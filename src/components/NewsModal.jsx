import React, { useState } from 'react';
import { useGame } from '../GameContext';

export default function NewsModal() {
  const { state, dispatch } = useGame();
  const [copied, setCopied] = useState(false);

  if (!state.showNews) return null;

  const copyQQ = () => {
    navigator.clipboard?.writeText('1030761725');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overlay" onClick={(e) => {
      if (e.target === e.currentTarget) dispatch({ type: 'TOGGLE_NEWS' });
    }}>
      <div className="modal">
        <button className="modal-close" onClick={() => dispatch({ type: 'TOGGLE_NEWS' })}>✕</button>
        <h2>更新公告</h2>
        <p className="news-date">2026 年 7 月 30 日</p>

        <div className="qq-group">
          <div>
            <span className="qq-label">足一把交流群</span>
            <span className="qq-num">1030761725</span>
          </div>
          <button className="mini-btn" onClick={copyQQ}>
            {copied ? '已复制 ✓' : '复制群号'}
          </button>
        </div>

        <ul className="news-list">
          <li>
            二十岁以前不再动不动就报销。伤病概率以前是一条不看年龄的线，
            十六七岁抽到跟腱断裂，那会儿能力才四十几，扣掉的是全部家当 ——
            这一局在还没开始的时候就废了。现在十八岁以前几乎不打断、十九到二十一岁也调低了一大截，
            二十二岁往后一点没动 —— 该挨的还是那么多，只是不在你还没长起来的时候挨。
          </li>
          <li>
            「从头来过」那个按钮原来做得跟正文一样淡，藏得太好，想重开一局的人找不着。
            现在描出来了。
          </li>
          <li>
            猜球员那个也在：<a href="https://zuyiba.pages.dev/" target="_blank" rel="noopener">zuyiba.pages.dev</a>
          </li>
        </ul>
      </div>
    </div>
  );
}
