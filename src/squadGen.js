// Random squad generator — creates 16-man teams (11 starters + 5 subs)
// with full sub-attribute sets and engine-ready skill mapping.
//
// Public API:
//   setSeed(seed)                 — seed the deterministic PRNG
//   generatePlayer(position, qualityMin, qualityMax) → player object
//   buildTeamSquad(playerIdentity, leagueLevel, seed) → { teamName, starters, subs, all }
//   buildOpponentSquad(teamName, leagueLevel, seed)    → { teamName, starters, subs, all }

import { SUB_ATTRS, getWeights } from './attributes.js';
import { mapToEngineSkills } from './attributeMapping.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

let _rng = Math.random;

function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
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

/** Seed the internal PRNG so all generation calls are deterministic. */
export function setSeed(seed) {
  _rng = mulberry32(hashSeed(String(seed)));
  _teamNamesUsed = new Set(); // fresh name pool per seed
}

function rand() { return _rng(); }

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randPick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------------------
// Name generation — Chinese football-style surnames + given names
// ---------------------------------------------------------------------------

const SURNAMES = [
  '李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','胡','朱','高','林',
  '何','郭','马','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹',
  '袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛',
  '叶','阎','余','潘','杜','戴','夏','钟','汪','田','任','姜','范','方','石','姚',
  '谭','顾','邹','熊','金','陆','郝','孔','白','崔','康','毛','邱','秦','江','史',
  '侯','邵','孟','龙','万','段','雷','钱','汤','尹','黎','易','常','武','乔','贺',
  '赖','龚','文',
];

const GIVEN_NAMES_MALE = [
  '伟','强','磊','洋','勇','军','杰','涛','明','超','波','辉','亮','刚','宁','慧',
  '志','健','宇','鑫','毅','峰','旭','鹏','俊','豪','飞','龙','林','斌','鹏','浩',
  '哲','翔','瑞','凯','文','华','建','国','思','远','海','天','永','博','腾','锐',
  '辰','翰','恒','嘉',
];

const GIVEN_NAMES_FEMALE = [
  '丽','敏','静','秀','芳','娜','婷','雪','娟','怡','馨','颖','莹','娟','洁',
  '雅','兰','玲','慧','红','翠','茜','君','琳','涵','雯','菲','诗','悦','瑶',
  '萱','梦','秋','雨','芸','珊','蕾',
];

function _generateName() {
  const surname = randPick(SURNAMES);
  // Two-character given name ~70% of the time, one-character ~30%
  const pool = rand() < 0.5 ? GIVEN_NAMES_MALE : GIVEN_NAMES_FEMALE;
  if (rand() < 0.7) {
    const a = randPick(pool);
    const b = randPick(pool);
    return surname + a + b;
  }
  return surname + randPick(pool);
}

// ---------------------------------------------------------------------------
// Position role info
// ---------------------------------------------------------------------------

// Position role info — all 12 career-selectable positions
// Engine only supports 8 (GK, CB, LB, RB, CM, LM, RM, ST) but we generate
// all 12 with proper sub-attribute weights and map CDM/CAM/LW/RW at engine time.

const POSITION_ROLES = {
  GK:  { key: 'GK',  label: '门将' },
  CB:  { key: 'CB',  label: '中后卫' },
  LB:  { key: 'LB',  label: '左后卫' },
  RB:  { key: 'RB',  label: '右后卫' },
  CDM: { key: 'CDM', label: '后腰' },
  CM:  { key: 'CM',  label: '中场' },
  CAM: { key: 'CAM', label: '前腰' },
  LM:  { key: 'LM',  label: '左前卫' },
  RM:  { key: 'RM',  label: '右前卫' },
  LW:  { key: 'LW',  label: '左边锋' },
  RW:  { key: 'RW',  label: '右边锋' },
  ST:  { key: 'ST',  label: '前锋' },
};

// Formation definitions: name → position array (11 starters)
// Positions are listed in standard order: GK → DEF → MID → ATT
const FORMATIONS = {
  '4-4-2':   ['GK', 'RB', 'CB', 'CB', 'LB',    'RM', 'CM', 'CM', 'LM',    'ST', 'ST'],
  '4-3-3':   ['GK', 'RB', 'CB', 'CB', 'LB',    'CM', 'CM', 'CM',          'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB',    'CDM','CDM',               'RM', 'CAM', 'LM', 'ST'],
  '3-5-2':   ['GK', 'CB', 'CB', 'CB',          'RM', 'CM', 'CM', 'CM', 'LM',    'ST', 'ST'],
  '5-3-2':   ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM',            'ST', 'ST'],
};

