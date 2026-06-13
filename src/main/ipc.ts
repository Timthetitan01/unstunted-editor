import { ipcMain, dialog, app } from 'electron'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { probe, thumbnail, filmstrip, run, FFMPEG_PATH } from './ffmpeg'
import { registerExportIpc } from './export'
import { MEDIA_SCHEME } from '../shared/types'

export function registerIpc(): void {
  registerExportIpc()

  // ── disk cache for ML model files (Whisper weights etc.) ──
  // The renderer runs on file:// in production where the browser Cache API is
  // unreliable, so transformers.js caches through these handlers instead.
  const modelCacheDir = (): string => join(app.getPath('userData'), 'model-cache')
  const cacheFile = (key: string): string =>
    join(modelCacheDir(), createHash('sha256').update(key).digest('hex'))

  ipcMain.handle('cache:get', async (_e, key: string) => {
    try {
      const buf = await readFile(cacheFile(key))
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    } catch {
      return null
    }
  })

  ipcMain.handle('cache:put', async (_e, key: string, data: ArrayBuffer) => {
    await mkdir(modelCacheDir(), { recursive: true })
    await writeFile(cacheFile(key), Buffer.from(data))
    return true
  })

  ipcMain.handle('dialog:openMedia', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle('media:probe', async (_e, path: string) => probe(path))

  ipcMain.handle('media:thumbnail', async (_e, path: string, time?: number) =>
    thumbnail(path, time)
  )

  ipcMain.handle('media:filmstrip', async (_e, path: string, duration: number, frames?: number) =>
    filmstrip(path, duration, frames)
  )

  ipcMain.handle('dialog:saveFrame', async (_e, defaultName: string) => {
    const res = await dialog.showSaveDialog({
      title: 'Export frame',
      defaultPath: defaultName,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    return res.canceled ? null : res.filePath
  })

  // Hand the renderer a custom-scheme URL (not file://) so Chromium will load
  // it as media from the dev server's http origin. See MEDIA_SCHEME in index.ts.
  ipcMain.handle('media:fileUrl', (_e, path: string) =>
    `${MEDIA_SCHEME}://local/${encodeURIComponent(path)}`
  )

  // Decode audio to 16kHz mono float32 PCM for Whisper transcription.
  ipcMain.handle('audio:decode16k', async (_e, path: string) => {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        FFMPEG_PATH,
        ['-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
        { windowsHide: true }
      )
      child.stdout.on('data', (d: Buffer) => chunks.push(d))
      child.on('error', reject)
      child.on('close', () => resolve())
    })
    const buf = Buffer.concat(chunks)
    // Return a transferable ArrayBuffer slice (mono f32).
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('dialog:saveExport', async (_e, defaultName: string) => {
    const res = await dialog.showSaveDialog({
      title: 'Export video',
      defaultPath: defaultName,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    })
    return res.canceled ? null : res.filePath
  })

  ipcMain.handle('project:save', async (_e, path: string, json: string) => {
    await writeFile(path, json, 'utf8')
    return true
  })

  ipcMain.handle('project:autosave', async (_e, json: string) => {
    const dir = join(app.getPath('userData'), 'autosaves')
    await mkdir(dir, { recursive: true })
    const name = `autosave-${new Date().toISOString().replace(/[:.]/g, '-')}.scut`
    // keep only the last 5 autosaves
    const { readdir, unlink } = await import('node:fs/promises')
    const files = (await readdir(dir).catch(() => [] as string[]))
      .filter((f) => f.startsWith('autosave-'))
      .sort()
    for (const old of files.slice(0, Math.max(0, files.length - 4))) {
      await unlink(join(dir, old)).catch(() => {})
    }
    await writeFile(join(dir, name), json, 'utf8')
    return Date.now()
  })

  ipcMain.handle('dialog:openProxy', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Select proxy file',
      properties: ['openFile'],
      filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mkv'] }]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('project:saveDialog', async () => {
    const res = await dialog.showSaveDialog({
      title: 'Save project',
      filters: [{ name: 'Unstunted Editor project', extensions: ['scut'] }]
    })
    return res.canceled ? null : res.filePath
  })

  ipcMain.handle('project:openDialog', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'Unstunted Editor project', extensions: ['scut'] }]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('project:load', async (_e, path: string) => readFile(path, 'utf8'))

  // WebCodecs export writes the finished MP4 bytes here.
  ipcMain.handle('export:writeFile', async (_e, path: string, data: ArrayBuffer) => {
    await writeFile(path, Buffer.from(data))
    return path
  })

  // Lightweight ffmpeg passthrough used by a couple of UI affordances.
  ipcMain.handle('ffmpeg:run', async (_e, args: string[]) => run(FFMPEG_PATH, args))
}
