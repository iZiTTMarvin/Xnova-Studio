// src/pages/AgentsPage.tsx

/**
 * AgentsPage — 独立 Agent 管理页面（Phase 3 新增）
 *
 * 功能：
 * - 展示 builtin + user 全部 agent 列表
 * - 主 Agent / SubAgent 候选池过滤视图
 * - 新建用户 agent（从模板或从空白）
 * - 编辑用户 agent 内容
 * - 删除用户 agent
 * - 错误提示、保存状态、加载状态
 *
 * 约束：
 * - 不展示 project-level agent
 * - UI 只消费 /api/agents/* 接口，不直接访问文件系统
 * - 模式过滤逻辑由后端 filterForPrimarySelector / filterForSubagentPool 执行
 *
 * 规范来源：.trellis/tasks/04-22-phase3-agent-management-ui/prd.md
 */

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import {
  IconAgent,
  IconPlus,
  IconEdit,
  IconTrash,
  IconBuiltin,
  IconX,
} from '../components/icons'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

interface AgentToolPolicy {
  mode: 'include' | 'exclude'
  tools: string[]
}

interface AgentFrontmatter {
  id: string
  name: string
  summary: string
  mode: 'primary' | 'subagent' | 'all'
  inherits?: string
  when_to_use: string
  tool_policy: AgentToolPolicy
  model_preference?: string
  extra?: Record<string, unknown>
}

interface AgentItem {
  source: 'builtin' | 'user'
  frontmatter: AgentFrontmatter
  body: string
  filePath: string
}

interface TemplateItem {
  templateId: string
  name: string
  description: string
  useCase: string
}

interface AgentsListResponse {
  agents: AgentItem[]
  defaultAgentId: string | null
  warnings: string[]
}

interface AgentDetailResponse {
  agent: AgentItem
  rawContent?: string
}

// ─── 子组件 ────────────────────────────────────────────────────────────────────

