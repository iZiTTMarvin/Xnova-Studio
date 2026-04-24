# Xnova Studio 前端设计审查报告

**审查日期**: 2026-04-24
**审查范围**: `apps/studio/src/renderer/` 全部组件、样式、页面
**审查方法**: 源码静态分析（Electron 应用无法通过浏览器工具实时审查）
**对照基准**: `DESIGN.md` 设计系统 v1.1

---

## 一、总体评价

整体设计系统完成度较高，token 体系完整，视觉语言统一。主要问题集中在：
1. **CSS 变量命名存在两套体系**，`styles.css` 和 `ProjectShellSidebar.css` 使用不同的 token 名
2. **部分组件缺少关键交互状态**（focus-visible、disabled 反馈）
3. **响应式断点只有一个**（1024px），缺少中间态
4. **设置对话框引用了未定义的 CSS 变量**

---

## 二、HIGH — 必须修复

### FINDING-001: CSS 变量双轨制 — 两套 token 共存

**位置**: `styles.css` vs `ProjectShellSidebar.css`（旧体系）

`styles.css` 定义了完整的 token 体系：
```css
--bg-canvas, --bg-app, --bg-sidebar, --bg-panel, --bg-panel-strong
--border-subtle, --border-strong, --border-hover
--text-primary, --text-secondary, --text-muted, --text-faint
--primary, --primary-soft, --secondary, --secondary-soft
```

但 `ProjectShellSidebar.css`（旧文件）使用了完全不同的命名：
```css
var(--color-canvas), var(--color-surface-primary), var(--color-surface-secondary)
var(--color-border), var(--color-text-primary), var(--color-text-secondary)
var(--color-accent-primary), var(--color-accent-primary-hover)
var(--font-family-body), var(--font-family-mono)
```

这些 `--color-*` 和 `--font-family-*` 变量在 `:root` 中**从未定义**。

**影响**: 如果任何组件实际引用了 `ProjectShellSidebar.css` 中的样式，所有颜色、字体、边框都会 fallback 到浏览器默认值，导致视觉崩溃。

**修复建议**: 删除 `ProjectShellSidebar.css` 中的旧样式，或添加变量别名映射：
```css
:root {
  --color-canvas: var(--bg-canvas);
  --color-border: var(--border-subtle);
  --color-text-primary: var(--text-primary);
  --font-family-body: var(--font-ui);
  --font-family-mono: var(--font-mono);
  /* ... */
}
```

---

### FINDING-002: 设置对话框引用未定义变量

**位置**: `StudioSettingsDialog.css:73, :91`

```css
.studio-settings-nav {
  background: color-mix(in srgb, var(--bg-muted) 35%, transparent);
}
.studio-settings-nav-item-active {
  border-color: color-mix(in srgb, var(--accent-color) 60%, var(--border-subtle));
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
}
```

`--bg-muted` 和 `--accent-color` 在 `:root` 中均未定义。`styles.css` 中没有这两个 token。

**影响**: 设置导航栏背景透明（`color-mix` 中 undefined 变量会被忽略），激活态无视觉反馈。

**修复建议**:
```css
--bg-muted → --bg-soft
--accent-color → --primary
```

---

### FINDING-003: `--text-strong` 未定义

**位置**: `StudioSettingsDialog.css:57`

```css
.studio-settings-dialog-meta strong {
  color: var(--text-strong);
}
```

`:root` 中没有 `--text-strong`，只有 `--text-primary`。

**修复**: 改为 `var(--text-primary)`。

---

### FINDING-004: Sidebar 导航图标全部是空色块

**位置**: `ProjectShellSidebar.tsx:88`, `styles.css:163-168`

```tsx
<span className="sidebar-nav-icon" />
```
```css
.sidebar-nav-icon {
  width: 14px;
  height: 14px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--text-faint) 65%, transparent);
}
```

所有导航项（新对话、搜索、Agents、项目、工具、设置）使用相同的 14×14 灰色方块作为图标。没有实际的 SVG 图标或 icon font。

**影响**: 用户无法通过图标快速区分导航项，只能依赖文字标签。对于一个工作台级应用，这严重降低了导航效率和专业感。

