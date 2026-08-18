// vendorFormation.js — 阵形相关代码的单一真理源，忠实移植 vendor 引擎的阵形逻辑。
//
// RealTimeEngine.ts 里的阵形方法都是私有成员，本模块以纯函数形式复刻：
//   parseFormation / roleLineIndex / roleLane / roleFormationPreference /
//   formationSlots / formationSlotScore / assignRolesToSlots
// 引擎方向是「球员位置 → 阵形槽位（line + lane）」，这里额外提供生成方向的
// 反向：buildLineup(formation) 把「阵形字符串 → 首发 11 人位置」。
//
// 关键事实（与引擎一致）：
//   - 阵形字符串就是「每线人数」之和等于 10（门将另算），parseFormation 对
//     非 10 的输入一律回退 [4,4,2]。
//   - 引擎只用每个位置的 line（roleLineIndex）与 lane（roleLane）来摆放球员，
//     同一 line/lane 上的多个位置（如 LW 与 LF 的 lane 都是 0）对引擎完全等价，
//     叫什么名字纯粹是展示层的选择——生成方向里由 GROUP_BUCKETS 拍板。

import {
  Position,
  defencePositions,
  midfieldPositions,
  attackPositions,
} from '../vendor/football-simulator/src/enums/Position';

// ---------------------------------------------------------------------------
// 引擎私有方法的忠实移植
// ---------------------------------------------------------------------------

/** 阵形字符串 → 每线人数数组（和必须为 10，否则回退 [4,4,2]）。 */
export function parseFormation(formation) {
  const shape = formation
    .split('-')
    .map((line) => parseInt(line, 10))
    .filter((line) => Number.isFinite(line) && line > 0);

  if (shape.reduce((sum, line) => sum + line, 0) !== 10) {
    return [4, 4, 2];
  }

  return shape;
}

/** 位置 → 所属线索引（0 起，GK 由调用方特判为 -1）。 */
export function roleLineIndex(role, outfieldLineCount) {
  if (defencePositions.includes(role)) {
    return 0;
  }

  if (attackPositions.includes(role)) {
    return outfieldLineCount - 1;
  }

  if (midfieldPositions.includes(role)) {
    if ([Position.LDM, Position.DM, Position.RDM].includes(role)) {
      return Math.min(1, outfieldLineCount - 1);
    }

    return Math.min(Math.max(1, Math.round((outfieldLineCount - 1) / 2)), outfieldLineCount - 1);
  }

  return Math.max(0, outfieldLineCount - 1);
}

/** 位置 → 横向 lane（0=左，0.5=中，1=右）。 */
export function roleLane(role) {
  switch (role) {
    case Position.LB:
    case Position.LWB:
    case Position.LM:
    case Position.LW:
    case Position.LF:
      return 0;
    case Position.LCB:
    case Position.LDM:
    case Position.LCM:
    case Position.LCOM:
      return 0.33;
    case Position.RCB:
    case Position.RDM:
    case Position.RCM:
    case Position.RCOM:
      return 0.67;
    case Position.RB:
    case Position.RWB:
    case Position.RM:
    case Position.RW:
    case Position.RF:
      return 1;
    default:
      return 0.5;
  }
}

/** 位置 → { lineIndex, lane, goalkeeper } 偏好（GK 线索引 -1）。 */
export function roleFormationPreference(role, outfieldLineCount) {
  if (role === Position.GK) {
    return { lineIndex: -1, lane: 0.5, goalkeeper: true };
  }

  return {
    lineIndex: roleLineIndex(role, outfieldLineCount),
    lane: roleLane(role),
    goalkeeper: false,
  };
}

/** 阵形 → 11 个槽位（1 门将 + 10 外场），只保留结构（lineIndex/lane/goalkeeper）。 */
export function formationSlots(formation) {
  const shape = parseFormation(formation);
  const slots = [{ lineIndex: -1, lane: 0.5, goalkeeper: true }];

  shape.forEach((playerCount, lineIndex) => {
    const gap = playerCount === 1 ? 0 : 1 / (playerCount - 1);
    for (let index = 0; index < playerCount; index += 1) {
      const lane = playerCount === 1 ? 0.5 : index * gap;
      slots.push({ lineIndex, lane, goalkeeper: false });
    }
  });

  return slots;
}

/** 槽位 vs 偏好 的评分（越小越好）。 */
export function formationSlotScore(slot, preference) {
  const goalkeeperPenalty = slot.goalkeeper === preference.goalkeeper ? 0 : 20;
  const lineScore = Math.abs(slot.lineIndex - preference.lineIndex) * 4;
  const laneScore = Math.abs(slot.lane - preference.lane);

  return goalkeeperPenalty + lineScore + laneScore;
}

