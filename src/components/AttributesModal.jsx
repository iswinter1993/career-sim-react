import React from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';
import * as ATTRS from '../attributes';

const { SUB_ATTRS, CATEGORIES, CAT_LABELS } = ATTRS;

const CAT_COLORS = {
  tech:   { bar: '#27ae60', bg: 'rgba(39,174,96,.16)', accent: 'rgba(39,174,96,.08)' },
  phys:   { bar: '#e67e22', bg: 'rgba(230,126,34,.16)', accent: 'rgba(230,126,34,.08)' },
  mental: { bar: '#3498db', bg: 'rgba(52,152,219,.16)', accent: 'rgba(52,152,219,.08)' },
};

// ---------------------------------------------------------------------------
// Hexagonal radar — 6 technical attributes
// ---------------------------------------------------------------------------

function hexVertices(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (Math.PI * 2 * i) / 6;
    pts.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  }
  return pts;
}

function HexRadar({ attrs }) {
  const techKeys = Object.keys(SUB_ATTRS).filter((k) => SUB_ATTRS[k].cat === 'tech');
  const labels = techKeys.map((k) => SUB_ATTRS[k].label);
  const SIZE = 220, CX = SIZE / 2, CY = SIZE / 2, MAX_R = 80;
  const verts = hexVertices(CX, CY, MAX_R);

  const dataPts = verts.map((v, i) => {
    const val = Math.max(0, Math.min(20, attrs?.[techKeys[i]] ?? 0));
    const r = val / 20;
    return { x: CX + (v.x - CX) * r, y: CY + (v.y - CY) * r };
  });
  const dLine = dataPts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" aria-label="技术六维雷达图">
      {[5, 10, 15, 20].map((r) => {
        const rv = verts.map((v) => ({ x: CX + (v.x - CX) * r / 20, y: CY + (v.y - CY) * r / 20 }));
        const d = rv.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return <path key={r} d={d} fill="none" stroke="hsl(var(--border))" strokeWidth="0.7" />;
      })}
      {verts.map((v, i) => (
        <line key={`s-${i}`} x1={CX} y1={CY} x2={v.x} y2={v.y} stroke="hsl(var(--border))" strokeWidth="0.5" />
      ))}
      <path d={dLine} fill="#27ae60" fillOpacity="0.18" stroke="#27ae60" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={`d-${i}`} cx={p.x} cy={p.y} r="3" fill="#27ae60" stroke="#111" strokeWidth="0.8" />
      ))}
      {verts.map((v, i) => {
        const lx = CX + (v.x - CX) * 1.2, ly = CY + (v.y - CY) * 1.2;
        const a = lx < CX - 30 ? 'end' : lx > CX + 30 ? 'start' : 'middle';
        return (
          <text key={`t-${i}`} x={lx} y={ly} textAnchor={a} dominantBaseline="middle"
            fill="hsl(var(--muted))" fontSize="10.5" fontWeight="600" style={{ fontFamily: 'inherit' }}>
            {labels[i]}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Triangular radar — 3 category averages
// ---------------------------------------------------------------------------

function TriRadar({ attrs }) {
  const avgs = CATEGORIES.map((cat) => {
    const keys = Object.keys(SUB_ATTRS).filter((k) => SUB_ATTRS[k].cat === cat);
    return Math.round(keys.reduce((s, k) => s + (attrs?.[k] ?? 0), 0) / (keys.length || 1) * 10) / 10;
  });
  const SIZE = 200, CX = SIZE / 2, CY = SIZE / 2 + 4, MAX_R = 74;
  const angles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
  const verts = angles.map((a) => ({ x: CX + MAX_R * Math.cos(a), y: CY - MAX_R * Math.sin(a) }));

  const dataPts = verts.map((v, i) => {
    const r = Math.max(0, Math.min(20, avgs[i])) / 20;
    return { x: CX + (v.x - CX) * r, y: CY + (v.y - CY) * r };
  });
  const dLine = dataPts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" aria-label="能力三角雷达图">
      {[5, 10, 15, 20].map((r) => {
        const rv = verts.map((v) => ({ x: CX + (v.x - CX) * r / 20, y: CY + (v.y - CY) * r / 20 }));
        const d = rv.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return <path key={r} d={d} fill="none" stroke="hsl(var(--border))" strokeWidth="0.7" />;
      })}
      {verts.map((v, i) => (
        <line key={`s-${i}`} x1={CX} y1={CY} x2={v.x} y2={v.y} stroke="hsl(var(--border))" strokeWidth="0.5" />
      ))}
      <path d={dLine} fill="#f0c040" fillOpacity="0.16" stroke="#f0c040" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={`d-${i}`} cx={p.x} cy={p.y} r="3.5" fill="#f0c040" stroke="#111" strokeWidth="0.8" />
      ))}
      {verts.map((v, i) => {
        const lx = CX + (v.x - CX) * 1.24, ly = CY + (v.y - CY) * 1.24;
        const a = i === 0 ? 'middle' : i === 1 ? 'start' : 'end';
        return (
          <text key={`t-${i}`} x={lx} y={ly} textAnchor={a} dominantBaseline="middle"
            fill="hsl(var(--muted))" fontSize="10.5" fontWeight="600" style={{ fontFamily: 'inherit' }}>
            {CAT_LABELS[CATEGORIES[i]]}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Attribute card — a polished row: label + value + mini bar
// ---------------------------------------------------------------------------

function AttrCard({ label, value, color }) {
  const pct = Math.round((value / 20) * 100);
  const c = value >= 14 ? '#f0c040' : color;
  return (
    <div className="acard">
      <div className="acard-top">
        <span className="acard-label">{label}</span>
        <span className="acard-val" style={{ color: c }}>{Math.round(value)}</span>
      </div>
      <div className="acard-track">
        <div className="acard-fill" style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category block — label at top, cards stacked below
// ---------------------------------------------------------------------------

function CategoryBlock({ cat, attrs }) {
  const entries = Object.entries(SUB_ATTRS).filter(([, v]) => v.cat === cat);
  const catVal = SIM.getCategory(attrs, cat);
  const c = CAT_COLORS[cat] || CAT_COLORS.tech;

  return (
    <div className={`cat-block cat-block--${cat}`}>
      <div className="cat-block-head">
        <span className="cat-block-icon" style={{ background: c.bar }} />
        <span className="cat-block-name">{CAT_LABELS[cat]}</span>
        <span className="cat-block-score">{catVal}</span>
      </div>
      <div className="cat-block-cards">
        {entries.map(([key, def]) => (
          <AttrCard key={key} label={def.label} value={attrs?.[key] ?? 0} color={c.bar} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export default function AttributesModal({ onClose }) {
  const { state } = useGame();
  const attrs = SIM.getAttributes();
  const simState = state.simState;
  if (!attrs) return null;

  const attrOvr = SIM.getOVRFromAttributes(attrs, simState?.pos || attrs._pos);
  const engineOvr = Math.round(simState?.ovr || 0);
  const pos = simState?.pos || attrs._pos;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal attrs-modal-new">
        <button className="modal-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="am-header">
          <h2 className="am-title">球员属性</h2>
          <span className="am-pos">{pos}</span>
        </div>

        {/* Body: left radars, right attrs */}
        <div className="am-body">
          {/* Left: radar charts */}
          <div className="am-left">
            <div className="am-radar-card">
              <div className="am-radar-title">技术六维</div>
              <HexRadar attrs={attrs} />
            </div>
            <div className="am-radar-card">
              <div className="am-radar-title">能力三角</div>
              <TriRadar attrs={attrs} />
            </div>
          </div>

          {/* Right: three category blocks */}
          <div className="am-right">
            {CATEGORIES.map((cat) => (
              <CategoryBlock key={cat} cat={cat} attrs={attrs} />
            ))}
          </div>
        </div>

        {/* Footer: OVR comparison */}
        <div className="am-footer">
          <div className="am-ovr-item">
            <span className="am-ovr-lab">属性推算</span>
            <span className="am-ovr-num">{attrOvr}</span>
          </div>
          <span className="am-ovr-sep">·</span>
          <div className="am-ovr-item">
            <span className="am-ovr-lab">引擎 OVR</span>
            <span className="am-ovr-num am-ovr-num--eng">{engineOvr}</span>
          </div>
          <span className="am-ovr-diff">差值 {attrOvr >= engineOvr ? '+' : ''}{attrOvr - engineOvr}</span>
        </div>
      </div>
    </div>
  );
}
