// gameConfig.js — Design Pattern #9: Data-driven static config
//
// Single source of truth for tunable, static game data. These are the knobs a
// designer (or a future settings screen / difficulty presets) should be able to
// change WITHOUT touching engine or component logic. Keeping them in one data
// module — rather than scattered as magic numbers and inline tables inside
// matchEngine.js / MatchView.jsx / PitchCanvas.jsx — is the point of the
// pattern: code says *how*, config says *what*.
//
// Nothing here imports engine/component code, so this module can never create
// an import cycle. Treat it as pure data.
//
// Public API:
//   PITCH                 → { pitchWidth, pitchHeight, goalWidth }
//   ITERATIONS_PER_HALF   → iterations in one half (engine tick granularity)
//   TICK_BURST            → { normal, fast } — engine iterations advanced per
//                           React render tick at each playback speed
//   COMMENTARY_TEMPLATES  → engine log string → Chinese commentary translation

// ---------------------------------------------------------------------------
// Pitch geometry (pitch units; also the render coordinate space)
// ---------------------------------------------------------------------------
export const PITCH = Object.freeze({
  pitchWidth: 680,
  pitchHeight: 1050,
  goalWidth: 90,
});

// ---------------------------------------------------------------------------
// Match length — iterations per half. Half the author's reference
// (gamelength=12000 → 6000/half) because we batch TICK_BURST.normal iterations
// per tick, giving ~12s per half at normal speed.
// ---------------------------------------------------------------------------
export const ITERATIONS_PER_HALF = 3000;

// ---------------------------------------------------------------------------
// Playback — engine iterations advanced per render tick.
// ---------------------------------------------------------------------------
export const TICK_BURST = Object.freeze({
  normal: 4,
  fast: 15,
});

// ---------------------------------------------------------------------------
// Chinese commentary templates
// ---------------------------------------------------------------------------
export const COMMENTARY_TEMPLATES = {
  // =========================================================================
  // Match setup
  // =========================================================================
  'Team to kick off': (text, team) => {
    const m = text.match(/Team to kick off - (.+)/);
    return m ? `${team}${m[1]} 先开球` : `${team}比赛开始`;
  },
  'Second team': () => '',
  'Second Half Started': () => `下半场开始`,

  // =========================================================================
  // Goals & penalties
  // =========================================================================
  'Goal Scored by': (text, team, pn) => {
    const m = text.match(/Goal Scored by - (.+?) - \((.+?)\)/);
    const scorer = m ? m[1] : pn;
    return `${team}⚽ ${scorer} 进球了！`;
  },
  'Penalty Taken by': (text, team, pn) => `${team}${pn} 主罚点球`,
  'penalty to:': (text, team) => {
    const m = text.match(/penalty to: (.+)/);
    return m ? `${team}${m[1]} 获得点球` : `${team}获得点球`;
  },
  'penalty awarded': () => `裁判指向点球点`,

  // =========================================================================
  // Shots
  // =========================================================================
  'Shot Made by': (text, team, pn) => `${team}${pn} 起脚射门`,
  'Header Shot by': (text, team, pn) => `${team}${pn} 头球攻门`,
  'Volley Shot by': (text, team, pn) => `${team}${pn} 凌空抽射`,
  'Shot On Target': () => '🎯 射门命中目标',
  'Shot Off Target': () => '💨 射门偏离目标',

  // =========================================================================
  // Saves
  // =========================================================================
  'ball saved by': (text, team) => {
    const m = text.match(/ball saved by (.+?) possesion/);
    return m ? `${team}🧤 ${m[1]} 将球扑出` : `${team}🧤 将球扑出`;
  },
  'Ball saved': () => '🧤 扑救成功',

  // =========================================================================
  // Tackles & fouls
  // =========================================================================
  'Successful tackle by': (text, team, pn) => `${team}${pn} 成功抢断`,
  'Tackle attempted by': (text, team, pn) => `${team}${pn} 尝试抢断`,
  'Failed tackle by': (text, team, pn) => `${team}${pn} 抢断失败`,
  'Slide tackle attempted by': (text, team, pn) => `${team}${pn} 滑铲`,
  'Foul against': (text, team, pn) => `${team}对${pn} 犯规`,
  'Handball by': (text, team, pn) => `${team}${pn} 手球犯规`,
  'Yellow card for': (text, team, pn) => `${team}🟨 ${pn} 吃到黄牌`,
  'Red card for': (text, team, pn) => `${team}🟥 ${pn} 被红牌罚下`,

  // =========================================================================
  // Set pieces
  // =========================================================================
  'Corner to': (text, team) => `${team}🚩 获得角球`,
  'Throw in to': (text, team) => `${team}🏐 发界外球`,
  'Goal Kick to': (text, team) => `${team}🥅 球门球`,
  'Free Kick taken by': (text, team, pn) => `${team}${pn} 主罚任意球`,
  'freekick to:': (text, team) => {
    const m = text.match(/freekick to: (.+?) \[/);
    return m ? `${team}${m[1]} 获得任意球` : `${team}获得任意球`;
  },
  'freekick awarded': () => `裁判判罚任意球`,

  // =========================================================================
  // Passing & crossing
  // =========================================================================
  'ball passed by:'  : (text, team, pn) => `${team}${pn} 传球`,
  'through ball attempted by': (text, team, pn) => `${team}${pn} 尝试直塞`,
  'ball crossed by': (text, team, pn) => `${team}${pn} 传中`,
  'ball kicked by': (text, team, pn) => `${team}${pn} 起球`,
  'through ball target': (text, team, pn) => `🎯 直塞找 ${pn}`,
  'Target selected': (text, team, pn) => `🎯 传球目标是 ${pn}`,
  'Pass intercepted by': (text, team, pn) => `${team}${pn} 拦截传球`,
  'creating new ball movement': () => `⚽ 发起进攻`,

  // =========================================================================
  // Headers & volleys (non-shots)
  // =========================================================================
  'Header made by': (text, team, pn) => `${team}${pn} 头球摆渡`,
  'Volley kick made by': (text, team, pn) => `${team}${pn} 凌空出球`,

  // =========================================================================
  // Ball possession & movement
  // =========================================================================
  'has the ball': (text, team, pn) => `${team}${pn} 控球`,
  'Closest Player to ball': (text, team, pn) => pn ? `${team}${pn} 靠近皮球` : '球员靠近皮球',
  'passed to new position': () => `⚽ 球转移`,
  'crossed to new position': () => `⚽ 传中转移`,
  'ball deflected by': (text, team, pn) => `${team}${pn} 挡出皮球`,
  'ball still moving': () => `⚽ 球仍在滚动`,
  'Ball start position': () => '',   // boilerplate — suppress
  'Ball end position': () => '',     // boilerplate — suppress
  'Iteration': () => '',             // boilerplate — suppress

  // =========================================================================
  // Offside
  // =========================================================================
  'is offside': (text, team, pn) => `${team}🏳 ${pn} 越位了`,
  'Caught offside': (text, team, pn) => `${team}🏳 ${pn} 越位`,

  // =========================================================================
  // Injuries
  // =========================================================================
  'Player Injured': (text, team, pn) => {
    const m = text.match(/Player Injured - (.+)/);
    const name = m ? m[1] : pn;
    return `${team}💊 ${name} 受伤倒地`;
  },

  // =========================================================================
  // Substitutions
  // =========================================================================
  'SUB:': (text, team) => {
    const m = text.match(/^SUB: (.+)/);
    return m ? `🔄 ${m[1]}` : `🔄 换人`;
  },
};
