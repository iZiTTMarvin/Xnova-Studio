# Phase 5 - Project-aware Shell

## 阶段目标

把当前偏 `session-first` 的体验升级成真正的 `project-aware` 主界面。

这是第一个真正让用户感知到“Xnova Studio 不是普通聊天壳”的阶段。

## 前置依赖

- `Phase 2 - Config Migration`
- `Phase 3 - Agent System`
- `Phase 4 - Electron Host`

## 本阶段范围

### 包含

- 空白聊天页
- 项目块 / 聊天块
- 项目树 / 会话树 / 子代理树
- 顶部模式切换
- 输入框附近上下文条

### 不包含

- Settings / Tools 深度整合
- 发布收尾

## 任务清单

### A. 首页入口改造

- [ ] 默认首页切换为空白聊天页
- [ ] `Overview` 改为二级页面
- [ ] 冷启动时按规则决定：
  - [ ] 无最近项目 -> 空白聊天页
  - [ ] 有最近项目和最近会话 -> 恢复最近工作会话

### B. 左侧信息架构

- [ ] 建立一级导航
  - [ ] 快速聊天
  - [ ] 搜索
  - [ ] Agents
  - [ ] 项目
  - [ ] 聊天
  - [ ] 工具
  - [ ] 设置
- [ ] `项目` 与 `聊天` 两个 block 独立折叠 / 展开

### C. Project-aware 数据呈现

- [ ] 最近项目列表
- [ ] 项目内会话树
- [ ] 子代理会话折叠呈现
- [ ] 全局聊天列表仅保留 scratchpad 语义

### D. 上下文条

- [ ] 当前项目
- [ ] 当前分支
- [ ] 当前 Agent
- [ ] 当前模型
- [ ] Context 使用率
- [ ] 运行中的 SubAgent 数量

### E. Mode 切换

- [ ] 顶部 `Standard / XForge`
- [ ] mode 与 project config / 最近选择联动

## 重点涉及模块

- `cli/web/src/App.tsx`
- `cli/web/src/components/Sidebar.tsx`
- `cli/web/src/pages/ChatPage.tsx`
- 新增 project shell 组件

## 测试要求

### 集成测试

- 冷启动路由决策
- 最近项目 / 最近会话恢复
- 项目树 / 会话树 / 子代理树同步
- mode 切换与恢复

### E2E

- 新建项目链路
- 打开已有项目链路

## 完成标准

- 首屏不再落到统计页
- 项目维度成为主叙事
- 全局聊天不会和项目会话冲突
- 用户能明显感知“当前正在操作哪个项目”

## 风险提醒

1. 不要把“项目感”只做成 UI 文案
2. 不要让全局聊天重新长成第二套主工作流
3. 会话树与子代理树必须从一开始就按增长数据设计

## 交付物

- 空白聊天页
- project-aware 左侧壳
- 上下文条
- mode 切换基础体验

