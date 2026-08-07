// PitchCanvas — 2D top-down football pitch renderer (T06)
//
// Draws the full pitch with 22 players + ball on a <canvas> element.
// Rendering is decoupled from the engine iteration loop:
//   1. Engine updates → matchDetails snapshot pushed to a ref
//   2. requestAnimationFrame reads the latest snapshot → tweens toward it
//
// Tween interpolation (~400ms) gives smooth 60fps movement between
// discrete engine steps, avoiding jerky teleportation.

import React, { useRef, useEffect, useCallback } from 'react';
import { useGame } from '../GameContext';

// ---------------------------------------------------------------------------
// Pitch geometry (mirrors engine's defaults)
// ---------------------------------------------------------------------------
const PITCH_WIDTH = 680;
const PITCH_HEIGHT = 1050;
const GOAL_WIDTH = 90;

// Margins inside the canvas (px)
const MARGIN = 20;

// Player rendering
const PLAYER_RADIUS = 10;
const BALL_RADIUS = 5;

// Tween duration in ms
const TWEEN_MS = 350;

// Team colors
const HOME_COLOR = '#3498db';
const AWAY_COLOR = '#e74c3c';
const PLAYER_HIGHLIGHT = '#f1c40f';

// ---------------------------------------------------------------------------
// Coordinate mapping (engine pitch coords → canvas pixel coords)
// ---------------------------------------------------------------------------
function getCanvasDims(containerWidth) {
  // Maintain pitch aspect ratio
  const maxW = containerWidth - MARGIN * 2;
  const maxH = 520; // fixed max height for the pitch area

  const aspect = PITCH_WIDTH / PITCH_HEIGHT;
  let w, h;

  if (maxW / aspect <= maxH) {
    w = maxW;
    h = w / aspect;
  } else {
    h = maxH;
    w = h * aspect;
  }

  return {
    width: w + MARGIN * 2,
    height: h + MARGIN * 2,
    pitchLeft: MARGIN,
    pitchTop: MARGIN,
    pitchW: w,
    pitchH: h,
    scaleX: w / PITCH_WIDTH,
    scaleY: h / PITCH_HEIGHT,
  };
}

function toScreenX(engineX, dims) {
  return dims.pitchLeft + engineX * dims.scaleX;
}

