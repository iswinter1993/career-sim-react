// [DEPRECATED] 已弃用 — 比赛画面改由 simulatorDemo 的 vendor 引擎渲染。
// 本文件保留仅作历史参考，无任何活代码引用（仅被已弃用的 MatchView.jsx 引用）。
// PitchCanvas — 2D top-down football pitch renderer (T06 enhanced)
//
// Enhanced with:
//   - Formation lines connecting players to show formation shape
//   - Player role/position badges
//   - Ball trail effect
//   - Possession-based highlight
//   - Formation name overlay
//   - Team color differentiation with kit markings

import React, { useRef, useEffect, useCallback } from 'react';
import { useGame } from '../GameContext';
import * as MatchEngine from '../matchEngine';
import { PITCH } from '../gameConfig';

// ---------------------------------------------------------------------------
// Pitch geometry (canonical values live in gameConfig.PITCH — Design Pattern #9)
// ---------------------------------------------------------------------------
const PITCH_WIDTH = PITCH.pitchWidth;
const PITCH_HEIGHT = PITCH.pitchHeight;
const GOAL_WIDTH = PITCH.goalWidth;
const MARGIN = 20;
const PLAYER_RADIUS = 10;
const BALL_RADIUS = 5;

// Team colors — using kit-style differentiation
const HOME_COLOR = '#2d7dd2';      // blue kit
const HOME_COLOR_LIGHT = '#5ba0e8';
const AWAY_COLOR = '#e63946';      // red kit
const AWAY_COLOR_LIGHT = '#f06070';
const PLAYER_HIGHLIGHT = '#f1c40f';
const GK_COLOR = '#27ae60';         // keeper in green

// Ball trail
const TRAIL_MAX = 12;
const TRAIL_STORAGE = { positions: [], lastBallPos: null };

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------
function getCanvasDims(containerWidth, containerHeight) {
  const maxW = containerWidth - MARGIN * 2;
  const maxH = containerHeight ? containerHeight - MARGIN * 2 : 680;
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
    width: w + MARGIN * 2, height: h + MARGIN * 2,
    pitchLeft: MARGIN, pitchTop: MARGIN,
    pitchW: w, pitchH: h,
    scaleX: w / PITCH_WIDTH, scaleY: h / PITCH_HEIGHT,
  };
}

