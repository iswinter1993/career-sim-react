// zhLabels.js — 比赛页/结果页的中文标签词典与 label 化工具。
//
// 引擎（vendor/football-simulator）产出的 phase/event type/outcome/field zone/
// attack pattern/position 等都是英文 snake_case 字符串。这里集中提供中文映射，
// 未收录的 token 会退化为「下划线转空格」的英文原文，保证不会空白或崩溃。

const POSITION_ZH = {
  GK: '门将',
  LB: '左后卫',
  LCB: '左中卫',
  CB: '中卫',
  RCB: '右中卫',
  RB: '右后卫',
  LWB: '左翼卫',
  LDM: '左后腰',
  DM: '后腰',
  RDM: '右后腰',
  RWB: '右翼卫',
  LM: '左中场',
  LCM: '左中前卫',
  CM: '中场',
  RCM: '右中前卫',
  RM: '右中场',
  LW: '左边锋',
  LCOM: '左前腰',
  COM: '前腰',
  RCOM: '右前腰',
  RW: '右边锋',
  LF: '左前锋',
  CF: '中锋',
  RF: '右前锋',
  ST: '前锋',
};

const TEAM_SIDE_ZH = {
  home: '主队',
  away: '客队',
};

// 事件类型 / 阶段 / 区域 / 进攻形态 / 意图 / 风格 / 线路等通用词典。
const TOKENS = {
  // 事件类型
  match_start: '开赛',
  kickoff: '开球',
  half_time: '中场休息',
  full_time: '全场结束',
  throw_in: '界外球',
  corner: '角球',
  goal_kick: '球门球',
  free_kick: '任意球',
  penalty: '点球',
  dribble: '盘带',
  challenge: '对抗',
  yellow_card: '黄牌',
  red_card: '红牌',
  injury: '伤停',
  substitution: '换人',
  tactical_change: '战术调整',
  role_change: '位置调整',
  advantage: '有利进攻',
  aerial_duel: '争顶',
  blocked_shot: '封堵射门',
  goalkeeper_claim: '门将没收',
  goalkeeper_punch: '门将击出',
  pass: '传球',
  receive: '接球',
  second_ball: '二点球',
  interception: '拦截',
  tackle: '抢断',
  shot: '射门',
  save: '扑救',
  miss: '未中',
  foul: '犯规',
  goal: '进球',
  recovery: '反抢',

  // 比赛阶段
  open_play: '运动战',
  injury_stoppage: '伤停',

  // 场地区域
  defensive_third: '防守三区',
  middle_third: '中场三区',
  attacking_third: '进攻三区',
  final_third: '前场三区',
  wide_left: '左路',
  wide_right: '右路',
  half_space_left: '左肋',
  half_space_right: '右肋',
  central_lane: '中路',
  box: '禁区',
  byline: '底线',

  // 进攻形态
  none: '无',
  patient_buildup: '耐心推进',
  midfield_progression: '中场推进',
  final_third_probe: '前场渗透',
  wide_overload: '边路过载',
  switch_of_play: '转移进攻',
  overlap: '套边',
  underlap: '内切',
  through_ball: '直塞',
  cross: '传中',
  cutback: '倒三角',
  late_run: '后插上',
  rebound: '二次进攻',
  set_piece: '定位球',
  central_combination: '中路配合',
  defensive_transition: '防守转换',
  counter_attack: '反击',

  // 球员意图
  hold_shape: '保持阵型',
  press: '逼抢',
  cover_passing_lane: '封堵线路',
  track_runner: '跟防跑动',
  attack_box: '冲击禁区',
  drop_between_lines: '回撤接应',
  drift_wide: '拉边',
  make_forward_run: '前插',
  recover_shape: '回位',
  support_carrier: '支援持球',
  support: '支援',
  receive_pass: '接球',
  attack_second_ball: '争二点',

  // 战术风格 / 心态 / 侧重
  balanced: '均衡',
  possession: '控球',
  direct: '直传',
  counter: '防反',
  low_block: '低位防守',
  high_press: '高位逼抢',
  defensive: '防守',
  attacking: '进攻',
  wide: '边路',
  central: '中路',

  // 传球/射门线路与结果
  overlap_pass: '套边传球',
  underlap_pass: '内切传球',
  line_breaking_pass: '撕开防线',
  wall_pass: '撞墙配合',
  progressive_pass: '推进传球',
  late_midfield_run: '中场后插',
  manager_choice: '教练安排',
  manager_tactical_change: '教练战术调整',
  manager_role_change: '教练位置调整',
  chasing_goal: '追分',
  event: '事件',
  match: '比赛',
  save_rebound: '扑出弹回',
  goalkeeper_spill: '门将脱手',
  close_down_one_v_one: '单刀封堵',
  positioned_save: '站位扑救',
  saved: '被扑出',
  blocked: '被封堵',
  over: '高出',
  wide: '偏出',
  post: '击中门柱',
  bar: '击中横梁',

  // 伤情
  knock: '轻伤',
  minor: '轻伤',
  forced: '重伤',
};

// 射门/传球结果常见的后缀，label 化时剥掉再看基础词。
const OUTCOME_SUFFIXES = [
  '_deflected_behind',
  '_inaccurate',
  '_goal',
  '_miss',
  '_saved',
  '_blocked',
  '_over',
  '_wide',
];

export function positionName(name) {
  return POSITION_ZH[name] || name;
}

export function teamSideLabel(side) {
  return TEAM_SIDE_ZH[side] || (side ? String(side).toUpperCase() : '');
}

export function periodLabel(period) {
  if (period === 1) return '上半场';
  if (period === 2) return '下半场';
  if (period === 'ended') return '全场结束';
  return String(period);
}

// 把任意引擎字符串 label 成中文；未收录则退化为英文（下划线转空格）。
export function labelize(raw) {
  if (raw == null || raw === '') return '—';
  const str = String(raw);

  // 先整词精确匹配（如 drift_wide / chasing_goal 这类以结果后缀结尾但
  // 本身是独立词条的，不能被下面「剥后缀」误拆）。
  if (TOKENS[str]) return TOKENS[str];

  for (const suffix of OUTCOME_SUFFIXES) {
    if (str.endsWith(suffix)) {
      const base = str.slice(0, -suffix.length);
      return TOKENS[base] || base.replace(/_/g, ' ');
    }
  }

  return str.replace(/_/g, ' ');
}