function toScreenY(engineY, dims) {
  // Engine Y: 0 = top goal, pitchHeight = bottom goal
  return dims.pitchTop + engineY * dims.scaleY;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawPitch(ctx, dims) {
  const { pitchLeft, pitchTop, pitchW, pitchH } = dims;
  const right = pitchLeft + pitchW;
  const bottom = pitchTop + pitchH;
  const cx = pitchLeft + pitchW / 2;
  const cy = pitchTop + pitchH / 2;

  // Grass
  ctx.fillStyle = '#0d4a0d';
  ctx.fillRect(pitchLeft, pitchTop, pitchW, pitchH);

  // Subtle grass stripes
  ctx.fillStyle = '#0e4e0e';
  const stripeW = pitchW / 10;
  for (let i = 0; i < 10; i += 2) {
    ctx.fillRect(pitchLeft + i * stripeW, pitchTop, stripeW, pitchH);
  }

  // Outer boundary
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);

  // Centre line
  ctx.beginPath();
  ctx.moveTo(pitchLeft, cy);
  ctx.lineTo(right, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Centre circle
  const centreRadius = (90 / PITCH_WIDTH) * pitchW;
  ctx.beginPath();
  ctx.arc(cx, cy, centreRadius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();

  // Goals (top and bottom)
  const goalHalfW = (GOAL_WIDTH / PITCH_WIDTH) * pitchW / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;

  // Top goal
  ctx.strokeRect(cx - goalHalfW, pitchTop - 3, goalHalfW * 2, 6);
  // Bottom goal
  ctx.strokeRect(cx - goalHalfW, bottom - 3, goalHalfW * 2, 6);

  // Penalty areas
  const penW = (300 / PITCH_WIDTH) * pitchW;
  const penH = (200 / PITCH_HEIGHT) * pitchH;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;

  // Top penalty area
  const penLeft = cx - penW / 2;
  ctx.strokeRect(penLeft, pitchTop, penW, penH);
  // Bottom penalty area
  ctx.strokeRect(penLeft, bottom - penH, penW, penH);

  // Goal areas (6-yard box)
  const gaW = (150 / PITCH_WIDTH) * pitchW;
  const gaH = (70 / PITCH_HEIGHT) * pitchH;
  const gaLeft = cx - gaW / 2;
  ctx.strokeRect(gaLeft, pitchTop, gaW, gaH);
  ctx.strokeRect(gaLeft, bottom - gaH, gaW, gaH);

  // Penalty spots
  const penSpotY = (100 / PITCH_HEIGHT) * pitchH;
  ctx.beginPath();
  ctx.arc(cx, pitchTop + penSpotY, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, bottom - penSpotY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Corner arcs
  const cornerR = 10;
  const corners = [
    [pitchLeft, pitchTop, 0],
    [right, pitchTop, Math.PI / 2],
    [right, bottom, Math.PI],
    [pitchLeft, bottom, -Math.PI / 2],
  ];
  for (const [cx2, cy2, startAngle] of corners) {
    ctx.beginPath();
    ctx.arc(cx2, cy2, cornerR, startAngle, startAngle + Math.PI / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawPlayer(ctx, player, x, y, isHomeTeam, isPlayer, hasBall, dims) {
  const r = PLAYER_RADIUS;
  const color = isHomeTeam ? HOME_COLOR : AWAY_COLOR;

  // Body circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Player highlight (golden ring)
  if (isPlayer) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = PLAYER_HIGHLIGHT;
    ctx.lineWidth = 2;
    ctx.shadowColor = PLAYER_HIGHLIGHT;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Border
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Name above player
  const shortName = (player.name || '').slice(0, 3);
  if (shortName) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shortName, x, y - r - 5);
  }

  // Ball indicator
  if (hasBall) {
    ctx.beginPath();
    ctx.arc(x, y - r - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

function drawBall(ctx, pos, dims) {
  const x = toScreenX(pos[0], dims);
  const y = toScreenY(pos[1], dims);

  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Snapshot & Tween state (outside React to survive re-renders)
// ---------------------------------------------------------------------------

/**
 * Linear interpolation between two points.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Player snapshot: position on the pitch in engine coordinates.
 */
function snapPlayer(p, isHomeTeam) {
  // currentPOS assigned by engine; originPOS as fallback
  const pos = p.currentPOS || p.originPOS || [PITCH_WIDTH / 2, PITCH_HEIGHT / 2];
  return {
    id: p.playerID || p.name,
    name: p.name,
    x: pos[0],
    y: pos[1],
    isHomeTeam,
    hasBall: !!p.hasBall,
  };
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

export default function PitchCanvas() {
  const { state } = useGame();
  const { matchState } = state;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameId = useRef(null);
  const dimsRef = useRef(null);

  const isPaused = matchState?.paused;
  const isAutoMode = matchState?.autoMode;
  const isFinished = matchState?.finished;
  const matchDetails = matchState?.matchDetails;

  // Build current snapshot from engine state
  const buildSnapshot = useCallback(() => {
    if (!matchDetails) return null;

    const kickOff = matchDetails.kickOffTeam;
    const second = matchDetails.secondTeam;

    const homePlayers = (kickOff?.players || []).map((p) => snapPlayer(p, true));
    const awayPlayers = (second?.players || []).map((p) => snapPlayer(p, false));

    const ballPos = matchDetails.ball?.position || [PITCH_WIDTH / 2, PITCH_HEIGHT / 2];

    return {
      homePlayers,
      awayPlayers,
      ballPos,
      ballWithPlayer: matchDetails.ball?.withPlayer || false,
    };
  }, [matchDetails]);

  // Animation loop — persistent rAF that reads the latest engine positions
  // every frame. No tween interpolation — the engine updates at 40-220ms
  // intervals with 20-40 iterations per tick, so positions change frequently
  // enough for smooth-enough motion without interpolation fighting the
  // React render cycle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const loop = () => {
      if (!running) return;

      const snapshot = buildSnapshot();
      if (snapshot && !isAutoMode && !isFinished) {
        clearAndDraw(ctx, canvas, null, dimsRef.current, snapshot, null);
      }

      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
        animFrameId.current = null;
      }
    };
  }, [buildSnapshot, isAutoMode, isFinished]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const dims = getCanvasDims(rect.width);
      dimsRef.current = dims;

      canvas.width = dims.width * (window.devicePixelRatio || 1);
      canvas.height = dims.height * (window.devicePixelRatio || 1);
      canvas.style.width = dims.width + 'px';
      canvas.style.height = dims.height + 'px';

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={containerRef} className="pitch-canvas-container">
      <canvas
        ref={canvasRef}
        className="pitch-canvas"
        style={{ display: 'block', margin: '0 auto' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clearAndDraw(ctx, canvas, prev, dims, current, tweenT) {
  if (!current) return;

  // Use dims from ref or compute fresh
  let d = dims;
  if (!d) {
    d = getCanvasDims(canvas.clientWidth || 500);
  }

  ctx.clearRect(0, 0, d.width, d.height);

  // Draw pitch
  drawPitch(ctx, d);

  const progress = (tweenT != null && prev) ? tweenT : 1;

  const allPrev = prev ? [...(prev.homePlayers || []), ...(prev.awayPlayers || [])] : null;
  const allCurr = [...(current.homePlayers || []), ...(current.awayPlayers || [])];

  // Draw each player — if we have a previous frame, interpolate; otherwise draw at target
  for (const cp of allCurr) {
    if (!cp || cp.id == null) continue;
    const pp = allPrev ? allPrev.find((p) => p.id === cp.id) : null;
    const x = toScreenX(pp ? lerp(pp.x, cp.x, progress) : cp.x, d);
    const y = toScreenY(pp ? lerp(pp.y, cp.y, progress) : cp.y, d);
    const isHome = cp.isHomeTeam;
    const isPlayer = cp.id === 'player_self';

    drawPlayer(ctx, { name: cp.name || '?' }, x, y, isHome, isPlayer, cp.hasBall, d);
  }

  // Draw ball (on pitch or with a player)
  const bpx = prev ? lerp(prev.ballPos[0], current.ballPos[0], progress) : current.ballPos[0];
  const bpy = prev ? lerp(prev.ballPos[1], current.ballPos[1], progress) : current.ballPos[1];

  if (!current.ballWithPlayer) {
    drawBall(ctx, [bpx, bpy], d);
  }
}

function _hasSnapshotChanged(prev, curr) {
  if (!prev || !curr) return true;

  // Check ball position
  if (Math.abs(prev.ballPos[0] - curr.ballPos[0]) > 0.5 ||
      Math.abs(prev.ballPos[1] - curr.ballPos[1]) > 0.5) {
    return true;
  }

  // Check if any player moved
  const prevById = {};
  for (const p of [...prev.homePlayers, ...prev.awayPlayers]) {
    prevById[p.id] = p;
  }
  for (const p of [...curr.homePlayers, ...curr.awayPlayers]) {
    const pp = prevById[p.id];
    if (!pp) return true;
    if (Math.abs(pp.x - p.x) > 0.5 || Math.abs(pp.y - p.y) > 0.5) return true;
  }

  return false;
}
