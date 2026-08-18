// compare-tactics.mjs — 用 vendor 引擎跑多场比赛，对比不同赛前设置对结果的影响。
//
// 用途：验证赛前设置（阵形 / 战术风格 / 进攻心态 / 5 个滑块）确实会改变比赛走向。
// 运行：node compare-tactics.mjs [每配置场次数]     （默认 10 场/配置）
//
// 实验设计：主客两队阵容"镜像"（同一 seed 生成、属性完全一致），客场固定用
// 4-4-2 均衡战术，只有主队战术在变——这样结果差异就只来自战术本身 + 随机运气。
// 每配置用同一组比赛种子（0..N-1）跑 N 场再取平均，抵消单场运气。

import { Player, Position, Team, RealTimeEngine } from '@bleckert/football-simulator';

// ---------------------------------------------------------------------------
// 种子随机数（mulberry32，与项目 vendorSquad.js 同款）
// ---------------------------------------------------------------------------
function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(seed) {
  return mulberry32(hashSeed(String(seed)));
}

// ---------------------------------------------------------------------------
// 46 属性键（心理 14 + 身体 8 + 技术 14 + 门将 10）
// ---------------------------------------------------------------------------
const ATTR_KEYS = [
  'aggression', 'anticipation', 'bravery', 'composure', 'concentration',
  'decisions', 'determination', 'flair', 'leadership', 'offTheBall',
  'positioning', 'teamwork', 'vision', 'workRate',
  'acceleration', 'agility', 'balance', 'jumpingReach', 'naturalFitness',
  'pace', 'stamina', 'strength',
  'corners', 'crossing', 'dribbling', 'finishing', 'firstTouch',
  'freeKickTaking', 'heading', 'longShots', 'longThrows', 'marking',
  'passing', 'penaltyTaking', 'tackling', 'technique',
  'aerialReach', 'commandOfArea', 'communication', 'eccentricity',
  'handling', 'oneOnOnes', 'reflexes', 'rushingOut', 'tendencyToPunch', 'throwing',
];

// ---------------------------------------------------------------------------
// 队伍：双方镜像、属性一致（同一 seed），排除球员实力对战术对比的干扰
// ---------------------------------------------------------------------------
const STARTERS = [
  Position.GK, Position.LB, Position.CB, Position.CB, Position.RB,
  Position.LM, Position.CM, Position.CM, Position.RM, Position.ST, Position.ST,
];
const BENCH = [Position.GK, Position.LB, Position.CB, Position.RB, Position.DM, Position.CM, Position.ST];
const BASE = 14; // 中等实力，所有球员基准 14（±2 抖动）

function makeTeam(home, name, seed) {
  const rng = rngFor(seed);
  const mk = (pos, i) => {
    const attrs = {};
    for (const k of ATTR_KEYS) {
      const jitter = (rng() - 0.5) * 4; // ±2
      attrs[k] = Math.max(1, Math.min(20, Math.round(BASE + jitter)));
    }
    return new Player(
      { name: `${name}${i + 1}`, number: i + 1 },
      { height: 180, weight: 75 },
      attrs,
      pos,
    );
  };
  const players = STARTERS.map((p, i) => mk(p, i)).concat(BENCH.map((p, i) => mk(p, 11 + i)));
  return new Team(home, name, players);
}

// ---------------------------------------------------------------------------
// 战术预设（与 matchSimulation.js STYLE_PRESETS / 引擎 tacticalStylePresets 一致）
// ---------------------------------------------------------------------------
const STYLE_PRESETS = {
  balanced:   { press: 50, width: 55, tempo: 50, mentality: 'balanced',  defensiveLine: 50, compactness: 50, focus: 'balanced' },
  possession: { press: 56, width: 54, tempo: 42, mentality: 'balanced',  defensiveLine: 56, compactness: 58, focus: 'central' },
  direct:     { press: 46, width: 52, tempo: 72, mentality: 'balanced',  defensiveLine: 48, compactness: 46, focus: 'balanced' },
  counter:    { press: 38, width: 48, tempo: 62, mentality: 'defensive', defensiveLine: 38, compactness: 60, focus: 'central' },
  low_block:  { press: 28, width: 42, tempo: 36, mentality: 'defensive', defensiveLine: 28, compactness: 76, focus: 'central' },
  high_press: { press: 82, width: 58, tempo: 68, mentality: 'attacking', defensiveLine: 72, compactness: 46, focus: 'balanced' },
};

// 客场固定战术：4-4-2 均衡
const AWAY_TACTICS = { formation: '4-4-2', style: 'balanced', ...STYLE_PRESETS.balanced };

