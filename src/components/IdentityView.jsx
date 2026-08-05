import React, { useState, useMemo } from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';

// Step 1: Choose Origin
function StepOrigin() {
  const { state, dispatch } = useGame();
  const { identity } = state;
  const origins = useMemo(() => SIM.getOrigins(), []);
  const [selected, setSelected] = useState(identity?.originId || null);

  const handleNext = () => {
    if (selected) {
      const origin = origins.find((o) => o.id === selected);
      dispatch({
        type: 'SET_IDENTITY',
        identity: { originId: selected, origin },
      });
      dispatch({ type: 'SET_STEP', step: 2 });
    }
  };

  return (
    <>
      <div className="step-head">
        <div className="step-title">选择你的出身</div>
        <div className="progress">
          <div className="progress-fill" style={{ width: '33%' }} />
        </div>
        <div className="step-sub">你的起点决定初始能力、关系和财富</div>
      </div>
      <div className="panel">
        <div className="pick-list">
          {origins.map((o) => (
            <button
              key={o.id}
              className={`pick ${selected === o.id ? 'selected' : ''}`}
              onClick={() => setSelected(o.id)}
            >
              <span
                className="swatch"
                style={{ background: o.c1 }}
              />
              <span className="pick-main">
                <span className="pick-name">{o.name}</span>
                <span className="pick-desc">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="actionbar">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'BACK_TO_INTRO' })}>
          返回
        </button>
        <button className="btn btn-primary" disabled={!selected} onClick={handleNext}>
          继续
        </button>
      </div>
    </>
  );
}

// Step 2: Choose Position
const POSITIONS = [
  { id: 'GK',  name: 'GK',  group: 'gk', x: 50, y: 93 },
  { id: 'CB',  name: 'CB',  group: 'df', x: 50, y: 78 },
  { id: 'LB',  name: 'LB',  group: 'df', x: 14, y: 71 },
  { id: 'RB',  name: 'RB',  group: 'df', x: 86, y: 71 },
  { id: 'CDM', name: 'CDM', group: 'mf', x: 50, y: 60 },
  { id: 'CM',  name: 'CM',  group: 'mf', x: 50, y: 44 },
  { id: 'CAM', name: 'CAM', group: 'mf', x: 50, y: 27 },
  { id: 'LM',  name: 'LM',  group: 'mf', x: 11, y: 40 },
  { id: 'RM',  name: 'RM',  group: 'mf', x: 89, y: 40 },
  { id: 'LW',  name: 'LW',  group: 'fw', x: 15, y: 15 },
  { id: 'RW',  name: 'RW',  group: 'fw', x: 85, y: 15 },
  { id: 'ST',  name: 'ST',  group: 'fw', x: 50, y: 9 },
];

