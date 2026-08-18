import React from 'react';
import { useGame } from '../GameContext';

export default function TopBar() {
  const { dispatch } = useGame();

  return (
    <header className="topbar">
      <button className="brand" onClick={() => dispatch({ type: 'BACK_TO_INTRO' })}>
        <span className="brand-mark">⚽</span>足一把-生涯模拟器
      </button>
      <div className="topbar-actions">
        <button
          className="corner-btn"
          onClick={() => dispatch({ type: 'OPEN_DEMO' })}
        >
          模拟器
        </button>
        <button
          id="btn-help"
          className="corner-btn"
          onClick={() => dispatch({ type: 'TOGGLE_HELP' })}
        >
          玩法
        </button>
      </div>
    </header>
  );
}
