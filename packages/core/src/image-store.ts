// src/core/image-store.ts

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs'

function getImagesDir(): string {
  return join(process.cwd(), '.xnovacode', 'images')
}

export interface ImageMeta {
  id: string
  fileName: string
  mediaType: string
  sizeBytes: number
}

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const MEDIA_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function findImageFile(imageId: string): string | null {
  try {
    if (!existsSync(getImagesDir())) {
      return null
    }
    const files = readdirSync(getImagesDir())
    const match = files.find((file) => file.startsWith(imageId))
    return match ? join(getImagesDir(), match) : null
  } catch {
    return null
  }
}

function getExtFromPath(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.')
  return dotIndex >= 0 ? filePath.slice(dotIndex) : ''
}

export function writeImage(buffer: Buffer, mediaType: string): ImageMeta {
  mkdirSync(getImagesDir(), { recursive: true })

  const id = randomUUID()
  const ext = EXT_MAP[mediaType] ?? '.jpg'
  const fileName = `${id}${ext}`
  const filePath = join(getImagesDir(), fileName)

  writeFileSync(filePath, buffer)

  return {
    id,
    fileName,
    mediaType,
    sizeBytes: buffer.length,
  }
}

export function readImageBase64(
  imageId: string,
): { base64: string; mediaType: string } | null {
  try {
    const filePath = findImageFile(imageId)
    if (!filePath) {
      return null
    }

    const buffer = readFileSync(filePath)
    const ext = getExtFromPath(filePath)
    const mediaType = MEDIA_TYPE_MAP[ext] ?? 'image/jpeg'

    return {
      base64: buffer.toString('base64'),
      mediaType,
    }
  } catch {
    return null
  }
}

export function imageExists(imageId: string): boolean {
  try {
    return findImageFile(imageId) !== null
  } catch {
    return false
  }
}

export function cleanupImages(retentionDays: number): number {
  try {
    if (!existsSync(getImagesDir())) {
      return 0
    }

    const files = readdirSync(getImagesDir())
    const now = Date.now()
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000
    let deletedCount = 0

    for (const file of files) {
      try {
        const filePath = join(getImagesDir(), file)
        const stat = statSync(filePath)
        if (now - stat.mtimeMs > retentionMs) {
          unlinkSync(filePath)
          deletedCount++
        }
      } catch {
        continue
      }
    }

    return deletedCount
  } catch {
    return 0
  }
}
