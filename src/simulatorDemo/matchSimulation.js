// matchSimulation.js — 用 vendor 引擎跑一场生涯比赛。
//
// 双方阵容直接由 vendorSquad 用 vendor 的 Player/Team/Position 生成（46 属性
// 全部 1-20 刻度，无映射层）；球员本人也直接用 SIM 的 46 属性构建 vendor
// Player。之后用 RealTimeEngine 跑完 90 分钟，并把球员个人表现换算成 0-10 评分，
// 供上层 mapGrowthToAttributes 反哺 SIM 属性成长。
//
// 关键假设（与 vendor 引擎一致）：
//   - vendor PlayerAttributes 本身就是 1-20 刻度（attributesAverage 里 /20*100）。
//   - SimulatedPlayer.id = `${side}-${idPrefix}-${index}-${number}`，event.player
//     是真正的 Player 实例，可用引用相等（===）精确定位球员本人。

import RealTimeEngine from '../../vendor/football-simulator/src/RealTimeEngine';
import { seededRandom } from './simulation';
import {
  buildHomeTeam,
  buildAwayTeam,
} from '../vendorSquad';
import { isValidFormation, SUPPORTED_FORMATIONS } from '../vendorFormation';

// ---------------------------------------------------------------------------
// 战术风格预设（复制自 vendor RealTimeEngine.ts 的 tacticalStylePresets，
// 该对象未导出，需在此复制一份以便拼装 Tactics）
// ---------------------------------------------------------------------------
export const STYLE_PRESETS = {
  balanced:   { press: 50, width: 55, tempo: 50, mentality: 'balanced',  defensiveLine: 50, compactness: 50, focus: 'balanced' },
  possession: { press: 56, width: 54, tempo: 42, mentality: 'balanced',  defensiveLine: 56, compactness: 58, focus: 'central' },
  direct:     { press: 46, width: 52, tempo: 72, mentality: 'balanced',  defensiveLine: 48, compactness: 46, focus: 'balanced' },
  counter:    { press: 38, width: 48, tempo: 62, mentality: 'defensive', defensiveLine: 38, compactness: 60, focus: 'central' },
  low_block:  { press: 28, width: 42, tempo: 36, mentality: 'defensive', defensiveLine: 28, compactness: 76, focus: 'central' },
  high_press: { press: 82, width: 58, tempo: 68, mentality: 'attacking', defensiveLine: 72, compactness: 46, focus: 'balanced' },
};

/** 拼装一套战术：formation + style 预设，可再叠加自定义覆盖（赛前设置）。 */
export function tacticsFor(formation, style = 'balanced', overrides = {}) {
  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.balanced;
  return { formation, style, ...preset, ...overrides };
}

// 客场风格随联赛级别变化（级别越高越难缠）
const AWAY_STYLE_BY_LEVEL = {
  1: 'possession',
  2: 'direct',
  3: 'counter',
  4: 'low_block',
};

// 对手阵型池（来自 vendorFormation.SUPPORTED_FORMATIONS）

// 每个位置最契合的默认阵型——保证球员本人永远精确落位，不做 fallback
const FORMATION_FOR_POSITION = {
  GK: '4-4-2', CB: '4-4-2', LB: '4-4-2', RB: '4-4-2',
  CM: '4-4-2', LM: '4-4-2', RM: '4-4-2', ST: '4-4-2',
  CDM: '4-2-3-1', CAM: '4-2-3-1',
  LW: '4-3-3', RW: '4-3-3',
};

// ---------------------------------------------------------------------------
// 工具：确定性哈希 / 阵型选择
// ---------------------------------------------------------------------------
function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** 根据球员位置选默认阵型（保证精确落位）。 */
export function defaultFormationForPosition(pos) {
  return FORMATION_FOR_POSITION[pos] || '4-4-2';
}

/** 确定性挑选一个不同于主队的对手阵型。 */
export function pickOpponentFormation(homeFormation, seed) {
  const pool = SUPPORTED_FORMATIONS;
  const idx = hashSeed(seed) % pool.length;
  const fm = pool[idx];
  return fm === homeFormation ? pool[(idx + 1) % pool.length] : fm;
}

// ---------------------------------------------------------------------------
// 主入口：搭建并跑完一场生涯比赛
// ---------------------------------------------------------------------------

/**
 * 用球员本人的球队（vendorSquad 生成）跑一场 vendor RealTimeEngine 比赛。
 *
 * @param {object} opts
 * @param {object} opts.identity      — { name, pos, number } 球员身份
 * @param {object} opts.playerAttrs   — 46 属性（1-20，来自 SIM.getAttributes()）
 * @param {number} opts.leagueLevel   — 联赛级别 1-4
 * @param {string} opts.seed          — 生涯种子字符串
 * @param {string} [opts.clubName]    — 俱乐部名称（SIM.curTeam()?.name）
 * @param {string} [opts.homeFormation] — 主队阵型（缺省按位置自动选）
 * @param {object} [opts.homeTactics]  — 赛前设置传入的完整主场战术（含 formation）
 * @returns {{ engine, homeTeam, awayTeam, snapshots, events, seed, humanPlayer,
 *   homeFormation, awayFormation }}
 */
