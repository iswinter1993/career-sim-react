import React from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';
import {
  PLAYER_ATTRS,
  CAT_LABELS,
  getKeysByCategory,
  getRatingComponents,
  RATING_COMPONENTS,
} from '../attributes';

const CAT_COLORS = {
  mental:       { bar: '#3498db', bg: 'rgba(52,152,219,.16)' },
  physical:     { bar: '#e67e22', bg: 'rgba(230,126,34,.16)' },
  technical:    { bar: '#27ae60', bg: 'rgba(39,174,96,.16)' },
  goalkeeping:  { bar: '#9b59b6', bg: 'rgba(155,89,182,.16)' },
};

// ---------------------------------------------------------------------------
// N-axis radar — vendor 的 6 分量 rating() 可视化（0-100）
// ---------------------------------------------------------------------------

function Radar({ axes, values, max = 100 }) {
  const SIZE = 220, CX = SIZE / 2, CY = SIZE / 2, MAX_R = 82;
  const n = axes.length;

  const verts = axes.map((_, i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    return { x: CX + MAX_R * Math.cos(a), y: CY + MAX_R * Math.sin(a) };
  });

  const dataPts = verts.map((v, i) => {
    const val = Math.max(0, Math.min(max, values?.[axes[i].key] ?? 0));
    const r = val / max;
    return { x: CX + (v.x - CX) * r, y: CY + (v.y - CY) * r };
  });
  const dLine = dataPts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" aria-label="综合能力六维雷达图">
      {[0.2, 0.4, 0.6, 0.8, 1].map((fr) => {
        const rv = verts.map((v) => ({ x: CX + (v.x - CX) * fr, y: CY + (v.y - CY) * fr }));
        const d = rv.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return <path key={fr} d={d} fill="none" stroke="hsl(var(--border))" strokeWidth="0.7" />;
      })}
      {verts.map((v, i) => (
        <line key={`s-${i}`} x1={CX} y1={CY} x2={v.x} y2={v.y} stroke="hsl(var(--border))" strokeWidth="0.5" />
      ))}
      <path d={dLine} fill="#f0c040" fillOpacity="0.16" stroke="#f0c040" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={`d-${i}`} cx={p.x} cy={p.y} r="3" fill="#f0c040" stroke="#111" strokeWidth="0.8" />
      ))}
      {verts.map((v, i) => {
        const lx = CX + (v.x - CX) * 1.22, ly = CY + (v.y - CY) * 1.22;
        const a = Math.abs(lx - CX) < 30 ? 'middle' : (lx < CX ? 'end' : 'start');
        return (
          <text key={`t-${i}`} x={lx} y={ly} textAnchor={a} dominantBaseline="middle"
            fill="hsl(var(--muted))" fontSize="10" fontWeight="600" style={{ fontFamily: 'inherit' }}>
            {axes[i].label}
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
// Category block — label + category average at top, cards below
// ---------------------------------------------------------------------------

function CategoryBlock({ cat, attrs }) {
  const keys = getKeysByCategory(cat);
  const c = CAT_COLORS[cat] || CAT_COLORS.technical;
  const sum = keys.reduce((s, k) => s + (attrs?.[k] ?? 0), 0);
  const avg = keys.length ? Math.round(sum / keys.length) : 0;

  return (
    <div className={`cat-block cat-block--${cat}`}>
      <div className="cat-block-head">
        <span className="cat-block-icon" style={{ background: c.bar }} />
        <span className="cat-block-name">{CAT_LABELS[cat]}</span>
        <span className="cat-block-score" style={{ color: c.bar }}>{avg}</span>
      </div>
      <div className="cat-block-cards">
        {keys.map((key) => (
          <AttrCard key={key} label={PLAYER_ATTRS[key].label} value={attrs?.[key] ?? 0} color={c.bar} />
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

  const pos = simState?.pos || attrs._pos || 'CM';
  const isGK = pos === 'GK';
  const attrOvr = SIM.getOVRFromAttributes(attrs, pos);
  const engineOvr = Math.round(simState?.ovr || 0);
  const rating = getRatingComponents(attrs, pos);
  const axes = RATING_COMPONENTS[isGK ? 'gk' : 'outfield'];
  const cats = isGK
    ? ['mental', 'physical', 'technical', 'goalkeeping']
    : ['mental', 'physical', 'technical'];

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal attrs-modal-new">
        <button className="modal-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="am-header">
          <h2 className="am-title">球员属性</h2>
          <span className="am-pos">{pos}</span>
        </div>

        {/* Body: left radar, right attrs */}
        <div className="am-body">
          <div className="am-left">
            <div className="am-radar-card">
              <div className="am-radar-title">综合能力</div>
              <Radar axes={axes} values={rating} />
            </div>
          </div>

          <div className="am-right">
            {cats.map((cat) => (
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
