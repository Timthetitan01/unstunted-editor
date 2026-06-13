import { ipcMain, BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getFFmpegPath } from './ffmpeg'

// The renderer drives export by streaming raw RGBA frames (project fps) plus a
// mixed-audio WAV. We pipe frames straight into ffmpeg's stdin as rawvideo and
// mux with the audio track. Using the renderer's own compositor for frames means
// the exported file is pixel-identical to the preview — on Windows and macOS alike.

interface Session {
  ff: ChildProcessWithoutNullStreams
  wavPath?: string
  outputPath: string
  totalFrames: number
  framesWritten: number
  stderr: string
}

const sessions = new Map<string, Session>()

interface BeginOpts {
  width: number
  height: number
  fps: number
  totalFrames: number
  outputPath: string
  wav?: ArrayBuffer // mixed audio, 16-bit or float WAV with header
  videoBitrateK?: number
}

export function registerExportIpc(): void {
  ipcMain.handle('export:begin', async (_e, opts: BeginOpts) => {
    const id = randomUUID()
    let wavPath: string | undefined

    if (opts.wav && opts.wav.byteLength > 44) {
      wavPath = join(tmpdir(), `unstunted-${id}.wav`)
      await writeFile(wavPath, Buffer.from(opts.wav))
    }

    const args: string[] = [
      '-y',
      // raw video from stdin
      '-f', 'rawvideo',
      '-pixel_format', 'rgba',
      '-video_size', `${opts.width}x${opts.height}`,
      '-framerate', String(opts.fps),
      '-i', 'pipe:0'
    ]
    if (wavPath) args.push('-i', wavPath)

    args.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-b:v', `${opts.videoBitrateK ?? 12000}k`,
      '-movflags', '+faststart'
    )
    if (wavPath) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest')
    args.push('-r', String(opts.fps), opts.outputPath)

    const ff = spawn(getFFmpegPath(), args, { windowsHide: true })
    const session: Session = {
      ff,
      wavPath,
      outputPath: opts.outputPath,
      totalFrames: opts.totalFrames,
      framesWritten: 0,
      stderr: ''
    }
    ff.stderr.on('data', (d) => (session.stderr += d.toString()))
    sessions.set(id, session)
    return id
  })

  // Write one frame. Returns once ffmpeg's stdin buffer has drained so the
  // renderer applies natural backpressure instead of flooding memory.
  ipcMain.handle('export:frame', async (e, id: string, frame: ArrayBuffer) => {
    const s = sessions.get(id)
    if (!s) throw new Error('export session not found')
    const buf = Buffer.from(frame)
    await new Promise<void>((resolve, reject) => {
      const ok = s.ff.stdin.write(buf, (err) => (err ? reject(err) : undefined))
      if (ok) resolve()
      else s.ff.stdin.once('drain', resolve)
    })
    s.framesWritten++
    const pct = s.totalFrames ? Math.round((s.framesWritten / s.totalFrames) * 100) : 0
    BrowserWindow.fromWebContents(e.sender)?.webContents.send('export:progress', {
      phase: 'rendering',
      percent: pct
    })
    return true
  })

  ipcMain.handle('export:end', async (e, id: string) => {
    const s = sessions.get(id)
    if (!s) throw new Error('export session not found')
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.webContents.send('export:progress', { phase: 'muxing', percent: 99 })

    const code = await new Promise<number>((resolve) => {
      s.ff.on('close', (c) => resolve(c ?? -1))
      s.ff.stdin.end()
    })

    if (s.wavPath) await unlink(s.wavPath).catch(() => {})
    sessions.delete(id)

    if (code !== 0) {
      win?.webContents.send('export:progress', {
        phase: 'error',
        percent: 0,
        message: s.stderr.slice(-2000)
      })
      throw new Error(`ffmpeg exited ${code}: ${s.stderr.slice(-500)}`)
    }
    win?.webContents.send('export:progress', { phase: 'done', percent: 100 })
    return s.outputPath
  })

  ipcMain.handle('export:cancel', async (_e, id: string) => {
    const s = sessions.get(id)
    if (!s) return false
    s.ff.kill(process.platform === 'win32' ? undefined : 'SIGKILL')
    if (s.wavPath) await unlink(s.wavPath).catch(() => {})
    sessions.delete(id)
    return true
  })
}
