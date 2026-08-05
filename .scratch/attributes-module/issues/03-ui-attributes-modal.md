# 03 — UI 展示（AttributesModal + OVRBadge 集成）

**What to build:** 点击 CareerView 中的 OVRBadge 弹出属性详情面板，让玩家直观查看球员的技术、身体、精神细分属性。

**Blocked by:** 02 — 生命周期接入（Bridge + GameContext 集成）

**Status:** ready-for-agent (blocked — wait for #02)

- [ ] 新建 `src/components/AttributesModal.jsx` — 弹出式模态框（参考 HelpModal.jsx 的 overlay + modal 模式）。点击背景遮罩或关闭按钮关闭。不依赖任何新的外部 UI 库。
- [ ] 三栏网格布局 — 技术（左）、身体（中）、精神（右）。每栏顶部显示大类名称和加权值（如 "技术 · 12"），下方列出子属性名 + 值 + 水平柱状条（0-20 占比映射到宽度）。使用 CSS 变量控制柱状条颜色（技术=绿色系、身体=橙色系、精神=蓝色系）。
- [ ] 底部显示「综合 OVR」— 由 `getOVRFromAttributes(getAttributes(), pos)` 计算，与引擎 OVR 并列展示以直观对比。
- [ ] CareerView.jsx 中 OVRBadge 添加 `onClick` prop → 触发 `showAttributesModal` state → 渲染 `<AttributesModal />`。`AttributesModal` 通过 `SIM.getAttributes()` 和 `SIM.getWeights(SIM.state()?.pos)` 读取数据。
- [ ] CareerView 中 OVRBadge 视觉提示可点击（hover 时 cursor:pointer + 微光效）。
- [ ] 构建校验：`npm run build` 通过，确保 Modal 组件正确导入且无运行时错误。
