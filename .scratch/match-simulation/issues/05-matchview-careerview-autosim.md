# 05 — MatchView 外壳 + CareerView 集成 + 自动模拟

**What to build:** 比赛页面的整体框架——上下布局 + Tab 面板。在 CareerView 中当 `pending.type === 'match'` 时渲染 MatchView 而非事件面板。实现"自动模拟"模式：跳过动画直接产出比赛结果。

**Blocked by:** 04 — matchEngine 封装 + GameContext 集成

**Status:** ready-for-agent

### MatchView 框架
- [ ] 上下布局：上区 Canvas 占位（~60% 视窗高度），下区 Tab 切换面板（~40%）
- [ ] Tab 面板：技术统计 / 积分榜 / 播报日志（内容先占位，后续 ticket 填充）
- [ ] 比赛状态栏：比分、时间显示（迭代进度映射为比赛分钟）
- [ ] "暂停"按钮和"自动模拟"按钮
- [ ] 比赛结束后显示结果面板（比分 + 评分 + 继续按钮）

### CareerView 集成
- [ ] 在 reducer 的 `NEXT_STEP` 中检测 `pending.type === 'match'`
- [ ] 当 pending 为 match 时，渲染 MatchView 替代事件选择/结果面板
- [ ] 比赛结束后的 CONTINUE 回到生涯循环（下一赛季/下一事件）
- [ ] 不影响现有 event/transfer/academy 的处理流程

### 自动模拟
- [ ] 点击"自动模拟"后连续调用 `runIteration` 直到比赛结束
- [ ] 自动模拟期间隐藏 Canvas 占位区域，显示简化进度条
- [ ] 完成后直接展示结果面板（比分 + 评分）
- [ ] 自动模拟也记录完整的技术统计供赛后查看
