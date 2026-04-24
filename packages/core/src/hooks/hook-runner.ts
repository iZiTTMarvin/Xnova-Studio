import { spawn } from 'node:child_process'

export interface RunOptions {
  command: string
  cwd: string
  env: Record<string, string>
  timeout: number
  stdin?: string
}

export class HookRunner {
  async run(opts: RunOptions): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const { command, cwd, env, timeout, stdin } = opts

      const child = spawn('bash', ['-c', command], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let settled = false

      const settle = (value: Record<string, unknown> | null) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      }

      const timer = setTimeout(() => {
        child.kill()
        settle(null)
      }, timeout)

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.on('error', () => settle(null))
      child.on('close', (code) => {
        if (code !== 0) {
          settle(null)
          return
        }
        try {
          const parsed: unknown = JSON.parse(stdout.trim())
          if (typeof parsed === 'object' && parsed !== null) {
            settle(parsed as Record<string, unknown>)
          } else {
            settle(null)
          }
        } catch {
          settle(null)
        }
      })

      if (stdin) {
        child.stdin.write(stdin)
      }
      child.stdin.end()
    })
  }
}
