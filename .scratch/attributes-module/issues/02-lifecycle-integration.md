# 02 — 生命周期接入（Bridge + GameContext 集成）

**What to build:** 将 Ticket 1 的属性模块集成到游戏的创建和运行流程中。新游戏开始时自动生成初始属性，每个赛季后自动更新。不涉及任何 UI 变更。

**Blocked by:** 01 — 属性核心模块

**Status:** ready-for-agent (blocked — wait for #01)

- [ ] `simEngine.js` 新增长生命周期方法：`initAttributes(identity, seed)` 委托给 attributes 模块的同名函数。`tickAttributes(currentOvr, age, pos)` 委托给 attributes 模块,使用内部存储的 attrs。`getAttributes()` / `getCategory()` / `getWeights()` / `getOVRFromAttributes()` / `getPotential()` / `getDevCurve()` 全部作为桥接方法注册到 SIM 对象上。
- [ ] GameContext `START_CAREER` reducer：在 `SIM.newState()` 之后调用 `SIM.initAttributes(state.identity, seed)`，生成和种子绑定的初始属性。
- [ ] GameContext `NEXT_STEP` reducer：在 `SIM.nextStep()` 之后、返回新 state 之前，调用 `SIM.tickAttributes(simState.ovr, simState.age, simState.pos)`。
- [ ] （新增）`CONTINUE` 和 `SPIN_COMPLETE` 的 tick 时机检查 — 如果 NEXT_STEP 不是唯一的 ovr 变更通道（事件后引擎也可能更新 ovr），在 `CONTINUE` 中也加一行 `SIM.tickAttributes(...)`。如果确认只有 doPeriod 改 ovr 则跳过此条。
- [ ] 验证：开发者可以在浏览器控制台输入 `SIM.getAttributes()` → 返回包含三大类和 15 项子属性的对象，且 `SIM.getOVRFromAttributes(SIM.getAttributes(), pos)` 的值接近 `SIM.state().ovr`。
