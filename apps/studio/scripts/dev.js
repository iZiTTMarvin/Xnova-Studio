const { spawn } = require('node:child_process')

/**
 * Xnova Studio 开发启动脚本
 *
 * Windows 控制台默认代码页为 GBK (936)，Node.js 输出 UTF-8 中文会乱码。
 * 在启动 Electron 之前，先通过 chcp 65001 将当前控制台切换为 UTF-8。
 * 由于 spawn 子进程与父进程共享控制台，chcp 修改的是控制台全局属性，
 * 子进程退出后代码页仍然保持，因此 electron-vite 启动的 Electron 会继承 UTF-8。
 */

const isWin = process.platform === 'win32'

function run(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    })
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`进程退出码: ${code}`))
    })
  })
}

async function main() {
  if (isWin) {
    await run('chcp', ['65001'])
  }
  await run('electron-vite', ['dev'])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