/** 模式徽章 */
function ModeBadge({ mode }: { mode: AgentFrontmatter['mode'] }) {
  const colorMap: Record<string, string> = {
    all: 'bg-green-500/10 text-green-400 border-green-500/20',
    primary: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    subagent: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }
  const labelMap: Record<string, string> = {
    all: 'all',
    primary: 'primary',
    subagent: 'subagent',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorMap[mode] ?? ''}`}>
      {labelMap[mode] ?? mode}
    </span>
  )
}

/** 来源徽章 */
function SourceBadge({ source }: { source: 'builtin' | 'user' }) {
  if (source === 'builtin') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-txt-muted/10 text-txt-muted border border-txt-muted/20">
        <IconBuiltin size={10} />
        内置
      </span>
    )
  }
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
      自定义
    </span>
  )
}

// ─── 新建 Agent 弹窗 ──────────────────────────────────────────────────────────

type CreateMode = 'blank' | 'template'

interface CreateDialogProps {
  templates: TemplateItem[]
  onClose: () => void
  onCreated: () => void
}

function CreateAgentDialog({ templates, onClose, onCreated }: CreateDialogProps) {
  const [mode, setMode] = useState<CreateMode>('template')
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.templateId ?? '')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const handleCreate = useCallback(async () => {
    if (!id.trim() || !name.trim()) {
      setError('id 和名称均为必填项')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'blank') {
        await apiPost('/api/agents', { type: 'blank', id: id.trim(), name: name.trim() })
      } else {
        await apiPost('/api/agents', {
          type: 'template',
          templateId: selectedTemplate,
          id: id.trim(),
          name: name.trim(),
          summary: summary.trim() || `${name.trim()} 的自定义 Agent`,
        })
      }
      toast.success(`Agent "${name}" 已创建`)
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [mode, selectedTemplate, id, name, summary, toast, onCreated, onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-txt-primary">新建 Agent</h3>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary">
            <IconX size={16} />
          </button>
        </div>

        {/* 创建方式选择 */}
        <div className="flex gap-2 mb-4">
          <button
            className={`flex-1 py-1.5 rounded text-sm border transition-colors ${
              mode === 'template'
                ? 'bg-accent text-white border-accent'
                : 'border-border text-txt-secondary hover:border-accent/50'
            }`}
            onClick={() => setMode('template')}
          >
            从模板创建
          </button>
          <button
            className={`flex-1 py-1.5 rounded text-sm border transition-colors ${
              mode === 'blank'
                ? 'bg-accent text-white border-accent'
                : 'border-border text-txt-secondary hover:border-accent/50'
            }`}
            onClick={() => setMode('blank')}
          >
            从空白创建
          </button>
        </div>

        {/* 模板选择 */}
        {mode === 'template' && templates.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs text-txt-muted mb-1">选择模板</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(t => (
                <button
                  key={t.templateId}
                  onClick={() => setSelectedTemplate(t.templateId)}
                  className={`p-2.5 rounded border text-left transition-colors ${
                    selectedTemplate === t.templateId
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className="text-xs font-medium text-txt-primary">{t.name}</div>
                  <div className="text-[10px] text-txt-muted mt-0.5 leading-snug">{t.useCase}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 基本信息填写 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-txt-muted mb-1">
              Agent ID <span className="text-red-400">*</span>
              <span className="ml-1 text-[10px]">（小写英文、数字、连字符）</span>
            </label>
            <input
              type="text"
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="my-custom-agent"
              className="w-full bg-elevated border border-border rounded px-3 py-1.5 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-txt-muted mb-1">
              显示名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Custom Agent"
              className="w-full bg-elevated border border-border rounded px-3 py-1.5 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent"
            />
          </div>
          {mode === 'template' && (
            <div>
              <label className="block text-xs text-txt-muted mb-1">副标题描述</label>
              <input
                type="text"
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="描述这个 Agent 的用途..."
                className="w-full bg-elevated border border-border rounded px-3 py-1.5 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        {/* 错误信息 */}
        {error && (
          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-txt-secondary border border-border rounded hover:bg-elevated transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? '创建中...' : '创建 Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 编辑 Agent 弹窗 ──────────────────────────────────────────────────────────

interface EditDialogProps {
  agent: AgentItem
  initialContent: string
  onClose: () => void
  onSaved: () => void
}

function EditAgentDialog({ agent, initialContent, onClose, onSaved }: EditDialogProps) {
  const fm = agent.frontmatter
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await apiPut(`/api/agents/${fm.id}`, { content })
      toast.success(`Agent "${fm.name}" 已保存`)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [content, fm.id, fm.name, toast, onSaved, onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg p-6 w-[640px] max-h-[90vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-base font-semibold text-txt-primary">
            编辑 Agent：{fm.name}
          </h3>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary">
            <IconX size={16} />
          </button>
        </div>

        <div className="text-xs text-txt-muted mb-2 shrink-0">
          frontmatter 格式为 TOML（--- 分隔符），正文为 Markdown 系统提示词
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 min-h-[360px] bg-elevated border border-border rounded p-3 text-xs font-mono text-txt-primary focus:outline-none focus:border-accent resize-none"
          spellCheck={false}
        />

        {error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 shrink-0">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-txt-secondary border border-border rounded hover:bg-elevated transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agent 卡片 ───────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentItem
  isCurrentDefault: boolean
  onEdit: (agent: AgentItem) => void
  onDelete: (agent: AgentItem) => void
  onSetDefault: (agent: AgentItem) => void
}

function AgentCard({ agent, isCurrentDefault, onEdit, onDelete, onSetDefault }: AgentCardProps) {
  const fm = agent.frontmatter
  const isBuiltin = agent.source === 'builtin'
  const canBeDefault = fm.mode === 'primary' || fm.mode === 'all'

  return (
    <div className="bg-surface border border-border rounded-lg p-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-txt-primary text-sm">{fm.name}</span>
            <SourceBadge source={agent.source} />
            <ModeBadge mode={fm.mode} />
            {isCurrentDefault && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/15 text-accent border border-accent/30">
                默认主 Agent
              </span>
            )}
          </div>
          <div className="text-xs text-txt-muted mt-0.5 font-mono">{fm.id}</div>
          <div className="text-xs text-txt-secondary mt-1.5 leading-relaxed">{fm.summary}</div>
          <div className="text-[10px] text-txt-muted mt-1.5">
            <span className="font-medium">适用场景：</span>{fm.when_to_use}
          </div>
          {fm.tool_policy.mode === 'include' && fm.tool_policy.tools.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {fm.tool_policy.tools.map(t => (
                <span key={t} className="px-1 py-0.5 bg-elevated rounded text-[10px] text-txt-muted border border-border/50">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {!isBuiltin && (
          <div className="flex gap-1.5 shrink-0">
            {canBeDefault && !isCurrentDefault && (
              <button
                onClick={() => onSetDefault(agent)}
                title="设为默认主 Agent"
                className="px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded transition-colors"
              >
                设为默认
              </button>
            )}
            <button
              onClick={() => onEdit(agent)}
              title="编辑"
              className="p-1.5 text-txt-muted hover:text-accent hover:bg-accent/10 rounded transition-colors"
            >
              <IconEdit size={14} />
            </button>
            <button
              onClick={() => onDelete(agent)}
              title="删除"
              className="p-1.5 text-txt-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            >
              <IconTrash size={14} />
            </button>
          </div>
        )}
        {isBuiltin && canBeDefault && !isCurrentDefault && (
          <div className="shrink-0">
            <button
              onClick={() => onSetDefault(agent)}
              title="设为默认主 Agent"
              className="px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded transition-colors"
            >
              设为默认
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'primary' | 'subagent'

interface EditingState {
  agent: AgentItem
  rawContent: string
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingAgent, setEditingAgent] = useState<EditingState | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)
  const [defaultWarnings, setDefaultWarnings] = useState<string[]>([])
  const toast = useToast()

  // 加载 agent 列表
  const loadAgents = useCallback(async (filterMode: FilterMode) => {
    setLoading(true)
    setError(null)
    try {
      const params = filterMode !== 'all' ? `?filter=${filterMode}` : ''
      const data = await apiGet<AgentsListResponse>(`/api/agents${params}`)
      setAgents(data.agents)
      setDefaultAgentId(data.defaultAgentId)
      setDefaultWarnings(data.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // 加载模板列表
  useEffect(() => {
    apiGet<{ templates: TemplateItem[] }>('/api/agents/templates')
      .then(data => setTemplates(data.templates))
      .catch(err => console.error('[AgentsPage] 模板加载失败:', err))
  }, [])

  // 切换 filter 时重新加载
  useEffect(() => {
    void loadAgents(filter)
  }, [filter, loadAgents])

  // 删除 agent
  const handleDelete = useCallback(async (agent: AgentItem) => {
    if (!window.confirm(`确定要删除 Agent "${agent.frontmatter.name}"？此操作不可撤销。`)) return
    try {
      await apiDelete(`/api/agents/${agent.frontmatter.id}`)
      toast.success(`Agent "${agent.frontmatter.name}" 已删除`)
      void loadAgents(filter)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [filter, loadAgents, toast])

  const handleSetDefault = useCallback(async (agent: AgentItem) => {
    try {
      const result = await apiPost<{ defaultAgentId: string | null; warnings: string[] }>(
        '/api/agents/default',
        { agentId: agent.frontmatter.id },
      )
      setDefaultAgentId(result.defaultAgentId)
      setDefaultWarnings(result.warnings ?? [])
      toast.success(`已切换默认主 Agent：${agent.frontmatter.name}`)
      void loadAgents(filter)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [filter, loadAgents, toast])

  const handleClearDefault = useCallback(async () => {
    try {
      const result = await apiPost<{ defaultAgentId: string | null; warnings: string[] }>(
        '/api/agents/default',
        { agentId: null },
      )
      setDefaultAgentId(result.defaultAgentId)
      setDefaultWarnings(result.warnings ?? [])
      toast.success('已清除默认主 Agent')
      void loadAgents(filter)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [filter, loadAgents, toast])

  const handleOpenEditor = useCallback(async (agent: AgentItem) => {
    try {
      const detail = await apiGet<AgentDetailResponse>(`/api/agents/${agent.frontmatter.id}?raw=true`)
      setEditingAgent({
        agent: detail.agent,
        rawContent: detail.rawContent ?? '',
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err)
      toast.error(message)
    }
  }, [toast])

  const builtinCount = agents.filter(a => a.source === 'builtin').length
  const userCount = agents.filter(a => a.source === 'user').length

  return (
    <div className="p-6 max-w-4xl">
      {/* 页面标题区 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <IconAgent size={20} className="text-accent" />
            <h2 className="text-xl font-bold text-txt-primary">Agent 管理</h2>
          </div>
          <p className="text-sm text-txt-muted mt-1">
            管理内置和自定义 Agent，支持新建、编辑、删除、切换和模式过滤
          </p>
        </div>
        <div className="flex gap-2">
          {defaultAgentId && (
            <button
              onClick={handleClearDefault}
              className="px-3 py-1.5 border border-border text-sm text-txt-secondary rounded-md hover:bg-elevated transition-colors"
            >
              清除默认
            </button>
          )}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/90 transition-colors"
          >
            <IconPlus size={14} />
            新建 Agent
          </button>
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="flex gap-3 mb-5">
        <div className="bg-surface border border-border rounded-lg px-4 py-2.5">
          <div className="text-lg font-semibold text-txt-primary">{builtinCount}</div>
          <div className="text-xs text-txt-muted">内置 Agent</div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-2.5">
          <div className="text-lg font-semibold text-accent">{userCount}</div>
          <div className="text-xs text-txt-muted">自定义 Agent</div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-2.5 min-w-[180px]">
          <div className="text-sm font-semibold text-txt-primary truncate">
            {defaultAgentId ?? '未设置'}
          </div>
          <div className="text-xs text-txt-muted">当前默认主 Agent</div>
        </div>
      </div>

      {defaultWarnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          {defaultWarnings.join('；')}
        </div>
      )}

      {/* 过滤 Tab */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {(['all', 'primary', 'subagent'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              filter === f
                ? 'border-accent text-accent'
                : 'border-transparent text-txt-secondary hover:text-txt-primary'
            }`}
          >
            {f === 'all' ? '全部' : f === 'primary' ? '主 Agent' : 'SubAgent'}
          </button>
        ))}
      </div>

      {/* 过滤说明 */}
      {filter !== 'all' && (
        <div className="mb-4 text-xs text-txt-muted bg-elevated border border-border rounded px-3 py-2">
          {filter === 'primary'
            ? '主 Agent 候选池：展示 mode = primary | all 的 Agent'
            : 'SubAgent 候选池：展示 mode = subagent | all 的 Agent'}
        </div>
      )}

      {/* Agent 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-txt-muted">
          <span className="animate-pulse">加载中...</span>
        </div>
      ) : error ? (
        <div className="py-8 text-center">
          <div className="text-red-400 text-sm mb-2">加载失败</div>
          <div className="text-xs text-txt-muted">{error}</div>
          <button
            onClick={() => loadAgents(filter)}
            className="mt-3 px-3 py-1.5 text-xs border border-border rounded text-txt-secondary hover:bg-elevated transition-colors"
          >
            重试
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="py-16 text-center">
          <IconAgent size={32} className="text-txt-muted mx-auto mb-3" />
          <div className="text-sm text-txt-muted">
            {filter === 'all' ? '暂无 Agent' : `${filter === 'primary' ? '主 Agent' : 'SubAgent'} 候选池为空`}
          </div>
          {filter === 'all' && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-3 px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              创建第一个 Agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map(agent => (
            <AgentCard
              key={agent.frontmatter.id}
              agent={agent}
              isCurrentDefault={defaultAgentId === agent.frontmatter.id}
              onEdit={handleOpenEditor}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {/* 弹窗 */}
      {showCreateDialog && (
        <CreateAgentDialog
          templates={templates}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => loadAgents(filter)}
        />
      )}

      {editingAgent && (
        <EditAgentDialog
          agent={editingAgent.agent}
          initialContent={editingAgent.rawContent}
          onClose={() => setEditingAgent(null)}
          onSaved={() => {
            setEditingAgent(null)
            void loadAgents(filter)
          }}
        />
      )}
    </div>
  )
}
