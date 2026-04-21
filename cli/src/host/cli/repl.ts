// src/host/cli/repl.ts

/**
 * CLI Host — REPL 启动器
 *
 * 职责：
 * - 加载 React / Ink / App 组件
 * - 处理 --web Bridge Server 启动与连接
 * - 调用 Ink render()，返回 unmount 句柄
 *
 * 约束：不得 import runtime/ 内部模块
 */

export interface ReplOptions {
  resumeSessionId?: string
  showResumeOnStart?: boolean
  model?: string
  provider?: string
  web?: boolean
  getSessionId: () => string | null
}

export interface ReplHandle {
  unmount: () => void
}

/** 启动 REPL（Ink 交互界面） */
export async function startRepl(opts: ReplOptions): Promise<ReplHandle> {
  const [
    React,
    { render },
    { App },
  ] = await Promise.all([
    import('react'),
    import('ink'),
    import('../../ui/App.js'),
  ])

  // Bridge Server（--web 模式）
  if (opts.web) {
    await setupBridge(opts.getSessionId)
  }

  const { unmount } = render(
    React.createElement(App, {
      ...(opts.resumeSessionId != null ? { resumeSessionId: opts.resumeSessionId } : {}),
      ...(opts.showResumeOnStart ? { showResumeOnStart: true } : {}),
      ...(opts.model != null ? { model: opts.model } : {}),
      ...(opts.provider != null ? { provider: opts.provider } : {}),
      ...(opts.web ? { webEnabled: true } : {}),
    }),
    { exitOnCtrlC: false },
  )

  return { unmount }
}

/** 启动 / 连接 Bridge Server（--web 模式） */
async function setupBridge(getSessionId: () => string | null): Promise<void> {
  const { startBridgeServer, connectBridge, disconnectBridge, closeBridge } = await import('../../server/bridge/index.js')

  const { createServer: createNetServer } = await import('node:net')
  const portInUse = await new Promise<boolean>((resolve) => {
    const tester = createNetServer()
    tester.once('error', () => resolve(true))
    tester.once('listening', () => { tester.close(); resolve(false) })
    tester.listen(9800)
  })

  let isBridgeOwner = false
  let bridgePort = 9800

  if (!portInUse) {
    const isDevMode = (process.argv[1] ?? '').endsWith('.ts')
    let vitePort: number | undefined

    if (isDevMode) {
      const { createServer: createNetServer2 } = await import('node:net')
      vitePort = await new Promise<number>((resolve, reject) => {
        const srv = createNetServer2()
        srv.listen(0, () => {
          const addr = srv.address()
          const port = typeof addr === 'object' && addr ? addr.port : 0
          srv.close(() => resolve(port))
        })
        srv.on('error', reject)
      })

      const { execa } = await import('execa')
      const webDir = new URL('../../web', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
      const viteProcess = execa('npx', ['vite', '--port', String(vitePort)], { cwd: webDir, stdio: 'ignore' })
      viteProcess.catch(() => { /* Vite 退出时静默 */ })
      process.on('exit', () => { viteProcess.kill() })

      const { createConnection } = await import('node:net')
      await new Promise<void>((resolve) => {
        let attempts = 0
        const poll = () => {
          const sock = createConnection({ port: vitePort! }, () => { sock.destroy(); resolve() })
          sock.on('error', () => {
            sock.destroy()
            if (++attempts < 150) setTimeout(poll, 100)
            else resolve() // 超时不阻塞
          })
        }
        poll()
      })
    }

    const bridge = startBridgeServer({
      dev: isDevMode,
      ...(vitePort !== undefined ? { vitePort } : {}),
    })
    bridgePort = bridge.port
    isBridgeOwner = true
  }

  // 轮询等待 sessionId（render 后才有值）
  let attempts = 0
  const poll = () => {
    const sid = getSessionId()
    if (sid) {
      connectBridge(bridgePort, sid)
    } else if (++attempts < 50) {
      setTimeout(poll, 100)
    }
  }
  setTimeout(poll, 100)

  process.on('exit', () => {
    disconnectBridge()
    if (isBridgeOwner) closeBridge()
  })
}
