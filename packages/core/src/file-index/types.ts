export interface SearchResult {
  path: string
  score: number
  positions: Set<number>
}

export interface DirEntry {
  name: string
  fullPath: string
  isDir: boolean
}
