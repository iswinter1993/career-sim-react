# FM 模拟比赛机制拆解分析

## 一、核心思维模型：基于坐标的 Max/Min 数学游戏

FM 将足球弱化为一个基于坐标的数学优化问题：

- 球场上每个球员视为一个对象，其当前位置记为 `C(L)`（Current Location）
- 每个球员在任意时刻存在一个理论上的**最佳位置**，记为 `M(L)`（Max/Min Location）
- 球员的思考本质：**"我应该在何时，出现在何地？"** → 求解 `M(L) - C(L)` 的差值，并向最佳位置移动
- 这是一个寻求最佳 LocationValue 的**有限次方程**

**总结**：FM 就是一个通过计算最佳空间位置，然后以最优状态数值参与在最佳位置上每一次 roll 对抗，目标为获取最大 roll 得分的游戏。

---

## 二、球员行为模式（Action 系统）

### 2.1 可用动作

球员可执行的动作包括：**Move、Tackle、Dribble、Shoot、Pass** 等（统称 Action）。

### 2.2 决策流程

```
M(L) - C(L) 差值 → 执行 Move Action
      +
其他参数（Ball Location、Situation、Marking Space、Opposition Player、Attribute 等）
      ↓
执行对应 Action
```

### 2.3 优先级机制

Action 执行的优先级由以下因素决定：

| 优先级因子 | 说明 |
|-----------|------|
| Position Method | 位置职责定义的基础行为模式 |
| Player Instruction | 球员个人指令 |
| Habit | 球员习惯动作 |

### 2.4 Action 得分方程（`<AC>`）

- 每种 Action（Shoot、Pass、Tackle 等）具有不同的分值
- 求解 **Max`<AC>`** 即可确定当前最优行动方式

---

## 三、比赛事件判定模式

### 3.1 事件得分公式

```
Event Score = PlayerGrade + PositionAbility + M(L) + <AC>
```

- 简记运算为 **score**
- 比赛总体结果依赖于**所有 Area 内的 Score 总和**
- 每次 Cross、Shoot、Tackle 等事件，双方 Player 执行 `<AC>` 后进行一次运算，得分高的一方获得 **Match Point**
- Match Point 累计到一定程度后决出胜负

### 3.2 事件分类

| 类型 | 判定方式 |
|------|---------|
| **非对抗事件** | 按上述公式算分累计 |
| **对抗事件** | 进行随机 Roll |

### 3.3 Roll 概率模型

推测存在两种成功率分配模式：

- **2:6:2** 模式
- **1:3:6** 模式（假定为主流模式）

以任意球攻门为例：

- 根据 Kicker 与 GK 的能力比值，获取 10%、30%、60% 三种得分率
- Kicker 能力值无限小于 GK 时，得分率**不为零**——所有对抗行为都被赋予保底 roll 概率（约 1% 或 0.5%）
- **Roll 的概率总和 > 1**（即存在保底机制）

---

## 四、坐标系统与空间计算

### 4.1 坐标系

采用三维坐标系 `(Width, Length, Height)`：

- X 轴：球场宽度
- Y 轴：球场长度
- Z 轴：高度（用于球的轨迹模拟）

### 4.2 位置计算简化

- 球员不会飞 → 仅使用二维坐标即可仿真 Player Position
- 球场划分为若干 **Block**，每个 Block 包含 **9 或 16 个 Points**
- 计算单元从 Point 降级为 Block，足以完成行为模拟和 3D 展示

---

## 五、Position 定域与 Formation

### 5.1 为什么需要 Position 定域

| 问题 | 说明 |
|------|------|
| 计算能力限制 | 无法实现理想的无固定位置模式 |
| 算法缺陷 | 若所有球员基于宽泛的 M(L) 思考，会产生"乱跑流"和扎堆现象 |
| 简化计算负荷 | 需要固化球员的初始位置和优先活动范围 |

### 5.2 实现方式

- **Birth Point**：球员初始重置坐标（如 GK、ST、MC、WB 各有固定出生点）
- 球员在不需要计算 M(L) 时，立即向 Birth Point 移动
- 优先活动范围为 Move Action 的**优先取值坐标区间**
- 不同 Position 设定不同的 M(L) 公式和初始行为参数 → 实现 Position 差异化
- Position 定域确立后，诞生了 **Formation（阵型）**

---

## 六、球队 AI 模拟思考-行动循环

```
1. 为了获胜需要做什么？
   → Situation → Team Instruction

2. 每个个体的实时情况是什么？
   → LocationValue / Attribute / Morale / Stamina

3. 应该具体做什么？
   → Player Instruction → Action

4. 我们最大能力能做什么？
   → Attribute

5. 具体做收益最大的事
   → Action（取 Max<AC>）

6. 做到了 or 没做到？
   → Roll 对抗 → Result 得分
   → 进入下一组判断循环
```