function StepPosition() {
  const { state, dispatch } = useGame();
  const { identity } = state;
  const [selected, setSelected] = useState(identity?.pos || null);

  const selectedInfo = POSITIONS.find((p) => p.id === selected);

  const handleNext = () => {
    if (selected) {
      dispatch({
        type: 'SET_IDENTITY',
        identity: { pos: selected, posGroup: selectedInfo?.group },
      });
      dispatch({ type: 'SET_STEP', step: 3 });
    }
  };

  return (
    <>
      <div className="step-head">
        <div className="step-title">选择位置</div>
        <div className="progress">
          <div className="progress-fill" style={{ width: '66%' }} />
        </div>
        <div className="step-sub">这会影响你的比赛数据和国家队机会</div>
      </div>
      <div className="pitch">
        <svg viewBox="0 0 300 415" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="pg61" x1="0" y1="0" x2=".4" y2="1">
              <stop offset="0" stopColor="#15563e" />
              <stop offset=".5" stopColor="#104330" />
              <stop offset="1" stopColor="#0b3224" />
            </linearGradient>
          </defs>
          <rect width="300" height="415" fill="url(#pg61)" />
          <rect x="0" y="52" width="300" height="52" fill="#fff" fillOpacity=".055" />
          <rect x="0" y="156" width="300" height="52" fill="#fff" fillOpacity=".055" />
          <rect x="0" y="260" width="300" height="52" fill="#fff" fillOpacity=".055" />
          <rect x="0" y="364" width="300" height="52" fill="#fff" fillOpacity=".055" />
          <g fill="none" stroke="#eafff6" strokeOpacity=".45" strokeWidth="2">
            <rect x="10" y="10" width="280" height="395" rx="2" />
            <line x1="10" y1="207" x2="290" y2="207" />
            <circle cx="150" cy="207" r="42" />
            <rect x="72" y="10" width="156" height="58" />
            <rect x="112" y="10" width="76" height="24" />
            <rect x="72" y="347" width="156" height="58" />
            <rect x="112" y="381" width="76" height="24" />
          </g>
          <circle cx="150" cy="207" r="3.5" fill="#eafff6" fillOpacity=".6" />
          <circle cx="150" cy="52" r="3" fill="#eafff6" fillOpacity=".45" />
          <circle cx="150" cy="363" r="3" fill="#eafff6" fillOpacity=".45" />
        </svg>
        {POSITIONS.map((pos) => (
          <button
            key={pos.id}
            className={`pos-btn ${selected === pos.id ? 'selected' : ''}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onClick={() => setSelected(pos.id)}
          >
            {pos.name}
          </button>
        ))}
      </div>
      <p className="pitch-hint">
        {selectedInfo ? `已选  ${selectedInfo.name}（${selectedInfo.id}）` : '点击位置按钮选择'}
      </p>
      <div className="actionbar">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
          返回
        </button>
        <button className="btn btn-primary" disabled={!selected} onClick={handleNext}>
          继续
        </button>
      </div>
    </>
  );
}

// Step 3: Personal Info (name, number, foot)
// Darken a hex color by a given amount (0-1)
function darken(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((num >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((num >> 8) & 0xff) * (1 - amount));
  const b = Math.round((num & 0xff) * (1 - amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function Jersey({ name, number, originId }) {
  const origins = useMemo(() => SIM.getOrigins(), []);
  const origin = useMemo(() => {
    if (!originId) return null;
    return origins.find((o) => o.id === originId) || null;
  }, [originId, origins]);

  const mainColor = origin?.c1 || '#C8102E';
  const darkColor = origin?.c2 || darken(mainColor, 0.3);
  const imgPath = useMemo(() => `./assets/images/${originId || 'ln'}.webp`, [originId]);
  const gid = useMemo(() => `jg${originId || 'default'}`, [originId]);

  const handleImgError = (e) => {
    const pic = e.target.closest('picture');
    if (pic) pic.classList.add('gone');
  };

  return (
    <div className="jersey-wrap">
      <div className="jersey">
        {/* Fallback: simple SVG with origin color — shown when image is missing */}
        <svg className="j-fallback" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={mainColor} />
              <stop offset="1" stopColor={darkColor} />
            </linearGradient>
          </defs>
          <path
            d="M34 20 L44 15 Q50 21 56 15 L66 20 L84 29 L77 44 L69 40 L69 86 L31 86 L31 40 L23 44 L16 29 Z"
            fill={`url(#${gid})`}
            stroke="rgba(0,0,0,.35)" strokeWidth="1.2" strokeLinejoin="round"
          />
          <path
            d="M44 15 Q50 21 56 15 L54 20 Q50 25 46 20 Z"
            fill="rgba(0,0,0,.32)"
          />
        </svg>

        {/* Actual jersey image — picture with WebP source */}
        <picture>
          <source srcSet={imgPath} type="image/webp" />
          <img
            className="j-img"
            src={imgPath}
            alt=""
            onError={handleImgError}
          />
        </picture>

        {/* Name & number overlay */}
        <svg className="j-print" viewBox="0 0 100 100" aria-hidden="true">
          <text x="50" y="31" textAnchor="middle" fill="#ffffff"
            stroke="#17171c" paintOrder="stroke" strokeLinejoin="round"
            fontFamily="Inter, PingFang SC, Microsoft YaHei, sans-serif"
            fontWeight="800" fontSize="9.5" strokeWidth="1.9" letterSpacing=".5">
            {name || '—'}
          </text>
          <text x="50" y="63" textAnchor="middle" fill="#ffffff"
            stroke="#17171c" paintOrder="stroke" strokeLinejoin="round"
            fontFamily="Inter, PingFang SC, Microsoft YaHei, sans-serif"
            fontWeight="800" fontSize="31" strokeWidth="3.6">
            {number || '—'}
          </text>
        </svg>
      </div>
    </div>
  );
}

function StepPersonal() {
  const { state, dispatch } = useGame();
  const { identity } = state;
  const [name, setName] = useState(identity?.name || '');
  const [number, setNumber] = useState(identity?.number || '7');
  const [foot, setFoot] = useState(identity?.foot || 'right');

  const canStart = name.trim().length > 0 && number >= 1 && number <= 99;

  const handleStart = () => {
    if (!canStart) return;
    dispatch({
      type: 'SET_IDENTITY',
      identity: { name: name.trim(), number: String(number), foot },
    });
    const seed = String(Math.floor(Math.random() * 1000000000));
    dispatch({ type: 'START_CAREER', seed });
  };

  return (
    <>
      <div className="step-head">
        <div className="step-title">你是谁？</div>
        <div className="progress">
          <div className="progress-fill" style={{ width: '100%' }} />
        </div>
        <div className="step-sub">最后一步：名字、号码和惯用脚</div>
      </div>

      <Jersey name={name} number={number} originId={identity?.originId} />

      <div className="form-row">
        <div>
          <span className="field-label">姓名</span>
          <input
            type="text"
            className="input"
            maxLength={6}
            placeholder="你的名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="narrow">
          <span className="field-label">号码</span>
          <input
            type="number"
            className="input"
            min={1}
            max={99}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: '1.1rem' }}>
        <span className="field-label">惯用脚</span>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${foot === 'left' ? 'selected' : ''}`}
            onClick={() => setFoot('left')}
          >
            左脚
          </button>
          <button
            type="button"
            className={`seg ${foot === 'right' ? 'selected' : ''}`}
            onClick={() => setFoot('right')}
          >
            右脚
          </button>
        </div>
      </div>

      <div className="actionbar">
        <button className="btn btn-back" onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}>
          返回
        </button>
        <button className="btn btn-primary" disabled={!canStart} onClick={handleStart}>
          开始生涯
        </button>
      </div>
    </>
  );
}

export default function IdentityView() {
  const { state, dispatch } = useGame();
  const { step } = state;

  // Step 0 is intro → step 1
  if (step === 1) return <StepOrigin />;
  if (step === 2) return <StepPosition />;
  if (step === 3) return <StepPersonal />;

  // Default: show origin
  return <StepOrigin />;
}
