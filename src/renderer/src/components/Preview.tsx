import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Compositor, MediaPool } from '../engine/compositor'
import { AudioEngine } from '../engine/audioEngine'
import { drawCaptions, SAMPLE_CUE, SAMPLE_DURATION } from '../engine/captions'
import {
  IcMarker, IcMarkIn, IcMarkOut, IcGoIn, IcGoOut, IcStepBack, IcStepFwd, IcPlay, IcStop, IcCamera
} from './icons'

function fmtTC(t: number, fps: number): string {
  const f = Math.floor((t % 1) * fps)
  const s = Math.floor(t) % 60
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const p = (n: number): string => n.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`
}

export function Preview({
  poolRef
}: {
  poolRef: MutableRefObject<MediaPool | null>
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compRef = useRef<Compositor | null>(null)
  const resRef = useRef(1)
  const [res, setRes] = useState(1)
  resRef.current = res

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { alpha: false })!
    const pool = new MediaPool()
    const audio = new AudioEngine()
    const comp = new Compositor(pool, audio)
    poolRef.current = pool
    compRef.current = comp

    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const s = useStore.getState()
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now

      const { width, height } = s.project
      const f = resRef.current
      const cw = Math.max(2, Math.round(width * f))
      const ch = Math.max(2, Math.round(height * f))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }

      let t = s.playhead
      if (s.playing) {
        const speed = s.shuttle !== 0 ? s.shuttle : 1
        t = s.playhead + dt * speed
        const dur = s.duration()
        if (t <= 0) {
          t = 0
          s.pause()
        } else if (t >= dur && dur > 0 && speed > 0) {
          t = dur
          s.pause()
        }
        s.setPlayhead(t)
      }
      comp.syncPlayback(s.project, s.assets, t, s.playing)
      ctx.setTransform(f, 0, 0, f, 0, 0)
      comp.drawFrame(ctx, s.project, s.assets, t)

      // Captions panel open + no real captions yet: preview the style right
      // here in the Program monitor with a looping sample. Once captions are
      // generated/added, only the real ones render.
      if (s.captionPreview && s.project.captions.length === 0) {
        const lt = (now / 1000) % SAMPLE_DURATION
        drawCaptions(ctx, [SAMPLE_CUE], s.project.captionStyle, lt, s.project.width, s.project.height)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      pool.dispose()
      audio.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="program-monitor">
      <div className="preview-wrap">
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>
      <Transport canvasRef={canvasRef} res={res} setRes={setRes} />
    </div>
  )
}

function Transport({
  canvasRef,
  res,
  setRes
}: {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
  res: number
  setRes: (n: number) => void
}): JSX.Element {
  const playing = useStore((s) => s.playing)
  const playhead = useStore((s) => s.playhead)
  const fps = useStore((s) => s.project.fps)
  const togglePlay = useStore((s) => s.togglePlay)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const stepFrame = useStore((s) => s.stepFrame)
  const duration = useStore((s) => {
    let end = 0
    for (const t of s.project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
    for (const cue of s.project.captions) end = Math.max(end, cue.end)
    return end
  })
  const inPoint = useStore((s) => s.inPoint)
  const outPoint = useStore((s) => s.outPoint)
  const setInPoint = useStore((s) => s.setInPoint)
  const setOutPoint = useStore((s) => s.setOutPoint)
  const addMarker = useStore((s) => s.addMarker)

  const exportFrame = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas) return
    const path = await window.swift.saveFrameDialog(`frame_${fmtTC(playhead, fps).replace(/:/g, '.')}.png`)
    if (!path) return
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) return
    await window.swift.writeExportFile(path, await blob.arrayBuffer())
  }

  return (
    <div className="transport">
      <span className="tc-blue">{fmtTC(playhead, fps)}</span>
      <div className="spacer" />
      <button className="iconbtn" title="Add Marker (M)" onClick={() => addMarker(playhead)}><IcMarker /></button>
      <button className="iconbtn" title="Mark In (I)" onClick={() => setInPoint(playhead)}><IcMarkIn /></button>
      <button className="iconbtn" title="Mark Out (O)" onClick={() => setOutPoint(playhead)}><IcMarkOut /></button>
      <span className="transport-sep" />
      <button className="iconbtn" title="Go to In" onClick={() => setPlayhead(inPoint ?? 0)}><IcGoIn /></button>
      <button className="iconbtn" title="Step Back (←)" onClick={() => stepFrame(-1)}><IcStepBack /></button>
      <button className="iconbtn play" title="Play/Stop (Space)" onClick={togglePlay}>
        {playing ? <IcStop size={16} /> : <IcPlay size={16} />}
      </button>
      <button className="iconbtn" title="Step Forward (→)" onClick={() => stepFrame(1)}><IcStepFwd /></button>
      <button className="iconbtn" title="Go to Out" onClick={() => setPlayhead(outPoint ?? duration)}><IcGoOut /></button>
      <span className="transport-sep" />
      <button className="iconbtn" title="Export Frame" onClick={exportFrame}><IcCamera /></button>
      <select
        title="Playback resolution"
        value={res}
        onChange={(e) => setRes(Number(e.target.value))}
        style={{ width: 64 }}
      >
        <option value={1}>Full</option>
        <option value={0.5}>1/2</option>
        <option value={0.25}>1/4</option>
      </select>
      <div className="spacer" />
      <span className="tc-dim">
        {inPoint != null && outPoint != null && outPoint > inPoint
          ? fmtTC(outPoint - inPoint, fps)
          : fmtTC(duration, fps)}
      </span>
    </div>
  )
}
