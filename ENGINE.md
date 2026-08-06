# ENGINE.md — public 引擎脚本分析

本文件分析 `public/` 下的混淆引擎脚本，记录其运行时结构、数据契约和关键机制，供 React 桥接层（`src/simEngine.js`）和各组件参考。

> **来源**：通过对引擎脚本的 node/vm 运行时探测（加载真实引擎、驱动完整生涯、提取 `buildProfile` 输出）反推得出。引擎为 obfuscator.io 混淆（base64 字符串表 + 偏移解码 `_sim_0b(0xNNN)`），无源码注释，本文档是"运行时真相"。

## 文件职责

| 文件 | 职责 |
|------|------|
| `data.js` | 静态数据：位置、联赛、球队、奖杯、国家队、个人奖项、角色、伤病、成长、身价表、结局 |
| `events.js` | 事件定义（决策/随机事件），供 `pickEvent`/`resolveEvent` 使用 |
| `sim.js` | 引擎核心：状态机、赛季模拟、转会、国家队、事件结算、`buildProfile` |
| `crests.js` | 队徽程序化绘制（canvas/SVG） |
| `qr.js` | 分享二维码生成 |

加载顺序（`index.html`）：`data.js` → `events.js` → `sim.js` → `crests.js` → `qr.js`。`sim.js` 初始化时读取 `window.DATA`/`window.EVENTS`。

## window.DATA 结构

通过 vm 加载后 `Object.keys(window.DATA)`：

```
POSITIONS, LEAGUES, TEAMS, TROPHIES, NATIONAL, AWARDS, ROLES, ROLE_ORDER,
INJURIES, GROWTH, VALUE_TABLE, ENDINGS
```

### 位置 POSITIONS
```js
[{"id":"GK","name":"门将","group":"gk"}, ... 12 个]
// group: gk | def | mid | att
// 完整：GK CB LB RB CDM CM CAM LM RM LW RW ST
```

### 联赛 LEAGUES
```js
[{"id":"csl","name":"中超","country":"CN","rep":2,"cn":true,"cup":"足协杯","cont":"亚冠"}, ...]
```

### 球队 TEAMS
```js
[{"id":"cn-jing","name":"京城蓝盾","league":"csl","rep":3,"color":"#1F4E9C"}, ...]
// rep 为声望 0-5，color 为队色
```

### 奖杯 TROPHIES
```js
{
  league: {name:"联赛冠军", p:[0,0.02,0.05,0.16,0.3,0.45]},
  cup:    {name:"国内杯赛", p:[0.02,0.04,0.08,0.15,0.22,0.28]},
  cont:   {name:"洲际冠军", p:[0,0,0,0.004,0.07,0.18]},
  world:  {name:"世俱杯",   p:[0,0,0,0.004,0.012,0.03]}
}
// p 数组索引 = 球队声望 rep（0-5），值 = 该赛季夺冠概率
```

### 国家队 NATIONAL
```js
{ asia: {name:"亚洲杯冠军"}, wc: {name:"世界杯冠军"}, wcq: {name:"打进世界杯"} }
```

### 个人奖项 AWARDS
```js
{
  ballon:  "金球奖",
  boot:    "欧洲金靴",
  glove:   "金手套",
  cslmvp:  "中超最佳球员",
  cslboot: "中超金靴",
  afcpoy:  "亚洲足球先生"
}
```
> ⚠️ **键是英文，值是中文名**。运行时 `state.awards` 和 `profile.award()` 都使用**中文名**，不用键。

### 角色 ROLES
```js
{ star:{name:"球星",apps:[44,56],mult:1.25,rank:4}, starter:{name:"主力",...}, rot, sub, bench }
```

## window.SIM 方法（62 个）

| 类别 | 方法 |
|------|------|
| 生命周期 | `newState(mode, identity, seed, legacy?)`, `nextStep()`, `doPeriod()`, `choose()`, `cont()`, `goSummary(reason)`, `state()`, `attach(state)` |
| 事件 | `pickEvent()`, `resolveEvent(index)`, `commitEvent(res)`, `applyResult()`, `interpolate(text)` |
| 转会 | `makeAcademy()`, `makeTransfer(fired)`, `doTransfer()`, `pickOffers()`, `offerOption()`, `computeRole()` |
| 国家队 | `runTournament()`, `natBest()`, `natResult()`, `nationalOdds()` |
| 查询 | `teamById(id)`, `leagueById(id)`, `posById(id)`, `curTeam()`, `curLeague()`, `originById(id)`, `isNear()`, `isHome()`, `inChina()` |
| 数值 | `rnd()`, `rint()`, `rpick()`, `shuffle()`, `rweight()`, `hashStr()`, `clamp()`, `fmtMoney()`, `fmtValue()`, `valueOf(ovr,age)`, `growthRange()`, `starPower()`, `posRates()` |
| 汇总 | `buildProfile()`, `legacyFrom()`, `normLegacy()`, `addAward()`, `snap()`, `stageOf()`, `pickRival()` |
| 常量 | `MODES`, `ORIGINS`, `NEAR_TEAMS`, `HOME_TEAMS`, `NAT_RANK`, `NAT_SHORT`, `LEGACY_CAP`, `SAVE_VER` |