// ---------------------------------------------------------------------------
// 跑一场，返回主队维度统计
// ---------------------------------------------------------------------------
function runMatch(homeTactics, seed) {
  const home = makeTeam(true, '主队', 'squad');
  const away = makeTeam(false, '客队', 'squad');
  const engine = new RealTimeEngine(home, away, {
    random: rngFor(`engine_${seed}`),
    homeTactics,
    awayTactics: AWAY_TACTICS,
  });
  engine.simulate(90 * 60 + 15 * 60);

  const snapshots = engine.snapshots;
  const last = snapshots[snapshots.length - 1];
  const events = engine.events;

  const homeShots = events.filter((e) => e.teamSide === 'home' && e.type === 'shot').length;
  const homePasses = events.filter((e) => e.teamSide === 'home' && e.type === 'pass').length;
  const homeReceives = events.filter((e) => e.teamSide === 'home' && e.type === 'receive').length;

  // 控球率：按快照里持球方占比
  let homePoss = 0;
  let totalPoss = 0;
  for (const s of snapshots) {
    const side = s.possession && s.possession.teamSide;
    if (side === 'home' || side === 'away') {
      totalPoss += 1;
      if (side === 'home') homePoss += 1;
    }
  }

  return {
    hg: last.score.home,
    ag: last.score.away,
    shots: homeShots,
    passComp: homePasses ? homeReceives / homePasses : 0,
    possession: totalPoss ? homePoss / totalPoss : 0,
  };
}

// ---------------------------------------------------------------------------
// 汇总：N 场取平均
// ---------------------------------------------------------------------------
function runConfig(homeTactics, n) {
  let w = 0, d = 0, l = 0;
  let g = 0, ga = 0, shots = 0, passComp = 0, poss = 0;

  for (let i = 0; i < n; i++) {
    const r = runMatch(homeTactics, i);
    if (r.hg > r.ag) w += 1;
    else if (r.hg === r.ag) d += 1;
    else l += 1;
    g += r.hg;
    ga += r.ag;
    shots += r.shots;
    passComp += r.passComp;
    poss += r.possession;
  }

  return {
    w, d, l,
    goals: g / n,
    conceded: ga / n,
    shots: shots / n,
    passComp: passComp / n,
    possession: poss / n,
  };
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

// 中文按 2 列宽算，保证混合中英表格对齐
function dispWidth(s) {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0) > 0xff ? 2 : 1;
  return w;
}
function pad(s, n) {
  return s + ' '.repeat(Math.max(0, n - dispWidth(s)));
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log(
    pad('配置', 22) + '胜  平  负   场均进球  场均失球  场均射门   控球率   传球成功率',
  );
  for (const row of rows) {
    console.log(
      pad(row.name, 22) +
      `${String(row.r.w).padStart(3)} ${String(row.r.d).padStart(3)} ${String(row.r.l).padStart(3)}` +
      `    ${row.r.goals.toFixed(2).padStart(6)}    ${row.r.conceded.toFixed(2).padStart(6)}` +
      `   ${row.r.shots.toFixed(1).padStart(6)}  ${pct(row.r.possession).padStart(6)}   ${pct(row.r.passComp).padStart(6)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const N = Math.max(1, parseInt(process.argv[2] || '10', 10));

console.log('足球模拟器 · 赛前战术对比实验');
console.log(`主客两队阵容镜像（属性一致），客场固定 4-4-2 均衡；每配置跑 ${N} 场（种子 0..${N - 1}）。\n`);

// 一、战术风格（主队阵形固定 4-4-2）
const styleLabels = {
  balanced: '均衡 balanced',
  possession: '传控 possession',
  direct: '长传 direct',
  counter: '防反 counter',
  low_block: '低位防守 low_block',
  high_press: '高位逼抢 high_press',
};
console.log('一、战术风格（主队阵形固定 4-4-2）…');
const styleRows = Object.entries(STYLE_PRESETS).map(([key, preset]) => {
  const r = runConfig({ formation: '4-4-2', style: key, ...preset }, N);
  return { name: styleLabels[key], r };
});
printTable('一、战术风格（主队阵形固定 4-4-2，客场固定均衡）', styleRows);

// 二、阵形（主队战术固定均衡）
console.log('\n二、阵形（主队战术固定均衡 balanced）…');
const formationRows = ['4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-2-3-1'].map((fm) => {
  const r = runConfig({ formation: fm, style: 'balanced', ...STYLE_PRESETS.balanced }, N);
  return { name: fm, r };
});
printTable('二、阵形（主队战术固定均衡 balanced，客场固定均衡 4-4-2）', formationRows);

// 三、进攻心态（其余参数固定均衡）
console.log('\n三、进攻心态（主队 4-4-2，其余参数固定均衡，仅改心态）…');
const mentalityRows = ['balanced', 'attacking', 'defensive'].map((m) => {
  const r = runConfig({ formation: '4-4-2', style: 'balanced', ...STYLE_PRESETS.balanced, mentality: m }, N);
  return { name: m, r };
});
printTable('三、进攻心态（主队 4-4-2 均衡，仅改 mentality）', mentalityRows);

console.log('\n注：控球率/传球成功率为主队维度；胜平负按主队视角。');
console.log('可加参数提高样本量，例如：node compare-tactics.mjs 30');
