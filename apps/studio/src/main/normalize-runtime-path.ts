/**
 * 统一 runtime cwd / workspaceRoot 路径规范化。
 *
 * 目标：同一物理路径无论以何种写法传入，都产生相同的字符串，
 * 从而让 warmup cache key、bootstrap promise cache、snapshot 匹配等
 * 不会因为 Windows 盘符大小写、正反斜杠、末尾斜杠差异而 miss。
 *
 * 规则：
 * 1. 去除首尾空白
 * 2. 反斜杠统一为正斜杠
 * 3. Windows 盘符统一为大写（D:/foo → D:/foo，d:/foo → D:/foo）
 * 4. 去除末尾斜杠（根路径 D:/ 保留）
 * 5. 空字符串返回空字符串（调用方负责兜底）
 */
export function normalizeRuntimePath(rawPath: string): string {
  let p = rawPath.trim()
  if (!p) return ''

  // 反斜杠 → 正斜杠
  p = p.replace(/\\/g, '/')

  // Windows 盘符大写：d:/foo → D:/foo
  if (/^[a-z]:\//.test(p)) {
    p = p[0]!.toUpperCase() + p.slice(1)
  }

  // 去除末尾斜杠，但保留根路径 D:/ 或 /
  if (p.length > 1 && p.endsWith('/')) {
    // 保留 D:/ 这种根路径
    if (/^[A-Z]:\/$/.test(p)) {
      return p
    }
    p = p.replace(/\/+$/, '')
  }

  return p
}
