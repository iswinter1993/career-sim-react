// MatchView — the main match simulation page (T05)
//
// Layout (top → bottom):
//   ┌──────────────────────────────────┐
//   │  Match Status Bar (score / time) │
//   ├──────────────────────────────────┤
//   │   Canvas Pitch (live animation)  │
//   ├──────────────────────────────────┤
//   │  Tab Panel                       │
//   │  [技术统计] [积分榜] [播报日志]    │
//   ├──────────────────────────────────┤
//   │  Action Buttons (pause / speed)   │
//   └──────────────────────────────────┘
//
// Rendering is driven by derived matchPhase from the state machine:
//   match.init → Loading
//   match.tactics → PreMatchTactics
//   match.playing | match.paused → Main view (Canvas + tabs + buttons)
//   match.finished → Result panel

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../GameContext';
import { MATCH } from '../stateMachine';
import SIM from '../simEngine';
import * as MatchEngine from '../matchEngine';
import { buildTeamSquad, buildOpponentSquad } from '../squadGen';
import PitchCanvas from './PitchCanvas';
import { PreMatchTactics, SubstitutionPanel } from './TacticsPanel';
import { rateAllPlayers } from '../playerRating';
import { mapGrowthToSubAttrs } from '../attributeMapping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iterationToMinute(iteration, maxIters) {
  if (iteration <= 0) return 0;
  // Each half has maxIters iterations → 45 minutes of playing time
  const ratio = iteration / maxIters;
  if (ratio >= 1) return 45;
  return Math.min(45, Math.round(ratio * 45));
}

function fmtRating(v) {
  if (v == null) return '6.0';
  return Number(v).toFixed(1);
}

// Play loop phase machine — one explicit state enum replaces scattered
// boolean refs (pauseRef, finishedRef, playTimerRef).
//   IDLE → RUNNING ⬄ PAUSED  |  RUNNING → FINISHED
const PLAY = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused', FINISHED: 'finished' };

// ---------------------------------------------------------------------------
// MatchView Component
// ---------------------------------------------------------------------------