**修复建议**: 为每个导航项添加对应的 SVG 图标，或使用 Lucide/Phosphor 等图标库。至少需要 6 个不同图标。

---

### FINDING-005: 品牌 Logo 也是空色块

**位置**: `ProjectShellSidebar.tsx:68`, `styles.css:106-115`

```tsx
<div className="sidebar-brand-mark" />
```
```css
.sidebar-brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(98,188,255,0.28), rgba(126,217,197,0.16)), var(--bg-soft);
  border: 1px solid var(--border-strong);
}
```

品牌标识只是一个渐变色方块，没有实际的 logo 图形。

**影响**: 品牌识别度为零。DESIGN.md 要求"安静的品牌区"，但安静不等于没有。

---

## 三、MEDIUM — 应该修复

### FINDING-006: 建议行图标同样是空色块

**位置**: `styles.css:685-691`

```css
.suggestion-icon {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary) 55%, transparent);
}
```

空白聊天页的建议动作列表中，每个建议项前面的图标都是同一个蓝色半透明方块。

**影响**: 建议项之间缺乏视觉区分，用户需要逐行阅读文字才能理解每个建议的含义。

---

### FINDING-007: 发送按钮使用 CSS `::before` 伪元素渲染 ">" 字符

**位置**: `styles.css:814-818`

```css
.composer-send::before {
  content: ">";
  color: #02131f;
  font-size: 15px;
  font-weight: 800;
}
```

发送按钮的图标是一个 `>` 字符，而不是箭头 SVG。这在不同字体下渲染效果不一致，且语义不明确。

**修复建议**: 替换为 SVG 箭头图标（如 `arrow-up` 或 `send`），与主流聊天应用保持一致。

---

### FINDING-008: 键盘可访问性不完整

**位置**: 多个组件

已有 `focus-visible` 的组件：
- `.mode-segment:focus-visible` ✅
- `.context-item-button:focus-visible` ✅
- `.subagent-item:focus-visible` ✅

缺少 `focus-visible` 的组件：
- `.sidebar-nav-button` — 主导航按钮，键盘用户无法看到焦点
- `.tree-item` / `.chat-item` — 项目树和聊天列表项
- `.suggestion-row` — 建议动作按钮
- `.entry-item` — 首页入口项
- `.composer-send` — 发送按钮
- `.primary-button` / `.secondary-button` — 通用按钮

**影响**: 键盘导航用户无法看到当前焦点位置，严重影响可访问性。

**修复建议**: 为所有可交互元素添加统一的 focus-visible 样式：
```css
:focus-visible {
  outline: none;
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px rgba(98, 188, 255, 0.18);
}
```

---

### FINDING-009: 模态对话框缺少 Escape 键关闭和焦点陷阱

**位置**: `StudioSettingsDialog.tsx:170-175`, `StudioHomePage.css:293-311`

设置对话框和模式提示对话框：
- ✅ 有 `aria-modal="true"` 和 `role="dialog"`
- ✅ 点击背景可关闭（设置对话框）
- ❌ 没有 Escape 键监听
- ❌ 没有焦点陷阱（focus trap）— 用户可以 Tab 到对话框后面的元素
- ❌ 模式提示对话框（`.mode-notice-backdrop`）没有关闭按钮，也没有 Escape 键支持

**修复建议**: 添加 `useEffect` 监听 Escape 键，使用 `focus-trap-react` 或手动实现焦点陷阱。

---

### FINDING-010: 响应式只有单一断点

**位置**: `styles.css:1488`, `StudioSettingsDialog.css:140`, `StudioHomePage.css:324`

整个应用只有两个断点：
- `@media (max-width: 1024px)` — 主布局
- `@media (max-width: 980px)` — 设置对话框

缺少的断点：
- **1280px**: Sidebar + 主内容区在中等屏幕上可能过于拥挤
- **768px**: 平板竖屏场景
- **480px**: 虽然是 Electron 桌面应用，但窗口可以被用户缩小到任意尺寸

**影响**: 在 1025px-1280px 之间，280px 的 Sidebar 占比过大（约 22-27%），主内容区被压缩。

---

### FINDING-011: Sidebar 在小窗口下变成堆叠布局而非抽屉

