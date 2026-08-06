import React, { useMemo } from 'react';
import { useGame } from '../GameContext';
import SIM from '../simEngine';
import Crest from './Crest';
import { PitchIcon, StarIcon, TrophyIcon, getOVRTier } from './Icons';

// OVR badge color class — uses same thresholds as getOVRTier in Icons.jsx
function ovrClass(ovr) {
  const tier = getOVRTier(ovr);
  if (tier) return tier;
  return 'base';
}

// Competition ranking labels
const RANK_LABELS = ['预选赛出局', '小组赛出局', '止步十六强', '止步八强', '止步四强', '亚军', '冠军'];

export default function SummaryView() {
  const { state, dispatch } = useGame();
  const { simState } = state;

  const profile = useMemo(() => {
    if (!simState) return null;
    return SIM.buildProfile();
  }, [simState]);

  if (!profile) {
    return (
      <section className="view" id="view-summary">
        <div className="empty">生涯数据缺失</div>
      </section>
    );
  }

  // Engine stores per-club stats in the season array.
  // CareerView uses simState.seasons (not simState.played).
  const clubStats = useMemo(() => {
    const seasons = simState?.seasons || [];
    const byClub = {};
    seasons.forEach((s, i) => {
      if (!s.teamId) return;
      const key = String(s.teamId);
      if (!byClub[key]) {
        byClub[key] = { teamId: s.teamId, teamName: s.teamName || '', apps: 0, goals: 0, assists: 0, trophies: [], firstSeason: 16 + i };
      }
      byClub[key].apps += s.apps || 0;
      byClub[key].goals += s.goals || 0;
      byClub[key].assists += s.assists || 0;
      (s.trophies || []).forEach((t) => {
        if (!byClub[key].trophies.includes(t)) byClub[key].trophies.push(t);
      });
    });
    return Object.values(byClub).sort((a, b) => (a.firstSeason ?? 0) - (b.firstSeason ?? 0));
  }, [simState]);

  // Trophies grouped by name for the trophy hall
  const trophyCounts = useMemo(() => {
    const trophies = simState?.trophies || [];
    const counts = {};
    trophies.forEach((t) => {
      const name = typeof t === 'string' ? t : t.name || t;
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [simState]);

  // Replicate engine's goSummary ending-matching:
  // iterate DATA.ENDINGS, run test(profile), pick lowest-tier match.
  const { ending, endingTitle, endingDesc } = useMemo(() => {
    const endings = SIM.getEndings();
    let best = null;
    for (const e of endings) {
      if (e.test && e.test(profile)) {
        if (!best || (e.tier ?? 9) < (best.tier ?? 9)) {
          best = e;
        }
      }
    }
    // Engine stores the ending id in simState.rid (set by goSummary).
    // Prefer the engine-assigned ending; otherwise fall back to profile matching.
    const engineEnding = simState?.rid ? endings.find((e) => e.id === simState.rid) : null;
    const match = engineEnding || best;
    return {
      ending: match,
      endingTitle: match?.title || '生涯结束',
      endingDesc: match?.desc || '',
    };
  }, [profile, simState]);

  // Build ending text line
  const endingLine = useMemo(() => {
    const parts = [];
    if (profile.age) parts.push(`${profile.age} 岁`);
    if (profile.seasons) parts.push(`${profile.seasons} 个赛季`);
    parts.push(`${profile.clubs} 家俱乐部`);
    return parts.join(' · ');
  }, [profile]);

  const handleShare = () => dispatch({ type: 'TOGGLE_SHARE' });
  const handleReplay = () => dispatch({ type: 'RESTART' });

  // Peak-value age: find the season where ovr was highest, for accurate valueOf
  const maxOvrAge = useMemo(() => {
    const seasons = simState?.seasons || [];
    let max = 0, bestAge = 16;
    seasons.forEach((s, i) => {
      if ((s.ovr || 0) > max) { max = s.ovr; bestAge = 16 + i; }
    });
    return max > 0 ? bestAge : 20; // fallback to a typical peak age
  }, [simState]);
  const totalApps = clubStats.reduce((s, c) => s + c.apps, 0);
  const totalGoals = clubStats.reduce((s, c) => s + c.goals, 0);
  const totalAssists = clubStats.reduce((s, c) => s + c.assists, 0);

  return (
    <section className="view" id="view-summary">
      {/* Top section: hero + cards */}
      <div className="sum-top">
        <div className="sum-main">
          <div className="ending-eyebrow">生涯结束 · {endingLine}</div>
          <div className="sum-hero">
            <div className="sum-hero-main">
              <div className="sum-name">{simState?.name || '—'}</div>
              <div className="tag-row">
                <span className="tag">{simState?.origin || ''}</span>
                <span className="tag blue">#{simState?.number || 0} {simState?.pos || '—'}</span>
              </div>
            </div>
            <div className="sum-hero-side">
              <div className="cr-l">最高身价</div>
              <div className="cr-v">{SIM.fmtValue(SIM.valueOf(profile.maxOvr, maxOvrAge))}</div>
            </div>
            <div className={`ovr-badge ${ovrClass(profile.maxOvr)}`}>
              <div className="ovr-badge-l">OVR</div>
              <div className="ovr-badge-v">{Math.round(profile.maxOvr)}</div>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-cell">
              <div className="stat-l">
                <PitchIcon />出场
              </div>
              <div className="stat-v">{totalApps}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-l">
                <StarIcon />进球
              </div>
              <div className="stat-v">{totalGoals}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-l">
                <TrophyIcon />助攻
              </div>
              <div className="stat-v">{totalAssists}</div>
            </div>
          </div>
        </div>

        {/* National team card */}
        <div className="sum-card nat">
          <div className="sum-card-l">国家队</div>
          <div className="sum-card-title">中国</div>
          <div className="sum-card-stat">{profile.caps} 次出场</div>
          <div className="nat-best">
            <div>
              <span>世界杯</span>
              <b>{profile.wcRank != null && profile.wcRank >= 0 ? RANK_LABELS[profile.wcRank] || '—' : '没打进正赛'}</b>
              {profile.wcAge && <i>{profile.wcAge} 岁</i>}
            </div>
            <div>
              <span>亚洲杯</span>
              <b>{profile.asiaRank != null && profile.asiaRank >= 0 ? RANK_LABELS[profile.asiaRank] || '—' : '—'}</b>
              {profile.asiaAge && <i>{profile.asiaAge} 岁</i>}
            </div>
          </div>
        </div>

        {/* Awards card */}
        <div className="sum-card awards">
          <div className="sum-card-l">个人奖项</div>
          {profile.awards > 0 ? (
            <>
              <div className="sum-card-title">{profile.awards} 项</div>
              {/* state.awards is [{name: '中超金靴', age: 24}, ...]. Group by name
                  for a compact chip list. Note: profile.award() expects the CHINESE
                  name (e.g. '中超金靴'), not the AWARDS map key (e.g. 'cslboot'). */}
              {(() => {
                const byName = {};
                (simState?.awards || []).forEach((a) => {
                  const n = typeof a === 'string' ? a : a.name;
                  if (!byName[n]) byName[n] = { count: 0, ages: [] };
                  byName[n].count++;
                  if (typeof a === 'object' && a.age) byName[n].ages.push(a.age);
                });
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                    {Object.entries(byName).map(([name, info]) => (
                      <span key={name} className="chip award">
                        ×{info.count} {name}
                        {info.ages.length > 0 && (
                          <i style={{ fontStyle: 'normal', opacity: 0.75 }}> · {info.ages.join('/')}岁</i>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="case-empty">奖杯柜是空的</div>
          )}
        </div>
      </div>

      {/* Trophy hall */}
      <div className="section-head">
        <h2>奖杯陈列</h2>
        <span>{simState?.trophies?.length || 0} 座</span>
      </div>
      {Object.keys(trophyCounts).length > 0 ? (
        <div className="trophy-hall">
          {Object.entries(trophyCounts).map(([name, count]) => (
            <div key={name} className="hall-item">
              <span className="trophy" role="img" aria-label={name}>
                {name.includes('杯') || name.includes('冠军') ? '🏆' : '🥇'}
              </span>
              {count > 1 && <span className="hall-count">×{count}</span>}
              <span className="hall-name">{name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="trophy-hall empty-hall">一座也没有</div>
      )}

      {/* Club cards */}
      <div className="section-head">
        <h2>效力过的俱乐部</h2>
        <span>{clubStats.length} 家</span>
      </div>
      <div className="club-grid">
        {clubStats.map((club, i) => {
          const team = SIM.getTeamById(club.teamId);
          const color = team?.color || '#333';
          return (
            <div key={i} className="club-card" style={{ '--tc': color }}>
              <div className="club-card-wash">
                <Crest team={team} />
              </div>
              <div className="club-card-body">
                <div className="club-card-crest">
                  <Crest team={team} />
                </div>
                <div className="club-card-name">{team?.name || club.teamName || '—'}</div>
                <div className="club-card-lg">{SIM.getLeagueById(team?.league)?.name || ''}</div>
                <div className="club-card-stats">
                  <span><b>{club.apps}</b>出场</span>
                  <span><b>{club.goals}</b>进球</span>
                  <span><b>{club.assists}</b>助攻</span>
                </div>
                <div className="club-card-tro">
                  {club.trophies.length > 0 && club.trophies.map((t, j) => (
                    <span key={j} className="chip" style={{ fontSize: '0.6rem' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ending */}
      <div className="ending" data-ending={ending?.id || ''}>
        <div className="ending-eyebrow">结局</div>
        <div className="ending-title-wrap">
          <div className="ending-glow" aria-hidden="true">{endingTitle}</div>
          <div className="ending-title">{endingTitle}</div>
        </div>
        <div className="ending-desc">{endingDesc}</div>
      </div>

      {/* Actions */}
      <div className="btn-stack" style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-primary" onClick={handleReplay}>再来一次</button>
        <button className="btn" onClick={handleShare}>分享生涯</button>
      </div>
    </section>
  );
}
