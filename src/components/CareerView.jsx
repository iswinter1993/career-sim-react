import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';
import Crest from './Crest';
import { PitchIcon, StarIcon, TrophyIcon, getOVRTier } from './Icons';

function OVRBadge({ ovr, prevOvr }) {
  const tier = getOVRTier(ovr);

  let anim = '';
  if (prevOvr !== null && prevOvr !== undefined) {
    anim = ovr > prevOvr ? 'up' : ovr < prevOvr ? 'down' : '';
  }

  return (
    <div className={`ovr-badge ${tier} ${anim}`}>
      <div className="ovr-badge-l">OVR</div>
      <div className="ovr-badge-v">{Math.round(ovr)}</div>
    </div>
  );
}

function ClubBar({ team, playerName, pos, role, seasonWage, prevOvr }) {
  const ovr = Math.round(SIM.state()?.ovr || 0);
  const roleObj = team ? SIM.getRole(role) : null;
  const roleName = roleObj?.name || role || '';

  const crestEl = team ? <Crest team={team} size="lg" /> : null;

  return (
    <div className="club-bar">
      <OVRBadge ovr={ovr} prevOvr={prevOvr} />
      <div className="club-bar-main">
        <div className="tag-row">
          <span className="tag blue">{pos || '—'}</span>
          <span className="tag">{roleName}</span>
        </div>
        <div className="player-name">{playerName || '—'}</div>
        <div className="club-line">
          {crestEl}
          <span className="club-name-big">{team?.name || '无球队'}</span>
        </div>
      </div>
      <div className="club-right">
        <div className="cr-l">年薪</div>
        <div className="cr-v">{seasonWage != null ? SIM.fmtMoney(seasonWage) : '—'}</div>
      </div>
    </div>
  );
}

function StatRow({ stats }) {
  return (
    <div className="stat-row">
      <div className="stat-cell">
        <div className="stat-l">出场</div>
        <div className="stat-v">{stats?.apps || 0}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-l">进球</div>
        <div className="stat-v">{stats?.goals || 0}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-l">助攻</div>
        <div className="stat-v">{stats?.assists || 0}</div>
      </div>
    </div>
  );
}

function Bars({ simState }) {
  if (!simState) return null;
  const { ovr, guanxi, clean, fame, careerEarnings } = simState;

  return (
    <>
      <div className="bars">
        <div className="bar">
          <span className="bar-l">能力</span>
          <div className="bar-t"><div className="bar-f" style={{ width: `${ovr}%`, background: 'hsl(var(--gold1))' }} /></div>
          <span className="bar-v">{Math.round(ovr)}</span>
        </div>
        <div className="bar">
          <span className="bar-l">关系</span>
          <div className="bar-t"><div className="bar-f" style={{ width: `${guanxi}%`, background: 'hsl(var(--info))' }} /></div>
          <span className="bar-v">{Math.round(guanxi)}</span>
        </div>
        <div className="bar">
          <span className="bar-l">清白</span>
          <div className="bar-t"><div className="bar-f" style={{ width: `${clean}%`, background: 'hsl(var(--accent))' }} /></div>
          <span className="bar-v">{Math.round(clean)}</span>
        </div>
        <div className="bar">
          <span className="bar-l">名气</span>
          <div className="bar-t"><div className="bar-f" style={{ width: `${fame}%`, background: 'hsl(var(--warning))' }} /></div>
          <span className="bar-v">{Math.round(fame)}</span>
        </div>
      </div>
      <div className="money-row">
        <span>生涯财富</span>
        <b className={careerEarnings < 0 ? 'neg' : ''}>{SIM.fmtMoney(Math.abs(careerEarnings))}</b>
      </div>
    </>
  );
}

