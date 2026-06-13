import type { MediaAsset, Project } from '../../../shared/types'
import { sampleKeyframes } from '../engine/keyframes'

const decodeCache = new Map<string, AudioBuffer>()

async function decodeAsset(ctx: BaseAudioContext, asset: MediaAsset): Promise<AudioBuffer | null> {
  if (decodeCache.has(asset.id)) return decodeCache.get(asset.id)!
  try {
    const res = await fetch(asset.url)
    const arr = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(arr)
    decodeCache.set(asset.id, buf)
    return buf
  } catch {
    return null
  }
}

/** Render the whole timeline's audio to an AudioBuffer (null if silent). */
export async function renderTimelineAudio(
  project: Project,
  assets: Record<string, MediaAsset>,
  durationSec: number
): Promise<AudioBuffer | null> {
  const sampleRate = project.sampleRate || 48000
  const frames = Math.ceil(durationSec * sampleRate)
  if (frames <= 0) return null

  const offline = new OfflineAudioContext(2, frames, sampleRate)
  let any = false

  for (const track of project.tracks) {
    if (track.kind === 'caption' || track.muted) continue
    for (const clip of track.clips) {
      const asset = assets[clip.assetId]
      if (!asset || !asset.hasAudio) continue
      const buf = await decodeAsset(offline, asset)
      if (!buf) continue
      any = true

      const src = offline.createBufferSource()
      src.buffer = buf
      const gain = offline.createGain()

      // volume: bake keyframes as a value curve, else constant
      const vk = clip.keyframes.volume
      if (vk.length > 0) {
        const steps = Math.max(2, Math.ceil(clip.duration * 30))
        for (let i = 0; i <= steps; i++) {
          const lt = (i / steps) * clip.duration
          const v = sampleKeyframes(vk, lt, clip.props.volume)
          gain.gain.setValueAtTime(Math.max(0, v), clip.start + lt)
        }
      } else {
        gain.gain.setValueAtTime(Math.max(0, clip.props.volume), clip.start)
      }

      src.connect(gain).connect(offline.destination)
      src.start(clip.start, clip.in, clip.duration)
    }
  }

  if (!any) return null
  return offline.startRendering()
}

/** Cut [start, end) seconds out of an AudioBuffer (for in/out ranged export). */
export function sliceAudioBuffer(buf: AudioBuffer, start: number, end: number): AudioBuffer {
  const sr = buf.sampleRate
  const s = Math.max(0, Math.floor(start * sr))
  const e = Math.min(buf.length, Math.ceil(end * sr))
  const out = new AudioBuffer({
    length: Math.max(1, e - s),
    numberOfChannels: buf.numberOfChannels,
    sampleRate: sr
  })
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.copyToChannel(buf.getChannelData(c).subarray(s, e), c)
  }
  return out
}

/** Render the whole timeline's audio to a stereo WAV (16-bit PCM). */
export async function mixTimelineToWav(
  project: Project,
  assets: Record<string, MediaAsset>,
  durationSec: number
): Promise<ArrayBuffer | null> {
  const buf = await renderTimelineAudio(project, assets, durationSec)
  return buf ? audioBufferToWav(buf) : null
}

export function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels
  const len = buf.length * numCh * 2
  const out = new ArrayBuffer(44 + len)
  const view = new DataView(out)
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + len, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, buf.sampleRate, true)
  view.setUint32(28, buf.sampleRate * numCh * 2, true)
  view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, len, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numCh; c++) channels.push(buf.getChannelData(c))
  let off = 44
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return out
}
