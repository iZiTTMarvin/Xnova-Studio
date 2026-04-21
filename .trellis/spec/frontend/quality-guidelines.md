# Frontend 质量规范

> 本文件定义当前终端 UI 与 Web UI 的最低质量门槛，以及 `Xnova Studio v1` 主体验在开发前就应锁定的验证重点。

## 当前检查命令

终端/UI 相关代码在 `cli/` 下验证：

```bash
pnpm typecheck
pnpm test
```

Web 面板在 `cli/web/` 下验证：

```bash
pnpm build:check
```

## TDD 基线

以下前端改动必须优先补失败测试或验收脚本：

- 项目恢复 / 最近会话恢复
- `Standard / XForge` 模式切换
- SubAgent 状态在聊天流与侧栏中的同步
- Settings 中的配置迁移与错误提示
- Bridge / runtime 未就绪时的空态与失败态

如果暂时无法写完整 E2E，至少补：

- 单元测试
- 状态机测试
- 事件 payload 回归测试
- spec 验收测试

## 页面级质量门槛

每个新页面或主要改版必须回答清楚：

- loading 怎么显示？
- empty 怎么显示？
- error 怎么显示？
- disabled / unsupported 怎么显示？

不能接受：

- 只在控制台报错
- 页面空白但没有提示
- 失败后仍然显示“好像成功了”的默认态

## v1 设计回归点

根据设计与测试文档，以下内容是前端开发中的固定回归点：

- 默认首页必须是空白聊天页或恢复后的最近工作会话，不能回到 overview
- 左侧一级导航保持收敛，不新增额外一级入口来绕过信息架构
- `Standard / XForge` 必须是唯一主模式切换入口
- `工具` 页优先展示 MCP / Skills 状态，而不是复杂管理表单
- Memory 降级、Provider 连接失败、路径失效等都要给明确可操作反馈

## 最少验证清单

### 终端 UI

- 输入与中断逻辑正常
- 权限弹窗、问题表单、SubAgent 面板状态正确
- 恢复会话后消息流与当前模型提示一致

### Web UI

- 页面首次加载不抖动、不白屏
- 设置保存失败会提示
- 关键表单项支持空值、错误值与禁用态
- 最小宽度下布局仍可操作

## 当前正向样例

- 终端业务状态集中：`cli/src/ui/useChat.ts`
- 终端主壳与面板组合：`cli/src/ui/App.tsx`
- Web 设置页的状态卡片拆分：`cli/web/src/pages/SettingsPage.tsx`
- Web 侧边导航信息架构：`cli/web/src/components/Sidebar.tsx`

## 反模式

- 不做失败态就直接提交 UI。
- 为了赶进度，把项目级/全局级语义混在同一导航或同一状态条里。
- 在页面上新增第二套 mode、agent 或 project 真入口，导致语义冲突。
