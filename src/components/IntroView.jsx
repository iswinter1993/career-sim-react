import React, { useState } from 'react';
import { useGame } from '../GameContext';

function HeroArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hg1" x1="0" y1="0" x2=".5" y2="1">
          <stop offset="0" stopColor="#15563e" />
          <stop offset=".55" stopColor="#0e3b2b" />
          <stop offset="1" stopColor="#08251b" />
        </linearGradient>
        <radialGradient id="hl2" cx=".5" cy=".42" r=".62">
          <stop offset="0" stopColor="#34d399" stopOpacity=".2" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill="url(#hg1)" />
      <rect x="50" y="0" width="50" height="300" fill="#fff" fillOpacity=".05" />
      <rect x="150" y="0" width="50" height="300" fill="#fff" fillOpacity=".05" />
      <rect x="250" y="0" width="50" height="300" fill="#fff" fillOpacity=".05" />
      <rect x="350" y="0" width="50" height="300" fill="#fff" fillOpacity=".05" />
      <rect width="400" height="300" fill="url(#hl2)" />
      <g fill="none" stroke="#eafff6" strokeOpacity=".3" strokeWidth="2">
        <rect x="26" y="26" width="348" height="248" rx="2" />
        <line x1="200" y1="26" x2="200" y2="274" />
        <circle cx="200" cy="150" r="46" />
        <rect x="26" y="92" width="52" height="116" />
        <rect x="322" y="92" width="52" height="116" />
        <rect x="26" y="126" width="18" height="48" />
        <rect x="356" y="126" width="18" height="48" />
      </g>
      {/* centre spot */}
      <circle cx="200" cy="150" r="5" fill="#eafff6" fillOpacity=".8" />
      {/* penalty spots */}
      <circle cx="61" cy="150" r="3" fill="#eafff6" fillOpacity=".6" />
      <circle cx="339" cy="150" r="3" fill="#eafff6" fillOpacity=".6" />
      {/* penalty arcs — centred on penalty spot, radius ~29, drawn only outside the box */}
      <path d="M78 126.5 A29 29 0 0 1 78 173.5" fill="none" stroke="#eafff6" strokeOpacity=".3" strokeWidth="2" />
      <path d="M322 126.5 A29 29 0 0 0 322 173.5" fill="none" stroke="#eafff6" strokeOpacity=".3" strokeWidth="2" />
    </svg>
  );
}

export default function IntroView() {
  const { state, dispatch } = useGame();
  const [mode, setMode] = useState(state.mode || 'normal');

  const modeNotes = {
    long: '每个赛季一次决策，完整走一遍',
    normal: '每两个赛季一次决策，节奏适中',
    express: '每三个赛季一次决策，快速过完',
  };

  return (
    <section className="view intro">
      <p className="eyebrow">生涯模拟器</p>
      <h1 className="hero-title">
        从足校到退役<br />把一辈子走一遍
      </h1>

      <div className="hero-art">
        <HeroArt />
      </div>

      <p className="hero-sub">
        选出身，做选择，承担后果。能力、关系、清白、名气四条线一起往前走，
        最后给你一份没人替你写的履历。
      </p>

      <div className="segmented">
        {['long', 'normal', 'express'].map((m) => (
          <button
            key={m}
            className={`seg ${mode === m ? 'selected' : ''}`}
            onClick={() => {
              setMode(m);
              dispatch({ type: 'SET_MODE', mode: m });
            }}
          >
            {{ long: '硬核', normal: '普通', express: '快进' }[m]}
          </button>
        ))}
      </div>
      <p className="seg-note">{modeNotes[mode]}</p>

      <div className="btn-stack">
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: 'START_IDENTITY' })}
        >
          开始生涯
        </button>
      </div>
    </section>
  );
}
