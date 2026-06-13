import type { Clip, MediaAsset, Project, StaticProps, Track } from '../../../shared/types'
import { resolveClipProps } from './keyframes'
import { drawCaptions } from './captions'
import type { AudioEngine } from './audioEngine'

interface PoolEntry {
  video?: HTMLVideoElement
  image?: HTMLImageElement
  ready: boolean
}

/** Owns the <video>/<img> elements backing each asset. */
export class MediaPool {
  private entries = new Map<string, PoolEntry>()

  get(asset: MediaAsset, proxyMode = false): PoolEntry {
    const key = proxyMode && asset.proxyUrl ? `proxy:${asset.id}` : asset.id
    let e = this.entries.get(key)
    if (e) return e
    e = { ready: false }
    const src = (proxyMode && asset.proxyUrl) ? asset.proxyUrl : asset.url
    if (asset.kind === 'image') {
      const img = new Image()
      img.onload = () => (e!.ready = true)
      img.src = src
      e.image = img
    } else {
      const v = document.createElement('video')
      v.src = src
      v.preload = 'auto'
      v.muted = asset.kind === 'video'
      v.crossOrigin = 'anonymous'
      v.playsInline = true
      v.addEventListener('loadeddata', () => (e!.ready = true))
      e.video = v
    }
    this.entries.set(key, e)
    return e
  }

  forEachVideo(fn: (v: HTMLVideoElement) => void): void {
    for (const e of this.entries.values()) if (e.video) fn(e.video)
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      if (e.video) {
        e.video.pause()
        e.video.removeAttribute('src')
        e.video.load()
      }
    }
    this.entries.clear()
  }
}

export interface ActiveClip {
  clip: Clip
  track: Track
  entry: PoolEntry
  asset: MediaAsset
}

/** The clip playing on a track at `time`, if any. */
function clipAt(track: Track, time: number): Clip | undefined {
  return track.clips.find((c) => time >= c.start && time < c.start + c.duration)
}

/** Source time (seconds into asset) for a clip at timeline `time`. */
export function sourceTime(clip: Clip, time: number): number {
  return clip.in + (time - clip.start)
}

/** Build a CSS filter string from a clip's static props. */
function buildFilter(a: StaticProps): string {
  const f: string[] = []
  // exposure maps to brightness multiplier (2^stops)
  const expBrightness = Math.pow(2, a.exposure ?? 0)
  const totalBrightness = expBrightness * (a.brightness ?? 1)
  if (Math.abs(totalBrightness - 1) > 0.001) f.push(`brightness(${totalBrightness.toFixed(4)})`)
  if ((a.contrast ?? 1) !== 1) f.push(`contrast(${a.contrast})`)
  if ((a.saturation ?? 1) !== 1) f.push(`saturate(${a.saturation})`)
  if ((a.blur ?? 0) > 0) f.push(`blur(${a.blur}px)`)
  // temperature: warm = sepia + hue-rotate approximation
  if ((a.temperature ?? 0) !== 0) {
    const t = (a.temperature ?? 0) / 100 // -1..+1
    const sepia = Math.abs(t) * 0.4
    const hue = t > 0 ? -20 * t : 30 * Math.abs(t) // warm=amber, cool=blue
    f.push(`sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`)
  }
  // tint: green<->magenta via hue-rotate
  if ((a.tint ?? 0) !== 0) {
    const tintDeg = (a.tint ?? 0) * 0.3
    f.push(`hue-rotate(${tintDeg.toFixed(1)}deg)`)
  }
  return f.length ? f.join(' ') : 'none'
}

