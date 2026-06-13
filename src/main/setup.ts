import { app } from 'electron'
import { existsSync, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import https from 'node:https'

// ffmpeg-static only ships the binary for the platform where npm install ran
// (macOS in our CI). On Windows we download the win32/x64 binary on first
// launch and cache it to userData. ARM64 Windows runs it via x64 emulation.
const FFMPEG_URL =
  'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz'

function httpsGet(url: string): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'unstunted-editor' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        httpsGet(res.headers.location).then(resolve).catch(reject)
        res.resume()
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading ffmpeg`))
        res.resume()
        return
      }
      resolve(res)
    }).on('error', reject)
  })
}

export async function ensureWindowsFFmpeg(): Promise<void> {
  if (process.platform !== 'win32') return

  const binDir = join(app.getPath('userData'), 'bin')
  const dest = join(binDir, 'ffmpeg.exe')

  if (existsSync(dest)) {
    process.env['SWIFTCUT_FFMPEG'] = dest
    return
  }

  await mkdir(binDir, { recursive: true })
  const stream = await httpsGet(FFMPEG_URL)
  await pipeline(stream, createGunzip(), createWriteStream(dest))
  process.env['SWIFTCUT_FFMPEG'] = dest
}
