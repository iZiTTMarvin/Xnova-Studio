# 数据库与持久化规范

> 当前项目的数据库事实源是本地 SQLite（`libsql`）加 session JSONL。v1 的新增功能必须在不破坏现有本地数据链路的前提下演进。

## 当前事实

- SQLite 入口：`cli/src/persistence/db.ts`
- 数据库位置：`~/.xnovacode/data/xnovacode.db`
- 当前未使用 ORM，直接使用 `libsql` + SQL
- 主 schema 版本使用 `PRAGMA user_version`
- 向量表 `memory_vectors` 的版本和维度额外使用 `memory_meta` 管理
- 历史会话主事实源仍包含 JSONL 事件流：`cli/src/persistence/session-store.ts`

## 场景：新增或修改本地 SQLite schema

### 1. Scope / Trigger

- 触发条件：
  - 新增表、字段、索引
  - 修改 `pricing_rules` / `usage_logs` / `memory_meta` / `memory_vectors`
  - 调整 session restore、memory rebuild、pricing 计算依赖的数据结构
- 这是高风险 infra 变更，必须写失败测试后再实现。

### 2. Signatures

当前关键入口：

- `createDb(dbPath: string): DatabaseType`
- `getDb(): DatabaseType`
- `closeDb(): void`
- `ensureMemoryVectors(dimension: number): void`
- `getStoredEmbeddingDimension(): number | null`

新增数据库能力时，应优先复用这些入口，而不是在别处直接 new 数据库连接。

### 3. Contracts

#### 数据路径契约

- SQLite 数据目录：`~/.xnovacode/data/`
- 数据库文件：`xnovacode.db`
- 调试日志目录：项目级 `.xnovacode/`，不要与用户级数据目录混用

#### 版本契约

- 主 schema：`PRAGMA user_version`
- 向量 schema：`memory_meta.vectors_schema_version`
- Embedding 维度：`memory_meta.embedding_dimension`

#### 迁移契约

- 主 schema 迁移统一挂到 `migrations[]`
- 每次迁移函数负责：
  - DDL
  - 必要的数据修复/种子数据
- `user_version` 由 `runMigrations()` 在全部成功后统一写入
- 向量表不能“改列维度”，维度变化时必须 drop + rebuild

### 4. Validation & Error Matrix

| 条件 | 处理方式 |
|---|---|
| 数据库文件不存在 | 自动创建目录与数据库 |
| `user_version` 落后 | 执行待跑 migration 后再提升版本 |
| migration 报错 | 启动失败，不能伪装成成功 |
| `dimension <= 0` | `ensureMemoryVectors()` 直接跳过向量表构建 |
| Embedding 维度变化 | 删除旧 `memory_vectors` 与向量索引后重建 |
| 向量存储初始化失败 | 记录 warning，Memory 降级为 BM25，而不是静默失效 |

### 5. Good / Base / Bad Cases

- Good：
  - 新增字段通过 migration 增量演进
  - 旧数据可继续读取
  - 维度变化后明确触发重建
- Base：
  - 只新增索引或种子数据，保持旧查询兼容
- Bad：
  - 直接修改表结构但不更新版本号
  - 在其他模块里偷偷执行建表 SQL
  - migration 失败后仍继续启动，导致用户误以为数据已安全迁移

### 6. Tests Required

至少补以下测试中的相关项：

- migration 测试：
  - 从旧版本库升级到新版本
  - `user_version` 只在成功后更新
- 向量表测试：
  - `dimension <= 0` 不建表
  - 维度变化时会触发 drop + rebuild
- 降级测试：
  - Embedding/向量存储失败时，Memory 仍可进入 BM25 模式
- 回归测试：
  - 旧 session / pricing / memory meta 仍可读

### 7. Wrong vs Correct

#### Wrong

```ts
import Database from 'libsql'

const db = new Database('tmp.db')
db.exec('ALTER TABLE usage_logs ADD COLUMN foo TEXT')
```

问题：

- 绕过统一入口
- 没有版本管理
- 没有兼容与测试

#### Correct

```ts
const migrations: MigrationFn[] = [
  (db) => {
    db.exec('ALTER TABLE usage_logs ADD COLUMN foo TEXT')
  },
]
```

并补充：

- 版本升级测试
- 旧数据兼容测试
- 失败回滚/报错验证

## 命名规则

- 表名、索引名、meta key 使用 `snake_case`
- 主键默认 `id`
- 关联字段优先 `<entity>_id`
- 时间字段优先带语义：`timestamp`, `created`, `updated`, `effective_from`

## 当前代码示例

- 主 schema 与 migration：`cli/src/persistence/db.ts`
- 会话事件持久化：`cli/src/persistence/session-store.ts`
- 记忆向量使用：`cli/src/memory/storage/libsql-vector-store.ts`

## 反模式

- 不要把 JSONL 与 SQLite 的责任混为一谈。
- 不要在 migration 中偷偷改业务含义而不更新文档与测试。
- 不要因为“当前还是早期项目”就省略版本控制；早期更要把迁移规则定稳。
