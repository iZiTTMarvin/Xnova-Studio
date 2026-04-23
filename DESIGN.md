# Design System — Xnova Studio

## Product Context
- **这是什么**：`Xnova Studio` 是 `Xnova Code` 的 Electron 桌面宿主，目标是把 `cli/` 共享 runtime 与 `studio/` 桌面主壳收敛成同一套 `project-aware` 智能开发工作流。
- **面向谁**：一类是你自己这样的高频重度使用者；另一类是不熟悉 `Claude Code`、`Codex` 等工具、但需要从 `0 → 1` 开发项目或接手现有项目继续开发的用户。
- **所处领域**：AI Coding Agent / 桌面开发工具 / project-aware 工作台。
- **项目类型**：Electron 桌面应用，主界面以聊天驱动，但底层数据模型以项目、会话、Agent、Mode、Model 为中心。

## Product Experience Principles
- **聊天优先，项目落地**：界面第一眼像聊天工作台，但任何关键状态都必须落到“当前在哪个项目里工作”这个事实源上。
- **冷静而可信**：整体气质不是炫技，不做花哨 dashboard，不制造“AI 很厉害”的表演感，而是让用户感到“这东西稳、清楚、真能干活”。
- **信息有层级，不堆卡片**：默认首页保持空白聊天的克制感；状态、工具、设置页才承担更高密度的信息呈现。
- **同一事实只出现一个主入口**：Mode 只有顶部一个主切换入口；项目、会话、Scratchpad、Agent 的语义边界不能混。
- **视觉服务于持续工作**：长时间使用下必须耐看、低疲劳、可恢复，不追求首页一次性“哇”的营销感。

## Aesthetic Direction
- **方向**：`Industrial / Utilitarian` 与 `Quiet Premium` 的混合体。
- **装饰级别**：`intentional`，保留渐变、玻璃感、阴影与大圆角，但整体必须服务于“安静工作台”而不是“展示型设计稿”。
- **情绪关键词**：冷静、可信、专注、长期工作、略带未来感，但不过度科幻。
- **参考基线**：本版不做外部竞品拼贴，直接以内核文档、`project-shell-v1` spec、现有 `studio/src/renderer` 骨架和“接近 Codex App Windows”的既定方向为准。

## Safe Choices
- **深色主壳 + 浅色文本**：桌面编码工具的高频使用场景决定深色壳体依然是最稳妥的默认选择，有利于聚焦消息流、上下文条与项目树。
- **左侧 rail + 中央工作区**：保持成熟 IDE / agent 工具的空间认知，用户不用重新学习“项目在哪里、会话在哪里、工具在哪里”。
- **技术元信息用等宽字体**：分支、模型、Context 使用率、SubAgent 数量等字段使用更强的数据感表达，让“项目感”不只是文案。

## Deliberate Risks
- **首页刻意留白，不做总览大盘**：这是最重要的一次反常识选择。`Xnova Studio` 不是运营后台，首屏必须把用户直接送入工作，而不是先看指标与大卡片。
- **品牌色弱化为“精确提示色”**：不追求一眼强品牌，而是让主色只出现在当前激活、可操作、可信反馈的时刻。好处是耐用；代价是前期视觉冲击力更弱。
- **工具页保持状态页，而不是管理后台**：`MCP / Skills / Memory / Providers` 先做“看得见、能判断、能进入管理”，不做臃肿平台面板。这样更贴近 v1 主链路，但要求版面语言足够克制。

## Typography
- **Display / Hero**：`Segoe UI Variable` 600
  - 用于空白聊天页标题、恢复会话标题、一级工作区标题。
  - 原因：更接近 Windows 原生桌面工具气质，减少“设计样张感”。
- **Body**：`Segoe UI Variable` 400 / 500
  - 用于正文、说明文案、表单、导航标签。
  - 原因：更自然、更耐看，也更接近 `Codex App` 的工作台氛围。
- **UI / Labels**：`Segoe UI Variable` 500
  - 用于按钮、标签、辅助说明、字段名。
  - 原因：整个界面统一为系统感主字体，降低工具噪音。
- **Data / Tables**：`IBM Plex Mono` 400 / 500
  - 用于分支名、模型 id、Context 数值、时间戳、路径片段、运行态计数。
  - 原因：技术属性更强，便于形成“可核验”的工作感。
- **Code**：`IBM Plex Mono`
- **加载策略**：
  - 桌面端优先使用系统字体栈，不依赖在线字体下载：
    - `"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
  - 等宽字体可继续使用本地 monospace 栈或后续再做静态打包。
- **字号层级**：
  - `display-xl`：52px / 1.08 / 600
  - `display-lg`：40px / 1.12 / 600
  - `heading-lg`：32px / 1.18 / 600
  - `heading-md`：24px / 1.25 / 600
  - `heading-sm`：20px / 1.3 / 600
  - `body-lg`：16px / 1.7 / 400
  - `body-md`：14px / 1.65 / 400
  - `body-sm`：13px / 1.55 / 400
  - `label-xs`：12px / 1.4 / 500
  - `meta-xs`：11px / 1.35 / 500

## Color
- **方法**：`restrained`
- **主色 Primary**：`#59B8FF`
  - 代表：当前聚焦、当前选择、主行动作、可点击的关键反馈。
  - 使用：导航激活、Mode 当前态、可操作链接、输入聚焦、信息型状态。
