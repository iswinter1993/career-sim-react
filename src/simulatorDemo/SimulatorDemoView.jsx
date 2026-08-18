import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Position } from '../../vendor/football-simulator/src/enums/Position';
import { labelize, periodLabel, positionName, teamSideLabel } from './zhLabels';
import zhReport from './zhReport';
import { useGame } from '../GameContext';
import SIM from '../simEngine';
import { PLAYER_ATTRS } from '../attributes';
import { mapGrowthToAttributes } from '../attributeMapping';
import {
  createSimulation,
  eventsUntil,
  formatScoreSheet,
  formatTime,
  reportFor,
} from './simulation';
import {
  buildCareerMatch,
  computeHumanRating,
  defaultFormationForPosition,
  STYLE_PRESETS,
} from './matchSimulation';
import { SUPPORTED_FORMATIONS, buildLineup, formationSlots } from '../vendorFormation';
import './simulatorDemo.css';

// ---------------------------------------------------------------------------
// 模块级 helper（照搬 App.svelte 里的函数）
// ---------------------------------------------------------------------------

function eventLabel(event) {
  const outcome = event.outcome ? ` · ${labelize(event.outcome)}` : '';

  if (event.type === 'substitution') {
    const outgoing = event.secondaryPlayer?.info.name || '球员';
    const incoming = event.player?.info.name || '替补';

    return `换人 ${outgoing} → ${incoming}${outcome}`;
  }

  const player = event.player?.info.name || teamSideLabel(event.teamSide) || '比赛';

  return `${labelize(event.type)} ${player}${outcome}`;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDecimal(value) {
  return value.toFixed(1);
}

function restartLabel(type) {
  return labelize(type);
}

function diagnosticLabel(type) {
  return labelize(type || 'none');
}

function formatChance(value) {
  return typeof value === 'number' ? value.toFixed(2) : '-';
}

// 补时时钟：上半场 45+X、下半场 90+X，其余按 MM:SS 显示。
function formatMatchClock(snapshot) {
  const ht = 45 * 60;
  const ft = 90 * 60;
  const t = snapshot.time;

  if (snapshot.period === 1 && t > ht) return `45+${Math.ceil((t - ht) / 60)}'`;
  if (snapshot.period === 2 && t > ft) return `90+${Math.ceil((t - ft) / 60)}'`;

  return formatTime(t);
}

// 进球时间：区分上半场补时（45+X）与下半场补时（90+X）。
function formatMatchMinute(time, addedTime = {}) {
  const ht = 45 * 60;
  const ft = 90 * 60;

  if (time > ft) return `90+${Math.ceil((time - ft) / 60)}'`;
  if (time > ht && time <= ht + (addedTime.firstHalf || 0)) {
    return `45+${Math.ceil((time - ht) / 60)}'`;
  }

  return `${Math.floor(time / 60)}'`;
}

function matchStatus(snapshot) {
  if (snapshot.period === 'ended') {
    return '全场结束';
  }

  if (snapshot.phase === 'half_time') {
    return '中场';
  }

  return snapshot.time > 0 ? formatMatchClock(snapshot) : '开赛';
}

function pitchX(value) {
  return value / 105 * 100;
}

function pitchY(value) {
  return value / 68 * 100;
}

function filterEvents(source, filter) {
  if (filter === 'goals') {
    return source.filter((event) => event.type === 'goal');
  }

  if (filter === 'passes') {
    return source.filter((event) => ['pass', 'receive', 'interception'].includes(event.type));
  }

  if (filter === 'shots') {
    return source.filter((event) => ['shot', 'save', 'miss', 'goal', 'blocked_shot'].includes(event.type));
  }

  if (filter === 'second_balls') {
    return source.filter((event) => ['second_ball', 'recovery', 'aerial_duel'].includes(event.type));
  }

  if (filter === 'set_pieces') {
    return source.filter((event) => ['throw_in', 'corner', 'goal_kick', 'free_kick', 'penalty'].includes(event.type));
  }

  if (filter === 'discipline') {
    return source.filter((event) => ['foul', 'yellow_card', 'red_card'].includes(event.type));
  }

  if (filter === 'stoppages') {
    return source.filter((event) => ['injury', 'substitution', 'half_time', 'full_time'].includes(event.type));
  }

  return source;
}

// Pitch.svelte helpers
function x(value) {
  return value / 105 * 100;
}

function y(value) {
  return value / 68 * 100;
}

function shortRole(roleName) {
  return roleName.replace(/[A-Z]?([A-Z])[^A-Z]*/g, '$1').slice(0, 3);
}

function phaseLabel(phase) {
  return labelize(phase);
}

function isSetPiece(phase) {
  return ['throw_in', 'corner', 'goal_kick', 'free_kick', 'penalty'].includes(phase);
}

// ---------------------------------------------------------------------------
// Pitch 组件（照搬 Pitch.svelte）
// ---------------------------------------------------------------------------

function Pitch({ snapshot, selectedPlayerId, onSelectPlayer }) {
  const ballOwner = snapshot.players.find((player) => player.id === snapshot.ball.ownerId);
  const selectedPlayer = snapshot.players.find((player) => player.id === selectedPlayerId);

  return (
    <div className="pitch-shell">
      <div className="pitch-meta">
        <span>{periodLabel(snapshot.period)}</span>
        <span>{phaseLabel(snapshot.phase)}</span>
        <span>
          {ballOwner
            ? `${teamSideLabel(ballOwner.teamSide)} ${positionName(ballOwner.roleName)}`
            : '无球权'}
        </span>
      </div>
      <div className="pitch">
        <div className="mark mark--half"></div>
        <div className="mark mark--circle"></div>
        <div className="mark mark--home-box"></div>
        <div className="mark mark--away-box"></div>
        {isSetPiece(snapshot.phase) && (
          <div
            className="restart-zone"
            style={{ left: `${x(snapshot.ball.x)}%`, top: `${y(snapshot.ball.y)}%` }}
          ></div>
        )}
        {snapshot.activePassTarget && (
          <div
            className="pass-target"
            style={{ left: `${x(snapshot.activePassTarget.x)}%`, top: `${y(snapshot.activePassTarget.y)}%` }}
          ></div>
        )}
        {snapshot.secondBall && (
          <div
            className="second-ball-marker"
            style={{ left: `${x(snapshot.secondBall.x)}%`, top: `${y(snapshot.secondBall.y)}%` }}
          ></div>
        )}
        {selectedPlayer && (
          <svg className="intent-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={x(selectedPlayer.x)}
              y1={y(selectedPlayer.y)}
              x2={x(selectedPlayer.currentIntent.target.x)}
              y2={y(selectedPlayer.currentIntent.target.y)}
            ></line>
          </svg>
        )}
        {snapshot.players.map((player) => (
          <div
            key={`target-${player.id}`}
            className={`target ${player.teamSide}`}
            style={{ left: `${x(player.target.x)}%`, top: `${y(player.target.y)}%` }}
          ></div>
        ))}
        {snapshot.players.map((player) => (
          <button
            key={player.id}
            type="button"
            className={
              `player ${player.teamSide}` +
              `${player.id === snapshot.ball.ownerId ? ' owner' : ''}` +
              `${player.id === selectedPlayerId ? ' selected' : ''}`
            }
            style={{ left: `${x(player.x)}%`, top: `${y(player.y)}%` }}
            title={`${player.playerName} ${positionName(player.roleName)} ${labelize(player.currentIntent.type)}`}
            aria-label={`${player.playerName} ${positionName(player.roleName)}`}
            onClick={() => onSelectPlayer(player.id)}
          >
            {shortRole(player.roleName)}
          </button>
        ))}
        <div
          className="ball"
          style={{ left: `${x(snapshot.ball.x)}%`, top: `${y(snapshot.ball.y)}%` }}
        ></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamReport 组件（照搬 TeamReport.svelte）
// ---------------------------------------------------------------------------

function TeamReport({ team, report }) {
  const shortNames = {
    goalkeeping: '门将',
    defense: '防守',
    attack: '进攻',
  };

  const ratings = Object.entries(team.rating());

  return (
    <section className="team">
      <h2>{team.name}</h2>
      <ul className="ratings" aria-label={`${team.name} 评分`}>
        {ratings.map(([key, value]) => (
          <li key={key}>
            <strong>{shortNames[key]}</strong>
            <span>{Math.round(value)}</span>
          </li>
        ))}
      </ul>

      <table className="report">
        <tbody>
          <tr>
            <th>控球率</th>
            <td>{Math.round(report.possession * 100)}%</td>
          </tr>
          <tr>
            <th>传球</th>
            <td>{report.passes}</td>
          </tr>
          <tr>
            <th>传球成功率</th>
            <td>{Math.round(report.passCompletion * 100)}%</td>
          </tr>
          <tr>
            <th>射门</th>
            <td>{report.shots}</td>
          </tr>
          <tr>
            <th>射正</th>
            <td>{report.shotsOnGoal}</td>
          </tr>
          <tr>
            <th>抢断</th>
            <td>{report.tackles}</td>
          </tr>
          <tr>
            <th>犯规</th>
            <td>{report.fouls}</td>
          </tr>
          <tr>
            <th>黄牌</th>
            <td>{report.yellowCards}</td>
          </tr>
          <tr>
            <th>红牌</th>
            <td>{report.redCards}</td>
          </tr>
        </tbody>
      </table>

      <table className="players">
        <thead>
          <tr>
            <th>#</th>
            <th>姓名</th>
            <th>位置</th>
          </tr>
        </thead>
        <tbody>
          <tr className="players__group">
            <th colSpan="3">首发</th>
          </tr>
          {team.players.slice(0, 11).map((player) => (
            <tr key={player.info.number}>
              <td>{player.info.number}</td>
              <td>{player.info.name}</td>
              <td>{positionName(Position[player.position])}</td>
            </tr>
          ))}
        </tbody>
        {team.players.length > 11 && (
          <tbody>
            <tr className="players__group">
              <th colSpan="3">替补</th>
            </tr>
            {team.players.slice(11).map((player) => (
              <tr key={player.info.number}>
                <td>{player.info.number}</td>
                <td>{player.info.name}</td>
                <td>{positionName(Position[player.position])}</td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 比赛结束页（生涯 MATCH 模式整页结果）
// ---------------------------------------------------------------------------

function MatchEndPage({ simulation, snapshot, humanRating, growthResult, matchStory, onContinue }) {
  const homeName = simulation.homeTeam?.name || '主队';
  const awayName = simulation.awayTeam?.name || '客队';
  const homeGoals = snapshot.score?.home ?? 0;
  const awayGoals = snapshot.score?.away ?? 0;
  const tone = homeGoals > awayGoals ? 'win' : homeGoals < awayGoals ? 'loss' : 'draw';
  const toneLabel = homeGoals > awayGoals ? '胜利' : homeGoals < awayGoals ? '失利' : '平局';

  return (
    <div className="sim-demo">
      <div className="match-end">
        <header className="match-end__head">
          <span className="match-end__eyebrow">全场比赛结束</span>
          <h2>比赛结束</h2>
        </header>

        <div className={`match-end__banner tone-${tone}`}>
          <div className="match-end__team">
            <span className="match-end__name">{homeName}</span>
            <span className="match-end__fm">{simulation.homeFormation}</span>
          </div>
          <div className="match-end__score">
            <span>{homeGoals}</span>
            <span className="match-end__colon">:</span>
            <span>{awayGoals}</span>
          </div>
          <div className="match-end__team">
            <span className="match-end__name">{awayName}</span>
            <span className="match-end__fm">{simulation.awayFormation}</span>
          </div>
        </div>
        <div className="match-end__tag">{toneLabel}</div>

        <div className="match-end__rating">
          <span className="match-end__rating-label">本场评分</span>
          <span className="match-end__rating-val">{humanRating != null ? humanRating.toFixed(1) : '—'}</span>
        </div>

        {growthResult && Object.keys(growthResult.deltas).length > 0 ? (
          <ul className="match-end__growth">
            {Object.entries(growthResult.deltas).map(([key, delta]) => (
              <li key={key}><span>{PLAYER_ATTRS[key]?.label || key}</span><b>+{delta}</b></li>
            ))}
          </ul>
        ) : (
          <p className="match-end__none">表现平平，本场未获得属性成长</p>
        )}

        {matchStory && (
          <section className="match-end__story">
            <h3>{matchStory.headline}</h3>
            <p>{matchStory.summary}</p>
            {matchStory.sections.map((section, sectionIndex) => (
              <article key={sectionIndex}>
                <h4>{section.title}</h4>
                <p>{section.text}</p>
              </article>
            ))}
          </section>
        )}

        <div className="match-end__actions">
          <button type="button" className="match-end__continue" onClick={onContinue}>继续</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 赛前设置（MATCH 模式进入比赛前的可操作战术面板，全部对应引擎 Tactics 字段）
// ---------------------------------------------------------------------------

const STYLE_META = {
  balanced:   { label: '均衡',     desc: '攻守平衡的默认策略' },
  possession: { label: '控球',     desc: '低节奏短传，稳住球权' },
  direct:     { label: '直接',     desc: '高节奏，快速向前推进' },
  counter:    { label: '防守反击', desc: '收缩防线，伺机快速反击' },
  low_block:  { label: '低位防守', desc: '深度回收，稳守待变' },
  high_press: { label: '高位逼抢', desc: '前场压迫，激进逼抢' },
};

const MENTALITY_META = {
  attacking: '进攻',
  balanced:  '均衡',
  defensive: '防守',
};

const FOCUS_META = {
  balanced: '均衡',
  wide:     '边路',
  central:  '中路',
};

/** 迷你阵形预览：用引擎 formationSlots 的结构摆 11 个点（左=宽度、上=纵深）。 */
function FormationPreview({ formation }) {
  const slots = formationSlots(formation);
  const lineup = buildLineup(formation);
  const outfieldLineCount = Math.max(
    ...slots.filter((slot) => !slot.goalkeeper).map((slot) => slot.lineIndex),
  ) + 1;

  return (
    <div className="fm-preview" aria-hidden="true">
      <div className="fm-preview__pitch">
        {slots.map((slot, i) => {
          const left = slot.goalkeeper ? 50 : 10 + slot.lane * 80;
          const top = slot.goalkeeper
            ? 90
            : 72 - (slot.lineIndex / Math.max(1, outfieldLineCount - 1)) * 44;
          const role = Position[lineup[i]] || '';

          return (
            <span
              key={i}
              className={`fm-preview__dot${slot.goalkeeper ? ' fm-preview__dot--gk' : ''}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={role}
            >
              {role.slice(0, 2)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 赛前设置面板。选择阵形 / 战术风格 / 心态 / 进攻重点，并微调 5 个 0-100 滑块；
 * 确认后回调一份完整的 vendor Tactics 对象（含 formation）。
 */
function PreMatchSetup({ clubName, leagueLevel, playerPos, onConfirm, onExit }) {
  const [formation, setFormation] = useState(defaultFormationForPosition(playerPos || 'ST'));
  const [style, setStyle] = useState('balanced');
  const [mentality, setMentality] = useState('balanced');
  const [focus, setFocus] = useState('balanced');
  const [press, setPress] = useState(50);
  const [width, setWidth] = useState(55);
  const [tempo, setTempo] = useState(50);
  const [defensiveLine, setDefensiveLine] = useState(50);
  const [compactness, setCompactness] = useState(50);

  function applyStyle(nextStyle) {
    setStyle(nextStyle);
    const preset = STYLE_PRESETS[nextStyle] || STYLE_PRESETS.balanced;
    setMentality(preset.mentality);
    setFocus(preset.focus);
    setPress(preset.press);
    setWidth(preset.width);
    setTempo(preset.tempo);
    setDefensiveLine(preset.defensiveLine);
    setCompactness(preset.compactness);
  }

  function confirm() {
    onConfirm({
      formation,
      style,
      mentality,
      focus,
      press,
      width,
      tempo,
      defensiveLine,
      compactness,
    });
  }

  const sliders = [
    { key: 'press',         label: '逼抢强度', value: press,         set: setPress },
    { key: 'tempo',         label: '比赛节奏', value: tempo,         set: setTempo },
    { key: 'width',         label: '进攻宽度', value: width,         set: setWidth },
    { key: 'defensiveLine', label: '防线高度', value: defensiveLine, set: setDefensiveLine },
    { key: 'compactness',   label: '阵型紧凑', value: compactness,   set: setCompactness },
  ];

  return (
    <div className="sim-demo">
      <div className="prematch">
        <header className="prematch__head">
          <span className="prematch__eyebrow">赛前准备</span>
          <h2>赛前设置</h2>
          <p className="prematch__meta">
            {clubName || '我的球队'}
            {leagueLevel ? ` · 第 ${leagueLevel} 级联赛` : ''}
          </p>
        </header>

        <section className="prematch__block">
          <h3>阵形</h3>
          <div className="prematch__formations">
            {SUPPORTED_FORMATIONS.map((fm) => (
              <button
                key={fm}
                type="button"
                className={`prematch__fm${fm === formation ? ' is-active' : ''}`}
                onClick={() => setFormation(fm)}
              >
                <FormationPreview formation={fm} />
                <span>{fm}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="prematch__block">
          <h3>战术风格</h3>
          <div className="prematch__styles">
            {Object.entries(STYLE_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                className={`prematch__style${key === style ? ' is-active' : ''}`}
                onClick={() => applyStyle(key)}
              >
                <strong>{meta.label}</strong>
                <span>{meta.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="prematch__block">
          <h3>进攻心态</h3>
          <div className="prematch__seg">
            {Object.entries(MENTALITY_META).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={key === mentality ? 'is-active' : ''}
                onClick={() => setMentality(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="prematch__block">
          <h3>进攻重点</h3>
          <div className="prematch__seg">
            {Object.entries(FOCUS_META).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={key === focus ? 'is-active' : ''}
                onClick={() => setFocus(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="prematch__block">
          <h3>战术细节</h3>
          <div className="prematch__sliders">
            {sliders.map((slider) => (
              <label key={slider.key} className="prematch__slider">
                <span>{slider.label}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={slider.value}
                  onChange={(event) => slider.set(Number(event.target.value))}
                />
                <b>{slider.value}</b>
              </label>
            ))}
          </div>
        </section>

        <div className="prematch__actions">
          <button type="button" className="prematch__exit" onClick={onExit}>← 返回</button>
          <button type="button" className="prematch__start" onClick={confirm}>开始比赛</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 比赛构建 loading
// ---------------------------------------------------------------------------

// MATCH 模式赛前设置确认前 simulation 为 null，这里给一份空快照/空事件，
// 让下方所有派生计算（eventsUntil/reportFor/评分等）都能安全运行，不崩溃。
const EMPTY_SNAPSHOTS = [];
const EMPTY_EVENTS = [];
const EMPTY_SNAPSHOT = {
  period: 'first_half',
  phase: 'in_play',
  time: 0,
  score: { home: 0, away: 0 },
  addedTime: { firstHalf: 0, secondHalf: 0 },
  players: [],
  ball: { ownerId: null, x: 0, y: 0 },
};

/** 比赛构建中的整页 loading（引擎跑 90 分钟快照较耗时，先渲染 loading 再同步构建）。 */
function MatchLoading() {
  return (
    <div className="sim-demo">
      <div className="match-loading">
        <div className="match-loading__spinner" aria-hidden="true"></div>
        <p>正在生成比赛…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 主视图
// ---------------------------------------------------------------------------

export default function SimulatorDemoView() {
  const { state, dispatch, PHASES } = useGame();

  const ms = state.matchState || {};
  const identity = ms.identity || state.identity;
  const simState = ms.simState || state.simState;
  const leagueLevel = simState?.league?.tier || 2;

  // 生涯比赛模式下，用球员本人的球队（vendorSquad → vendor Team）跑比赛；
  // demo 模式下保持原来的固定 Juventus/Milan 阵容。
  // 赛前设置确认后传入完整 homeTactics（含 formation）。
  const buildMatch = (tactics = null) => {
    if (state.phase !== PHASES.MATCH) return createSimulation();

    const attrs = SIM.getAttributes();

    return buildCareerMatch({
      identity: identity || {},
      playerAttrs: attrs || {},
      leagueLevel,
      seed: `${state.seed || 'default'}_match`,
      clubName: SIM.curTeam()?.name || '',
      homeTactics: tactics,
    });
  };

  // 赛前设置：MATCH 模式进入后先确认战术，再开赛（确认时才构建一次，避免重复构建）
  const [matchSetup, setMatchSetup] = useState(null);
  // 构建中标志：确认/重建比赛时先显示 loading，引擎跑完再隐藏
  const [building, setBuilding] = useState(false);
  // MATCH 模式初始不构建（等赛前设置确认）；DEMO 模式保持 eager 构建
  const [simulation, setSimulation] = useState(() => (state.phase === PHASES.MATCH ? null : buildMatch()));
  const [index, setIndex] = useState(0);
  // 自动开播：生涯 MATCH 模式在赛前设置确认后开播；DEMO 模式保持手动（回放工具）
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [selectedGoalIndex, setSelectedGoalIndex] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  // 生涯模式下比赛结束时的评分 + 成长增量（供展示）
  const [growthResult, setGrowthResult] = useState(null);

  const preciseIndex = useRef(0);
  const lastFrameTime = useRef(0);
  const replayEndIndex = useRef(null);
  // 成长只应用一次：防止 scrubbing 反复跨过终场时重复喂给 SIM
  const growthAppliedRef = useRef(false);

  const snapshots = simulation?.snapshots || EMPTY_SNAPSHOTS;
  const events = simulation?.events || EMPTY_EVENTS;

  const snapshot = snapshots[index] || EMPTY_SNAPSHOT;
  // 终场快照的补时与最终时间（用于补时进球时间与时间轴刻度）
  const finalSnapshot = snapshots[snapshots.length - 1];
  const finalAdded = finalSnapshot?.addedTime || { firstHalf: 0, secondHalf: 0 };
  const finalTime = finalSnapshot?.time || simulation?.engine?.matchLengthSeconds || 90 * 60;

  // 生涯模式下球员本人的整场评分（基于全部 events，与 scrub 位置无关）
  const humanRating = useMemo(
    () => (state.phase === PHASES.MATCH ? computeHumanRating(events, simulation?.humanPlayer) : null),
    [state.phase, events, simulation?.humanPlayer],
  );

  // 每次重建比赛时复位成长状态
  useEffect(() => {
    growthAppliedRef.current = false;
    setGrowthResult(null);
  }, [simulation]);

  // 比赛进行到终场时，把评分换算成属性成长并喂回 SIM（一次）
  useEffect(() => {
    if (state.phase !== PHASES.MATCH) return;
    if (!snapshot || snapshot.period !== 'ended') return;
    if (growthAppliedRef.current) return;
    growthAppliedRef.current = true;

    const attrs = SIM.getAttributes();
    const ms = state.matchState || {};
    const identity = ms.identity || state.identity;
    const pos = identity?.pos || attrs?._pos || 'ST';

    let deltas = {};
    if (attrs && humanRating != null && humanRating > 7.0) {
      const potential = SIM.getPotential(attrs);
      deltas = mapGrowthToAttributes(humanRating, pos, attrs, potential);
      for (const [key, delta] of Object.entries(deltas)) {
        attrs[key] = Math.max(1, Math.min(20, (attrs[key] || 0) + delta));
      }
    }
    setGrowthResult({ rating: humanRating, deltas });
  }, [state.phase, snapshot, humanRating, simulation]);

  const elapsedEvents = eventsUntil(events, snapshot);
  const report = reportFor(events, snapshot, snapshots);
  const goals = formatScoreSheet(elapsedEvents);
  const allGoals = formatScoreSheet(events);
  const selectedPlayer = snapshot.players.find((player) => player.id === selectedPlayerId)
    || snapshot.players.find((player) => player.id === snapshot.ball.ownerId);
  const filteredEvents = filterEvents(elapsedEvents, eventFilter);
  const recentShot = elapsedEvents.filter((event) => ['shot', 'goal', 'save', 'miss', 'blocked_shot', 'penalty'].includes(event.type)).slice(-1)[0];
  const shotEvents = elapsedEvents.filter((event) => event.type === 'shot');
  const passRouteEntries = Object.entries(report.match.passRoutes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const shotRouteEntries = Object.entries(report.match.shotRoutes).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 防止 selectedGoalIndex 越界（等价于 Svelte 的响应式 clamp）
  const safeGoalIndex = allGoals.length ? Math.min(selectedGoalIndex, allGoals.length - 1) : 0;
  const activeGoal = allGoals[safeGoalIndex];

  const matchStory = useMemo(() => {
    if (snapshot.period !== 'ended' || !simulation) {
      return null;
    }

    return zhReport(simulation.engine);
  }, [snapshot.period, simulation]);

  function snapshotIndexAt(time) {
    const foundIndex = snapshots.findIndex((candidate) => candidate.time >= time);

    return foundIndex >= 0 ? foundIndex : snapshots.length - 1;
  }

  function togglePlay() {
    setPlaying((value) => !value);
    lastFrameTime.current = 0;
    replayEndIndex.current = null;
  }

  // 构建比赛（引擎跑 90 分钟快照较耗时）：先置 building 渲染 loading，
  // 让浏览器先画一帧，再同步构建；完成后隐藏 loading 并按需自动开播。
  // 只在确认/重建时调用，保证“确认时才构建一次”。
  function buildSimulationDeferred(tactics, autoPlay) {
    setBuilding(true);
    window.setTimeout(() => {
      const sim = buildMatch(tactics);
      setSimulation(sim);
      setIndex(0);
      preciseIndex.current = 0;
      setPlaying(autoPlay);
      lastFrameTime.current = 0;
      replayEndIndex.current = null;
      setSelectedGoalIndex(0);
      setSelectedPlayerId('');
      setBuilding(false);
    }, 60);
  }

  // 赛前设置确认：用所选战术构建一次比赛，自动开播
  function confirmSetup(tactics) {
    setMatchSetup(tactics);
    buildSimulationDeferred(tactics, true);
  }

  function newMatch() {
    buildSimulationDeferred(null, false);
  }

  // 直接跳到终场（触发结束页）
  function skipToEnd() {
    setPlaying(false);
    preciseIndex.current = snapshots.length - 1;
    replayEndIndex.current = null;
    setIndex(snapshots.length - 1);
  }

  function onScrub(event) {
    const value = Number(event.target.value);
    setPlaying(false);
    preciseIndex.current = value;
    replayEndIndex.current = null;
    setIndex(value);
  }

  function jumpToGoal(goalIndex) {
    const goal = allGoals[goalIndex];

    if (!goal) {
      return;
    }

    setSelectedGoalIndex(goalIndex);
    const goalSnapshot = snapshotIndexAt(goal.time);
    setIndex(goalSnapshot);
    preciseIndex.current = goalSnapshot;
    setPlaying(false);
    replayEndIndex.current = null;
  }

  function jumpToNextGoal() {
    if (!allGoals.length) {
      return;
    }

    const nextIndex = allGoals.findIndex((goal) => goal.time > snapshot.time + 0.01);

    jumpToGoal(nextIndex >= 0 ? nextIndex : 0);
  }

  function jumpToPreviousGoal() {
    if (!allGoals.length) {
      return;
    }

    const reversedIndex = allGoals
      .slice()
      .reverse()
      .findIndex((goal) => goal.time < snapshot.time - 0.01);
    const previousIndex = reversedIndex >= 0 ? allGoals.length - 1 - reversedIndex : allGoals.length - 1;

    jumpToGoal(previousIndex);
  }

  function replayGoal(goal = activeGoal) {
    if (!goal) {
      return;
    }

    const replayWindow = goal.replayWindow || {
      startTime: Math.max(0, goal.time - 12),
      endTime: Math.min(finalTime, goal.time + 4),
    };

    const startIndex = snapshotIndexAt(replayWindow.startTime);
    setIndex(startIndex);
    preciseIndex.current = startIndex;
    replayEndIndex.current = snapshotIndexAt(replayWindow.endTime);
    setSelectedGoalIndex(allGoals.indexOf(goal));
    setPlaying(true);
    lastFrameTime.current = 0;
  }

  function selectPlayer(id) {
    setSelectedPlayerId(id);
  }

  // 帧循环：始终跑一个 rAF，playing 时才推进 preciseIndex。
  // 依赖 [playing, speed, simulation]，切换时重建循环（等价于 Svelte onMount 的常驻循环）。
  useEffect(() => {
    let frameHandle;

    const frame = (now) => {
      if (!lastFrameTime.current) {
        lastFrameTime.current = now;
      }

      const deltaSeconds = (now - lastFrameTime.current) / 1000;
      lastFrameTime.current = now;

      if (playing && simulation) {
        preciseIndex.current += deltaSeconds * speed / simulation.engine.tickSeconds;
        const nextIndex = Math.min(snapshots.length - 1, Math.floor(preciseIndex.current));
        setIndex(nextIndex);

        if (
          nextIndex >= snapshots.length - 1
          || snapshots[nextIndex].period === 'ended'
          || (replayEndIndex.current !== null && nextIndex >= replayEndIndex.current)
        ) {
          setPlaying(false);
          replayEndIndex.current = null;
        }
      }

      frameHandle = requestAnimationFrame(frame);
    };

    frameHandle = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(frameHandle);
  }, [playing, speed, simulation, snapshots]);

  // 赛前设置 → 整页（顺序：生涯继续 → 判断进入比赛 → 赛前设置 → 比赛页）
  if (state.phase === PHASES.MATCH && !matchSetup) {
    return (
      <PreMatchSetup
        clubName={SIM.curTeam()?.name || ''}
        leagueLevel={leagueLevel}
        playerPos={identity?.pos || 'ST'}
        onConfirm={confirmSetup}
        onExit={() => dispatch({ type: 'LEAVE_MATCH' })}
      />
    );
  }

  // 比赛构建中 → 整页 loading（确认赛前设置后、引擎跑完快照前）
  if (building) {
    return <MatchLoading />;
  }

  // 生涯比赛结束 → 整页结束页（DEMO 模式仍停留在回放工具）
  if (state.phase === PHASES.MATCH && snapshot.period === 'ended') {
    return (
      <MatchEndPage
        simulation={simulation}
        snapshot={snapshot}
        humanRating={humanRating}
        growthResult={growthResult}
        matchStory={matchStory}
        onContinue={() => dispatch({ type: 'LEAVE_MATCH' })}
      />
    );
  }

  return (
    <div className="sim-demo">
      <div className="demo-toolbar">
        <button
          type="button"
          className="demo-exit"
          onClick={() => dispatch({ type: state.phase === PHASES.MATCH ? 'LEAVE_MATCH' : 'BACK_TO_INTRO' })}
        >
          ← 返回
        </button>
      </div>

      <section className="scoreboard">
        <button
          type="button"
          className="match-minute"
          aria-label={playing ? '暂停比赛' : '播放比赛'}
          onClick={togglePlay}
        >
          {matchStatus(snapshot)}
        </button>
        <div className="scores">
          <span>{snapshot.score.home}</span>
          <span>-</span>
          <span>{snapshot.score.away}</span>
        </div>
        {goals.length > 0 && (
          <div className="score-sheet">
            {goals.map((goal, goalIndex) => (
              <div
                key={`${goalIndex}-${goal.player?.info?.name || 'own-goal'}-${goal.time}`}
                className={`score-sheet__item${goal.teamSide === 'away' ? ' away' : ''}`}
              >
                <span>{goal.player?.info.name}</span>
                <span>{formatMatchMinute(goal.time, finalAdded)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="controls" aria-label="比赛控制">
        <button type="button" onClick={togglePlay}>{playing ? '暂停' : '播放'}</button>
        {state.phase !== PHASES.MATCH && (
          <button type="button" onClick={newMatch}>新比赛</button>
        )}
        {state.phase === PHASES.MATCH && (
          <button type="button" onClick={skipToEnd}>看结果</button>
        )}
        <button type="button" onClick={jumpToPreviousGoal} disabled={!allGoals.length}>上一个进球</button>
        <button type="button" onClick={jumpToNextGoal} disabled={!allGoals.length}>下一个进球</button>
        {snapshot.period === 'ended' && allGoals.length > 0 && (
          <button type="button" onClick={() => replayGoal()}>回放进球</button>
        )}
        <label>
          倍速
          <select value={String(speed)} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value="1">1x</option>
            <option value="5">5x</option>
            <option value="15">15x</option>
            <option value="45">45x</option>
            <option value="90">90x</option>
            <option value="180">180x</option>
          </select>
        </label>
        <label>
          事件
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
            <option value="all">全部</option>
            <option value="goals">进球</option>
            <option value="passes">传球</option>
            <option value="shots">射门</option>
            <option value="second_balls">二点球</option>
            <option value="set_pieces">定位球</option>
            <option value="discipline">纪律</option>
            <option value="stoppages">停顿</option>
          </select>
        </label>
        <span className="seed">种子 {String(simulation.seed).padStart(10, '0')}</span>
        <div className="timeline">
          <input
            type="range"
            min="0"
            max={snapshots.length - 1}
            value={index}
            onChange={onScrub}
            aria-label="时间轴"
          />
          <div className="goal-markers">
            {allGoals.map((goal, goalIndex) => (
              <button
                key={goalIndex}
                type="button"
                className={goalIndex === selectedGoalIndex ? 'active' : ''}
                style={{ left: `${goal.time / finalTime * 100}%` }}
                onClick={() => jumpToGoal(goalIndex)}
                aria-label={`第 ${goalIndex + 1} 球 ${formatMatchMinute(goal.time, finalAdded)}`}
              ></button>
            ))}
          </div>
        </div>
      </section>

      <Pitch snapshot={snapshot} selectedPlayerId={selectedPlayerId} onSelectPlayer={selectPlayer} />

      <section className="match-report" aria-label="比赛报告">
        <dl>
          <div>
            <dt>平均控球</dt>
            <dd>{formatDecimal(report.match.averagePossessionPasses)}</dd>
          </div>
          <div>
            <dt>最长控球</dt>
            <dd>{report.match.longestPossession}</dd>
          </div>
          <div>
            <dt>控球占比</dt>
            <dd>{formatPercent(report.match.ballOwnedShare)}</dd>
          </div>
          <div>
            <dt>球权悬空</dt>
            <dd>{formatPercent(report.match.looseBallShare)}</dd>
          </div>
          <div>
            <dt>控球回合</dt>
            <dd>#{snapshot.possession.id}</dd>
          </div>
          <div>
            <dt>传球</dt>
            <dd>{snapshot.possession.passCount}</dd>
          </div>
          <div>
            <dt>区域</dt>
            <dd>{diagnosticLabel(snapshot.fieldZones[0])}</dd>
          </div>
          <div>
            <dt>进攻形态</dt>
            <dd>{diagnosticLabel(snapshot.activeAttackPattern)}</dd>
          </div>
          <div>
            <dt>最后一传</dt>
            <dd>{diagnosticLabel(snapshot.possession.lastSuccessfulPassRoute)}</dd>
          </div>
          <div>
            <dt>机会</dt>
            <dd>{formatChance(recentShot?.chanceQuality)}</dd>
          </div>
          <div>
            <dt>进入前场</dt>
            <dd>{report.match.finalThirdEntries}</dd>
          </div>
          <div>
            <dt>进入禁区</dt>
            <dd>{report.match.boxEntries}</dd>
          </div>
        </dl>
        <table>
          <thead>
            <tr>
              <th>死球</th>
              <th>判罚</th>
              <th>执行</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.match.restarts).map(([type, restarts]) => (
              <tr key={type}>
                <th>{restartLabel(type)}</th>
                <td>{restarts.awards}</td>
                <td>{restarts.executions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>传球线路</th>
              <th>次数</th>
            </tr>
          </thead>
          <tbody>
            {passRouteEntries.map(([route, count]) => (
              <tr key={route}>
                <th>{diagnosticLabel(route)}</th>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>射门线路</th>
              <th>次数</th>
            </tr>
          </thead>
          <tbody>
            {shotRouteEntries.map(([route, count]) => (
              <tr key={route}>
                <th>{diagnosticLabel(route)}</th>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="shot-map" aria-label="射门分布">
          {shotEvents.map((shot, shotIndex) => (
            <span
              key={shotIndex}
              style={{ left: `${pitchX(shot.position.x)}%`, top: `${pitchY(shot.position.y)}%` }}
              title={`${diagnosticLabel(shot.outcome)} ${formatChance(shot.chanceQuality)}`}
            ></span>
          ))}
        </div>
        <div className="route-summary">
          <span>传中 {report.match.crosses.completed}/{report.match.crosses.attempted}</span>
          <span>倒三角 {report.match.cutbacks.completed}/{report.match.cutbacks.attempted}</span>
          <span>直塞 {report.match.throughBalls.completed}/{report.match.throughBalls.attempted}</span>
          <span>转移 {report.match.switches.completed}/{report.match.switches.attempted}</span>
        </div>
      </section>

      {activeGoal && (
        <section className="goal-context" aria-label="进球详情">
          <dl>
            <div>
              <dt>进球线路</dt>
              <dd>{diagnosticLabel(activeGoal.outcome)}</dd>
            </div>
            <div>
              <dt>控球回合</dt>
              <dd>#{activeGoal.possession.id}</dd>
            </div>
            <div>
              <dt>传球</dt>
              <dd>{activeGoal.possession.passCount}</dd>
            </div>
            <div>
              <dt>机会</dt>
              <dd>{formatChance(activeGoal.chanceQuality)}</dd>
            </div>
          </dl>
        </section>
      )}

      {matchStory && (
        <section className="story-report" aria-label="比赛战报">
          <h2>{matchStory.headline}</h2>
          <p>{matchStory.summary}</p>
          <div className="story-report__sections">
            {matchStory.sections.map((section, sectionIndex) => (
              <article key={sectionIndex}>
                <h3>{section.title}</h3>
                <p>{section.text}</p>
              </article>
            ))}
          </div>
          {matchStory.turningPoints.length > 0 && (
            <ol>
              {matchStory.turningPoints.map((point, pointIndex) => (
                <li key={pointIndex}>
                  <span>{formatTime(point.time || 0)}</span>
                  <strong>{point.title}</strong>
                  <p>{point.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="inspector" aria-label="选中球员">
        <div>
          <strong>{selectedPlayer?.playerName || '无球权'}</strong>
          <span>
            {selectedPlayer
              ? `${teamSideLabel(selectedPlayer.teamSide)} #${selectedPlayer.playerNumber} ${positionName(selectedPlayer.roleName)}`
              : '无球员持球'}
          </span>
        </div>
        <dl>
          <div>
            <dt>意图</dt>
            <dd>{selectedPlayer ? labelize(selectedPlayer.currentIntent.type) : '—'}</dd>
          </div>
          <div>
            <dt>落点</dt>
            <dd>{selectedPlayer ? `${Math.round(selectedPlayer.target.x)}, ${Math.round(selectedPlayer.target.y)}` : '—'}</dd>
          </div>
          <div>
            <dt>意图落点</dt>
            <dd>
              {selectedPlayer
                ? `${Math.round(selectedPlayer.currentIntent.target.x)}, ${Math.round(selectedPlayer.currentIntent.target.y)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>体能</dt>
            <dd>{selectedPlayer ? `${Math.round(selectedPlayer.stamina)}%` : '—'}</dd>
          </div>
          <div>
            <dt>牌</dt>
            <dd>{selectedPlayer ? `${selectedPlayer.yellowCards}黄${selectedPlayer.redCard ? '·红' : ''}` : '—'}</dd>
          </div>
          <div>
            <dt>犯规</dt>
            <dd>{selectedPlayer ? `${selectedPlayer.foulsCommitted}/${selectedPlayer.foulsSuffered}` : '—'}</dd>
          </div>
          <div>
            <dt>伤情</dt>
            <dd>{labelize(selectedPlayer?.injurySeverity)}</dd>
          </div>
        </dl>
      </section>

      <section className="events" aria-label="最近事件">
        <h2>最近事件</h2>
        <ol>
          {filteredEvents.slice(-8).reverse().map((event, eventIndex) => (
            <li key={eventIndex}>
              <span>{formatTime(event.time)}</span>
              <strong>{eventLabel(event)}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="teams">
        <TeamReport team={simulation.homeTeam} report={report.home} />
        <TeamReport team={simulation.awayTeam} report={report.away} />
      </section>
    </div>
  );
}