export default function MatchView() {
  const { state, dispatch, matchPhase } = useGame();
  const { matchState, identity, simState } = state;

  const mIdentity = matchState?.identity || identity;
  const mSimState = matchState?.simState || simState;
  const mSeed = state.seed;

  const [activeTab, setActiveTab] = useState('stats');
  const [error, setError] = useState(null);
  const [fastMode, setFastMode] = useState(false);
  const [showSubPanel, setShowSubPanel] = useState(false);

  // Play-loop refs — survive re-renders so the tick loop always sees
  // the latest values without depending on stale closures.
  //   engineRef — the engine's OWN object reference. Never cloned or
  //               passed through React state — the engine mutates it
  //               in place via playIteration().
  //   playCtrl  — phase machine + timer + speed flag. The tick loop
  //               reads EVERYTHING from these refs directly.
  const engineRef = useRef(null);
  const playCtrl = useRef({ phase: PLAY.IDLE, timer: null, fast: false });
  const tacticsRef = useRef({ formation: '4-4-2', mentality: 'balanced' }); // stored when tactics screen finishes

  // Keep fast flag in the ref so the setTimeout chain sees it instantly
  useEffect(() => { playCtrl.current.fast = fastMode; }, [fastMode]);

  // ------------------------------------------------------------------
  // 1. Initialise match engine — deferred until tactics are confirmed
  // ------------------------------------------------------------------
  useEffect(() => {
    // Only fire init when the match is ready to start playing (tactics done, ready=false)
    if (!matchState || matchState.ready) return;
    // Must have tactics confirmed (tacticsDone) before initializing
    if (!matchState.tacticsDone) return;

    let cancelled = false;

    async function init() {
      try {
        const playerSubAttrs = SIM.getAttributes();
        const leagueLevel = mSimState?.league?.tier || 2;
        const matchSeed = (mSeed || 'default') + '_match';

        // Use formation from tacticsRef (set by PreMatchTactics onStart callback)
        const homeFormation = tacticsRef.current.formation || '4-4-2';
        const homeMentality = tacticsRef.current.mentality || 'balanced';
        // Opponent uses a random different formation for variety
        const oppFormations = Object.keys(_getOpponentFormationPool());
        const awayFormation = oppFormations[Math.floor(Math.random() * oppFormations.length)] || '4-4-2';
        // Opponent mentality varies by league level (higher tier = tougher mentality)
        const awayMentality = leagueLevel <= 2 ? 'balanced' : (Math.random() > 0.5 ? 'defend' : 'balanced');

        const homeSquad = buildTeamSquad(
          { name: mIdentity?.name || 'Player', pos: mIdentity?.pos || 'ST', subAttrs: playerSubAttrs },
          leagueLevel,
          matchSeed + '_home',
          homeFormation
        );
        const awaySquad = buildOpponentSquad('对手联队', leagueLevel, matchSeed + '_away', awayFormation);

        const homeTeam = MatchEngine.buildTeamJson(homeSquad.teamName, homeSquad.starters);
        const awayTeam = MatchEngine.buildTeamJson(awaySquad.teamName, awaySquad.starters);

        const md = await MatchEngine.createMatch(homeTeam, awayTeam, matchState.pitch, {
          homeMentality,
          awayMentality,
          homeFormation,
          awayFormation,
        });

        if (cancelled) return;

        engineRef.current = md;

        dispatch({ type: 'MATCH_READY', matchDetails: md, homeSquad, awaySquad });
      } catch (e) {
        console.error('[MatchView] init failed:', e);
        if (!cancelled) setError('比赛引擎初始化失败: ' + e.message);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [matchState?.tacticsDone]);

  // ------------------------------------------------------------------
  // 2. Match completion
  // ------------------------------------------------------------------
  const completeMatch = useCallback((md) => {
    md._finished = true;
    MatchEngine.destroyMatch();

    const summary = MatchEngine.getMatchSummary(md);
    const stats = MatchEngine.getPlayerStats(md);

    const ratingMatchDetails = {
      homeTeam: (md.kickOffTeam?.players || []).map((p) => ({ id: p.playerID, name: p.name, position: p.position })),
      awayTeam: (md.secondTeam?.players || []).map((p) => ({ id: p.playerID, name: p.name, position: p.position })),
      events: _buildPlayerEvents(md),
      result: summary,
      stats,
      minutesPlayed: {},
    };
    for (const p of ratingMatchDetails.homeTeam.concat(ratingMatchDetails.awayTeam)) {
      ratingMatchDetails.minutesPlayed[p.id] = 90;
    }

    const ratings = rateAllPlayers(ratingMatchDetails);
    const playerAttrs = SIM.getAttributes();
    const potential = SIM.getPotential(playerAttrs);
    const playerRating = ratings.home.find((r) => r.playerID === 'player_self')
      || ratings.away.find((r) => r.playerID === 'player_self');

    let growthDeltas = {};
    if (playerRating && playerRating.rating > 7.0) {
      growthDeltas = mapGrowthToSubAttrs(playerRating.rating, mIdentity?.pos || 'ST', playerAttrs, potential);
    }

    dispatch({
      type: 'MATCH_COMPLETE',
      matchDetails: md,
      result: summary,
      ratings,
      mvp: ratings.mvp,
      growthDeltas,
      matchResult: {
        type: 'match',
        text: buildMatchResultText(summary, playerRating),
        deltas: buildGrowthDisplay(growthDeltas),
      },
    });
  }, [dispatch, mIdentity]);

  // ------------------------------------------------------------------
  // 3. Play loop — tick scheduler driven by playCtrl phase machine
  // ------------------------------------------------------------------
  const runOneTick = useCallback(async () => {
    const ctrl = playCtrl.current;
    if (ctrl.phase !== PLAY.RUNNING) return;
    const md = engineRef.current;
    if (!md) return;

    const maxIters = MatchEngine.DEFAULT_ITERATIONS;
    const burst = ctrl.fast ? 15 : 4;

    let next = md;

    for (let b = 0; b < burst; b++) {
      if (ctrl.phase !== PLAY.RUNNING) return;
      const iter = MatchEngine.getIterationCount(next);
      if (iter >= maxIters && next._half === 2) break;

      next = await MatchEngine.runIteration(next);

      // Half-time transition
      if (MatchEngine.getIterationCount(next) >= maxIters && next._half === 1) {
        next = await MatchEngine.startSecondHalf(next);
        break;
      }
    }

    if (ctrl.phase !== PLAY.RUNNING) return;

    // Match finished?
    if (MatchEngine.getIterationCount(next) >= maxIters && next._half === 2) {
      ctrl.phase = PLAY.FINISHED;
      completeMatch(next);
      return;
    }

    engineRef.current = next;

    dispatch({
      type: 'TICK_ITERATION',
      matchDetails: next,
      iterationLog: MatchEngine.parseIterationEvents(next),
      stats: MatchEngine.getPlayerStats(next),
      half: next._half,
    });
  }, [dispatch, completeMatch]);

  // Tick scheduler — uses the phase-machine ref so neither this
  // callback nor runOneTick closes over pauseRef/finishedRef.
  const scheduleNextTick = useCallback(() => {
    const ctrl = playCtrl.current;
    if (ctrl.phase !== PLAY.RUNNING) return;
    if (ctrl.timer) { clearTimeout(ctrl.timer); ctrl.timer = null; }

    const delay = ctrl.fast ? 5 : 45;
    ctrl.timer = setTimeout(async () => {
      await runOneTick();
      scheduleNextTick();
    }, delay);
  }, [runOneTick]);

  // Play-loop lifecycle — maps React matchPhase to the play phase machine.
  // This single effect replaces the previous pairs of separate refs
  // (pauseRef, finishedRef) + their syncing effects + the timer effect.
  useEffect(() => {
    const ctrl = playCtrl.current;

    // Cleanup any running timer
    if (ctrl.timer) { clearTimeout(ctrl.timer); ctrl.timer = null; }

    switch (matchPhase) {
      case MATCH.PLAYING:
        ctrl.phase = PLAY.RUNNING;
        scheduleNextTick();
        break;
      case MATCH.PAUSED:
      case MATCH.TACTICS:
        ctrl.phase = PLAY.PAUSED;
        break;
      case MATCH.FINISHED:
        ctrl.phase = PLAY.FINISHED;
        break;
      default:
        ctrl.phase = PLAY.IDLE;
        break;
    }

    return () => {
      if (ctrl.timer) { clearTimeout(ctrl.timer); ctrl.timer = null; }
    };
  }, [matchPhase, scheduleNextTick]);

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------
  const handlePauseResume = () => {
    dispatch({ type: matchPhase === MATCH.PAUSED ? 'RESUME_MATCH' : 'PAUSE_MATCH' });
  };

  const handleTacticsDone = (tactics) => {
    // Store formation/mentality choice for the match init effect
    if (tactics) {
      tacticsRef.current = { formation: tactics.formation || '4-4-2', mentality: tactics.mentality || 'balanced' };
    }
    dispatch({ type: 'RESUME_MATCH' });
  };

  const handleSubstitute = (playerOut, playerIn) => {
    const md = engineRef.current;
    if (!md) return;

    // Determine which engine team the player is in
    let teamKey = null;
    for (const key of ['kickOffTeam', 'secondTeam']) {
      const team = md[key];
      if (team?.players?.some((p) => p.playerID === playerOut.id)) {
        teamKey = key;
        break;
      }
    }
    if (!teamKey) return;

    // Apply substitution in the engine
    MatchEngine.applySubstitution(md, teamKey, playerOut.id, playerIn);

    // Update squad references in matchState
    const ms = matchState || {};
    const homeSquad = ms.homeSquad ? { ...ms.homeSquad } : null;
    if (homeSquad) {
      // Swap in home squad's starters/sub list
      const starterIdx = homeSquad.starters.findIndex((p) => p.id === playerOut.id);
      if (starterIdx !== -1) {
        homeSquad.starters = [...homeSquad.starters];
        homeSquad.starters[starterIdx] = { ...playerIn, isPlayer: playerIn.id === 'player_self' };
        homeSquad.subs = homeSquad.subs.filter((p) => p.id !== playerIn.id);
      }
    }

    dispatch({
      type: 'SUBSTITUTE',
      matchDetails: md,
      homeSquad,
      awaySquad: ms.awaySquad,
    });
  };

  const handleLeaveMatch = () => {
    const ctrl = playCtrl.current;
    if (ctrl.timer) { clearTimeout(ctrl.timer); ctrl.timer = null; }
    ctrl.phase = PLAY.FINISHED;
    if (matchState?.growthDeltas && Object.keys(matchState.growthDeltas).length > 0) {
      const attrs = SIM.getAttributes();
      if (attrs) {
        for (const [key, delta] of Object.entries(matchState.growthDeltas)) {
          if (attrs[key] !== undefined) attrs[key] = Math.min(100, (attrs[key] || 0) + delta);
        }
      }
    }
    MatchEngine.destroyMatch();
    dispatch({ type: 'LEAVE_MATCH' });
  };

  // ------------------------------------------------------------------
  // Render — switched by derived matchPhase
  // ------------------------------------------------------------------

  if (matchPhase === MATCH.INIT) {
    return (
      <section className="view match-view">
        <div className="match-loading">
          <div className="match-loading-spinner" />
          <p>正在准备比赛...</p>
        </div>
      </section>
    );
  }

  if (matchPhase === MATCH.TACTICS) {
    return (
      <section className="view match-view">
        <PreMatchTactics
          homeSquad={matchState?.homeSquad}
          playerID="player_self"
          onStart={handleTacticsDone}
        />
      </section>
    );
  }

  if (error) {
    return (
      <section className="view match-view">
        <div className="match-error">
          <p className="match-error-msg">{error}</p>
          <button className="btn btn-primary" onClick={handleLeaveMatch}>返回生涯</button>
        </div>
      </section>
    );
  }

  if (matchPhase === MATCH.FINISHED && matchState?.result) {
    return <MatchResultPanel matchState={matchState} onContinue={handleLeaveMatch} />;
  }

  // match.playing | match.paused — main view with Canvas
  const summary = matchState?.matchDetails ? MatchEngine.getMatchSummary(matchState.matchDetails) : null;
  const iterCount = matchState?.matchDetails ? MatchEngine.getIterationCount(matchState.matchDetails) : 0;
  const minute = iterationToMinute(iterCount, MatchEngine.DEFAULT_ITERATIONS);
  const homeName = matchState?.homeSquad?.teamName || summary?.homeTeamName || '主队';
  const awayName = matchState?.awaySquad?.teamName || summary?.awayTeamName || '客队';
  const isPaused = matchPhase === MATCH.PAUSED;
  const starters = matchState?.homeSquad?.starters || [];
  const subs = matchState?.homeSquad?.subs || [];

  return (
    <section className="view match-view">
      <div className="match-scorebar">
        <div className="match-scorebar-team home">
          <span className="match-scorebar-name">{homeName}</span>
        </div>
        <div className="match-scorebar-center">
          <span className="match-score">{summary?.homeGoals ?? 0}</span>
          <span className="match-score-sep">-</span>
          <span className="match-score">{summary?.awayGoals ?? 0}</span>
          <span className="match-minute">{minute}'</span>
          {matchState?.half === 2 && <span className="match-half-badge">下半场</span>}
        </div>
        <div className="match-scorebar-team away">
          <span className="match-scorebar-name">{awayName}</span>
        </div>
      </div>

      <div className="match-pitch-placeholder">
        <PitchCanvas />
        {isPaused && <div className="match-pause-overlay"><span>已暂停</span></div>}
        {fastMode && !isPaused && <div className="match-fast-indicator">快速模拟中...</div>}
      </div>

      <div className="match-tabpanel">
        <div className="match-tabs">
          {['stats', 'table', 'commentary'].map((tab) => (
            <button
              key={tab}
              className={`match-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'stats' ? '技术统计' : tab === 'table' ? '积分榜' : '播报'}
            </button>
          ))}
        </div>
        <div className="match-tab-content">
          {activeTab === 'stats' && <StatsTab matchState={matchState} />}
          {activeTab === 'table' && <LeagueTableTab />}
          {activeTab === 'commentary' && <CommentaryTab matchState={matchState} />}
        </div>
      </div>

      <div className="match-actions">
        <button className="btn btn-secondary" onClick={handlePauseResume}>
          {isPaused ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button className={`btn ${fastMode ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setFastMode((f) => !f)}>
          {fastMode ? '🐢 正常速度' : '⏩ 快速模拟'}
        </button>
        {isPaused && (
          <button className="btn btn-accent" onClick={() => setShowSubPanel((s) => !s)}>
            {showSubPanel ? '🗑 关闭换人' : '🔄 换人'}
          </button>
        )}
        <span className="match-subs-left">换人剩余: {matchState?.substitutionsLeft ?? 3}</span>
      </div>

      {isPaused && showSubPanel && (
        <SubstitutionPanel
          starters={starters}
          subs={subs}
          substitutionsLeft={matchState?.substitutionsLeft ?? 0}
          onSubstitute={handleSubstitute}
          onResume={() => setShowSubPanel(false)}
          playerID="player_self"
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (unchanged from original)
// ---------------------------------------------------------------------------

function StatsTab({ matchState }) {
  if (!matchState?.matchDetails) return <div className="match-empty-tab">比赛尚未开始</div>;

  const md = matchState.matchDetails;
  const kickOffStats = md.kickOffTeamStatistics || {};
  const secondStats = md.secondTeamStatistics || {};
  const summary = MatchEngine.getMatchSummary(md);
  const isKickOffHome = md.kickOffTeam?.name === md._homeTeamName;

  // Team-level stats (available directly on team statistics)
  const homeTeamStats = isKickOffHome ? kickOffStats : secondStats;
  const awayTeamStats = isKickOffHome ? secondStats : kickOffStats;
  const homeShots = homeTeamStats.shots || {};
  const awayShots = awayTeamStats.shots || {};
  const homeGoals = homeTeamStats.goals || 0;
  const awayGoals = awayTeamStats.goals || 0;

  // Per-player stats (passes, tackles live inside each player.stats)
  function _sumPlayerStat(players, field) {
    let total = 0;
    for (const p of players) {
      const s = p.stats || {};
      if (field.includes('.')) {
        const [a, b] = field.split('.');
        total += (s[a] || {})[b] || 0;
      } else {
        total += s[field] || 0;
      }
    }
    return total;
  }

  const homePlayers = isKickOffHome
    ? (md.kickOffTeam?.players || [])
    : (md.secondTeam?.players || []);
  const awayPlayers = isKickOffHome
    ? (md.secondTeam?.players || [])
    : (md.kickOffTeam?.players || []);

  const homePasses = _sumPlayerStat(homePlayers, 'passes.total');
  const awayPasses = _sumPlayerStat(awayPlayers, 'passes.total');
  const homeTackles = _sumPlayerStat(homePlayers, 'tackles.total');
  const awayTackles = _sumPlayerStat(awayPlayers, 'tackles.total');
  const homeFouls = homeTeamStats.fouls || 0;
  const awayFouls = awayTeamStats.fouls || 0;
  const homeCorners = homeTeamStats.corners || 0;
  const awayCorners = awayTeamStats.corners || 0;

  const rows = [
    { label: '控球率', home: '50%', away: '50%' },
    { label: '射门', home: `${homeGoals}/${homeShots.total || 0}`, away: `${awayGoals}/${awayShots.total || 0}` },
    { label: '传球', home: String(homePasses), away: String(awayPasses) },
    { label: '抢断', home: String(homeTackles), away: String(awayTackles) },
    { label: '犯规', home: String(homeFouls), away: String(awayFouls) },
    { label: '角球', home: String(homeCorners), away: String(awayCorners) },
  ];

  return (
    <div className="match-stats">
      <div className="match-stats-header">
        <span>{summary?.homeTeamName || '主队'}</span>
        <span className="match-stats-label">统计项</span>
        <span>{summary?.awayTeamName || '客队'}</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="match-stats-row">
          <span className="match-stats-val home">{row.home}</span>
          <span className="match-stats-label">{row.label}</span>
          <span className="match-stats-val away">{row.away}</span>
        </div>
      ))}
    </div>
  );
}

function LeagueTableTab() {
  return (
    <div className="match-league">
      <div className="match-league-header">联赛积分榜</div>
      <div className="match-empty-tab">积分榜将在赛季流程中更新</div>
    </div>
  );
}

function CommentaryTab({ matchState }) {
  const events = matchState?.iterationLog || [];
  if (events.length === 0) return <div className="match-empty-tab">暂无播报</div>;
  const recent = events.slice(-30);
  return (
    <div className="match-commentary">
      <div className="match-commentary-list">
        {recent.map((evt, i) => (
          <div key={evt.iter} className={`match-commentary-item type-${evt.type || 'info'}`}>
            <span className="match-commentary-time">{iterationToMinute(evt.halfIter ?? evt.iter, MatchEngine.DEFAULT_ITERATIONS)}'</span>
            <span className="match-commentary-text">{evt.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchResultPanel({ matchState, onContinue }) {
  const result = matchState?.result;
  const ratings = matchState?.ratings;
  const mvp = matchState?.mvp;
  const homeName = matchState?.homeSquad?.teamName || '主队';
  const awayName = matchState?.awaySquad?.teamName || '客队';
  const homeFormation = matchState?.matchDetails?._homeFormation || '4-4-2';
  const awayFormation = matchState?.matchDetails?._awayFormation || '4-4-2';

  return (
    <div className="match-result-panel">
      <div className="match-result-header">
        <h2>比赛结束</h2>
        <div className="match-result-score">
          <span>{homeName}</span>
          <span className="match-result-score-num">{result?.homeGoals ?? 0} - {result?.awayGoals ?? 0}</span>
          <span>{awayName}</span>
        </div>
        {mvp && <div className="match-mvp">⭐ 最佳球员: {mvp.name} ({fmtRating(mvp.rating)})</div>}
      </div>

      {ratings && (
        <div className="match-ratings">
          {['home', 'away'].map((side) => (
            <div key={side} className="match-ratings-col">
              <h3>{side === 'home' ? homeName : awayName}</h3>
              {(ratings[side] || []).map((r) => (
                <div key={r.playerID} className={`match-rating-row ${r.playerID === 'player_self' ? 'is-player' : ''}`}>
                  <span className="match-rating-name">{r.name}</span>
                  <span className="match-rating-bar-track">
                    <span className="match-rating-bar-fill" style={{ width: `${r.rating * 10}%`, background: r.color || '#95a5a6' }} />
                  </span>
                  <span className="match-rating-val" style={{ color: r.color }}>{fmtRating(r.rating)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {matchState?.growthDeltas && Object.keys(matchState.growthDeltas).length > 0 && (
        <div className="match-growth">
          <h3>属性成长</h3>
          <div className="match-growth-deltas">
            {buildGrowthDisplay(matchState.growthDeltas).map((d, i) => (
              <span key={i} className="delta positive">+{d.text}</span>
            ))}
          </div>
        </div>
      )}

      <div className="match-result-actions">
        <button className="btn btn-primary" onClick={onContinue}>继续</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _buildPlayerEvents(matchDetails) {
  const events = [];
  const log = matchDetails?.iterationLog || [];
  for (const entry of log) {
    const text = String(entry).toLowerCase();
    if (text.includes('goal')) events.push({ type: 'goal', playerID: _findScorer(matchDetails, text) });
    if (text.includes('yellow')) events.push({ type: 'yellowCard', playerID: _findPlayerInText(matchDetails, text) });
    if (text.includes('red')) events.push({ type: 'redCard', playerID: _findPlayerInText(matchDetails, text) });
  }
  return events;
}

function _findScorer(matchDetails, text) {
  const allPlayers = [...(matchDetails.kickOffTeam?.players || []), ...(matchDetails.secondTeam?.players || [])];
  for (const p of allPlayers) {
    if (p.name && text.includes(p.name.toLowerCase())) return p.playerID;
  }
  return 'unknown';
}

function _findPlayerInText(matchDetails, text) {
  return _findScorer(matchDetails, text);
}

function buildMatchResultText(summary, playerRating) {
  if (!summary) return '比赛结束';
  let text = `${summary.homeTeamName || '主队'} ${summary.homeGoals} - ${summary.awayGoals} ${summary.awayTeamName || '客队'}`;
  if (playerRating) text += ` · 评分 ${fmtRating(playerRating.rating)}`;
  return text;
}

function buildGrowthDisplay(deltas) {
  if (!deltas) return [];
  return Object.entries(deltas).map(([key, val]) => ({ text: `${key} +${val}`, cls: 'positive' }));
}

/**
 * Opponent formation pool — formations the AI can use against the player.
 * Excludes the player's chosen formation for variety.
 */
function _getOpponentFormationPool() {
  return {
    '4-4-2': true,
    '4-3-3': true,
    '4-2-3-1': true,
    '3-5-2': true,
    '5-3-2': true,
  };
}
