import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import type { MediaAsset, Project } from '../../../shared/types'
import { Compositor } from '../engine/compositor'

// Hardware-accelerated export via WebCodecs -> muxed to MP4 in memory.
// No per-frame IPC: only the finished file crosses to the main process.
// Falls back (caller's responsibility) when the platform lacks the encoders.

export interface WebExportOpts {
  project: Project
  assets: Record<string, MediaAsset>
  duration: number
  /** timeline time of the first frame (in/out ranged export) */
  startTime?: number
  comp: Compositor
  audio: AudioBuffer | null
  bitrateK: number
  onProgress: (pct: number) => void
  isCancelled: () => boolean
}

const AVC_CODEC = 'avc1.640028' // H.264 High, level 4.0
const AAC_CODEC = 'mp4a.40.2'

/** Returns true if this machine can encode H.264 (and AAC, if audio present). */
export async function webCodecsSupported(hasAudio: boolean): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  try {
    const v = await VideoEncoder.isConfigSupported({
      codec: AVC_CODEC,
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30
    })
    if (!v?.supported) return false
    if (hasAudio) {
      if (typeof AudioEncoder === 'undefined') return false
      const a = await AudioEncoder.isConfigSupported({
        codec: AAC_CODEC,
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192000
      })
      if (!a?.supported) return false
    }
    return true
  } catch {
    return false
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function exportWithWebCodecs(opts: WebExportOpts): Promise<ArrayBuffer> {
  const { project, assets, duration, startTime = 0, comp, audio, bitrateK, onProgress, isCancelled } = opts
  const W = project.width
  const H = project.height
  const fps = project.fps
  const totalFrames = Math.max(1, Math.ceil(duration * fps))
  const hasAudio = !!audio

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    ...(hasAudio
      ? { audio: { codec: 'aac', sampleRate: audio!.sampleRate, numberOfChannels: audio!.numberOfChannels } }
      : {})
  })

  let encoderError: unknown = null
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encoderError = e)
  })
  videoEncoder.configure({
    codec: AVC_CODEC,
    width: W,
    height: H,
    bitrate: bitrateK * 1000,
    framerate: fps,
    latencyMode: 'quality',
    // Use the platform's hardware H.264 encoder (VideoToolbox on macOS,
    // Media Foundation on Windows). Falls back to software automatically when
    // unavailable, so this only ever speeds things up.
    hardwareAcceleration: 'prefer-hardware'
  })

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!
  const frameDur = Math.round(1_000_000 / fps)
  const keyEvery = Math.round(fps) * 2

  // Seeking the source <video> elements is the slowest part of export, so we
  // overlap each frame's seek with the previous frame's encode: prime frame 0,
  // then while the hardware encoder digests frame f we already kick off the
  // seek for f+1. The canvas pixels are snapshotted into the VideoFrame at
  // construction, so it's safe to re-seek the videos immediately after.
  await comp.seekAll(project, assets, startTime)
  for (let f = 0; f < totalFrames; f++) {
    if (isCancelled()) {
      videoEncoder.close()
      throw new Error('cancelled')
    }
    if (encoderError) throw encoderError
    const t = startTime + f / fps
    comp.drawFrame(ctx, project, assets, t)

    const frame = new VideoFrame(canvas, { timestamp: f * frameDur, duration: frameDur })
    videoEncoder.encode(frame, { keyFrame: f % keyEvery === 0 })
    frame.close()

    // Start decoding the next frame now (runs in parallel with the encode).
    const seekNext =
      f + 1 < totalFrames ? comp.seekAll(project, assets, startTime + (f + 1) / fps) : null

    // Backpressure: keep the encode queue deep enough to saturate the hardware
    // encoder without letting it balloon unboundedly.
    while (videoEncoder.encodeQueueSize > 30) await tick()
    if (seekNext) await seekNext
    onProgress(Math.round((f / totalFrames) * (hasAudio ? 92 : 99)))
  }
  await videoEncoder.flush()
  videoEncoder.close()
  if (encoderError) throw encoderError

  if (hasAudio) {
    onProgress(94)
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (encoderError = e)
    })
    const numCh = audio!.numberOfChannels
    const sr = audio!.sampleRate
    audioEncoder.configure({ codec: AAC_CODEC, sampleRate: sr, numberOfChannels: numCh, bitrate: 192000 })

    const total = audio!.length
    const block = 4096
    const channels: Float32Array[] = []
    for (let c = 0; c < numCh; c++) channels.push(audio!.getChannelData(c))

    for (let off = 0; off < total; off += block) {
      if (encoderError) throw encoderError
      const len = Math.min(block, total - off)
      // interleave f32 (AudioData 'f32' expects interleaved)
      const data = new Float32Array(len * numCh)
      for (let i = 0; i < len; i++)
        for (let c = 0; c < numCh; c++) data[i * numCh + c] = channels[c][off + i]
      const ad = new AudioData({
        format: 'f32',
        sampleRate: sr,
        numberOfFrames: len,
        numberOfChannels: numCh,
        timestamp: Math.round((off / sr) * 1_000_000),
        data
      })
      audioEncoder.encode(ad)
      ad.close()
      while (audioEncoder.encodeQueueSize > 30) await tick()
    }
    await audioEncoder.flush()
    audioEncoder.close()
    if (encoderError) throw encoderError
  }

  onProgress(99)
  muxer.finalize()
  return (muxer.target as ArrayBufferTarget).buffer
}
