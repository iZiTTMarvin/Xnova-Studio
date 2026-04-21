# Config TOML Migration 专项规范

> 本规范约束 `config.json -> config.toml` 与 `.xnovacode/project.toml` 的迁移方式，目标是在不丢用户配置的前提下，建立 `project > user > builtin` 的稳定配置模型。

## 当前事实

- 当前用户级配置入口：`cli/src/config/config-manager.ts`
- 当前主配置文件：`~/.xnovacode/config.json`
- 当前项目级配置只存在于零散能力：
  - `.xnovacode/hooks.json`
  - `.xnovacode/XNOVACODE.md`
  - 旧逻辑中的项目级 agent 目录兼容
- 需求文档已锁定：
  - 统一主格式改为 TOML
  - 用户级 `~/.xnovacode/config.toml`
  - 项目级 `.xnovacode/project.toml`
  - 优先级 `project > user > builtin`

## 场景：建立 TOML 主配置并安全迁移旧 JSON

### 1. Scope / Trigger

- 触发条件：
  - 引入 `config.toml` / `project.toml`
  - 修改 `ConfigManager`
  - 新增合并策略、迁移器、桌面设置写回逻辑
- 这是高风险 infra 变更，任何 silent reset 都视为严重缺陷。

### 2. Signatures

v1 目标建议围绕以下接口收敛：

```ts
interface UserConfigToml {
  providers?: Record<string, ProviderConfigToml>
  memory?: MemoryConfigToml
  agent?: UserAgentDefaults
  modes?: UserModeConfig
  features?: UserFeatureConfig
}

interface ProjectConfigToml {
  agent?: {
    default?: string
    max_parallel_subagents?: number
  }
  features?: {
    enabled?: string[]
  }
  modes?: {
    allowed?: Array<'standard' | 'xforge'>
    recommended?: 'standard' | 'xforge'
  }
}

interface ResolvedConfig {
  source: {
    projectToml?: string
    userToml?: string
    legacyJson?: string
  }
  effective: CCodeConfigLike
}

function loadResolvedConfig(cwd: string): ResolvedConfig
function migrateLegacyJsonToToml(): MigrationResult
```

> **类型引用约定（spec 层契约骨架）**：
>
> 上述签名中出现但本 spec 未展开定义的类型（`ProviderConfigToml`、`MemoryConfigToml`、`UserAgentDefaults`、`UserModeConfig`、`UserFeatureConfig`、`CCodeConfigLike`、`MigrationResult`）只作为 **契约骨架占位**。
>
> - `ProviderConfigToml` / `MemoryConfigToml`：字段应与 `cli/src/config/config-manager.ts` 中现行 `ProviderConfig` / `MemoryConfig` 一一对应；本次迁移只变格式（JSON → TOML），**不借迁移夹带字段重命名或语义变更**。
> - `CCodeConfigLike`：等价于当前 CLI 运行时实际消费的 `CCodeConfig` 合并结果，由 Phase 2 `2-*` 对应 `prd.md` 落到具体字段列表。
> - `UserAgentDefaults` / `UserModeConfig` / `UserFeatureConfig`：字段集由 Phase 2 对应 `prd.md` 结合 `agent-schema-v1.md` 的字段契约共同锁定。
> - `MigrationResult`：至少包含 `success / error / fallback / writtenPath / kept` 五类语义，用于支撑 `Validation & Error Matrix`。
> - **实现约束**：子代理实现阶段不得私自扩字段；新增字段须同步更新本 spec 与对应 prd，并在 `ResolvedConfig.effective` 上做向后兼容。

### 3. Contracts

#### 文件位置

- 用户级：
  - `~/.xnovacode/config.toml`
  - 兼容旧：`~/.xnovacode/config.json`
- 项目级：
  - `<project>/.xnovacode/project.toml`

#### 读取优先级

1. project
2. user
3. builtin

#### merge 规则

- 标量：项目覆盖用户
- 对象：按 key merge，冲突以项目为准
- 数组：项目整组覆盖

#### 迁移规则

- 若 `config.toml` 已存在：优先读取 TOML，不自动用 JSON 覆盖
- 若仅有 `config.json`：
  - 可触发一次迁移生成 `config.toml`
  - 迁移失败不得删除或覆盖原 JSON
- 桌面设置保存后：
  - 只写 TOML
  - JSON 不再作为主写入目标

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| `config.toml` 不存在但 `config.json` 存在 | 读取 JSON，并允许安全迁移 |
| `config.toml` 存在且合法 | 优先使用 TOML |
| `config.toml` 损坏 | 明确报错并给 fallback 策略，不能静默清空 |
| `project.toml` 缺失 | 仅使用 user + builtin |
| `project.toml` 字段类型错误 | 明确指出字段路径与错误，不允许模糊忽略 |
| 迁移写入 TOML 失败 | 保留原 JSON，不修改原配置 |

### 5. Good / Base / Bad Cases

- Good：
  - 老用户升级后保留现有 providers/memory 配置
  - 项目配置只覆盖项目相关默认值
  - UI 和 CLI 都消费同一份 resolved config
- Base：
  - 未配置 `project.toml` 时，行为保持接近当前 CLI
- Bad：
  - 解析失败后自动写一份默认 TOML 覆盖用户现有配置
  - 读取和写回使用不同优先级
  - `project.toml` 和 `config.toml` 字段结构不一致，导致理解成本飙升

### 6. Tests Required

- 单元测试：
  - JSON -> TOML 迁移
  - `project > user > builtin` merge
  - 损坏 TOML / 损坏 project.toml 错误提示
- 集成测试：
  - 设置页写回 TOML 后 CLI/runtime 生效
  - 旧用户首次启动迁移链路
- 回归测试：
  - provider / memory / mode / features 默认值不丢失

### 7. Wrong vs Correct

#### Wrong

```ts
if (parseTomlFailed) {
  writeDefaultToml()
  return defaultConfig
}
```

问题：

- 用户原始配置被静默重置
- 无法区分“未配置”和“配置损坏”

#### Correct

```ts
if (parseTomlFailed) {
  return {
    success: false,
    error: 'config.toml is invalid',
    fallback: 'keep legacy json untouched',
  }
}
```

## 当前代码参考

- `cli/src/config/config-manager.ts`
- `cli/src/config/instructions-loader.ts`
- `cli/web/src/pages/SettingsPage.tsx`

## 反模式

- 不要把 `project.toml` 当作第二份用户配置大杂烩。
- 不要为了“兼容旧版本”保留双写不收敛。
- 不要在 UI 层私自决定配置优先级。