/** Overlay a vignette on top of the drawn canvas region. */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  strength: number,
  midpoint: number,
  feather: number
): void {
  if (strength <= 0) return
  const cx = W / 2, cy = H / 2
  const r = Math.sqrt(cx * cx + cy * cy)
  const innerR = r * midpoint * (1 - feather * 0.5)
  const outerR = r * (midpoint + (1 - midpoint) * feather)
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
  grad.addColorStop(0, `rgba(0,0,0,0)`)
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, strength).toFixed(3)})`)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

export class Compositor {
  public proxyMode = false

  constructor(
    public pool: MediaPool,
    public audio?: AudioEngine
  ) {}

  /** Visible video clips at `time`, ordered bottom track first (draw order). */
  videoClipsAt(project: Project, assets: Record<string, MediaAsset>, time: number): ActiveClip[] {
    const out: ActiveClip[] = []
    const videoTracks = project.tracks.filter((t) => (t.kind === 'video' || t.kind === 'adjustment') && !t.hidden)
    for (const track of [...videoTracks].reverse()) {
      const clip = clipAt(track, time)
      if (!clip) continue
      if (track.kind === 'adjustment') continue // adjustment layers drawn separately
      const asset = assets[clip.assetId]
      if (!asset) continue
      out.push({ clip, track, asset, entry: this.pool.get(asset, this.proxyMode) })
    }
    return out
  }

  audioClipsAt(project: Project, assets: Record<string, MediaAsset>, time: number): ActiveClip[] {
    const out: ActiveClip[] = []
    for (const track of project.tracks) {
      if (track.kind === 'caption' || track.kind === 'adjustment') continue
      const clip = clipAt(track, time)
      if (!clip) continue
      const asset = assets[clip.assetId]
      if (!asset || !asset.hasAudio) continue
      out.push({ clip, track, asset, entry: this.pool.get(asset, this.proxyMode) })
    }
    return out
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    ac: ActiveClip,
    time: number,
    W: number,
    H: number,
    opacityMul = 1,
    adjustProps?: StaticProps
  ): void {
    const { entry, asset, clip } = ac
    const el = entry.video ?? entry.image
    if (!el) return
    const srcW = asset.width || W
    const srcH = asset.height || H

    const p = resolveClipProps(clip, time)
    // Merge adjustment layer props on top of clip props if present
    const a: StaticProps = adjustProps ? { ...clip.props, ...adjustProps } : clip.props
    const fit = Math.min(W / srcW, H / srcH)
    const scale = fit * p.scale
    const drawW = srcW * scale
    const drawH = srcH * scale

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity * opacityMul))
    ctx.filter = buildFilter(a)

    ctx.translate(W / 2 + p.x, H / 2 + p.y)
    if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180)
    const sx = a.flipH ? -1 : 1
    const sy = a.flipV ? -1 : 1
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
    try {
      ctx.drawImage(el as CanvasImageSource, -drawW / 2, -drawH / 2, drawW, drawH)
    } catch {
      /* frame not ready yet */
    }
    ctx.restore()

    // Vignette is drawn outside the clip transform, full-canvas
    if ((a.vignetteStrength ?? 0) > 0) {
      drawVignette(ctx, W, H, a.vignetteStrength, a.vignetteMidpoint ?? 0.5, a.vignetteFeather ?? 0.5)
    }
  }

  drawFrame(
    ctx: CanvasRenderingContext2D,
    project: Project,
    assets: Record<string, MediaAsset>,
    time: number
  ): void {
    const W = project.width
    const H = project.height
    ctx.save()
    ctx.fillStyle = project.background || '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // Collect active adjustment layer props (merged from bottom up)
    const adjustTracks = project.tracks.filter((t) => t.kind === 'adjustment' && !t.hidden)
    let adjustProps: StaticProps | undefined
    for (const at of adjustTracks) {
      const ac = clipAt(at, time)
      if (ac) adjustProps = { ...(adjustProps ?? {}), ...ac.props } as StaticProps
    }

    const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.hidden)
    for (const track of [...videoTracks].reverse()) {
      const clip = clipAt(track, time)
      if (!clip) continue
      const asset = assets[clip.assetId]
      if (!asset) continue
      const ac: ActiveClip = { clip, track, asset, entry: this.pool.get(asset, this.proxyMode) }

      const tr = clip.inTransition
      if (tr && tr.duration > 0 && time < clip.start + tr.duration) {
        const prog = (time - clip.start) / tr.duration
        const prev = track.clips
          .filter((c) => c.start + c.duration <= clip.start + 0.001)
          .sort((a, b) => b.start - a.start)[0]
        const prevAsset = prev ? assets[prev.assetId] : undefined

        if (tr.type === 'fadeToBlack') {
          if (prog < 0.5 && prev && prevAsset) {
            const pAc: ActiveClip = { clip: prev, track, asset: prevAsset, entry: this.pool.get(prevAsset, this.proxyMode) }
            this.drawClip(ctx, pAc, time, W, H, 1 - prog * 2, adjustProps)
          } else {
            this.drawClip(ctx, ac, time, W, H, (prog - 0.5) * 2, adjustProps)
          }
        } else if (tr.type === 'dissolve') {
          if (prev && prevAsset) {
            const pAc: ActiveClip = { clip: prev, track, asset: prevAsset, entry: this.pool.get(prevAsset, this.proxyMode) }
            this.drawClip(ctx, pAc, time, W, H, 1 - prog, adjustProps)
          }
          this.drawClip(ctx, ac, time, W, H, prog, adjustProps)
        } else {
          ctx.save()
          const x = tr.type === 'wipeLeft' ? W * (1 - prog) : 0
          if (prev && prevAsset) {
            const pAc: ActiveClip = { clip: prev, track, asset: prevAsset, entry: this.pool.get(prevAsset, this.proxyMode) }
            this.drawClip(ctx, pAc, time, W, H, 1, adjustProps)
          }
          ctx.beginPath()
          if (tr.type === 'wipeLeft') ctx.rect(x, 0, W - x, H)
          else ctx.rect(0, 0, W * prog, H)
          ctx.clip()
          this.drawClip(ctx, ac, time, W, H, 1, adjustProps)
          ctx.restore()
        }
      } else {
        this.drawClip(ctx, ac, time, W, H, 1, adjustProps)
      }
    }

    drawCaptions(ctx, project.captions, project.captionStyle, time, W, H)
  }

  syncPlayback(
    project: Project,
    assets: Record<string, MediaAsset>,
    time: number,
    playing: boolean
  ): void {
    if (playing) this.audio?.resume()
    const active = new Set<HTMLVideoElement>()
    const clips = [
      ...this.videoClipsAt(project, assets, time),
      ...this.audioClipsAt(project, assets, time)
    ]
    for (const ac of clips) {
      const v = ac.entry.video
      if (!v) continue
      active.add(v)
      const src = sourceTime(ac.clip, time)
      const vol = resolveClipProps(ac.clip, time).volume
      // clipGain: dB to linear (0 dB = 1.0)
      const gainLinear = ac.clip.clipGain != null ? Math.pow(10, ac.clip.clipGain / 20) : 1
      const wantGain = ac.track.muted || !ac.asset.hasAudio ? 0 : Math.max(0, Math.min(2, vol * gainLinear))

      if (this.audio) {
        this.audio.attach(v)
        v.muted = false
        this.audio.setGain(v, playing ? wantGain : 0)
        this.audio.setPan(v, ac.clip.props.pan ?? 0)
      } else {
        v.muted = ac.track.muted || !ac.asset.hasAudio
        v.volume = Math.max(0, Math.min(1, vol * gainLinear))
      }

      if (playing) {
        if (Math.abs(v.currentTime - src) > 0.18) v.currentTime = src
        if (v.paused) v.play().catch(() => {})
      } else {
        if (!v.paused) v.pause()
        if (Math.abs(v.currentTime - src) > 0.04) v.currentTime = src
      }
    }
    this.audio?.silenceExcept(active)
    this.pool.forEachVideo((v) => {
      if (!active.has(v) && !v.paused) v.pause()
    })
  }

  async seekAll(
    project: Project,
    assets: Record<string, MediaAsset>,
    time: number
  ): Promise<void> {
    const active = [
      ...this.videoClipsAt(project, assets, time),
      ...this.audioClipsAt(project, assets, time)
    ]
    await Promise.all(
      active.map(({ entry, clip }) => {
        const v = entry.video
        if (!v) return Promise.resolve()
        const st = sourceTime(clip, time)
        if (Math.abs(v.currentTime - st) < 0.04) return Promise.resolve()
        return new Promise<void>((resolve) => {
          let done = false
          const finish = (): void => {
            if (done) return
            done = true
            v.removeEventListener('seeked', onSeeked)
            resolve()
          }
          const onSeeked = (): void => finish()
          v.addEventListener('seeked', onSeeked)
          // requestVideoFrameCallback fires the moment the seeked frame is
          // actually decoded and ready to draw — usually sooner, and never
          // later, than 'seeked'. Resolve on whichever comes first.
          const rvfc = (v as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number
          }).requestVideoFrameCallback
          if (typeof rvfc === 'function') rvfc.call(v, () => finish())
          v.currentTime = st
          // Safety net only — if neither event fires (e.g. seeking onto the
          // exact same frame), don't wedge the export.
          setTimeout(finish, 1000)
        })
      })
    )
  }
}
