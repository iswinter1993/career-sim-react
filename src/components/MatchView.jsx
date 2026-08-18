// [DEPRECATED] 已弃用 — 比赛模拟 UI 已由 src/simulatorDemo/SimulatorDemoView.jsx
// + vendor RealTimeEngine 取代。本文件保留仅作历史参考，无任何活代码引用；
// 其 imports（squadGen / mapGrowthToSubAttrs / matchEngine 等）已随迁移失效。
// MatchView — the main match simulation page (T05)
//
// Layout (three-column broadcast):
//   ┌──────────────────────────────────────────────────┐
//   │  Score Bar (score / time / half)                 │
//   ├──────────────┬─────────────────────┬─────────────┤
//   │ 实时播报     │   Pitch (live anim) │ 技术统计    │
//   │  commentary  │                     │ / 积分榜     │
//   │  ticker      │                     │             │
//   ├──────────────┴─────────────────────┴─────────────┤
//   │  Action Buttons (pause / speed / sub)            │
//   └──────────────────────────────────────────────────┘
//
// Rendering is driven by derived matchPhase from the state machine:
//   match.init → Loading
//   match.tactics → PreMatchTactics
//   match.playing | match.paused → Main view (three columns + buttons)
//   match.finished → Result panel

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../GameContext';
import { MATCH } from '../stateMachine';
import SIM from '../simEngine';
import * as MatchEngine from '../matchEngine';
import { substitutionCommand, formationChangeCommand } from '../matchCommands';
import { createMatchSession } from '../matchSession';
import { TICK_BURST } from '../gameConfig';
import { buildTeamSquad, buildOpponentSquad } from '../squadGen';
import PitchCanvas from './PitchCanvas';
import { PreMatchTactics, SubstitutionPanel } from './TacticsPanel';
import { rateAllPlayers, getRatingLabel } from '../playerRating';
import { mapGrowthToSubAttrs } from '../attributeMapping';
import { POSITION_LABELS } from '../engine/lib/positionGroup';

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
  //   sessionRef — the EngineSession (Design Pattern #6). Owns the engine's
  //               object reference (never cloned or passed through React
  //               state), the event bus, and the Command history.
  //   playCtrl   — phase machine + timer + speed flag. The tick loop
  //               reads EVERYTHING from these refs directly.
  const sessionRef = useRef(null);
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

        // Get the player's current club name from the sim engine
        const curTeam = SIM.curTeam();
        const curTeamName = curTeam?.name || '';

        const homeSquad = buildTeamSquad(
          { name: mIdentity?.name || 'Player', pos: mIdentity?.pos || 'ST', subAttrs: playerSubAttrs },
          leagueLevel,
          matchSeed + '_home',
          homeFormation,
          curTeamName   // pass club name so squadGen uses it instead of random
        );
        const awaySquad = buildOpponentSquad(null, leagueLevel, matchSeed + '_away', awayFormation);

        // Pass the selected formation into buildTeamJson so originPOS is
        // computed for that formation (not the default 4-4-2). Without this,
        // the squad is generated for e.g. 4-3-3 but positioned as 4-4-2.
        const homeTeam = MatchEngine.buildTeamJson(homeSquad.teamName, homeSquad.starters, { formation: homeFormation });
        const awayTeam = MatchEngine.buildTeamJson(awaySquad.teamName, awaySquad.starters, { formation: awayFormation });

        const session = await createMatchSession({
          homeTeam,
          awayTeam,
          pitch: matchState.pitch,
          tactics: { homeMentality, awayMentality, homeFormation, awayFormation },
        });

        if (cancelled) return;

        sessionRef.current = session;

        dispatch({ type: 'MATCH_READY', matchDetails: session.matchDetails, homeSquad, awaySquad });
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

    const ratingMatchDetails = _buildRatingMatchDetails(md, summary, stats);
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
    const session = sessionRef.current;
    if (!session) return;

    const burst = ctrl.fast ? TICK_BURST.fast : TICK_BURST.normal;

    const { matchDetails: next, finished } = await session.advance(burst);

    if (ctrl.phase !== PLAY.RUNNING) return;

    // Match finished?
    if (finished) {
      ctrl.phase = PLAY.FINISHED;
      completeMatch(next);
      return;
    }

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
    const session = sessionRef.current;
    const md = session?.matchDetails;
    if (!md) return;

    // Determine which engine team the player is in. Match by squadID (which
    // survives the engine's setGameVariables playerID randomisation) with a
    // playerID fallback for safety.
    let teamKey = null;
    for (const key of ['kickOffTeam', 'secondTeam']) {
      const team = md[key];
      if (team?.players?.some((p) => p.squadID === playerOut.id || p.playerID === playerOut.id)) {
        teamKey = key;
        break;
      }
    }
    if (!teamKey) return;

    // Apply substitution through the Command layer (validate → execute → record).
    const cmd = substitutionCommand(md, teamKey, playerOut.id, playerIn);
    const result = session.commandHistory.execute(cmd);
    if (!result.ok) return;

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

    // Shallow-clone matchDetails so React detects the state change
    dispatch({
      type: 'SUBSTITUTE',
      matchDetails: { ...md },
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
    sessionRef.current?.destroy();
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
  const currentHalf = matchState?.matchDetails?._half || matchState?.half || 1;
  const halfMinute = iterationToMinute(iterCount, MatchEngine.DEFAULT_ITERATIONS);
  // Display 0-45' for first half, 45-90' for second half
  const displayMinute = currentHalf === 2 ? 45 + halfMinute : halfMinute;
  const homeName = matchState?.homeSquad?.teamName || summary?.homeTeamName || '主队';
  const awayName = matchState?.awaySquad?.teamName || summary?.awayTeamName || '客队';
  const isPaused = matchPhase === MATCH.PAUSED;
  const starters = matchState?.homeSquad?.starters || [];
  const subs = matchState?.homeSquad?.subs || [];

  const handleResumeFromPanel = () => {
    setShowSubPanel(false);
    handlePauseResume();
  };

  return (
    <section className="view match-view">
      <div className="match-scorebar">
        <div className="match-scorebar-team home">
          <span className="match-team-dot home" />
          <span className="match-scorebar-name">{homeName}</span>
        </div>
        <div className="match-scorebar-center">
          <span className="match-score">{summary?.homeGoals ?? 0}</span>
          <span className="match-score-sep">-</span>
          <span className="match-score">{summary?.awayGoals ?? 0}</span>
          <div className="match-scorebar-meta">
            <span className="match-minute">{displayMinute}'</span>
            <span className="match-half-badge">{currentHalf === 1 ? '上半场' : '下半场'}</span>
          </div>
        </div>
        <div className="match-scorebar-team away">
          <span className="match-scorebar-name">{awayName}</span>
          <span className="match-team-dot away" />
        </div>
      </div>

      <div className="match-columns">
        {/* Left column — live commentary ticker */}
        <aside className="match-col match-col-left">
          <div className="match-col-header">
            <span className="match-live"><span className="match-live-dot" />实时播报</span>
          </div>
          <div className="match-col-body">
            <CommentaryTab matchState={matchState} />
          </div>
        </aside>

        {/* Center column — pitch (the broadcast stage) */}
        <main className="match-col match-col-center">
          <div className="match-pitch-placeholder">
            <PitchCanvas />
            {isPaused && <div className="match-pause-overlay"><span>已暂停</span></div>}
            {fastMode && !isPaused && <div className="match-fast-indicator">快速模拟中...</div>}
          </div>
        </main>

        {/* Right column — stats / league table */}
        <aside className="match-col match-col-right">
          <div className="match-col-header match-col-tabs">
            {[['stats', '技术统计'], ['table', '积分榜']].map(([key, label]) => (
              <button
                key={key}
                className={`match-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="match-col-body">
            {activeTab === 'table' ? <LeagueTableTab /> : <StatsTab matchState={matchState} />}
          </div>
        </aside>

        {/* Paused-state modal (substitution / in-match tactics) */}
        {isPaused && (
          <div className="match-modal-backdrop">
            <div className="match-modal-card">
              {showSubPanel ? (
                <SubstitutionPanel
                  starters={starters}
                  subs={subs}
                  substitutionsLeft={matchState?.substitutionsLeft ?? 0}
                  onSubstitute={handleSubstitute}
                  onResume={handleResumeFromPanel}
                  playerID="player_self"
                />
              ) : (
                <InMatchTactics
                  matchDetails={matchState?.matchDetails}
                  onFormationChange={(side, formation) => {
                    const session = sessionRef.current;
                    const md = session?.matchDetails;
                    if (!md) return;
                    // Route through the Command layer (validate → execute → record).
                    const cmd = formationChangeCommand(md, side, formation);
                    const result = session.commandHistory.execute(cmd);
                    if (!result.ok) return;
                    // Shallow-clone so React detects the reference change
                    dispatch({ type: 'TICK_ITERATION', matchDetails: { ...md }, iterationLog: MatchEngine.parseIterationEvents(md), stats: MatchEngine.getPlayerStats(md), half: md._half });
                  }}
                  onResume={handleResumeFromPanel}
                />
              )}
            </div>
          </div>
        )}
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
    </section>
  );
}

// ===========================================================================
// MODULE-LEVEL SUB-COMPONENTS — defined outside MatchView so React keeps
// stable component identity across renders.
// ===========================================================================

const StatsTab = React.memo(function StatsTab({ matchState }) {
  if (!matchState?.matchDetails) return <div className="match-empty-tab">比赛尚未开始</div>;

  const md = matchState.matchDetails;
  const kickOffStats = md.kickOffTeamStatistics || {};
  const secondStats = md.secondTeamStatistics || {};
  const summary = MatchEngine.getMatchSummary(md);
  const isKickOffHome = md.kickOffTeam?.name === md._homeTeamName;

  const homeTeamStats = isKickOffHome ? kickOffStats : secondStats;
  const awayTeamStats = isKickOffHome ? secondStats : kickOffStats;
  const homeShots = homeTeamStats.shots || {};
  const awayShots = awayTeamStats.shots || {};
  const homeGoals = homeTeamStats.goals || 0;
  const awayGoals = awayTeamStats.goals || 0;

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
  const homePassOn = _sumPlayerStat(homePlayers, 'passes.on');
  const awayPassOn = _sumPlayerStat(awayPlayers, 'passes.on');
  const homeTackles = _sumPlayerStat(homePlayers, 'tackles.total');
  const awayTackles = _sumPlayerStat(awayPlayers, 'tackles.total');
  const homeTackleOn = _sumPlayerStat(homePlayers, 'tackles.on');
  const awayTackleOn = _sumPlayerStat(awayPlayers, 'tackles.on');
  const homeFouls = homeTeamStats.fouls || 0;
  const awayFouls = awayTeamStats.fouls || 0;
  const homeCorners = homeTeamStats.corners || 0;
  const awayCorners = awayTeamStats.corners || 0;

  // Real possession from pass counts
  const totalPasses = homePasses + awayPasses;
  const homePossession = totalPasses > 0 ? Math.round((homePasses / totalPasses) * 100) : 50;
  const awayPossession = 100 - homePossession;

  // Pass accuracy
  const homePassAcc = homePasses > 0 ? Math.round((homePassOn / homePasses) * 100) : 0;
  const awayPassAcc = awayPasses > 0 ? Math.round((awayPassOn / awayPasses) * 100) : 0;

  const homeShotsTotal = homeShots.total || 0;
  const awayShotsTotal = awayShots.total || 0;
  const homeShotsOn = homeShots.on || 0;
  const awayShotsOn = awayShots.on || 0;

  const homeFormation = md._homeFormation || '4-4-2';
  const awayFormation = md._awayFormation || '4-4-2';

  // Bar-visual rows: each has home value, away value, and a 0-100% percentage where home is "left"
  const barRows = [
    { label: '控球率', homeVal: homePossession, home: `${homePossession}%`, away: `${awayPossession}%` },
    { label: '射门 (射正)', home: `${homeShotsTotal} (${homeShotsOn})`, away: `${awayShotsTotal} (${awayShotsOn})`,
      homeVal: homeShotsTotal, awayVal: awayShotsTotal },
    { label: '传球', home: String(homePasses), away: String(awayPasses),
      homeVal: homePasses, awayVal: awayPasses },
    { label: '传球成功率', home: `${homePassAcc}%`, away: `${awayPassAcc}%`,
      homeVal: homePassAcc, awayVal: awayPassAcc },
    { label: '抢断', home: `${homeTackleOn}/${homeTackles}`, away: `${awayTackleOn}/${awayTackles}`,
      homeVal: homeTackles, awayVal: awayTackles },
    { label: '犯规', home: String(homeFouls), away: String(awayFouls),
      homeVal: awayFouls, awayVal: homeFouls, invert: true },
    { label: '角球', home: String(homeCorners), away: String(awayCorners),
      homeVal: homeCorners, awayVal: awayCorners },
  ];

  return (
    <div className="match-stats">
      {/* Formation bar */}
      <div className="match-stats-formations">
        <span className="match-stats-fm-badge">{homeFormation}</span>
        <span className="match-stats-fm-label">阵型</span>
        <span className="match-stats-fm-badge">{awayFormation}</span>
      </div>

      <div className="match-stats-header">
        <span className="match-stats-team-name">{summary?.homeTeamName || '主队'}</span>
        <span className="match-stats-label">统计项</span>
        <span className="match-stats-team-name">{summary?.awayTeamName || '客队'}</span>
      </div>

      {barRows.map((row, i) => {
        // Calculate bar widths: homeVal as % of total (unless inverted)
        let homeBarPct = 50;
        if (row.invert) {
          homeBarPct = row.homeVal + row.awayVal > 0 ? Math.round((row.awayVal / (row.homeVal + row.awayVal)) * 100) : 50;
        } else {
          homeBarPct = row.homeVal + row.awayVal > 0 ? Math.round((row.homeVal / (row.homeVal + row.awayVal)) * 100) : 50;
        }
        return (
          <div key={i} className="match-stats-row">
            <span className="match-stats-val home">{row.home}</span>
            <div className="match-stats-bar-cell">
              <span className="match-stats-label">{row.label}</span>
              <div className="match-stats-bar-track">
                <div className="match-stats-bar-fill home" style={{ width: `${homeBarPct}%` }} />
                <div className="match-stats-bar-fill away" style={{ width: `${100 - homeBarPct}%` }} />
              </div>
            </div>
            <span className="match-stats-val away">{row.away}</span>
          </div>
        );
      })}

      {/* Goal distribution */}
      {homeGoals + awayGoals > 0 && (
        <div className="match-stats-goals-section">
          <div className="match-stats-goals-title">进球分布</div>
          <div className="match-stats-goals-bar">
            <div className="match-stats-goals-home" style={{ flex: homeGoals }}>
              <span>{homeGoals}</span>
            </div>
            <div className="match-stats-goals-away" style={{ flex: awayGoals }}>
              <span>{awayGoals}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const LeagueTableTab = React.memo(function LeagueTableTab() {
  return (
    <div className="match-league">
      <div className="match-league-header">联赛积分榜</div>
      <div className="match-empty-tab">积分榜将在赛季流程中更新</div>
    </div>
  );
});

const EVENT_ICONS = {
  goal: '⚽', save: '🧤', tackle: '🦶', foul: '🟨', offside: '🏳',
  corner: '🚩', pass: '→', shot: '🎯', cross: '↗', injury: '💊', info: '📢',
  sub: '🔄', tactical: '📋',
};

const CommentaryTab = React.memo(function CommentaryTab({ matchState }) {
  const incoming = matchState?.iterationLog || [];
  // ref accumulates ALL events ever received — never replaced, only appended
  const allRef = useRef([]);
  // useState triggers re-render when new events arrive
  const [, setTick] = useState(0);
  const listRef = useRef(null);
  // Track which events are brand new for staggered animation
  const newKeysRef = useRef(new Set());
  useEffect(() => {
    if (incoming.length === 0) return;
    const all = allRef.current;
    const seen = new Set(all.map(e => e.key));
    const newKeys = new Set();
    let added = false;
    for (const evt of incoming) {
      // Skip empty entries (boilerplate suppressed by template returning '')
      // and entries with no meaningful text
      if (!evt.text || evt.text.trim() === '') continue;
      if (!seen.has(evt.key)) {
        all.push(evt);
        newKeys.add(evt.key);
        added = true;
      }
    }
    if (added) {
      if (all.length > 200) all.splice(0, all.length - 200);
      newKeysRef.current = newKeys;
      setTick(t => t + 1);
    }
  }, [incoming]);

  const events = allRef.current;

  // Auto-scroll to bottom
  useEffect(() => {
    if (!listRef.current) return;
    requestAnimationFrame(() => {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [events.length]);

  if (events.length === 0) return <div className="match-empty-tab">暂无播报</div>;

  const recent = events.slice(-50);
  const newKeys = newKeysRef.current;
  // Count how many new items appear consecutively at the end for stagger ordering
  let consecutiveNew = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (newKeys.has(recent[i].key)) consecutiveNew++;
    else break;
  }

  return (
    <div className="match-commentary">
      <div className="match-commentary-list" ref={listRef}>
        {recent.map((evt, i) => {
          // Double-check: skip empty entries at render time too
          if (!evt.text || evt.text.trim() === '') return null;
          const type = evt.type || 'info';
          const icon = EVENT_ICONS[type] || '';
          const halfMinute = iterationToMinute(evt.halfIter ?? evt.iter, MatchEngine.DEFAULT_ITERATIONS);
          const minute = evt.half === 2 ? 45 + halfMinute : halfMinute;
          const isKeyEvent = type === 'goal' || type === 'foul' || type === 'injury' || type === 'save';
          const isNew = newKeys.has(evt.key);
          // Stagger delay: newest items at the bottom animate last
          // Items further from the end get earlier delays
          const staggerIdx = isNew ? (recent.length - 1 - i) : 0;
          const staggerDelay = isNew ? Math.min(staggerIdx * 55, 250) : 0;
          return (
            <div
              key={evt.key || evt.iter || i}
              className={`match-commentary-item type-${type} ${isKeyEvent ? 'key-event' : ''} ${isNew ? 'commentary-new' : ''}`}
              style={isNew ? { '--stagger-delay': `${staggerDelay}ms` } : undefined}
            >
              <span className="match-commentary-time">{minute}'</span>
              <span className="match-commentary-icon">{icon}</span>
              <span className="match-commentary-text">{evt.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const MatchResultPanel = React.memo(function MatchResultPanel({ matchState, onContinue }) {
  const result = matchState?.result;
  const ratings = matchState?.ratings;
  const mvp = matchState?.mvp;
  const homeName = matchState?.homeSquad?.teamName || '主队';
  const awayName = matchState?.awaySquad?.teamName || '客队';
  const homeFormation = matchState?.matchDetails?._homeFormation || '4-4-2';
  const awayFormation = matchState?.matchDetails?._awayFormation || '4-4-2';
  const matchReport = matchState?.matchDetails
    ? MatchEngine.buildMatchReport(matchState.matchDetails)
    : null;

  // Result tone — from the human player's side (human always plays as `home`).
  const winner = result?.winner;
  const tone = winner === 'home' ? 'win' : winner === 'away' ? 'loss' : 'draw';
  const toneLabel = winner === 'home' ? '胜利' : winner === 'away' ? '失利' : '平局';

  const ts = matchReport?.teamStats;
  const homePoss = ts?.home?.possession ?? 50;
  const awayPoss = ts?.away?.possession ?? 50;
  const homeShots = ts?.home?.shots ?? 0;
  const awayShots = ts?.away?.shots ?? 0;
  const homeOn = ts?.home?.shotsOnTarget ?? 0;
  const awayOn = ts?.away?.shotsOnTarget ?? 0;
  const homeCorners = ts?.home?.corners ?? 0;
  const awayCorners = ts?.away?.corners ?? 0;

  return (
    <div className="match-result-panel">
      {/* Score banner — left accent stripe tinted by the result */}
      <div className={`match-result-banner tone-${tone}`}>
        <div className="match-result-banner-teams">
          <div className="match-result-banner-team">
            <span className="match-result-banner-name">{homeName}</span>
            <span className="match-result-banner-fm">{homeFormation}</span>
          </div>
          <div className="match-result-banner-score">
            <span className="match-result-banner-score-num">{result?.homeGoals ?? 0}</span>
            <span className="match-result-banner-colon">:</span>
            <span className="match-result-banner-score-num">{result?.awayGoals ?? 0}</span>
          </div>
          <div className="match-result-banner-team">
            <span className="match-result-banner-name">{awayName}</span>
            <span className="match-result-banner-fm">{awayFormation}</span>
          </div>
        </div>
        <div className="match-result-banner-tag">{toneLabel}</div>
      </div>

      {mvp && (
        <div className="match-mvp">
          <span className="match-mvp-star">⭐</span>
          <span className="match-mvp-label">全场最佳</span>
          <span className="match-mvp-name">{mvp.name}</span>
          <span className="match-mvp-rating">{fmtRating(mvp.rating)}</span>
        </div>
      )}

      {/* Stat strip — possession / shots / corners */}
      {matchReport && (
        <div className="match-result-stats">
          <div className="match-result-stat-possession">
            <div className="match-result-stat-head">
              <span className="match-result-stat-val">{homePoss}%</span>
              <span className="match-result-stat-title">控球率</span>
              <span className="match-result-stat-val">{awayPoss}%</span>
            </div>
            <div className="match-result-bar-track">
              <div className="match-result-bar-fill home" style={{ width: `${homePoss}%` }} />
            </div>
          </div>
          <div className="match-result-stat-row">
            <span className="match-result-stat-val">{homeShots}<span className="match-result-stat-sub">（{homeOn}）</span></span>
            <span className="match-result-stat-title">射门（射正）</span>
            <span className="match-result-stat-val">{awayShots}<span className="match-result-stat-sub">（{awayOn}）</span></span>
          </div>
          <div className="match-result-stat-row">
            <span className="match-result-stat-val">{homeCorners}</span>
            <span className="match-result-stat-title">角球</span>
            <span className="match-result-stat-val">{awayCorners}</span>
          </div>
        </div>
      )}

      {/* Player ratings — position chip + rating bar */}
      {ratings && (
        <div className="match-ratings">
          {['home', 'away'].map((side) => (
            <div key={side} className="match-ratings-col">
              <h3>
                {side === 'home' ? homeName : awayName}
                <span className="match-ratings-fm">{side === 'home' ? homeFormation : awayFormation}</span>
              </h3>
              {(ratings[side] || []).map((r) => {
                const color = getRatingLabel(r.rating).color;
                return (
                  <div key={r.playerID} className={`match-rating-row ${r.playerID === 'player_self' ? 'is-player' : ''}`}>
                    <span className="match-rating-pos">{POSITION_LABELS[r.position] || r.position || '—'}</span>
                    <span className="match-rating-name">{r.name}</span>
                    <span className="match-rating-bar-track">
                      <span className="match-rating-bar-fill" style={{ width: `${r.rating * 10}%`, background: color }} />
                    </span>
                    <span className="match-rating-val" style={{ color }}>{fmtRating(r.rating)}</span>
                  </div>
                );
              })}
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
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the matchDetails shape `rateAllPlayers` expects, wired to the FM-style
 * stats tracker so post-match ratings reflect real per-player data (passes,
 * tackles, saves, shots, …) instead of only goals/cards/result.
 *
 * Key mappings handled here:
 *   - Group players by OUR home/away side (`_homeTeamName`), NOT by the
 *     engine's kickOffTeam/secondTeam naming (the engine assigns those
 *     randomly), so the result modifier is applied to the correct side.
 *   - Keep the engine `playerID` as the tracker/role lookup key (the tracker
 *     is keyed by the engine's randomised playerID), while carrying `squadID`
 *     so `rateAllPlayers` can return the stable squad identity (`player_self`).
 *   - Rebuild role maps from each engine player's resolved `role` (the
 *     `_homeRoles`/`_awayRoles` stored on md are keyed by pre-engine ids and
 *     are empty for the default tactics path).
 */
function _buildRatingMatchDetails(md, summary, stats) {
  const kickIsHome = md.kickOffTeam?.name === md._homeTeamName;
  const homeTeam = kickIsHome ? md.kickOffTeam : md.secondTeam;
  const awayTeam = kickIsHome ? md.secondTeam : md.kickOffTeam;

  const toRatingSide = (team) => {
    const roles = {};
    const list = (team?.players || []).map((p) => {
      roles[p.playerID] = p.role || null;
      return {
        id: p.playerID,              // tracker/role lookup key (engine playerID)
        squadID: p.squadID || p.playerID, // stable identity for the UI
        name: p.name,
        position: p.position,
      };
    });
    return { list, roles };
  };

  const home = toRatingSide(homeTeam);
  const away = toRatingSide(awayTeam);

  const ratingMatchDetails = {
    homeTeam: home.list,
    awayTeam: away.list,
    _statsTracker: md._statsTracker,
    _homeRoles: home.roles,
    _awayRoles: away.roles,
    events: _buildPlayerEvents(md),
    result: summary,
    stats,
    minutesPlayed: {},
  };
  for (const p of ratingMatchDetails.homeTeam.concat(ratingMatchDetails.awayTeam)) {
    ratingMatchDetails.minutesPlayed[p.id] = 90;
  }
  return ratingMatchDetails;
}

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

// ---------------------------------------------------------------------------
// In-match tactical controls (formation & mentality change during pause)
// ---------------------------------------------------------------------------
const InMatchTactics = React.memo(function InMatchTactics({ matchDetails, onFormationChange, onResume }) {
  const [selectedFormation, setSelectedFormation] = useState('4-4-2');
  const currentFm = matchDetails?._homeFormation || '4-4-2';
  const formations = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-1-4-1'];

  useEffect(() => { setSelectedFormation(currentFm); }, [currentFm]);

  const handleApply = () => {
    if (selectedFormation !== currentFm && onFormationChange) {
      onFormationChange('home', selectedFormation);
    }
  };

  return (
    <div className="inmatch-tactics">
      <div className="inmatch-tactics-title">战术调整</div>
      <div className="inmatch-tactics-current">当前阵型: {currentFm}</div>
      <div className="inmatch-tactics-grid">
        {formations.map((fm) => (
          <button
            key={fm}
            className={`inmatch-fm-btn ${selectedFormation === fm ? 'active' : ''}`}
            onClick={() => setSelectedFormation(fm)}
          >
            {fm}
          </button>
        ))}
      </div>
      {selectedFormation !== currentFm && (
        <button className="btn btn-accent inmatch-apply-btn" onClick={handleApply}>
          应用阵型变更: {selectedFormation}
        </button>
      )}
      <button className="btn btn-primary inmatch-resume-btn" onClick={onResume}>
        ▶ 继续比赛
      </button>
    </div>
  );
});
