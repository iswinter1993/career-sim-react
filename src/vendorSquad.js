// vendorSquad.js — vendor-native squad generation.
//
// Replaces the old squadGen.js. Teams and players are now built directly from
// the vendor engine (`Player` / `Team` / `Position`), with all 46
// `PlayerAttributes` generated in place (1-20 scale). There is no mapping or
// adapter layer — vendor is the single source of truth.
//
// Formation handling is delegated to vendorFormation.js (a faithful port of the
// engine's own parseFormation / roleLineIndex / roleLane logic). The starting XI
// roles are derived from the formation string, and the human player is slotted
// in via the same line/lane scoring the engine uses.
//
// Public API:
//   buildHomeTeam({name,pos,number,attributes}, leagueLevel, seed, formation, clubName)
//                                → { team, humanPlayer, formation }
//   buildAwayTeam(teamName, leagueLevel, seed, formation) → Team
//
// The first 11 players are the starting XI (vendor slices `players[0..11)`);
// the following 7 are named substitutes.

import Player from '../vendor/football-simulator/src/Player';
import { Position } from '../vendor/football-simulator/src/enums/Position';
import Team from '../vendor/football-simulator/src/Team';
import {
  ATTRIBUTE_KEYS,
  positionEnumFor,
  weightsForVendorPosition,
} from './attributes';
import { buildLineup, findSlotIndex } from './vendorFormation';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — local so squad generation stays deterministic
// ---------------------------------------------------------------------------

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

function rngFor(seed) {
  return mulberry32(hashSeed(String(seed)));
}

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

function _generateName(rng) {
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const pool = rng() < 0.5 ? GIVEN_NAMES_MALE : GIVEN_NAMES_FEMALE;
  const pick = () => pool[Math.floor(rng() * pool.length)];
  if (rng() < 0.7) return surname + pick() + pick();
  return surname + pick();
}

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

function _generateTeamName(rng, used) {
  let name;
  do {
    name = CITY_PREFIXES[Math.floor(rng() * CITY_PREFIXES.length)]
      + TEAM_SUFFIXES[Math.floor(rng() * TEAM_SUFFIXES.length)];
  } while (used.has(name) && used.size < CITY_PREFIXES.length * TEAM_SUFFIXES.length);
  used.add(name);
  return name;
}

// ---------------------------------------------------------------------------
// League quality → attribute ranges (1-20)
// ---------------------------------------------------------------------------

const LEAGUE_QUALITY = {
  1: [13, 19], // 顶级联赛
  2: [10, 16], // 二级联赛
  3: [7, 13],  // 三级联赛
  4: [4, 10],  // 业余 / 青年
};

function clampLevel(level) {
  return Math.max(1, Math.min(4, Number(level) || 2));
}

// 7 人替补：覆盖门将 + 各位置组，保证换人有 GK 兜底
const BENCH_POSITIONS = [
  Position.GK, Position.LB, Position.CB, Position.RB,
  Position.DM, Position.CM, Position.ST,
];

// ---------------------------------------------------------------------------
// Player generation
// ---------------------------------------------------------------------------

function makePlayer(slotEnum, number, rng, qMin, qMax, overrides) {
  const weights = weightsForVendorPosition(slotEnum);
  const target = Math.round(qMin + rng() * (qMax - qMin));

  const attributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (overrides && overrides[key] !== undefined) {
      attributes[key] = overrides[key];
      continue;
    }
    const w = weights[key] || 5;
    const importance = w / 10;
    const base = target * (0.7 + 0.3 * importance);
    const jitter = (rng() - 0.5) * 6; // ±3
    attributes[key] = Math.max(1, Math.min(20, Math.round(base + jitter)));
  }

  return new Player(
    { name: _generateName(rng), number },
    { height: 178 + (number % 5) * 3, weight: 72 + (number % 4) * 4 },
    attributes,
    slotEnum,
  );
}