- **副色 Secondary**：`#82D8C6`
  - 代表：系统稳定、已接通、轻成功态、Memory/MCP 等“状态正常”的温和反馈。
  - 使用：健康状态、小型徽标、辅助强调，不可与主 CTA 争抢。
- **中性色 Neutral**：
  - `#05070B`：Canvas 最深背景
  - `#0C1016`：Sidebar / 次级深背景
  - `#111722`：主 Surface
  - `#17202C`：二级 Surface
  - `#223044`：边框强化 / hover 底色
  - `#6F8199`：弱文字 / 占位信息
  - `#AAB7C8`：辅助文字
  - `#D9E2EC`：主文字
  - `#F7FAFC`：最高对比文本
- **语义色**：
  - `success`: `#4FC58B`
  - `warning`: `#F5AF57`
  - `error`: `#F06C6C`
  - `info`: `#59B8FF`
- **Dark Mode 策略**：
  - 深色模式为默认主模式。
  - 所有高饱和色只用于交互和状态，不允许大面积平铺。
  - 阴影偏冷，发光半径短，避免“赛博霓虹”。
- **Light Mode 策略**：
  - 使用偏冷灰白而不是纯白画布。
  - 深色文字与浅蓝交互色搭配，边框对比提升 8% 到 12%。
  - Light Mode 是辅助，不应反向定义设计语言。

## Spacing
- **基础单位**：4px
- **密度**：`compact-comfortable`
- **Spacing Scale**：
  - `2xs`: 4
  - `xs`: 8
  - `sm`: 12
  - `md`: 16
  - `lg`: 24
  - `xl`: 32
  - `2xl`: 48
  - `3xl`: 64
- **核心规则**：
  - 顶级壳层间距以 `24 / 32` 为主，不要到处都用 `16`。
  - 同类元素内部节奏优先 `8 / 12`，避免“每层都一样大”的 AI 排版感。
  - 空白聊天页的上半屏保留明显呼吸感，不能被卡片占满。

## Layout
- **方法**：`grid-disciplined`
- **壳层结构**：
  - 左侧 Sidebar：`280px`
  - 主工作区：`minmax(0, 1fr)`
  - 主内容最大宽度：`1180px`
- **内容网格**：
  - `>= 1440px`：12 列
  - `1200px - 1439px`：8 列
  - `1024px - 1199px`：6 列
  - `< 1024px`：退化为单列，优先保证可操作，不追求完整观感
- **圆角层级**：
  - `interactive-sm`: 10px
  - `chip / pill`: 999px
  - `field / item`: 14px
  - `card / panel`: 18px
  - `shell / hero`: 24px
- **边框策略**：
  - 永远优先“浅边框 + 轻底差”而不是重阴影。
  - 一级激活用描边与底色双信号，不能只靠颜色变化。

## Motion
- **方法**：`intentional`
- **缓动**：
  - `enter`: `cubic-bezier(0.22, 1, 0.36, 1)`
  - `exit`: `cubic-bezier(0.4, 0, 1, 1)`
  - `move`: `cubic-bezier(0.2, 0.8, 0.2, 1)`
- **时长**：
  - `micro`: 80-120ms
  - `short`: 140-180ms
  - `medium`: 220-280ms
  - `long`: 320-420ms
- **允许的动效**：
  - Sidebar hover / active 过渡
  - Mode 切换按钮状态过渡
  - 新会话恢复与状态卡进入时的短位移淡入
  - SubAgent 状态变更时一次性微高亮
- **禁止的动效**：
  - 持续脉冲
  - 长时间辉光呼吸
  - 首页全局背景漂浮动画
  - 纯为了“显高级”的滚动视差

## Surface Hierarchy
- **Layer 0 · Canvas**：整体背景，允许极弱径向提亮，但不可抢戏。
- **Layer 1 · Sidebar / Persistent Rail**：比主内容更暗半级，稳定承载导航与树结构。
- **Layer 2 · Panels / Cards**：主区的功能容器，强调信息组块与层次。
- **Layer 3 · Interactive Cells**：树节点、上下文字段、设置表单项，强调点击与选择。
- **Layer 4 · Runtime Emphasis**：错误、进行中、风险提示、当前激活项，只在必要时提高对比。

## Shell-Level Interface Rules
- **默认首页**：始终是空白聊天页或恢复后的最近工作会话，`Overview` 不回到默认首页。
- **首页氛围**：欢迎语 + 轻量建议动作 + 输入区占位是主叙事，不加 KPI、图表、巨型功能矩阵。
- **一级导航顺序固定**：
  1. 快速聊天
  2. 搜索
  3. Agents
  4. 项目
  5. 聊天
  6. 工具
  7. 设置