// Default position filler order — used when building substitute slots
// to ensure positional diversity on the bench
const SUB_POSITION_POOL = ['GK', 'CB', 'CM', 'LM', 'ST'];

// ---------------------------------------------------------------------------
// Public API — player generation
// ---------------------------------------------------------------------------

/**
 * Generate a single random player.
 *
 * @param {string} position — e.g. 'ST', 'CM', 'GK'
 * @param {number} qualityMin — floor for average sub-attribute value (0-100)
 * @param {number} qualityMax — ceiling for average sub-attribute value (0-100)
 * @param {object} [overrides] — optional forced values (used for the player's player)
 * @returns {object} { id, name, position, subAttrs, engineSkills, ovr }
 */
export function generatePlayer(position, qualityMin, qualityMax, overrides) {
  const id = `p_${Date.now().toString(36)}_${randInt(1000, 9999)}`;
  const name = _generateName();

  // Target quality level (deterministic, varies per player)
  const target = Math.round(qualityMin + rand() * (qualityMax - qualityMin));

  const weights = _getPosWeights(position);

  // Generate sub-attributes biased toward the target quality
  const subAttrs = {};
  for (const key of Object.keys(SUB_ATTRS)) {
    if (overrides && overrides[key] !== undefined) {
      subAttrs[key] = overrides[key];
      continue;
    }
    const w = weights.sub[key] || 5;
    // Core attributes get boosted toward target, fringe ones trend lower
    const importance = w / 10; // 0-1
    const base = target * 0.7 + target * 0.3 * importance;
    // ±15 jitter
    const jitter = (rand() - 0.5) * 30;
    subAttrs[key] = Math.max(0, Math.min(100, Math.round(base + jitter)));
  }

  // Engine-ready skills
  const engineSkills = mapToEngineSkills(subAttrs, position);

  // Approximate OVR from position-weighted categories
  const ovr = _approxOvr(subAttrs, position);

  return {
    id,
    name,
    position,
    subAttrs,
    engineSkills,
    ovr,
  };
}

// ---------------------------------------------------------------------------
// Public API — team building
// ---------------------------------------------------------------------------

/**
 * Build a complete 16-man squad with the player's player injected at their position.
 *
 * @param {object} playerIdentity — { name, pos, subAttrs } from the career player
 * @param {number} leagueLevel — 1 (top) to 4 (low); drives quality range
 * @param {string} seed — deterministic seed
 * @param {string} [formation] — formation key (e.g. '4-4-2', '4-3-3'); defaults to '4-4-2'
 * @returns {{ teamName: string, starters: Array, subs: Array, all: Array, formation: string }}
 */
export function buildTeamSquad(playerIdentity, leagueLevel, seed, formation) {
  setSeed(seed);

  const quality = LEAGUE_QUALITY[Math.max(1, Math.min(4, leagueLevel))] || LEAGUE_QUALITY[2];
  const fm = formation && FORMATIONS[formation] ? formation : '4-4-2';
  const fmSlots = FORMATIONS[fm];

  // Team name
  const teamName = _generateTeamName();

  const playerPos = playerIdentity.pos || 'ST';
  const starters = [];
  const usedIds = new Set();

  for (const pos of fmSlots) {
    if (pos === playerPos && starters.filter((s) => s.position === playerPos).length === 0) {
      // Inject the player's player here
      const playerSkills = mapToEngineSkills(playerIdentity.subAttrs, playerPos);
      const ovr = _approxOvr(playerIdentity.subAttrs, playerPos);
      const p = {
        id: 'player_self',
        name: playerIdentity.name,
        position: playerPos,
        subAttrs: { ...playerIdentity.subAttrs },
        engineSkills: playerSkills,
        ovr,
        isPlayer: true,
      };
      starters.push(p);
      usedIds.add('player_self');
    } else {
      // Generate a random teammate, bias quality toward player OVR
      const ovr = playerIdentity.subAttrs ? _approxOvr(playerIdentity.subAttrs, playerPos) : quality[0];
      const qMin = Math.max(quality[0], ovr - 15);
      const qMax = Math.min(quality[1], ovr + 10);
      const teammate = generatePlayer(pos, qMin, qMax);
      teammate.id = `tm_${pos}_${starters.length}`;
      while (usedIds.has(teammate.id)) teammate.id += '_';
      usedIds.add(teammate.id);
      starters.push(teammate);
    }
  }

  // Generate 5 substitutes with positional diversity
  const subs = [];
  for (const pos of SUB_POSITION_POOL) {
    const sub = generatePlayer(pos, quality[0], quality[1]);
    sub.id = `sub_${pos}_${subs.length}`;
    subs.push(sub);
  }

  const all = [...starters, ...subs];

  return { teamName, starters, subs, all, formation: fm };
}