**位置**: `styles.css:1489-1498`

```css
@media (max-width: 1024px) {
  .project-shell-layout {
    grid-template-columns: 1fr;
  }
  .studio-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
    max-height: 60vh;
    overflow-y: auto;
  }
}
```

DESIGN.md 提到 Sidebar 应该"以抽屉形式出现"，但实际实现是将 Sidebar 堆叠到顶部，占据最多 60vh 的高度。这意味着在小窗口下，用户需要滚动过整个 Sidebar 才能看到主内容。

**修复建议**: 实现可折叠的抽屉模式，默认隐藏 Sidebar，通过汉堡菜单按钮触发。

---

### FINDING-012: 消息流没有自动滚动到底部

**位置**: `ConversationTimeline.tsx`

`ConversationTimeline` 组件渲染消息列表，但没有任何 `scrollIntoView` 或 `useEffect` 来在新消息到达时自动滚动到底部。

**影响**: 当消息流超出可视区域时，用户需要手动滚动才能看到最新消息。对于聊天应用，这是基本功能缺失。

**修复建议**: 添加 `useRef` + `useEffect`，在 `persistedMessages` 或 `liveConversation` 变化时滚动到底部。

---

## 四、POLISH — 建议改进

### FINDING-013: `color-mix()` 浏览器兼容性

**位置**: `styles.css` 全文（约 30+ 处）

`color-mix(in srgb, ...)` 在 Chromium 111+ 支持。Electron 使用的 Chromium 版本通常足够新，但如果项目需要支持较旧的 Electron 版本，这会是问题。

**建议**: 确认最低 Electron 版本要求，如果 ≥ Electron 25（Chromium 114）则无需担心。

---

### FINDING-014: 排版层级清晰但缺少 `clamp()` 一致性

**位置**: `styles.css` 多处

部分标题使用了 `clamp()` 做响应式字号：
```css
.blank-chat-stage h2 { font-size: clamp(32px, 4vw, 48px); }
.conversation-header h2 { font-size: clamp(24px, 3vw, 32px); }
.feature-page-header h2 { font-size: clamp(24px, 3vw, 32px); }
```

但其他标题使用固定字号：
```css
.sidebar-brand-title { font-size: 15px; }
.sidebar-block-header h2 { font-size: 14px; }
.workspace-header-title { font-size: 14px; }
```

**建议**: 固定字号的标题在 Sidebar 中是合理的（Sidebar 宽度固定），但主内容区的标题应统一使用 `clamp()` 策略。

---

### FINDING-015: 过渡动画时间不统一

**位置**: `styles.css` 全文

存在多种过渡时间：
- `120ms ease` — 按钮、建议行、ghost 按钮
- `140ms ease` — 导航按钮、树项、context item
- `150ms ease-out` — 旧 CSS 中的按钮（`ProjectShellSidebar.css`）
- `160ms ease` — mode switch

**建议**: 统一为 2-3 个层级：
- `--transition-fast: 120ms ease` — 微交互（hover 色变）
- `--transition-normal: 160ms ease` — 状态切换（active、expand）
- `--transition-slow: 240ms ease` — 布局变化（抽屉展开）

---

### FINDING-016: 工具事件 JSON 直接渲染

**位置**: `ConversationTimeline.tsx:31`

```tsx
const argsText = Object.keys(toolEvent.args ?? {}).length > 0
  ? JSON.stringify(toolEvent.args)
  : '无参数'
```

工具调用的参数直接用 `JSON.stringify` 渲染为原始 JSON 字符串。对于包含长路径或大对象的参数，这会产生一行很长的不可读文本。

**建议**: 使用 `JSON.stringify(args, null, 2)` 并配合 `<pre>` 标签，或实现折叠式参数展示。

---

### FINDING-017: 系统消息使用数组 index 作为 key

**位置**: `ConversationTimeline.tsx:145`

```tsx
{props.liveConversation.systemMessages.map((message, index) => (
  <article key={`live-system-${index}`} ...>
```

使用数组 index 作为 React key 在列表项可能被重新排序或插入时会导致渲染错误。

**影响**: 如果系统消息列表在前面插入新消息，React 可能复用错误的 DOM 节点。