- **项目块 / 聊天块**：
  - 两个 block 独立折叠、独立滚动。
  - `项目` 强调最近项目、会话树、子代理树。
  - `聊天` 只保留 scratchpad 语义，不复制项目工作流。
- **Mode Switch**：
  - 顶部唯一主切换入口。
  - 视觉上像一组精致的 segmented control，不像大型 tab 页签。
- **Context Bar**：
  - 必须放在输入框附近。
  - 视觉上更像“运行态 HUD strip”，而不是六张并排卡片。
  - 字段顺序固定：项目 / 分支 / Agent / 模型 / Context 使用率 / 运行中的 SubAgent。
- **SubAgent UX**：
  - 首先在聊天流出现，其次才映射到左侧树。
  - `running / stopped / partial result / done` 必须在主流与侧栏同步。
- **Tools / Settings 页**：
  - Tools：状态优先，突出“现在是好是坏、哪里需要处理”。
  - Settings：编辑优先，突出“当前默认值是什么、保存是否成功、失败为什么”。

## Component-Specific Guidance
- **Sidebar Nav**
  - 使用低对比背景 + 明确激活描边/底色。
  - 默认只突出当前项，不让 7 个入口同时争抢注意力。
- **Project Tree Item**
  - 结构为：主标题 + 一行技术元信息。
  - 选中态必须同时有边框、底色、文字增强三层反馈。
- **Suggestion Card**
  - 首页建议动作是快速入口，不是营销 feature card。
  - v1 优先做成轻量列表项或紧凑行项，不做三张大卡片占满页面。
- **Context Field**
  - 标签用 12px，值用 13-14px。
  - 数据字段允许使用 `IBM Plex Mono`，但不要整条栏都变成等宽字。
- **Composer**
  - 保持宽而稳，不做巨大圆角泡泡。
  - Focus 态应通过描边、外圈淡光、placeholder 降低共同完成。
- **Status Banner**
  - 错误红、警告橙、信息蓝都必须偏克制，不做高饱和整块纯色。

## States & Empty/Error Guidance
- **Loading**：优先使用骨架/弱 shimmer，不用大面积 spinner。
- **Empty**：给出一句说明 + 一个明确可执行动作。
- **Error**：必须告诉用户错在哪、能做什么，不允许只写“加载失败”。
- **Disabled / Unsupported**：必须解释原因，例如“宿主桥接不可用”“当前项目未开启该能力”。
- **路径失效 / 会话损坏**：降级回空白聊天页或项目根视图时，要有可感知的提示而不是静默回退。

## Responsive Strategy
- **>= 1280px**：完整体验，Sidebar + 主区并存，上下文条完整铺开。
- **1024px - 1279px**：主区保持完整，Context Bar 可变为两行，Sidebar 内容压缩但不隐藏一级导航。
- **< 1024px**：
  - v1 目标是“尽量不崩溃”，不是完整移动端适配。
  - 允许 Sidebar 以抽屉形式出现。
  - 上下文条改为折行或二层结构，但字段顺序不变。

## Anti-Patterns
- 不要把主界面重新做成 dashboard first。
- 不要使用紫色 / 洋红渐变作为默认品牌视觉。
- 不要所有卡片都一样大、一样圆、一样亮。
- 不要把图标放进彩色圆形底里排成功能矩阵。
- 不要做第二个 Mode 切换入口。
- 不要让全局聊天块长成第二套项目工作台。
- 不要用营销文案语言覆盖真实技术状态。

## Implementation Notes
- 当前 `studio/src/renderer/styles.css` 已完成 v1.1 视觉收敛：
  - 统一了完整的设计 token 体系（颜色、阴影、圆角、字号、间距）
  - Context Bar 已改为紧凑 HUD strip，不再是六张并排卡片
  - Mode Switch 已改为精致 pill segmented control
  - Sidebar 品牌区更安静，导航项更原生
  - 首页建议动作已改为轻量列表行项，不再是 feature card grid
  - Tools / Settings 页已收紧为工作面板，减少 dashboard 感
  - 保留渐变、玻璃感、阴影、大圆角，但整体更像 Codex App 工作台气质
- 视觉实现顺序已完成：
  1. ✅ 统一 token
  2. ✅ 重做 Sidebar / Mode Switch / Context Bar
  3. ✅ 重做 Blank Chat / Restore Session 主区
  4. ✅ 收拢 Tools / Settings 状态页样式

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-23 | 初版设计系统建立 | 基于现有核心设计文档、前端 spec 与 `studio/src/renderer` 骨架，为 `Xnova Studio` 收敛成可执行的桌面界面基线 |
| 2026-04-23 | 默认方向锁定为“工业工具感 + 安静高级感” | 既要贴近 `Codex App` 的工作氛围，又要保留 `Xnova` 自己更强的 `project-aware` 语义 |
| 2026-04-23 | 首页坚持空白聊天优先，不回退 Overview | 让主产品叙事始终回到“直接开工”，而不是先看大盘 |