function makeHumanPlayer(slotEnum, name, attributes, number) {
  return new Player(
    { name, number },
    { height: 178 + (number % 5) * 3, weight: 72 + (number % 4) * 4 },
    attributes,
    slotEnum,
  );
}

function _avgAttrs(attrs) {
  if (!attrs) return null;
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) sum += attrs[key] || 0;
  return sum / ATTRIBUTE_KEYS.length;
}

// ---------------------------------------------------------------------------
// Team building
// ---------------------------------------------------------------------------

/**
 * Build the player's club as a vendor Team, injecting the human player (with
 * their own 46-key SIM attributes) at the formation slot closest to their
 * position (via vendorFormation.findSlotIndex).
 *
 * @param {object} playerIdentity — { name, pos, number, attributes } (46 keys, 1-20)
 * @param {number} leagueLevel    — 1-4
 * @param {string} seed
 * @param {string} formation      — e.g. '4-4-2'
 * @param {string} [clubName]
 * @returns {{ team: Team, humanPlayer: Player, formation: string }}
 */
export function buildHomeTeam(playerIdentity, leagueLevel, seed, formation, clubName) {
  const rng = rngFor(`${seed}|home`);
  const level = clampLevel(leagueLevel);
  const quality = LEAGUE_QUALITY[level];
  const lineup = buildLineup(formation);

  const teamName = clubName || _generateTeamName(rng, new Set());

  const pos = playerIdentity?.pos || 'ST';
  const attrs = playerIdentity?.attributes || {};
  // 球员本人号码＝生涯开始输入的号码（1-99），未提供则回退 99
  const humanNumber = Math.max(1, Math.min(99, Number(playerIdentity?.number) || 99));
  const humanSlot = findSlotIndex(positionEnumFor(pos), formation);
  const playerAvg = _avgAttrs(attrs);

  const players = [];
  let humanPlayer = null;

  // 队友号码：从 1 起顺序分配，跳过球员本人的号码，保证全队不重号
  const usedNumbers = new Set([humanNumber]);
  let nextNumber = 1;
  const nextFreeNumber = () => {
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    usedNumbers.add(nextNumber);
    return nextNumber++;
  };

  lineup.forEach((slotEnum, index) => {
    if (index === humanSlot) {
      humanPlayer = makeHumanPlayer(slotEnum, playerIdentity?.name || '你', attrs, humanNumber);
      players.push(humanPlayer);
    } else {
      const qMin = playerAvg != null ? Math.max(quality[0], Math.round(playerAvg) - 3) : quality[0];
      const qMax = playerAvg != null ? Math.max(qMin, Math.min(quality[1], Math.round(playerAvg) + 2)) : quality[1];
      players.push(makePlayer(slotEnum, nextFreeNumber(), rng, qMin, qMax));
    }
  });

  BENCH_POSITIONS.forEach((slotEnum) => {
    players.push(makePlayer(slotEnum, nextFreeNumber(), rng, quality[0], quality[1]));
  });

  return {
    team: new Team(true, teamName, players),
    humanPlayer,
    formation,
  };
}

/**
 * Build an opponent club as a vendor Team (no human injection).
 *
 * @param {string} [teamName] — preset name; auto-generated if omitted
 * @param {number} leagueLevel — 1-4
 * @param {string} seed
 * @param {string} [formation]
 * @returns {Team}
 */
export function buildAwayTeam(teamName, leagueLevel, seed, formation) {
  const rng = rngFor(`${seed}|away`);
  const level = clampLevel(leagueLevel);
  const quality = LEAGUE_QUALITY[level];
  const lineup = buildLineup(formation);
  const used = new Set();
  const name = teamName || _generateTeamName(rng, used);

  const players = [];
  lineup.forEach((slotEnum, index) => {
    players.push(makePlayer(slotEnum, index + 1, rng, quality[0], quality[1]));
  });
  BENCH_POSITIONS.forEach((slotEnum, i) => {
    players.push(makePlayer(slotEnum, 12 + i, rng, quality[0], quality[1]));
  });

  return new Team(false, name, players);
}
