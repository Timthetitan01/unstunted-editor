import { spawn } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { ProbeResult, MediaKind } from '../shared/types'

// ffmpeg-static / ffprobe-static resolve to a bundled binary path per-platform.
// Inside a packaged app the path lives under app.asar.unpacked, so rewrite it.
function unpacked(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

export const FFMPEG_PATH = unpacked((ffmpegStatic as unknown as string) || 'ffmpeg')
export const FFPROBE_PATH = unpacked(ffprobeStatic.path || 'ffprobe')

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export function run(
  bin: string,
  args: string[],
  onStderr?: (chunk: string) => void
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      onStderr?.(s)
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i

export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE_PATH, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    path
  ])
  const data = JSON.parse(stdout || '{}')
  const streams: any[] = data.streams ?? []
  const v = streams.find((s) => s.codec_type === 'video')
  const a = streams.find((s) => s.codec_type === 'audio')
  const isImage = IMAGE_EXT.test(path) || (v && (!v.duration && !data.format?.duration))

  let kind: MediaKind = 'video'
  if (!v && a) kind = 'audio'
  else if (isImage) kind = 'image'

  const fpsRaw: string = v?.avg_frame_rate || v?.r_frame_rate || '30/1'
  const [num, den] = fpsRaw.split('/').map(Number)
  const fps = den ? num / den : 30

  return {
    duration: parseFloat(data.format?.duration ?? v?.duration ?? a?.duration ?? '0') || 0,
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
    hasAudio: !!a,
    kind
  }
}

/** Render `frames` evenly-spaced frames tiled into one horizontal JPEG strip. */
export async function filmstrip(
  path: string,
  duration: number,
  frames = 10,
  frameWidth = 120
): Promise<string> {
  if (!duration || duration <= 0) return ''
  const fps = frames / duration
  const { stdout } = await new Promise<{ stdout: Buffer }>((resolve, reject) => {
    const child = spawn(
      FFMPEG_PATH,
      [
        '-i', path,
        '-frames:v', '1',
        '-vf', `fps=${fps.toFixed(6)},scale=${frameWidth}:-1,tile=${frames}x1`,
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-q:v', '6',
        'pipe:1'
      ],
      { windowsHide: true }
    )
    const chunks: Buffer[] = []
    child.stdout.on('data', (d) => chunks.push(d))
    child.on('error', reject)
    child.on('close', () => resolve({ stdout: Buffer.concat(chunks) }))
  })
  if (!stdout.length) return ''
  return `data:image/jpeg;base64,${stdout.toString('base64')}`
}

/** Grab a single JPEG frame at `time` seconds, returned as a data: URL. */
export async function thumbnail(path: string, time = 0.5, width = 240): Promise<string> {
  const { stdout } = await new Promise<{ stdout: Buffer }>((resolve, reject) => {
    const child = spawn(
      FFMPEG_PATH,
      [
        '-ss', String(time),
        '-i', path,
        '-frames:v', '1',
        '-vf', `scale=${width}:-1`,
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        'pipe:1'
      ],
      { windowsHide: true }
    )
    const chunks: Buffer[] = []
    child.stdout.on('data', (d) => chunks.push(d))
    child.on('error', reject)
    child.on('close', () => resolve({ stdout: Buffer.concat(chunks) }))
  })
  if (!stdout.length) return ''
  return `data:image/jpeg;base64,${stdout.toString('base64')}`
}