/**
 * Build a full 16-man opponent squad.
 *
 * @param {string} teamName — preset team name
 * @param {number} leagueLevel — 1-4
 * @param {string} seed
 * @param {string} [formation] — formation key (e.g. '4-4-2', '4-3-3'); defaults to '4-4-2'
 * @returns {{ teamName: string, starters: Array, subs: Array, all: Array, formation: string }}
 */
export function buildOpponentSquad(teamName, leagueLevel, seed, formation) {
  setSeed(seed);

  const quality = LEAGUE_QUALITY[Math.max(1, Math.min(4, leagueLevel))] || LEAGUE_QUALITY[2];
  const fm = formation && FORMATIONS[formation] ? formation : '4-4-2';
  const fmSlots = FORMATIONS[fm];

  const starters = [];
  for (const pos of fmSlots) {
    const p = generatePlayer(pos, quality[0], quality[1]);
    p.id = `opp_${pos}_${starters.length}`;
    starters.push(p);
  }

  const subs = [];
  for (const pos of SUB_POSITION_POOL) {
    const sub = generatePlayer(pos, quality[0], quality[1]);
    sub.id = `oppSub_${pos}_${subs.length}`;
    subs.push(sub);
  }

  const all = [...starters, ...subs];

  return { teamName, starters, subs, all, formation: fm };
}

// ---------------------------------------------------------------------------
// League quality → sub-attribute ranges
// ---------------------------------------------------------------------------

const LEAGUE_QUALITY = {
  1: [65, 95],  // Top league (Chinese Super League)
  2: [50, 80],  // Second tier
  3: [35, 65],  // Third tier
  4: [20, 50],  // Amateur / youth
};

// ---------------------------------------------------------------------------
// Team name generation
// ---------------------------------------------------------------------------

const CITY_PREFIXES = [
  '北京', '上海', '广州', '深圳', '天津', '重庆', '成都', '武汉',
  '杭州', '南京', '沈阳', '大连', '青岛', '济南', '西安', '长沙',
  '郑州', '福州', '厦门', '合肥', '长春', '哈尔滨', '昆明', '石家庄',
  '太原', '南宁', '贵阳', '兰州', '南昌', '海口',
];

const TEAM_SUFFIXES = [
  'FC', '联队', '竞技', '城', '雄狮', '飞虎', '巨龙', '海盗',
  '绿茵', '铁骑', '钢铁', '蓝魔', '红魔', '勇士', '旋风',
  '闪电', '凤凰', '雄鹰', '战车', '神龙',
];

let _teamNamesUsed = new Set();

function _generateTeamName() {
  let name;
  do {
    const city = randPick(CITY_PREFIXES);
    const suffix = randPick(TEAM_SUFFIXES);
    name = city + suffix;
  } while (_teamNamesUsed.has(name) && _teamNamesUsed.size < CITY_PREFIXES.length * TEAM_SUFFIXES.length);
  _teamNamesUsed.add(name);
  return name;
}

/** Reset team name history (for a new season / rebuild). */
export function resetTeamNames() {
  _teamNamesUsed = new Set();
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function _getPosWeights(pos) {
  return getWeights(pos);
}

function _approxOvr(subAttrs, position) {
  const weights = _getPosWeights(position);
  const catW = weights.cat;
  const cats = ['tech', 'phys', 'mental'];
  const catScores = {};

  for (const cat of cats) {
    let wSum = 0, vSum = 0;
    for (const key of Object.keys(SUB_ATTRS)) {
      if (SUB_ATTRS[key].cat === cat) {
        const w = weights.sub[key] || 1;
        vSum += (subAttrs[key] || 0) * w;
        wSum += w;
      }
    }
    catScores[cat] = wSum > 0 ? vSum / wSum : 0;
  }

  let ovr = 0;
  for (const cat of cats) {
    ovr += catScores[cat] * (catW[cat] || 0.33);
  }
  return Math.round(Math.min(99, Math.max(0, ovr)));
}

export { FORMATIONS }; // re-exported for MatchView
