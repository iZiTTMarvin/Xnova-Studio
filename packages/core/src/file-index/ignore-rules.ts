import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ignore, { type Ignore } from 'ignore'

const BUILTIN_IGNORE_PATTERNS: string[] = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '__pycache__',
  '.xnovacode',
  '*.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.pyc',
  '*.class',
  '*.o',
  '*.so',
  '*.dll',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.*',
  'coverage',
  '.nyc_output',
  '.cache',
  '*.jpg',
  '*.jpeg',
  '*.png',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.mp3',
  '*.mp4',
  '*.avi',
  '*.mov',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.rar',
  '*.7z',
  '*.exe',
  '*.bin',
  '*.pdf',
  '*.doc',
  '*.docx',
  '*.xls',
  '*.xlsx',
]

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function createIgnoreFilter(cwd: string): Ignore {
  const ig = ignore()
  ig.add(BUILTIN_IGNORE_PATTERNS)

  const gitignoreContent = readFileSafe(join(cwd, '.gitignore'))
  if (gitignoreContent) {
    ig.add(gitignoreContent)
  }

  const xnovaIgnoreContent = readFileSafe(join(cwd, '.xnovacodeignore'))
  if (xnovaIgnoreContent) {
    ig.add(xnovaIgnoreContent)
  }

  return ig
}
