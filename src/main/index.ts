import { app, BrowserWindow, shell, protocol } from 'electron'
import { join, extname } from 'node:path'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { registerIpc } from './ipc'
import { ensureWindowsFFmpeg } from './setup'
import { MEDIA_SCHEME } from '../shared/types'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// Media is served to the renderer over MEDIA_SCHEME instead of file://.
// Chromium blocks file:// subresources from the dev server's http origin
// ("Not allowed to load local resource"), and even in production a privileged
// scheme gives us reliable range requests + CORS headers so the canvas
// compositor stays untainted (required for frame export).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true }
  }
])

const MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2'
}

function registerMediaProtocol(): void {
  // Serve real 206 Partial Content responses. Without proper byte ranges
  // Chromium treats the source as unseekable: any seek outside the buffered
  // region resets <video>.currentTime to 0, which froze preview playback
  // after pausing/scrubbing mid-timeline.
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1))
    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return new Response('not found', { status: 404 })
    }
    const common: Record<string, string> = {
      'Content-Type': MEDIA_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    }

    const m = request.headers.get('Range')?.match(/bytes=(\d*)-(\d*)/)
    if (m && (m[1] || m[2])) {
      // "bytes=a-b", "bytes=a-" or suffix form "bytes=-n" (last n bytes)
      const start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10))
      const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
      if (!Number.isFinite(start) || start < 0 || start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { ...common, 'Content-Range': `bytes */${size}` }
        })
      }
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          ...common,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1)
        }
      })
    }

    const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
    return new Response(body, {
      status: 200,
      headers: { ...common, 'Content-Length': String(size) }
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // We deliberately keep the renderer untrusted toward arbitrary fs;
      // all disk access goes through typed IPC in ipc.ts.
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await ensureWindowsFFmpeg()
  registerMediaProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
