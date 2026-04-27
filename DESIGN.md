# Design System — Xnova Studio

## Product Context

- **What this is:** Xnova Studio 是面向项目级编码协作的 Electron 工作台，核心体验是“固定项目上下文 + 长会话时间线 + 悬浮输入框”。
- **Who it's for:** 在本地代码仓库中长时间与 Agent 协作的开发者。
- **Project type:** 桌面端生产工具，不是营销页、数据看板或内容站。

## Aesthetic Direction

- **Direction:** Industrial / Utilitarian。
- **Decoration level:** minimal。
- **Mood:** 界面应安静、固定、耐看，把注意力留给项目、消息和工具执行过程。
- **Reference:** Codex App 首页与会话页排版：固定侧边栏、深色主画布、中央输入框、会话后底部悬浮 composer。

## Typography

- **UI / Body:** `"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei"`，优先贴近 Windows 桌面应用的原生质感。
- **Data / Code:** `"IBM Plex Mono", "Cascadia Mono", "JetBrains Mono"`，用于路径、分支、模型、代码与工具摘要。
- **Scale:** 主标题 36px，页面标题 24px，会话正文 15px，普通 UI 14px，辅助说明 12-13px。

## Color

- **Approach:** restrained。
- **Canvas:** `#05070b`，主工作区 `#111722`，输入面 `#17202c`。
- **Sidebar:** `#0c1016`，配合极弱的蓝色光感，只做空间分层，不做品牌化大色块。
- **Accent:** blue `#59b8ff` 用于焦点和可执行入口，cyan-green `#82d8c6` 用于辅助状态，success `#4fc58b`、warning `#f5af57`、error `#f06c6c` 只表达语义。
- **Text:** primary `#f7fafc`，secondary `#d9e2ec`，muted `#aab7c8`，faint `#6f8199`。

## Spacing

- **Base unit:** 4px。
- **Density:** compact。
- **Rule:** 主操作保持可点击面积，列表和消息区保持高信息密度，不做大块 dashboard 卡片。

## Layout

- **Approach:** grid-disciplined。
- **Shell:** 左侧栏固定 287px；主工作区固定滚动区域，顶部与侧边栏不随消息滚动。
- **Composer:** 空白页居中；会话页固定悬浮在底部，只占用固定宽度，不随消息内容变高。
- **Messages:** assistant 内容以正文排版为主，避免满屏气泡卡片；user 消息可用轻量深色气泡区分。
- **Radius:** 普通卡片和列表 4-8px；composer 可按 Codex 参考保留 22px。

## Motion

- **Approach:** minimal-functional。
- **Duration:** micro 100-160ms，scroll follow 使用 smooth，但用户上滚后必须暂停自动跟随。

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-27 | 建立 Codex-like Studio 主界面设计方向 | 当前后端和 bridge 主链路已较完整，主要问题是 UI 过度 dashboard 化、输入区和会话滚动体验不像可长期使用的编码工作台。 |