function toScreenX(engineX, dims) { return dims.pitchLeft + engineX * dims.scaleX; }
function toScreenY(engineY, dims) { return dims.pitchTop + engineY * dims.scaleY; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------------------
// Drawing: Pitch
// ---------------------------------------------------------------------------
function drawPitch(ctx, dims) {
  const { pitchLeft, pitchTop, pitchW, pitchH } = dims;
  const right = pitchLeft + pitchW;
  const bottom = pitchTop + pitchH;
  const cx = pitchLeft + pitchW / 2;
  const cy = pitchTop + pitchH / 2;

  // Grass base
  ctx.fillStyle = '#0c3e0c';
  ctx.fillRect(pitchLeft, pitchTop, pitchW, pitchH);

  // Grass stripes — alternating subtle color
  const stripeW = pitchW / 14;
  for (let i = 0; i < 14; i += 2) {
    ctx.fillStyle = '#0d4410';
    ctx.fillRect(pitchLeft + i * stripeW, pitchTop, stripeW, pitchH);
  }

  // Pitch boundary
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);

  // Center line
  ctx.beginPath();
  ctx.moveTo(pitchLeft, cy); ctx.lineTo(right, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center circle
  const centreRadius = (90 / PITCH_WIDTH) * pitchW;
  ctx.beginPath();
  ctx.arc(cx, cy, centreRadius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();

  // Goals
  const goalHW = (GOAL_WIDTH / PITCH_WIDTH) * pitchW / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.strokeRect(cx - goalHW, pitchTop - 3, goalHW * 2, 6);
  ctx.strokeRect(cx - goalHW, bottom - 3, goalHW * 2, 6);

  // Penalty areas
  const penW = (300 / PITCH_WIDTH) * pitchW;
  const penH = (200 / PITCH_HEIGHT) * pitchH;
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1;
  const penL = cx - penW / 2;
  ctx.strokeRect(penL, pitchTop, penW, penH);
  ctx.strokeRect(penL, bottom - penH, penW, penH);

  // 6-yard boxes
  const gaW = (150 / PITCH_WIDTH) * pitchW;
  const gaH = (70 / PITCH_HEIGHT) * pitchH;
  const gaL = cx - gaW / 2;
  ctx.strokeRect(gaL, pitchTop, gaW, gaH);
  ctx.strokeRect(gaL, bottom - gaH, gaW, gaH);

  // Penalty spots
  const penSY = (100 / PITCH_HEIGHT) * pitchH;
  ctx.beginPath(); ctx.arc(cx, pitchTop + penSY, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, bottom - penSY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Corner arcs
  const cr = 10;
  const corners = [
    [pitchLeft, pitchTop, 0], [right, pitchTop, Math.PI / 2],
    [right, bottom, Math.PI], [pitchLeft, bottom, -Math.PI / 2],
  ];
  for (const [cx2, cy2, sa] of corners) {
    ctx.beginPath(); ctx.arc(cx2, cy2, cr, sa, sa + Math.PI / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Drawing: Formation lines (dashed connections between players)
// ---------------------------------------------------------------------------
function drawFormationLines(ctx, players, color, dims) {
  if (!players || players.length < 3) return;

  // Group players by rough Y zone (defense, midfield, attack)
  const sorted = [...players].sort((a, b) => a.y - b.y);
  const zones = [[], [], []]; // def, mid, att

  for (const p of sorted) {
    const ratio = p.y / PITCH_HEIGHT;
    if (ratio < 0.28) zones[0].push(p);      // defense
    else if (ratio < 0.58) zones[1].push(p);  // midfield
    else zones[2].push(p);                     // attack
  }

  // Draw horizontal connection lines within each zone
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 8]);
  ctx.globalAlpha = 0.3;

  for (const zone of zones) {
    if (zone.length < 2) continue;
    const sortedByX = [...zone].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedByX.length - 1; i++) {
      const x1 = toScreenX(sortedByX[i].x, dims);
      const y1 = toScreenY(sortedByX[i].y, dims);
      const x2 = toScreenX(sortedByX[i + 1].x, dims);
      const y2 = toScreenY(sortedByX[i + 1].y, dims);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }

  // Vertical connection: GK → defense → midfield → attack
  if (zones[0].length > 0 && zones[1].length > 0) {
    const defCenter = zones[0][Math.floor(zones[0].length / 2)];
    const midCenter = zones[1][Math.floor(zones[1].length / 2)];
    const dx1 = toScreenX(defCenter.x, dims), dy1 = toScreenY(defCenter.y, dims);
    const dx2 = toScreenX(midCenter.x, dims), dy2 = toScreenY(midCenter.y, dims);
    ctx.beginPath(); ctx.moveTo(dx1, dy1); ctx.lineTo(dx2, dy2); ctx.stroke();
  }
  if (zones[1].length > 0 && zones[2].length > 0) {
    const midCenter = zones[1][Math.floor(zones[1].length / 2)];
    const attCenter = zones[2][Math.floor(zones[2].length / 2)];
    const dx2 = toScreenX(midCenter.x, dims), dy2 = toScreenY(midCenter.y, dims);
    const dx3 = toScreenX(attCenter.x, dims), dy3 = toScreenY(attCenter.y, dims);
    ctx.beginPath(); ctx.moveTo(dx2, dy2); ctx.lineTo(dx3, dy3); ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
}

// ---------------------------------------------------------------------------
// Drawing: Ball trail
// ---------------------------------------------------------------------------
function updateBallTrail(ballPos) {
  if (!ballPos || ballPos.length < 2) return;
  const [x, y] = ballPos;
  if (TRAIL_STORAGE.lastBallPos
      && x === TRAIL_STORAGE.lastBallPos[0]
      && y === TRAIL_STORAGE.lastBallPos[1]) return;

  TRAIL_STORAGE.positions.push([x, y]);
  if (TRAIL_STORAGE.positions.length > TRAIL_MAX) {
    TRAIL_STORAGE.positions.shift();
  }
  TRAIL_STORAGE.lastBallPos = [x, y];
}

function drawBallTrail(ctx, dims) {
  const positions = TRAIL_STORAGE.positions;
  if (positions.length < 2) return;

  for (let i = 1; i < positions.length; i++) {
    const alpha = (i / positions.length) * 0.6;
    const x1 = toScreenX(positions[i - 1][0], dims);
    const y1 = toScreenY(positions[i - 1][1], dims);
    const x2 = toScreenX(positions[i][0], dims);
    const y2 = toScreenY(positions[i][1], dims);

    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = Math.max(0.5, 2 * (i / positions.length));
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Drawing: Players
// ---------------------------------------------------------------------------
function getPlayerColor(isHomeTeam, isGK, isPlayer) {
  if (isPlayer) return PLAYER_HIGHLIGHT;
  if (isGK) return GK_COLOR;
  return isHomeTeam ? HOME_COLOR : AWAY_COLOR;
}

function drawPlayer(ctx, player, x, y, isHomeTeam, isPlayer, hasBall, isGK, dims) {
  const r = PLAYER_RADIUS;
  const color = getPlayerColor(isHomeTeam, isGK, isPlayer);

  // Body circle with gradient
  if (isPlayer) {
    // Player self: glow effect
    ctx.shadowColor = PLAYER_HIGHLIGHT;
    ctx.shadowBlur = 10;
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Player border
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isPlayer ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = isPlayer ? 2 : 1;
  ctx.stroke();

  // Ball indicator — small circle above player
  if (hasBall) {
    ctx.beginPath();
    ctx.arc(x, y - r - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Position badge — tiny colored square
  if (player.pos) {
    const badgeY = y + r + 2;
    const badgeW = 8, badgeH = 3;
    ctx.fillStyle = isGK ? GK_COLOR : (isHomeTeam ? HOME_COLOR_LIGHT : AWAY_COLOR_LIGHT);
    ctx.fillRect(x - badgeW / 2, badgeY, badgeW, badgeH);
  }

  // Short name label
  const displayName = player.name ? (player.name.length > 4 ? player.name.slice(0, 4) : player.name) : '?';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(displayName, x, y - r - 8);
}

// ---------------------------------------------------------------------------
// Drawing: Ball
// ---------------------------------------------------------------------------
function drawBall(ctx, pos, dims) {
  const x = toScreenX(pos[0], dims);
  const y = toScreenY(pos[1], dims);
  ctx.beginPath(); ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Formation overlay text
// ---------------------------------------------------------------------------
function drawFormationOverlay(ctx, formation, isHome, dims) {
  if (!formation) return;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = isHome ? 'left' : 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const x = isHome ? dims.pitchLeft + 5 : dims.pitchLeft + dims.pitchW - 5;
  const y = dims.pitchTop + dims.pitchH / 2;
  ctx.fillText(formation, x, y);
}

// ---------------------------------------------------------------------------
// Snapshot building
// ---------------------------------------------------------------------------
function snapPlayer(p, isHomeTeam) {
  const pos = p.currentPOS || p.originPOS || [PITCH_WIDTH / 2, PITCH_HEIGHT / 2];
  return {
    id: p.playerID || p.name,
    name: p.name,
    x: pos[0], y: pos[1],
    pos: p.position,
    isHomeTeam,
    isGK: p.position === 'GK',
    hasBall: !!p.hasBall,
    role: p.role || null,
    isPlayerSelf: !!(p.isPlayerSelf || p.playerID === 'player_self'),
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
  const prevSnapshot = useRef(null);

  const isPaused = matchState?.paused;
  const isAutoMode = matchState?.autoMode;
  const isFinished = matchState?.finished;
  const matchDetails = matchState?.matchDetails;

  // Build current snapshot
  const buildSnapshot = useCallback(() => {
    if (!matchDetails) return null;

    const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
    const homeTeam = kickIsHome ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const awayTeam = kickIsHome ? matchDetails.secondTeam : matchDetails.kickOffTeam;

    const homePlayers = (homeTeam?.players || []).map((p) => snapPlayer(p, true));
    const awayPlayers = (awayTeam?.players || []).map((p) => snapPlayer(p, false));

    const ballPos = matchDetails.ball?.position || [PITCH_WIDTH / 2, PITCH_HEIGHT / 2];
    const withPlayer = matchDetails.ball?.withPlayer || false;

    return {
      homePlayers,
      awayPlayers,
      ballPos,
      ballWithPlayer: withPlayer,
      homeFormation: matchDetails._homeFormation,
      awayFormation: matchDetails._awayFormation,
    };
  }, [matchDetails]);

  // Animation loop
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
        // Update ball trail
        if (!snapshot.ballWithPlayer) {
          updateBallTrail(snapshot.ballPos);
        } else {
          // Clear trail when ball is with a player
          TRAIL_STORAGE.positions = [];
          TRAIL_STORAGE.lastBallPos = null;
        }

        clearAndDraw(ctx, canvas, dimsRef.current, snapshot);
        prevSnapshot.current = snapshot;
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

  // Resize handler — use the container's actual height so the canvas scales to fit
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dims = getCanvasDims(rect.width, rect.height);
      dimsRef.current = dims;
      canvas.width = dims.width * (window.devicePixelRatio || 1);
      canvas.height = dims.height * (window.devicePixelRatio || 1);
      canvas.style.width = dims.width + 'px';
      canvas.style.height = dims.height + 'px';
      const ctx2 = canvas.getContext('2d');
      if (ctx2) ctx2.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
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
// Master draw function
// ---------------------------------------------------------------------------
function clearAndDraw(ctx, canvas, dims, snapshot) {
  if (!snapshot) return;

  let d = dims;
  if (!d) d = getCanvasDims(canvas.clientWidth || 500, canvas.clientHeight || 600);

  ctx.clearRect(0, 0, d.width, d.height);

  // 1. Pitch
  drawPitch(ctx, d);

  // 2. Formation lines (behind players)
  drawFormationLines(ctx, snapshot.homePlayers, 'rgba(45,125,210,0.25)', d);
  drawFormationLines(ctx, snapshot.awayPlayers, 'rgba(230,57,70,0.20)', d);

  // 3. Ball trail
  drawBallTrail(ctx, d);

  // 4. Away players first (behind), then home players (on top)
  for (const ap of (snapshot.awayPlayers || [])) {
    if (!ap || ap.id == null) continue;
    const x = toScreenX(ap.x, d), y = toScreenY(ap.y, d);
    drawPlayer(ctx, ap, x, y, false, ap.isPlayerSelf, ap.hasBall, ap.isGK, d);
  }

  for (const hp of (snapshot.homePlayers || [])) {
    if (!hp || hp.id == null) continue;
    const x = toScreenX(hp.x, d), y = toScreenY(hp.y, d);
    drawPlayer(ctx, hp, x, y, true, hp.isPlayerSelf, hp.hasBall, hp.isGK, d);
  }

  // 5. Ball (on pitch, not held)
  if (!snapshot.ballWithPlayer) {
    drawBall(ctx, snapshot.ballPos, d);
  }

  // 6. Formation overlay
  if (snapshot.homeFormation) drawFormationOverlay(ctx, snapshot.homeFormation, true, d);
  if (snapshot.awayFormation) drawFormationOverlay(ctx, snapshot.awayFormation, false, d);
}
