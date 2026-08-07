// TacticsPanel — pre-match tactics setup and in-match substitution UI (T07)
//
// Two modes:
//   preMatch: formation + mentality selection before kickoff
//   substitution: player swap interface during pause

import React, { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Formation definitions (positions as [x%, y%] on the pitch)
// ---------------------------------------------------------------------------

const FORMATIONS = {
  '4-4-2': {
    name: '4-4-2',
    label: '经典 4-4-2',
    positions: [
      { pos: 'GK',  x: 50, y: 5 },
      { pos: 'RB',  x: 15, y: 30 },
      { pos: 'CB',  x: 35, y: 28 },
      { pos: 'CB',  x: 65, y: 28 },
      { pos: 'LB',  x: 85, y: 30 },
      { pos: 'RM',  x: 15, y: 55 },
      { pos: 'CM',  x: 38, y: 52 },
      { pos: 'CM',  x: 62, y: 52 },
      { pos: 'LM',  x: 85, y: 55 },
      { pos: 'ST',  x: 35, y: 78 },
      { pos: 'ST',  x: 65, y: 78 },
    ],
  },
  '4-3-3': {
    name: '4-3-3',
    label: '攻击 4-3-3',
    positions: [
      { pos: 'GK',  x: 50, y: 5 },
      { pos: 'RB',  x: 15, y: 30 },
      { pos: 'CB',  x: 35, y: 28 },
      { pos: 'CB',  x: 65, y: 28 },
      { pos: 'LB',  x: 85, y: 30 },
      { pos: 'CM',  x: 25, y: 52 },
      { pos: 'CM',  x: 50, y: 48 },
      { pos: 'CM',  x: 75, y: 52 },
      { pos: 'RW',  x: 20, y: 78 },
      { pos: 'ST',  x: 50, y: 82 },
      { pos: 'LW',  x: 80, y: 78 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    label: '均衡 4-2-3-1',
    positions: [
      { pos: 'GK',  x: 50, y: 5 },
      { pos: 'RB',  x: 15, y: 30 },
      { pos: 'CB',  x: 35, y: 28 },
      { pos: 'CB',  x: 65, y: 28 },
      { pos: 'LB',  x: 85, y: 30 },
      { pos: 'CDM', x: 35, y: 45 },
      { pos: 'CDM', x: 65, y: 45 },
      { pos: 'RM',  x: 15, y: 62 },
      { pos: 'CAM', x: 50, y: 60 },
      { pos: 'LM',  x: 85, y: 62 },
      { pos: 'ST',  x: 50, y: 82 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    label: '防守 3-5-2',
    positions: [
      { pos: 'GK',  x: 50, y: 5 },
      { pos: 'CB',  x: 25, y: 28 },
      { pos: 'CB',  x: 50, y: 26 },
      { pos: 'CB',  x: 75, y: 28 },
      { pos: 'RM',  x: 8,  y: 52 },
      { pos: 'CM',  x: 30, y: 48 },
      { pos: 'CM',  x: 50, y: 46 },
      { pos: 'CM',  x: 70, y: 48 },
      { pos: 'LM',  x: 92, y: 52 },
      { pos: 'ST',  x: 35, y: 78 },
      { pos: 'ST',  x: 65, y: 78 },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    label: '铁桶 5-3-2',
    positions: [
      { pos: 'GK',  x: 50, y: 5 },
      { pos: 'RB',  x: 8,  y: 28 },
      { pos: 'CB',  x: 25, y: 26 },
      { pos: 'CB',  x: 50, y: 26 },
      { pos: 'CB',  x: 75, y: 26 },
      { pos: 'LB',  x: 92, y: 28 },
      { pos: 'CM',  x: 25, y: 52 },
      { pos: 'CM',  x: 50, y: 48 },
      { pos: 'CM',  x: 75, y: 52 },
      { pos: 'ST',  x: 35, y: 78 },
      { pos: 'ST',  x: 65, y: 78 },
    ],
  },
};

const MENTALITIES = [
  { key: 'ultra_attack', label: '全力进攻', intent: 20, desc: '全线压上，追求进球' },
  { key: 'attack',       label: '进攻',     intent: 15, desc: '积极进攻，高位压迫' },
  { key: 'balanced',     label: '平衡',     intent: 10, desc: '攻守均衡' },
  { key: 'defend',       label: '防守',     intent: 5,  desc: '稳守反击' },
  { key: 'ultra_defend', label: '全力防守', intent: 0,  desc: '死守到底' },
];

// ---------------------------------------------------------------------------
// Mini Tactical Board
// ---------------------------------------------------------------------------

function MiniBoard({ formation, starters, playerID }) {
  const fm = FORMATIONS[formation] || FORMATIONS['4-4-2'];
  const W = 200, H = 280, M = 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mini-board-svg" aria-label="阵型预览">
      {/* Pitch */}
      <rect x={M} y={M} width={W - M * 2} height={H - M * 2} fill="#0d4a0d" rx="3" />
      <rect x={M} y={M} width={W - M * 2} height={H - M * 2} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" rx="3" />
      <line x1={M} y1={H / 2} x2={W - M} y2={H / 2} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <circle cx={W / 2} cy={H / 2} r="15" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />

      {/* Player dots */}
      {fm.positions.map((slot, i) => {
        const px = M + (slot.x / 100) * (W - M * 2);
        const py = M + (slot.y / 100) * (H - M * 2);
        const player = starters[i];
        const isPlayerSelf = player?.id === playerID;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r="6" fill={isPlayerSelf ? '#f1c40f' : '#3498db'} />
            {isPlayerSelf && <circle cx={px} cy={py} r="8.5" fill="none" stroke="#f1c40f" strokeWidth="1.5" />}
            <text x={px} y={py + 1} textAnchor="middle" fill="#fff" fontSize="6" fontWeight="600">
              {player?.name?.slice(0, 1) || slot.pos}
            </text>
          </g>
        );
      })}
      {/* Position labels */}
      <text x={W / 2} y={H - 3} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="7">{formation}</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pre-match Tactics Panel
// ---------------------------------------------------------------------------

export function PreMatchTactics({ homeSquad, onStart, playerID }) {
  const [formation, setFormation] = useState('4-4-2');
  const [mentality, setMentality] = useState('balanced');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mentInfo = MENTALITIES.find((m) => m.key === mentality);

  const handleStart = () => {
    onStart({ formation, mentality, intent: mentInfo?.intent ?? 10 });
  };

  return (
    <div className="tactics-panel">
      <div className="tactics-header">
        <h2>赛前战术设置</h2>
        <p className="tactics-team-name">{homeSquad?.teamName || '主队'}</p>
      </div>

      <div className="tactics-body">
        {/* Left: formation + mini board */}
        <div className="tactics-left">
          <h3>阵型</h3>
          <div className="tactics-formation-grid">
            {Object.keys(FORMATIONS).map((key) => (
              <button
                key={key}
                className={`tactics-fm-btn ${formation === key ? 'active' : ''}`}
                onClick={() => setFormation(key)}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="tactics-board-wrap">
            <MiniBoard formation={formation} starters={homeSquad?.starters || []} playerID={playerID} />
          </div>
        </div>

        {/* Right: mentality + details */}
        <div className="tactics-right">
          <h3>比赛心态</h3>
          <div className="tactics-mentality-list">
            {MENTALITIES.map((m) => (
              <button
                key={m.key}
                className={`tactics-ment-btn ${mentality === m.key ? 'active' : ''}`}
                onClick={() => setMentality(m.key)}
              >
                <span className="tactics-ment-label">{m.label}</span>
                <span className="tactics-ment-desc">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tactics-footer">
        <button className="btn btn-primary btn-lg" onClick={handleStart}>
          ⚽ 开始比赛
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Substitution Panel (during pause)
// ---------------------------------------------------------------------------

export function SubstitutionPanel({
  starters,
  subs,
  substitutionsLeft,
  onSubstitute,
  onResume,
  playerID,
}) {
  const [selectedOut, setSelectedOut] = useState(null);
  const [selectedIn, setSelectedIn] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState(null);

  const canSub = substitutionsLeft > 0;
  const hasSelection = selectedOut && selectedIn;

  const handleSelectOut = (player) => {
    setSelectedOut(player.id === selectedOut?.id ? null : player);
    setConfirmMsg(null);
  };

  const handleSelectIn = (player) => {
    setSelectedIn(player.id === selectedIn?.id ? null : player);
    setConfirmMsg(null);
  };

  const handleConfirm = () => {
    if (!hasSelection || !canSub) return;
    if (selectedOut.id === 'player_self') {
      setConfirmMsg('不能换下自己！');
      return;
    }
    onSubstitute(selectedOut, selectedIn);
    setSelectedOut(null);
    setSelectedIn(null);
    setConfirmMsg('换人已确认');
  };

  return (
    <div className="sub-panel">
      <h3 className="sub-panel-title">
        换人面板
        <span className="sub-panel-count">剩余换人: {substitutionsLeft}/3</span>
      </h3>

      <div className="sub-panel-body">
        {/* Left: current players on pitch (starters) */}
        <div className="sub-col">
          <h4>场上球员</h4>
          <div className="sub-player-list">
            {starters.map((p) => (
              <button
                key={p.id}
                className={`sub-player-btn ${p.id === 'player_self' ? 'is-self' : ''} ${selectedOut?.id === p.id ? 'selected' : ''}`}
                onClick={() => handleSelectOut(p)}
                disabled={p.id === 'player_self'}
                title={p.id === 'player_self' ? '不能换下自己' : `换下 ${p.name}`}
              >
                <span className="sub-player-pos">{p.position}</span>
                <span className="sub-player-name">{p.name}</span>
                <span className="sub-player-ovr">{p.ovr || '—'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Swap arrow */}
        <div className="sub-swap">
          <span className="sub-swap-arrow">⇄</span>
        </div>

        {/* Right: substitutes (bench) */}
        <div className="sub-col">
          <h4>替补席</h4>
          <div className="sub-player-list">
            {subs.map((p) => (
              <button
                key={p.id}
                className={`sub-player-btn ${p.id === 'player_self' ? 'is-self' : ''} ${selectedIn?.id === p.id ? 'selected' : ''}`}
                onClick={() => handleSelectIn(p)}
              >
                <span className="sub-player-pos">{p.position}</span>
                <span className="sub-player-name">{p.name}</span>
                <span className="sub-player-ovr">{p.ovr || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {confirmMsg && (
        <div className={`sub-confirm-msg ${confirmMsg.includes('不能') || confirmMsg.includes('已满') ? 'error' : 'ok'}`}>
          {confirmMsg}
        </div>
      )}

      <div className="sub-panel-actions">
        <button
          className="btn btn-secondary"
          onClick={onResume}
        >
          ▶ 继续比赛
        </button>
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!hasSelection || !canSub}
        >
          确认换人
        </button>
      </div>
    </div>
  );
}

// Re-export for convenience
export { FORMATIONS, MENTALITIES };
