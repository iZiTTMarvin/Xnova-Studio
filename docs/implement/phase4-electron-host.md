# Phase 4 - Electron Host

## 阶段目标

建立 `Electron` 桌面宿主的最小可运行骨架，使其能够消费共享 runtime。

本阶段只解决：

- 宿主存在
- 窗口能起
- IPC 能通
- workspace 能打开

不在这一阶段追求完整产品 UI。

## 前置依赖

- `Phase 1 - Runtime Foundation`

## 本阶段范围

### 包含

- `studio/` 目录建立
- Electron main / preload / renderer
- 与 runtime 的最小 IPC
- 启动日志与错误输出

### 不包含

- 完整 project-aware 主界面
- 设置页重构
- 恢复逻辑

## 任务清单

### A. 工程骨架

- [ ] 新建 `studio/`
- [ ] 建立 `src/main`
- [ ] 建立 `src/preload`
- [ ] 建立 `src/renderer`
- [ ] 确定构建、启动、打包基础脚本

### B. Main Process

- [ ] 创建主窗口
- [ ] 处理应用生命周期
- [ ] 处理打开 workspace 的原生对话框
- [ ] 接入基础日志输出

### C. Preload / IPC

- [ ] 暴露安全 IPC API
- [ ] 定义 renderer 能调用的宿主能力
- [ ] 定义 runtime 事件桥接

### D. Renderer 最小接入

- [ ] 能加载基础页面
- [ ] 能显示当前 workspace
- [ ] 能向 runtime 发起最小请求

## 重点涉及模块

- `studio/src/main/*`
- `studio/src/preload/*`
- `studio/src/renderer/*`
- 与 runtime 的桥接层

## 测试要求

### 单元 / 轻集成

- IPC 方法参数校验
- workspace 选择结果处理
- 窗口生命周期基础逻辑

### 手工验证

- 应用可启动
- 可选择本地 workspace
- renderer 能收到基本状态

## 完成标准

- Electron 宿主能稳定启动
- runtime 可以被 host 调用
- renderer 不需要依赖 CLI 终端环境即可工作

## 风险提醒

1. 不要把过多业务逻辑塞回 main process
2. 不要跳过 preload 安全边界，直接在 renderer 滥用 Node 能力
3. 不要在本阶段开始做复杂页面重组

## 交付物

- `studio/` 工程骨架
- 最小 IPC contract
- Electron 启动与 workspace 打开能力