export function buildCareerMatch(opts) {
  const { identity, playerAttrs, leagueLevel = 2, seed = 'default', clubName } = opts;
  const pos = identity?.pos || 'ST';
  const level = Math.max(1, Math.min(4, Number(leagueLevel) || 2));

  // 赛前设置可传入完整 homeTactics（含 formation）；否则按位置/默认拼装
  const presetTactics = opts.homeTactics;
  const homeFormation = (presetTactics && isValidFormation(presetTactics.formation))
    ? presetTactics.formation
    : (opts.homeFormation && isValidFormation(opts.homeFormation)
        ? opts.homeFormation
        : defaultFormationForPosition(pos));
  const awayFormation = pickOpponentFormation(homeFormation, seed);

  // 双方阵容——home/away 用不同子种子，避免随机流完全同源
  const home = buildHomeTeam(
    { name: identity?.name || '你', pos, number: identity?.number, attributes: playerAttrs || {} },
    level,
    seed,
    homeFormation,
    clubName || '',
  );
  const away = buildAwayTeam(null, level, seed, awayFormation);

  const homeStyle = 'high_press';
  const awayStyle = AWAY_STYLE_BY_LEVEL[level] || 'balanced';

  const engine = new RealTimeEngine(home.team, away, {
    random: seededRandom(hashSeed(`${seed}|engine`) || 1),
    homeTactics: presetTactics || tacticsFor(homeFormation, homeStyle),
    awayTactics: tacticsFor(awayFormation, awayStyle),
  });

  const snapshots = engine.simulate(90 * 60 + 15 * 60);

  return {
    engine,
    homeTeam: home.team,
    awayTeam: away,
    snapshots,
    events: engine.events,
    seed,
    humanPlayer: home.humanPlayer,
    homeFormation,
    awayFormation,
  };
}

// ---------------------------------------------------------------------------
// 评分：从 vendor events 汇总球员本人的 0-10 评分
// ---------------------------------------------------------------------------

/**
 * 根据比赛事件给球员本人打分（0-10）。默认 6.0 起评，进球/抢断/拦截/射门/
 * 传球/扑救加分，犯规/吃牌扣分。good (>7.0) 才触发属性成长。
 *
 * @param {Array} events — engine.events
 * @param {Player} humanPlayer — 球员本人对应的 vendor Player 实例（引用匹配）
 * @returns {number} 0-10（保留 1 位小数）
 */
export function computeHumanRating(events, humanPlayer) {
  if (!humanPlayer) return 6.0;

  const isHuman = (player) => player && (player === humanPlayer
    || player.info?.number === humanPlayer.info?.number
    || player.info?.name === humanPlayer.info?.name);

  let score = 6.0;
  let goals = 0;
  let tackles = 0;
  let interceptions = 0;
  let shots = 0;
  let passes = 0;
  let saves = 0;
  let fouls = 0;
  let cards = 0;

  for (const e of events) {
    const humanPrimary = isHuman(e.player);
    const humanSecondary = isHuman(e.secondaryPlayer);
    if (!humanPrimary && !humanSecondary) continue;

    switch (e.type) {
      case 'goal':
        if (humanPrimary) { goals += 1; score += 2.2; }
        break;
      case 'pass':
        if (humanPrimary) passes += 1;
        break;
      case 'receive':
        // receiver（humanPrimary）或传出这脚球的人（humanSecondary）
        if (humanPrimary || humanSecondary) passes += 1;
        break;
      case 'shot':
      case 'miss':
        if (humanPrimary) shots += 1;
        break;
      case 'tackle':
        if (humanPrimary) tackles += 1;
        break;
      case 'interception':
      case 'recovery':
        if (humanPrimary) interceptions += 1;
        break;
      case 'foul':
        if (humanPrimary) fouls += 1;
        else if (humanSecondary) score += 0.1; // 被犯规
        break;
      case 'yellow_card':
        if (humanPrimary) cards += 1;
        break;
      case 'red_card':
        if (humanPrimary) cards += 2;
        break;
      case 'save':
      case 'goalkeeper_claim':
      case 'goalkeeper_punch':
        if (humanPrimary) saves += 1;
        break;
      default:
        break;
    }
  }

  score += Math.min(1.5, tackles * 0.15 + interceptions * 0.12);
  score += Math.min(1.5, shots * 0.18);
  score += Math.min(1.5, saves * 0.6);   // 门将
  score += Math.min(1.0, passes * 0.02);
  score -= Math.min(1.5, fouls * 0.25);
  score -= Math.min(3.0, cards * 0.75);
  // 进球已直接加过分（每球 +2.2），这里再给一个封顶的总进球加成，防止刷分过头
  score = Math.min(10, score - Math.max(0, goals - 1) * 0.6);

  return Math.max(3, Math.min(10, Math.round(score * 10) / 10));
}
