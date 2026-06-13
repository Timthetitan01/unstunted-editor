import type { MediaAsset, MediaKind } from '../../../shared/types'
import { uid } from '../store'

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/** Detect kind from file extension — no IPC needed. */
function kindFromPath(path: string): MediaKind {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  if (/^(png|jpe?g|gif|webp|bmp|tiff?)$/.test(ext)) return 'image'
  if (/^(mp3|wav|aac|m4a|ogg|flac|opus|wma|aiff?)$/.test(ext)) return 'audio'
  return 'video'
}

/**
 * Read duration + dimensions from the file's media headers using the browser's
 * own decoder — fires in milliseconds because it only reads the header/moov box,
 * not the full file.  No ffprobe process needed on the hot path.
 */
function probeInstant(
  url: string,
  kind: MediaKind
): Promise<{ duration: number; width: number; height: number; fps: number; hasAudio: boolean }> {
  if (kind === 'image') {
    return Promise.resolve({ duration: 5, width: 0, height: 0, fps: 0, hasAudio: false })
  }
  return new Promise((resolve) => {
    const fallback = (): void =>
      resolve({ duration: 5, width: kind === 'video' ? 1920 : 0, height: kind === 'video' ? 1080 : 0, fps: 30, hasAudio: true })
    const t = setTimeout(fallback, 8000)

    if (kind === 'audio') {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.src = url
      audio.onloadedmetadata = (): void => {
        clearTimeout(t)
        resolve({ duration: isFinite(audio.duration) ? audio.duration : 5, width: 0, height: 0, fps: 0, hasAudio: true })
      }
      audio.onerror = (): void => { clearTimeout(t); fallback() }
      return
    }

    // video
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    video.onloadedmetadata = (): void => {
      clearTimeout(t)
      resolve({
        duration: isFinite(video.duration) ? video.duration : 5,
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        fps: 30,        // refined by ffprobe in background via enrichAsset
        hasAudio: true  // conservative default; refined by ffprobe in background
      })
    }
    video.onerror = (): void => { clearTimeout(t); fallback() }
  })
}

/** Import a single file path — returns immediately after reading media headers. */
export async function importPath(path: string): Promise<MediaAsset> {
  const kind = kindFromPath(path)
  const url = await window.swift.fileUrl(path)
  const meta = await probeInstant(url, kind)
  return {
    id: uid(),
    name: basename(path),
    path,
    url,
    kind,
    duration: kind === 'image' ? 5 : meta.duration || 5,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    hasAudio: meta.hasAudio
  }
}

export async function importPaths(paths: string[]): Promise<MediaAsset[]> {
  const results = await Promise.allSettled(paths.map(importPath))
  const out: MediaAsset[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value)
    else console.error('import failed', paths[i], r.reason)
  })
  return out
}

/** Reduce mono PCM to `buckets` normalized peak amplitudes (0..1). */
function computePeaks(pcm: Float32Array, buckets = 2400): number[] {
  const out = new Array<number>(buckets).fill(0)
  const per = Math.max(1, Math.floor(pcm.length / buckets))
  let max = 0
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const base = b * per
    const step = Math.max(1, Math.floor(per / 32))
    for (let i = 0; i < per; i += step) {
      const v = Math.abs(pcm[base + i] ?? 0)
      if (v > peak) peak = v
    }
    out[b] = peak
    if (peak > max) max = peak
  }
  if (max > 0.01) for (let b = 0; b < buckets; b++) out[b] = Math.round((out[b] / max) * 100) / 100
  return out
}

function renderWaveform(peaks: number[], width = 480, height = 56): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(82, 198, 162, 0.9)'
  const mid = height / 2
  for (let x = 0; x < width; x++) {
    const amp = peaks[Math.floor((x / width) * peaks.length)] ?? 0
    const h = Math.max(1, amp * (height - 4))
    ctx.fillRect(x, mid - h / 2, 1, h)
  }
  return canvas.toDataURL('image/png')
}

/**
 * Capture a single thumbnail frame via the browser's video decoder.
 * Avoids spawning ffmpeg — one seek is fast (~100-300ms).
 */
function captureThumbnail(url: string, duration: number): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = (): void => {
      video.currentTime = Math.min(duration * 0.2, duration - 0.1, 1)
    }
    video.onseeked = (): void => {
      try {
        const w = 240
        const h = video.videoHeight ? Math.round(w * video.videoHeight / video.videoWidth) : 135
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = Math.max(1, h)
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        resolve('')
      }
    }
    video.onerror = (): void => resolve('')
    setTimeout(() => resolve(''), 10000)
  })
}

/**
 * Generate the heavier visuals (filmstrip, waveform) in the background after
 * import, patching the asset via `update` when each one lands.
 */
export function enrichAsset(
  asset: MediaAsset,
  update: (id: string, patch: Partial<MediaAsset>) => void
): void {
  if (asset.kind === 'video') {
    // Thumbnail: fast browser seek, no ffmpeg process
    captureThumbnail(asset.url, asset.duration)
      .then((thumb) => thumb && update(asset.id, { thumbnail: thumb }))
      .catch(() => {})

    // Filmstrip: ffmpeg tile filter in main process — efficient single-pass decode
    window.swift
      .filmstrip(asset.path, asset.duration, 20)
      .then((fs) => fs && update(asset.id, { filmstrip: fs, filmstripFrames: 20 }))
      .catch(() => {})

    // Refine fps + hasAudio via ffprobe (background — not blocking import)
    window.swift
      .probe(asset.path)
      .then((p) => {
        const patch: Partial<MediaAsset> = {}
        if (p.fps && p.fps !== asset.fps) patch.fps = p.fps
        if (p.hasAudio !== asset.hasAudio) patch.hasAudio = p.hasAudio
        if (Object.keys(patch).length) update(asset.id, patch)
      })
      .catch(() => {})
  }

  if (asset.kind === 'image') {
    // No enrichment needed for images — the url is the thumbnail
    update(asset.id, { thumbnail: asset.url })
  }

  if (asset.hasAudio || asset.kind === 'audio') {
    window.swift
      .decodeAudio16k(asset.path)
      .then((buf) => {
        const pcm = new Float32Array(buf)
        if (pcm.length > 0) {
          const peaks = computePeaks(pcm)
          update(asset.id, { peaks, waveform: renderWaveform(peaks) })
        }
      })
      .catch(() => {})
  }
}
