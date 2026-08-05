import React from 'react';
import { useGame } from '../GameContext';

export default function HelpModal() {
  const { state, dispatch } = useGame();
  if (!state.showHelp) return null;

  return (
    <div className="overlay" onClick={(e) => {
      if (e.target === e.currentTarget) dispatch({ type: 'TOGGLE_HELP' });
    }}>
      <div className="modal">
        <button className="modal-close" onClick={() => dispatch({ type: 'TOGGLE_HELP' })}>✕</button>
        <h2>玩法说明</h2>
        <p className="news-link">
          <button className="mini-btn" onClick={() => { dispatch({ type: 'TOGGLE_HELP' }); dispatch({ type: 'TOGGLE_NEWS' }); }}>
            看看最近更新了什么
          </button>
        </p>
        <p>你是一个 16 岁的球员，一路踢到退役。每隔一到三个赛季做一次选择，中间的比赛自动模拟。</p>

        <h3>四条线</h3>
        <ul>
          <li><strong>能力</strong> 决定数据、荣誉、谁会来买你。二十六七岁见顶，之后一路往下。</li>
          <li><strong>关系</strong> 影响国字号征召、队内首发、哨子松紧。高不一定是好事。</li>
          <li><strong>清白</strong> 平时看不见，反腐、查税、抽检的时候一次性结账。会随时间自然往下掉。</li>
          <li><strong>名气</strong> 影响舆论事件和场外收入。骂你的人也算名气。</li>
        </ul>

        <h3>几条规矩</h3>
        <ul>
          <li>连续几期出场太少，俱乐部就不续约了；没人报价就只能退役。</li>
          <li>出国踢球以后，国内那套事件不会再找你，换成另一套麻烦。</li>
          <li>结局称号由整段生涯算出来，不是随机的。</li>
          <li>同一个种子会走出同样的一生，想复盘就把种子记下来。</li>
        </ul>
      </div>
    </div>
  );
}