/** 引擎的贪心落位：给一组位置，返回每个位置对应的槽位下标。 */
export function assignRolesToSlots(roles, formation) {
  const slots = formationSlots(formation);
  const outfieldLineCount = Math.max(
    ...slots.filter((slot) => !slot.goalkeeper).map((slot) => slot.lineIndex),
  ) + 1;
  const assigned = new Set();

  return roles.map((role) => {
    const preference = roleFormationPreference(role, outfieldLineCount);
    const available = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ index }) => !assigned.has(index));
    const candidates = available.length
      ? available
      : slots.map((slot, index) => ({ slot, index }));
    const selected = candidates
      .sort((a, b) => formationSlotScore(a.slot, preference) - formationSlotScore(b.slot, preference))[0];

    assigned.add(selected.index);

    return selected.index;
  });
}

// ---------------------------------------------------------------------------
// 生成方向：阵形字符串 → 首发 11 人位置
// ---------------------------------------------------------------------------

// 每条线的「lane → 规范位置」表。line 结构由 parseFormation 决定、lane 由引擎
// 同款的均匀分布给出；同一 lane 上叫哪个名字（LW vs LF、LB vs LWB 等）引擎不
// 关心，这里取读起来最自然的那个（纯展示层选择）。
const GROUP_BUCKETS = {
  defence:  [[0, Position.LB], [0.25, Position.LCB], [0.5, Position.CB], [0.75, Position.RCB], [1, Position.RB]],
  deepMid:  [[0, Position.LDM], [0.5, Position.DM], [1, Position.RDM]],
  midfield: [[0, Position.LM], [0.25, Position.LCM], [0.5, Position.CM], [0.75, Position.RCM], [1, Position.RM]],
  attack:   [[0, Position.LF], [0.25, Position.LCOM], [0.5, Position.ST], [0.75, Position.RCOM], [1, Position.RF]],
};

/** 某条外场线属于哪个位置组（镜像引擎 roleLineIndex 的三段式：防线/中场/锋线）。 */
function groupForLine(lineIndex, outfieldLineCount) {
  if (lineIndex === 0) return 'defence';
  if (lineIndex === outfieldLineCount - 1) return 'attack';

  // 4 线阵形（如 4-2-3-1 / 4-1-4-1）：紧贴防线的那条中线是 DM 线（引擎里
  // LDM/DM/RDM 落在 min(1, n-1)=1，其余中场落在中间线）。
  if (outfieldLineCount >= 4 && lineIndex === 1) return 'deepMid';
  return 'midfield';
}

function pickForLane(group, lane) {
  const buckets = GROUP_BUCKETS[group] || GROUP_BUCKETS.midfield;
  let best = buckets[0][1];
  let bestDist = Infinity;

  for (const [bucketLane, position] of buckets) {
    const dist = Math.abs(bucketLane - lane);
    if (dist < bestDist) {
      bestDist = dist;
      best = position;
    }
  }

  return best;
}

/** 阵形字符串 → 首发 11 个 vendor 位置（下标 0 恒为 GK）。 */
export function buildLineup(formation) {
  const shape = parseFormation(formation);
  const n = shape.length;
  const roles = [Position.GK];

  shape.forEach((count, lineIndex) => {
    const group = groupForLine(lineIndex, n);
    const gap = count === 1 ? 0 : 1 / (count - 1);

    for (let i = 0; i < count; i += 1) {
      const lane = count === 1 ? 0.5 : i * gap;
      roles.push(pickForLane(group, lane));
    }
  });

  return roles;
}

/**
 * 给定一个 vendor 位置，找出发阵容里最贴合它的下标（供球员本人精确落位）。
 * 评分规则与引擎的 formationSlotScore 同款：门将不匹配罚 20、线差 ×4、lane 差 ×1。
 */
export function findSlotIndex(vendorPos, formation) {
  const lineup = buildLineup(formation);
  const n = parseFormation(formation).length;
  const pref = roleFormationPreference(vendorPos, n);

  let best = 0;
  let bestScore = Infinity;

  lineup.forEach((role, index) => {
    const rp = roleFormationPreference(role, n);
    const gkPenalty = rp.goalkeeper === pref.goalkeeper ? 0 : 20;
    const score = gkPenalty
      + Math.abs(rp.lineIndex - pref.lineIndex) * 4
      + Math.abs(rp.lane - pref.lane);

    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });

  return best;
}

// ---------------------------------------------------------------------------
// 供生涯模拟挑选的阵形清单（游戏设计选择；引擎本身接受任何和=10 的字符串）
// ---------------------------------------------------------------------------

export const SUPPORTED_FORMATIONS = [
  '4-4-2',
  '4-3-3',
  '4-2-3-1',
  '3-5-2',
  '5-3-2',
  '4-1-4-1',
  '3-4-3',
  '4-2-4',
];

/** 引擎的有效性判据：字符串每线人数之和 = 10（否则引擎回退 4-4-2）。 */
export function isValidFormation(formation) {
  if (typeof formation !== 'string' || !formation) return false;
  const shape = formation
    .split('-')
    .map((line) => parseInt(line, 10))
    .filter((line) => Number.isFinite(line) && line > 0);

  return shape.reduce((sum, line) => sum + line, 0) === 10;
}
