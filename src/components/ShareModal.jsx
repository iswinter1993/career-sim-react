import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';

export default function ShareModal() {
  const { state, dispatch } = useGame();
  const { simState } = state;
  const [showName, setShowName] = useState(true);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  if (!state.showShare) return null;

  const profile = simState ? SIM.buildProfile() : null;

  // Draw share card on canvas
  useEffect(() => {
    if (!canvasRef.current || !simState) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = 680;
    const h = 960;
    canvas.width = w;
    canvas.height = h;

    // Background
    ctx.fillStyle = '#0e100f';
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = '#2a4a35';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Title
    ctx.fillStyle = '#6ede8a';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('足一把 · 生涯模拟器', w / 2, 70);

    // Player info
    ctx.fillStyle = '#eafff6';
    ctx.font = 'bold 48px sans-serif';
    const name = showName ? (simState.name || '—') : '***';
    ctx.fillText(name, w / 2, 150);

    if (profile) {
      ctx.fillStyle = '#8d9aa6';
      ctx.font = '24px sans-serif';
      ctx.fillText(`生涯 OVR ${Math.round(profile.ovr)} · 巅峰 ${Math.round(profile.maxOvr || profile.ovr)}`, w / 2, 190);
      ctx.fillText(`${profile.seasons} 个赛季 · ${profile.clubs} 家俱乐部 · ${profile.caps} 次国家队出场`, w / 2, 225);

      // Stats
      ctx.fillStyle = '#6ede8a';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`出场 ${profile.apps} · 进球 ${profile.goals} · 助攻 ${profile.assists}`, w / 2, 280);

      // Divider
      ctx.strokeStyle = '#2a4a35';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, 310);
      ctx.lineTo(w - 80, 310);
      ctx.stroke();

      // Trophies
      ctx.fillStyle = '#eafff6';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('荣誉', w / 2, 360);
      ctx.font = '22px sans-serif';
      const trophies = simState.trophies || [];
      if (trophies.length > 0) {
        const trophyText = trophies.slice(0, 6).map((t) => typeof t === 'string' ? t : t.name).join(' · ');
        ctx.fillStyle = '#c98a45';
        ctx.fillText(trophyText, w / 2, 400);
      } else {
        ctx.fillStyle = '#8d9aa6';
        ctx.fillText('—', w / 2, 400);
      }

      // Clubs
      const clubs = simState.clubsPlayed || [];
      if (clubs.length > 0) {
        ctx.fillStyle = '#eafff6';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('效力过的球队', w / 2, 460);
        ctx.font = '22px sans-serif';
        clubs.forEach((clubId, i) => {
          const team = SIM.getTeamById(clubId);
          ctx.fillStyle = '#8d9aa6';
          ctx.fillText(team?.name || clubId, w / 2, 495 + i * 30);
        });
      }

      // Ending
      const endings = SIM.getEndings();
      // Prefer engine-assigned ending; fall back to profile matching
      let ending = simState?.rid ? endings.find((e) => e.id === simState.rid) : null;
      if (!ending && profile) {
        let best = null;
        for (const e of endings) {
          if (e.test && e.test(profile)) {
            if (!best || (e.tier ?? 9) < (best.tier ?? 9)) best = e;
          }
        }
        ending = best;
      }
      if (ending) {
        ctx.fillStyle = '#d99b1c';
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(ending.title, w / 2, h - 120);
        ctx.fillStyle = '#8d9aa6';
        ctx.font = '20px sans-serif';
        ctx.fillText(ending.desc || '', w / 2, h - 85);
      }
    }

    // Copy to img for WeChat
    if (imgRef.current) {
      imgRef.current.src = canvas.toDataURL('image/png');
    }
  }, [simState, showName, state.showShare]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const canvas = canvasRef.current;
        if (canvas) {
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          const file = new File([blob], 'career-sim.png', { type: 'image/png' });
          await navigator.share({ files: [file], title: '足一把-生涯模拟器', text: '我的中国球员生涯' });
        }
      } catch (e) {
        // User cancelled
      }
    }
  };

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('已复制到剪贴板');
    } catch (e) {
      alert('复制失败，请长按图片保存');
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `career-sim-${simState?.name || 'player'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Detect WeChat
  const isWechat = typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent);

  return (
    <div className="overlay" onClick={(e) => {
      if (e.target === e.currentTarget) dispatch({ type: 'TOGGLE_SHARE' });
    }}>
      <div className="modal share-modal">
        <button className="modal-close" onClick={() => dispatch({ type: 'TOGGLE_SHARE' })}>✕</button>
        <p className="share-eyebrow">生涯结束</p>
        <h2 className="share-title">分享你的生涯</h2>

        <div className="share-card-wrap">
          <canvas ref={canvasRef} id="share-canvas" />
          <img
            ref={imgRef}
            id="share-img"
            className={isWechat ? '' : 'hidden'}
            alt="生涯分享卡"
          />
        </div>
        {isWechat && (
          <p className="share-tip">长按上面这张图 → 发送给朋友 / 保存图片</p>
        )}

        <label className="share-toggle">
          <span>显示姓名</span>
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
          <i></i>
        </label>

        <div className="share-actions">
          {navigator.share && (
            <button className="share-btn" onClick={handleShare} title="分享">
              <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4" /></svg>
            </button>
          )}
          <button className="share-btn" onClick={handleCopy} title="复制图片">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="12" rx="2" /><path d="M15 5H6a2 2 0 0 0-2 2v9" /></svg>
          </button>
          <button className="share-btn" onClick={handleSave} title="保存图片">
            <svg viewBox="0 0 24 24"><path d="M12 4v11M8 11l4 4 4-4" /><path d="M5 19h14" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
