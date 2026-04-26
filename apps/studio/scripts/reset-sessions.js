const { existsSync, rmSync, mkdirSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

const sessionsDir = join(homedir(), '.xnovacode', 'sessions')

console.log('[reset:sessions] 仅清理 Xnova Studio 会话历史。')
console.log(`[reset:sessions] 目标路径: ${sessionsDir}`)

if (!existsSync(sessionsDir)) {
  console.log('[reset:sessions] 会话目录不存在，无需清理。')
  process.exit(0)
}

rmSync(sessionsDir, { recursive: true, force: true })
mkdirSync(sessionsDir, { recursive: true })

console.log('[reset:sessions] 已清空会话目录，并重新创建空目录。')