function TrophyBlock({ simState }) {
  const trophies = simState?.trophies || [];
  const awards = simState?.awards || [];

  if (trophies.length === 0 && awards.length === 0) {
    return (
      <div className="trophy-block empty">
        <div className="shelf empty-case">
          <div className="empty-case-icon">🏆</div>
          <div className="empty-case-t">暂无荣誉</div>
        </div>
      </div>
    );
  }

  return (
    <div className="trophy-block">
      <div className="shelf">
        {trophies.map((t, i) => (
          <span key={`t-${i}`} className="chip">{typeof t === 'string' ? t : t.name}</span>
        ))}
        {awards.map((a, i) => (
          <span key={`a-${i}`} className="chip award">{typeof a === 'string' ? a : a.name}</span>
        ))}
      </div>
    </div>
  );
}

// Timeline component
function Timeline({ seasons, currentAge }) {
  return (
    <div className="timeline">
      <div className="tl-head tl-cols">
        <span>年龄</span>
        <span>俱乐部</span>
        <span className="r">能力</span>
        <span className="r"><PitchIcon /></span>
        <span className="r"><StarIcon /></span>
        <span className="r hide-xs"><TrophyIcon /></span>
      </div>
      <div className="tl-scroll">
        {(!seasons || seasons.length === 0) && (
          <div style={{ padding: '1.2rem 1rem', textAlign: 'center', color: 'hsl(var(--faint))', fontSize: '.82rem' }}>
            暂无赛季数据
          </div>
        )}
        {seasons && seasons.map((s, i) => {
          const age = 16 + i;
          // currentAge is the engine's age; the active season (isNow) is the one
          // where the season index equals currentAge - 16 (since seasons[0] is age 16).
          const isNow = i === currentAge - 16;
          const team = SIM.getTeamById(s.teamId);
          const ovrTier = getOVRTier(s.ovr);

          const ageChipColor = team?.color || (s.teamId ? '#1A6FB4' : 'transparent');
          const ageChipStyle = ageChipColor ? { background: ageChipColor, color: '#fff' } : {};

          return (
            <div key={i} className={`tl-row tl-cols ${isNow ? 'now' : 'done'}`}>
              <span className="age-chip" style={ageChipStyle}>{age}</span>
              <span className="tl-club">
                <Crest team={team} size="sm" />
                <span className="tl-club-name">{team?.name || '—'}</span>
                {s.note && (
                  <span className="tl-badges">
                    <span className={`mini-badge ${s.note.includes('禁赛') ? 'bad' : s.note.includes('预选') || s.note.includes('出局') ? 'nat' : ''}`}>{s.note}</span>
                  </span>
                )}
              </span>
              <span className="r"><span className={`ovr-pill ${ovrTier}`}>{s.ovr != null ? Math.round(s.ovr) : '—'}</span></span>
              <span className="tl-n r">{Number(s.apps ?? 0)}</span>
              <span className="tl-n r">{Number(s.goals ?? 0)}</span>
              <span className="tl-n r hide-xs">{Number(s.assists ?? 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Slot-machine spinning animation for probabilistic event options.
// Alternates between "a" and "b" labels ~13 times, then settles on the correct outcome.
function SpinningSlot({ spinning, onComplete }) {
  const [tick, setTick] = useState(0);
  const totalTicks = 13;
  const timerRef = useRef(null);

  useEffect(() => {
    if (!spinning) return;

    // Adjust total ticks so the final tick lands on the correct label.
    // isATick = tick % 2 === 0, so even ticks show label "a", odd ticks show "b".
    // When ok=true (good outcome), final tick must be even → shows "a".
    // When ok=false (bad outcome), final tick must be odd → shows "b".
    const targetIsA = spinning.ok;
    let finalTickCount = totalTicks;
    if (finalTickCount % 2 === 0 && targetIsA) finalTickCount++;
    else if (finalTickCount % 2 === 1 && !targetIsA) finalTickCount++;

    let current = 0;
    const run = () => {
      if (current >= finalTickCount - 1) {
        setTick(finalTickCount - 1);
        timerRef.current = setTimeout(onComplete, 520);
        return;
      }
      current++;
      setTick(current);
      // Easing: shorter delays early, longer near the end
      const progress = current / (finalTickCount - 1);
      const delay = 90 + 420 * Math.pow(progress, 2.2);
      timerRef.current = setTimeout(run, delay);
    };
    run();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [spinning, onComplete]);

  if (!spinning) return null;

  const isATick = tick % 2 === 0;
  // Clamp: engine may compute dynamic probs like Math.max(0.7, (ovr-50)/40)
  // that exceed 1.0. c() handles it, but SIM_RT stores the raw value.
  const p = Math.min(Math.max(spinning.p, 0), 1);
  const pct = Math.round(p * 100);

  return (
    <div className="event">
      <div className="roulette" data-state="spin">
        <div className={'slot' + (isATick ? ' on' : '')}>
          <div className="slot-pct">{pct}%</div>
          <div className="slot-lab">{spinning.a}</div>
        </div>
        <div className="roulette-vs">抽签中...</div>
        <div className={'slot' + (isATick ? '' : ' on')}>
          <div className="slot-pct">{100 - pct}%</div>
          <div className="slot-lab">{spinning.b}</div>
        </div>
      </div>
    </div>
  );
}

// Template substitution: replace {club}, {league}, {rival} placeholders
// with actual team/league/rival names from the engine.
// The engine's own interpolate() method handles this.
function substituteEventText(text) {
  if (!text) return text;
  return SIM.interpolate(text);
}

// Event / Decision component
function EventPanel({ pendingEvent, pendingResult, onChoose, onContinue }) {
  if (!pendingEvent) return null;

  const type = pendingEvent?.type;

  // Event choice (also handles 'random' type - random events like cn_leader)
  if (type === 'event' || type === 'random') {
    // Check if we already committed and have a result to show
    // pendingResult can be:
    //   - engine's pending.result (object {text, deltas}) set by commitEvent
    //   - the full resolved object {res, opt, roll} as fallback
    const hasResult = !!pendingResult;
    const resultObj = pendingResult;

    if (hasResult && resultObj) {
      // Extract text and deltas from the result object
      const resultText = resultObj.text || resultObj.res?.text || '';
      const deltas = resultObj.deltas || [];

      if (resultText || deltas.length > 0) {
        return (
          <div className="event">
            <div className="result">
              {substituteEventText(resultText)}
              {deltas.length > 0 && (
                <div className="deltas">
                  {deltas.map((d, i) => (
                    <span key={i} className={`delta ${d.cls}`}>{d.text}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="btn-stack" style={{ marginTop: '0.5rem' }}>
              <button className="btn btn-primary" onClick={onContinue}>
                继续
              </button>
            </div>
          </div>
        );
      }
    }

    const events = window.EVENTS || [];
    const ev = events.find((e) => e.id === pendingEvent.eventId);
    if (!ev) {
      return (
        <div className="event">
          <div className="ev-title">未知事件</div>
          <div className="btn-stack" style={{ marginTop: '0.5rem' }}>
          </div>
        </div>
      );
    }

    return (
      <div className="event">
        <div className="ev-head">
          <div className="ev-icon">{ev.icon || '📋'}</div>
          <div className="ev-head-main">
            <span className="ev-tag decision">决策</span>
            <div className="ev-title">{substituteEventText(ev.title) || '事件'}</div>
          </div>
        </div>
        <div className="ev-desc">{substituteEventText(ev.desc) || ''}</div>
        <div className={`opts`} data-n={Math.min(ev.options?.length || 2, 3)}>
          {(ev.options || []).map((opt, i) => (
            <button key={i} className="opt" onClick={() => onChoose(i)}>
              <span className="opt-label">{substituteEventText(opt.label) || `选项 ${i + 1}`}</span>
              {opt.hint && <span className="opt-hint">{substituteEventText(opt.hint)}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Academy offers
  if (type === 'academy') {
    const offers = pendingEvent.offers || [];
    const offerTeams = offers.map((id) => SIM.getTeamById(id)).filter(Boolean);

    return (
      <div className="event">
        <div className="ev-head">
          <div className="ev-icon">⚽</div>
          <div className="ev-head-main">
            <span className="ev-tag decision">签约</span>
            <div className="ev-title">选择一家青训俱乐部</div>
          </div>
        </div>
        <div className="ev-desc">趁着年轻，选一个好的起点。近水楼台的机会更大。</div>
        <div className={`opts`} data-n={Math.min(offerTeams.length, 3)}>
          {offerTeams.map((team, i) => {
            const league = SIM.getLeagueById(team.league);
            return (
              <button key={i} className="opt" onClick={() => onChoose(i)}>
                <Crest team={team} size="lg" />
                <span className="opt-label">{team.name}</span>
                <span className="opt-hint">{league?.name || ''} · 声望 {team.rep}/5</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Transfer offers
  if (type === 'transfer') {
    const offers = pendingEvent.offers || [];
    const offerTeams = offers.map((id) => SIM.getTeamById(id)).filter(Boolean);
    const canStay = pendingEvent.canStay;
    const canRetire = pendingEvent.canRetire;
    const fired = pendingEvent.fired;

    return (
      <div className="event">
        <div className="ev-head">
          <div className="ev-icon">{fired ? '📋' : '🔄'}</div>
          <div className="ev-head-main">
            <span className="ev-tag decision">转会</span>
            <div className="ev-title">
              {fired ? '球队不打算续约了' : '有球队对你感兴趣'}
            </div>
          </div>
        </div>
        <div className="ev-desc">
          {fired
            ? '看看有没有人要你。没人报价就只能退役了。'
            : '选择一个下家，或者留在现在的球队。'}
        </div>
        {offerTeams.length > 0 && (
          <div className={`opts`} data-n={Math.min(offerTeams.length, 3)}>
            {offerTeams.map((team, i) => {
              const league = SIM.getLeagueById(team.league);
              return (
                <button key={i} className="opt" onClick={() => onChoose(i)}>
                  <Crest team={team} size="lg" />
                  <span className="opt-label">{team.name}</span>
                  <span className="opt-hint">{league?.name || ''} · 声望 {team.rep}/5</span>
                </button>
              );
            })}
          </div>
        )}
        {(canStay || canRetire) && (
          <div className="opts opts-alt">
            {canStay && (
              <button className="opt" onClick={() => onChoose('stay')}>
                <span className="opt-lead">留下</span>
                <span className="opt-label">留在现在的球队</span>
              </button>
            )}
            {canRetire && (
              <button className="opt" onClick={() => onChoose('retire')}>
                <span className="opt-lead">挂靴</span>
                <span className="opt-label">退役</span>
              </button>
            )}
          </div>
        )}
        {offerTeams.length === 0 && !canStay && !canRetire && (
          <div className="btn-stack" style={{ marginTop: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => onChoose('end')}>
              结束生涯
            </button>
          </div>
        )}
      </div>
    );
  }

  // Season recap (or 'report' type from engine)
  if (type === 'recap' || type === 'report') {
    const recs = pendingEvent.recs || [];
    return (
      <div className="event">
        <div className="ev-head">
          <div className="ev-icon">⏱️</div>
          <div className="ev-head-main">
            <span className="ev-tag">赛季</span>
            <div className="ev-title">赛季回顾</div>
          </div>
        </div>
        <div className="result">
          这个赛季过去了。
        </div>
        {recs.length > 0 && (
          <div className="season-mini">
            {recs.map((rec, i) => (
              <div key={i} className="result" style={{ marginTop: '0.25rem', padding: '0.5rem 0.7rem', fontSize: '0.82rem' }}>
                <strong>第{i + 1}赛季</strong> · {rec.teamName} · OVR {Math.round(rec.ovr)}
                {rec.note && ` · ${rec.note}`}
              </div>
            ))}
          </div>
        )}
        <div className="btn-stack" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={onContinue}>
            继续
          </button>
        </div>
      </div>
    );
  }

  // end career
  if (type === 'end') {
    return (
      <div className="event">
        <div className="ev-head">
          <div className="ev-icon">🏁</div>
          <div className="ev-head-main">
            <span className="ev-tag">生涯结束</span>
            <div className="ev-title">没有球队要你了</div>
          </div>
        </div>
        <div className="ev-desc">你的足球生涯到此为止。</div>
        <div className="btn-stack" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={() => onChoose('end')}>
            查看生涯总结
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function CareerView() {
  const { state, dispatch } = useGame();
  const { simState, pendingResult, spinning } = state;

  if (!simState) {
    return <div className="view">加载中...</div>;
  }

  const team = SIM.curTeam();
  const league = SIM.curLeague();
  const seasons = simState.seasons || [];
  const prevSeason = seasons.length > 1 ? seasons[seasons.length - 2] : null;

  const handleSpinComplete = () => {
    dispatch({ type: 'SPIN_COMPLETE' });
  };

  const handleChoose = (index) => {
    if (simState?.phase === 'summary') {
      dispatch({ type: 'GO_SUMMARY', reason: 'end' });
      return;
    }
    if (pendingResult) {
      dispatch({ type: 'CONTINUE' });
      return;
    }

    const pending = simState?.pending;
    if (!pending) {
      dispatch({ type: 'NEXT_STEP' });
      return;
    }

    if (pending.type === 'event' || pending.type === 'random') {
      dispatch({ type: 'CHOOSE_EVENT', index });
    } else if (pending.type === 'academy' || pending.type === 'transfer') {
      if (index === 'retire') {
        dispatch({ type: 'CHOOSE_RETIRE' });
      } else if (index === 'stay') {
        dispatch({ type: 'CHOOSE_STAY' });
      } else if (index === 'end') {
        dispatch({ type: 'GO_SUMMARY', reason: '无处可去' });
      } else {
        dispatch({ type: 'CHOOSE_EVENT', index });
      }
    } else if (pending.type === 'recap' || pending.type === 'report') {
      dispatch({ type: 'CONTINUE' });
    } else if (pending.type === 'end') {
      dispatch({ type: 'GO_SUMMARY', reason: '无处可去' });
    }
  };

  const handleContinue = () => {
    // Engine may have reached summary phase while retaining a pending
    // (e.g. report/recap). If phase is summary, go directly to summary view.
    if (simState?.phase === 'summary') {
      dispatch({ type: 'GO_SUMMARY', reason: 'end' });
      return;
    }
    if (pendingResult) {
      dispatch({ type: 'CONTINUE' });
    } else {
      dispatch({ type: 'NEXT_STEP' });
    }
  };

  // Auto-advance if no pending event
  const needsAdvance = !simState?.pending;
  useEffect(() => {
    if (needsAdvance) {
      const timer = setTimeout(() => {
        dispatch({ type: 'NEXT_STEP' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [needsAdvance, simState?.pending]);

  const handleRestart = () => {
    if (window.confirm('确定要重开一局吗？')) {
      dispatch({ type: 'RESTART' });
    }
  };

  const handleShare = () => {
    dispatch({ type: 'TOGGLE_SHARE' });
  };

  return (
    <section className="view">
      <div id="career-root">
        <div className="career-grid">
          {/* Left column: player card */}
          <div className="col-a">
            <div className="player-card">
              <ClubBar
                team={team}
                playerName={simState.name}
                pos={simState.pos}
                role={simState.role}
                seasonWage={simState.seasonWage}
                prevOvr={prevSeason?.ovr}
              />
              <StatRow stats={simState.totals} />
              <Bars simState={simState} />
              <TrophyBlock simState={simState} />
            </div>
            <div className="restart-row">
              <span>不满意这局？</span>
              <button className="mini-btn" onClick={handleRestart}>从头来过</button>
              <span style={{ flex: 1 }} />
              <button className="mini-btn" onClick={handleShare}>分享</button>
            </div>
          </div>

          {/* Right column: timeline */}
          <div className="col-b">
            <Timeline seasons={seasons} currentAge={simState.age} />
          </div>

          {/* Bottom: events/decisions */}
          <div className="col-c">
            {spinning ? (
              <SpinningSlot spinning={spinning} onComplete={handleSpinComplete} />
            ) : (
              <EventPanel
                pendingEvent={simState?.pending}
                pendingResult={pendingResult}
                onChoose={handleChoose}
                onContinue={handleContinue}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