### MODES
```js
{ long:{seasons:1,eventChance:0.85}, normal:{seasons:2,eventChance:0.95}, express:{seasons:3,eventChance:1} }
// seasons = 每多少赛季出一次事件；eventChance = 事件触发概率
```

### ORIGINS（球员出身，9 个）
```js
[{id:"ln", name:"辽宁", desc:"...", ovr:3, money:8, guanxi:5, c1:"#C8102E"}, ...]
// id: ln sd sh bj gd hn xj js sc；c1 = 主色
```

### NEAR_TEAMS / HOME_TEAMS
```js
NEAR_TEAMS = { ln:[...teamIds], sd:[...], ... }  // 每出身临近球队
HOME_TEAMS = { ln:["cn-dl"], sd:["cn-lu"], ... } // 每出身家乡球队
```

## newState 的 identity 契约

`newState(mode, identity, seed)` 中 identity 必须包含：

```js
{
  name: string,      // 球员名
  number: number,    // 球衣号
  foot: string,      // '右' | '左'
  pos: string,       // 位置 id，如 'ST'
  originId: string,  // 出身 id，如 'ln'
  origin: object     // ⚠️ 必须是 ORIGINS 中的完整对象（含 id/name/ovr/money/guanxi）
}
```

> ⚠️ `origin` 必须是完整对象，否则引擎读 `origin.id` 会报错，且 `ovr/money/guanxi` 会是 NaN。React 侧 `IdentityView.jsx` 正确组装了这一形状（`SET_IDENTITY` 同时写 `originId` 和 `origin`）。

初始 state 字段：`ver, seed, rngState, mode, phase, step, name, number, foot, pos, cheat, gen, legacy, age:16, ovr, maxOvr, talent, guanxi, clean:80, fame:5, money, seasonWage, peakAnnualWage, careerEarnings, teamId, role, roleAdjust, seasonsAtClub, seasonsAbroad, clubsPlayed, contractLeft, lowSpell, banLeft, banGames, banned, lockAbroad, pendingMult, stagnate, caps, totals{apps,goals,assists,cs,ga}, seasons[], trophies[], awards[], natRuns[], flags{}, pending, usedEvents{}, choices[], rid`

## state.pending 事件类型

| type | 含义 | 处理方式 |
|------|------|---------|
| `academy` | 青训签约 | `choose(0..n)` 选球队 |
| `transfer` | 转会报价 | `choose(0..n)` / `choose('stay')` / `choose('retire')` / `choose('end')` |
| `event` | 决策事件 | `resolveEvent(i)` → 概率 → `commitEvent(res)` |
| `random` | 随机事件 | 同 `event` |
| `recap` / `report` | 赛季回顾 | `cont()` |
| `end` | 生涯结束 | `choose('end')` |

`academy`/`transfer` 的 `offers` 是球队 id 数组（如 `["cn-dl","cn-rong","cn-hei"]`）。

## 奖项机制（关键）

### state.awards —— 运行时累积
```js
[{name:"中超金靴", age:24}, {name:"中超最佳球员", age:25}, ...]
// name = 中文奖项名，age = 获奖年龄
```

### buildProfile().awards —— 汇总
```js
awards: number        // 总奖项数量
award: function(name) // 传入中文奖项名 → 返回获得次数
```

### ⚠️ 关键契约
- `profile.award('中超金靴')` → 4（正确）
- `profile.award('cslboot')` → 0（✗ 传键名查不到，award 期望中文名）
- `SIM.AWARDS` 的**键**是英文（ballon/boot/...），**值**是中文名

**React 结算页修复要点**：遍历奖项时要用 `SIM.AWARDS` 的**值**（中文名）传给 `profile.award()`，或用 `state.awards` 数组（含年龄）直接渲染。

### 获奖触发
`addAward(name)` 被引擎内部调用（如赛季末评选）。可获得的奖项名（中文）：
- 中超金靴（cslboot）
- 中超最佳球员（cslmvp）
- 金球奖（ballon）
- 欧洲金靴（boot）
- 金手套（glove）
- 亚洲足球先生（afcpoy）

## buildProfile 完整输出

```
gen, age, ovr, maxOvr, seasons, clubs, caps, banned, top5Seasons, lowSeasons,
bigTrophies, uclTrophies, trophies, money, peakAnnualWage, careerEarnings,
peakSalaryRank, apps, goals, assists, cs, posGroup, clean, fame,
awards(number), award(fn), wcRank, asiaRank, abroad, reason, appsPerSeason,
ga, homeName, homeSeasons, homeApps, homeTrophies, flags
```

- `wcRank`/`asiaRank`：0=预选赛出局 … 6=冠军（对应 `RANK_LABELS`）
- `RANK_LABELS = ['预选赛出局','小组赛出局','止步十六强','止步八强','止步四强','亚军','冠军']`

## 引擎在 node 中复现的方法

1. 用 vm 加载 5 个文件，sandbox 需 mock：`document.createElement`（含 canvas）、`localStorage`、`location` 等
2. `newState('normal', { ..., origin: ORIGINS.find(o=>o.id==='ln') }, seed)`
3. 循环处理 `state().pending`（academy/transfer/event/recap）直到 `phase==='summary'`
4. `goSummary(reason)` 后 `buildProfile()` 得到完整档案