**建议**: 使用消息内容的 hash 或添加唯一 ID。

---

### FINDING-018: Sidebar 折叠/展开没有动画

**位置**: `ProjectShellSidebar.tsx:108-112`

```tsx
{!projectCollapsed ? (
  <div className="sidebar-block-body sidebar-block-scroll">
    {renderBlockState(props.projectBlock)}
  </div>
) : null}
```

折叠/展开是瞬间切换（条件渲染），没有高度过渡动画。DESIGN.md 强调"微过渡"，这里缺失。

**建议**: 使用 CSS `max-height` + `overflow: hidden` + `transition` 实现平滑折叠，或使用 `<details>` 元素。

---

### FINDING-019: 深色主题下滚动条未定制

**位置**: 全局

`.sidebar-block-scroll` 设置了 `overflow-y: auto; max-height: 282px`，但没有自定义滚动条样式。在深色背景下，默认的浅色滚动条会非常突兀。

**建议**: 添加 Webkit 滚动条样式：
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}
```

---

### FINDING-020: MCP 表单缺少验证

**位置**: `McpOverviewCard.tsx:200-219`

新增 MCP Server 表单没有任何前端验证：
- 名称可以为空
- URL 可以为空（非 stdio 模式）
- 命令可以为空（stdio 模式）
- 没有重复名称检查

**建议**: 添加基本的 `disabled` 逻辑和内联错误提示。

---

## 五、设计系统一致性对照

| 维度 | DESIGN.md 要求 | 实际实现 | 状态 |
|------|---------------|---------|------|
| 字体 | Segoe UI Variable + IBM Plex Mono | ✅ `--font-ui` / `--font-mono` 正确定义 | ✅ |
| 颜色 Token | 统一命名 | ❌ 两套命名共存（FINDING-001） | ❌ |
| 圆角层级 | sm/md/lg/xl/shell/pill | ✅ 6 级圆角完整 | ✅ |
| 阴影层级 | app/panel/elevated | ✅ 3 级阴影完整 | ✅ |
| 卡片层级 | shell/page/inline | ✅ 3 级卡片完整 | ✅ |
| 导航图标 | 有区分度的图标 | ❌ 全部是空色块（FINDING-004） | ❌ |
| 品牌标识 | 安静但有辨识度 | ❌ 空色块（FINDING-005） | ❌ |
| 响应式 | Sidebar 抽屉模式 | ❌ 堆叠模式（FINDING-011） | ❌ |
| 键盘可访问性 | 完整 focus 管理 | ⚠️ 部分缺失（FINDING-008） | ⚠️ |
| 过渡动画 | 微过渡 | ⚠️ 存在但不统一（FINDING-015） | ⚠️ |
| 深色主题 | 完整深色体验 | ⚠️ 滚动条未定制（FINDING-019） | ⚠️ |

---

## 六、修复优先级排序

| 优先级 | Finding | 工作量估算 | 说明 |
|--------|---------|-----------|------|
| P0 | 001 | 1h | CSS 变量双轨制 — 可能导致视觉崩溃 |
| P0 | 002 | 15min | 设置对话框未定义变量 |
| P0 | 003 | 5min | `--text-strong` 未定义 |
| P1 | 004 | 2h | 导航图标缺失 |
| P1 | 005 | 1h | 品牌 Logo 缺失 |
| P1 | 008 | 1h | 键盘可访问性 |
| P1 | 009 | 1.5h | 模态焦点陷阱 + Escape |
| P1 | 012 | 30min | 消息流自动滚动 |
| P2 | 006 | 1h | 建议行图标 |
| P2 | 007 | 30min | 发送按钮 SVG |
| P2 | 010 | 2h | 响应式断点补充 |
| P2 | 011 | 3h | Sidebar 抽屉模式 |
| P3 | 013-020 | 各 15-60min | Polish 项 |

**总估算**: 约 15-18 小时工作量

---

## 七、结论

Xnova Studio 的设计系统基础扎实 — token 体系、卡片层级、排版层级都经过了认真设计。主要风险在于 CSS 变量双轨制（P0）和图标/品牌资产缺失（P1）。建议先集中修复 P0 的 3 个变量问题（约 1.5h），然后推进图标和可访问性工作。