**核心结论**：经过无限次思考-行动循环，保持分值较高的一方将大概率取胜。

---

## 七、AI 行为的分层架构

### 三层结构

| 层级 | 名称 | 作用 |
|------|------|------|
| **Layer 1** | Team Style 层 | 确定个体指令 Action 参数范围。基于 Formation、Fluid、Team Instruction 确定 M(L) 和 `<AC>` 的基础参数 |
| **Layer 2** | Role 层 | 基于 Position 和 Player Instruction 定义个体行为模式。例如 Support 模式和 Attack 模式的 Winger 行动模式完全不同，且**不受 Individual Instruction 支配** |
| **Layer 3** | Individual 层 | 低于上述两层，但可以**部分影响** Role 层的行为 |

### 优先级：**Style > Role > Individual**

---

## 八、影响 Style 和 Role 层的公共参数

| 参数 | 作用 |
|------|------|
| **Formation Fluid（阵型流动性）** | 决定行为指令对 Position 定域的遵从度。Fluid 越高，M(L) 取值区间越广（极端时 GK 可移动到中圈）。Fluid 越低，定域越严格（如 DC 永远蹲坑后场） |
| **Tempo（节奏）** | 决定 `<AC>` 的风险遵从度。高 Tempo 下 `<AC>` 可简化忽略部分防守方计算因素（如 Marking Space 和 Tackle 属性），使 Action 更多取值为突破、远射、传身后球等 |
| **Free Role（自由角色）** | M(L) 取值不再遵从 Position 定域限制——即"流动化的理想足球" |
| **Backline Depth（防线深度）** | 设置 Formation 的起点 Y 轴平均坐标 |
| **Width（宽度）** | 设置 Formation 的 X 轴间距（如 Width 最小时，两侧后卫防守选位强制保持较小间距） |
| **Formation Familiar（阵型熟练度）** | 熟练度越高，M(L) 取值区间越大 |

---

## 九、非玩家入场比赛的模拟（Stimulate）机制

### 9.1 模拟公式

```
[PlayerValue × Formation × CoachStyle] × Roll
```

### 9.2 模拟步骤

1. **计算可上场球员 Value**（如英伦规则下 11 首发 + 7 替补）
2. **套入 Formation** 取得攻防两端的 `sum(Value)`（Attack / Defense）
   - 例：541 阵型 → Attack=20, Defense=60
3. **乘以 CoachStyle 加成** 得到最终攻防数值
   - 例：541 + 防反教练 → Attack×90%, Defense×150% → Att=18, Def=90
4. **与对手 AD 值进行 Roll** → 得出比分及总射门、传球、抢断、犯规、黄牌等数值
5. **保底概率** 依然存在（因此可以 SL 度假实现南北联赛球队足总杯逆袭英超球队）

### 9.3 View 模拟 vs Stimulate 模拟

| 类型 | 说明 |
|------|------|
| **View（假模拟）** | 不对参赛球员分配比赛行为数值，球员触球、传球等数据为**零** |
| **Stimulate（真模拟）** | 比赛随机 Roll 到一个总的行为数值，根据每位球员的能力值、习惯和位置进行分配（如 Roll 到射门数 20，则 C 罗 9 次、本泽马 5 次、拉莫斯 2 次……） |

### 9.4 关键注释

- **CoachAbility 在模拟赛中不起作用**（所谓"拴狗冠"）——只要 CoachStyle 和 Favor Formation 能给予球员战力充分加成即可，至少别是负面加成
- **强力替补影响模拟结果**：即使未上场，因战力太高，赛后分派比赛时间和数据时会"被上场"

---

## 十、核心公式速查

| 缩写 | 全称 | 含义 |
|------|------|------|
| `C(L)` | Current Location | 球员当前位置 |
| `M(L)` | Max/Min Location | 理论最佳位置 |
| `<AC>` | Action Score Equation | 行动得分方程 |
| `Score` | Event Score | PlayerGrade + PositionAbility + M(L) + `<AC>` |
| `Match Point` | — | 单次事件对抗获胜方获得的分值 |

---

> **文档总结**：FM 的模拟核心是一个多层级的数学优化系统——底层是坐标空间计算，中层是 Action 得分方程，上层是 Team/Role/Individual 三层 AI 决策。比赛的随机性通过 Roll 机制引入，且所有对抗行为存在保底概率，保证了极小概率冷门的发生可能。
