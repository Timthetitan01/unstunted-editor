import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useStore, uid } from '../store'
import { Compositor, MediaPool } from '../engine/compositor'
import { renderTimelineAudio, audioBufferToWav, sliceAudioBuffer } from '../lib/audioMix'
import { exportWithWebCodecs, webCodecsSupported } from '../lib/webcodecsExport'
import type { ExportProgress, ExportQueueItem } from '../../../shared/types'
import { IcCheck, IcWarn, IcPlus } from './icons'

async function runExport(
  item: ExportQueueItem,
  onProgress: (pct: number, msg: string) => void
): Promise<void> {
  const s = useStore.getState()
  const { project, assets } = s
  const pool = new MediaPool()
  const comp = new Compositor(pool)
  try {
    const rangeStart = item.rangeStart
    const rangeEnd = item.rangeEnd
    const rangeLen = rangeEnd - rangeStart
    onProgress(0, 'Mixing audio…')
    let audio = await renderTimelineAudio(project, assets, rangeEnd).catch(() => null)
    if (audio) audio = sliceAudioBuffer(audio, rangeStart, rangeEnd)
    const useWC = await webCodecsSupported(!!audio)
    if (useWC) {
      onProgress(2, 'Encoding (hardware H.264)…')
      const buffer = await exportWithWebCodecs({
        project, assets,
        duration: rangeLen,
        startTime: rangeStart,
        comp, audio,
        bitrateK: item.bitrateK,
        onProgress: (p) => onProgress(p, `Encoding ${p}%`),
        isCancelled: () => false
      })
      onProgress(97, 'Saving file…')
      await window.swift.writeExportFile(item.outputPath, buffer)
    } else {
      const wav = audio ? audioBufferToWav(audio) : undefined
      const fps = project.fps
      const totalFrames = Math.ceil(rangeLen * fps)
      const canvas = document.createElement('canvas')
      canvas.width = project.width
      canvas.height = project.height
      const ctx = canvas.getContext('2d', { alpha: false })!
      const id = await window.swift.exportBegin({
        width: project.width, height: project.height,
        fps, totalFrames, outputPath: item.outputPath,
        wav, videoBitrateK: item.bitrateK
      })
      for (let f = 0; f < totalFrames; f++) {
        const t = rangeStart + f / fps
        await comp.seekAll(project, assets, t)
        comp.drawFrame(ctx, project, assets, t)
        const img = ctx.getImageData(0, 0, project.width, project.height)
        await window.swift.exportFrame(id, img.data.buffer)
        onProgress(Math.round((f / totalFrames) * 95), `Rendering frame ${f + 1}/${totalFrames}`)
      }
      await window.swift.exportEnd(id)
    }
    onProgress(100, `Saved to ${item.outputPath}`)
  } finally {
    pool.dispose()
  }
}

export function ExportDialog({
  poolRef: _poolRef,
  onClose
}: {
  poolRef: MutableRefObject<MediaPool | null>
  onClose: () => void
}): JSX.Element {
  const project = useStore((s) => s.project)
  const duration = useStore((s) => {
    let end = 0
    for (const t of s.project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
    for (const cue of s.project.captions) end = Math.max(end, cue.end)
    return end
  })
  const inPoint = useStore((s) => s.inPoint)
  const outPoint = useStore((s) => s.outPoint)
  const pause = useStore((s) => s.pause)

  const hasRange = inPoint != null && outPoint != null && outPoint > inPoint
  const rangeStart = hasRange ? inPoint! : 0
  const rangeEnd = hasRange ? Math.min(outPoint!, duration || outPoint!) : duration
  const rangeLen = Math.max(0, rangeEnd - rangeStart)

  // Single export state
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState('')
  const [quality, setQuality] = useState(12000)

  // Export queue
  const [queue, setQueue] = useState<ExportQueueItem[]>([])
  const [queueRunning, setQueueRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'single' | 'queue'>('single')

  useEffect(() => {
    return window.swift.onExportProgress((p: ExportProgress) => {
      setPct(p.percent)
      if (p.phase === 'muxing') setMsg('Finalizing video…')
      if (p.message) setMsg(p.message)
    })
  }, [])

  const run = async (): Promise<void> => {
    pause()
    if (rangeLen <= 0) {
      setMsg('Timeline is empty — add a clip first.')
      setPhase('error')
      return
    }
    const outputPath = await window.swift.saveExportDialog(`${project.name || 'export'}.mp4`)
    if (!outputPath) return
    setPhase('running')
    setPct(0)
    setMsg('Starting export…')
    try {
      await runExport(
        { id: uid(), name: project.name, outputPath, bitrateK: quality, rangeStart, rangeEnd, status: 'running', percent: 0 },
        (p, m) => { setPct(p); setMsg(m) }
      )
      setPhase('done')
      setMsg(`Saved to ${outputPath}`)
    } catch (e) {
      setPhase('error')
      setMsg((e as Error).message)
    }
  }

  const addToQueue = async (): Promise<void> => {
    if (rangeLen <= 0) return
    const outputPath = await window.swift.saveExportDialog(`${project.name || 'export'}.mp4`)
    if (!outputPath) return
    const item: ExportQueueItem = {
      id: uid(),
      name: project.name || 'Export',
      outputPath,
      bitrateK: quality,
      rangeStart,
      rangeEnd,
      status: 'pending',
      percent: 0
    }
    setQueue((q) => [...q, item])
    setActiveTab('queue')
  }

  const runQueue = async (): Promise<void> => {
    setQueueRunning(true)
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'pending') continue
      setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'running' } : item))
      try {
        await runExport(queue[i], (p, m) => {
          setQueue((q) => q.map((item, idx) => idx === i ? { ...item, percent: p, message: m } : item))
        })
        setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'done', percent: 100 } : item))
      } catch (e) {
        setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'error', message: (e as Error).message } : item))
      }
    }
    setQueueRunning(false)
  }

  return (
    <div className="overlay" onClick={phase === 'running' || queueRunning ? undefined : onClose}>
      <div className="card export-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Export Media</h2>

        <div className="export-tabs">
          <button className={activeTab === 'single' ? 'active' : ''} onClick={() => setActiveTab('single')}>Single Export</button>
          <button className={activeTab === 'queue' ? 'active' : ''} onClick={() => setActiveTab('queue')}>
            Queue {queue.length > 0 && <span className="queue-badge">{queue.length}</span>}
          </button>
        </div>

        {activeTab === 'single' && (
          <>
            <p className="hint">
              {project.width}×{project.height} · {project.fps} fps · {rangeLen.toFixed(1)}s
              {hasRange ? ' (In → Out range)' : ''}
            </p>

            <div className="row" style={{ justifyContent: 'center' }}>
              <label style={{ width: 'auto' }}>Quality</label>
              <select value={quality} onChange={(e) => setQuality(Number(e.target.value))}>
                <option value={6000}>Good (6 Mbps)</option>
                <option value={12000}>High (12 Mbps)</option>
                <option value={24000}>Max (24 Mbps)</option>
                <option value={40000}>4K-grade (40 Mbps)</option>
              </select>
            </div>

            {phase === 'idle' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
                <button onClick={onClose}>Cancel</button>
                <button onClick={addToQueue} title="Add to export queue"><IcPlus size={12} /> Queue</button>
                <button className="primary" onClick={run}>Export Now</button>
              </div>
            )}
            {phase === 'running' && (
              <>
                <div className="progressbar"><div style={{ width: `${pct}%` }} /></div>
                <p className="hint">{msg} · {pct}%</p>
              </>
            )}
            {phase === 'done' && (
              <>
                <div className="progressbar"><div style={{ width: '100%' }} /></div>
                <p className="hint icon-inline" style={{ color: '#3fae57', justifyContent: 'center' }}><IcCheck size={14} /> {msg}</p>
                <button className="primary" onClick={onClose}>Done</button>
              </>
            )}
            {phase === 'error' && (
              <>
                <p className="hint icon-inline" style={{ color: 'var(--danger)', justifyContent: 'center' }}><IcWarn size={14} /> {msg}</p>
                <button onClick={() => setPhase('idle')}>Back</button>
              </>
            )}
          </>
        )}

        {activeTab === 'queue' && (
          <div className="export-queue">
            {queue.length === 0 ? (
              <p className="hint" style={{ textAlign: 'center', padding: 20 }}>
                No items in queue. Click "Queue" on the Single Export tab to add one.
              </p>
            ) : (
              <div className="queue-list">
                {queue.map((item, i) => (
                  <div key={item.id} className={`queue-item queue-${item.status}`}>
                    <div className="queue-item-name">{item.name}</div>
                    <div className="queue-item-path">{item.outputPath}</div>
                    {item.status === 'running' && (
                      <div className="progressbar" style={{ margin: '4px 0' }}>
                        <div style={{ width: `${item.percent}%` }} />
                      </div>
                    )}
                    <div className="queue-item-status">
                      {item.status === 'done' && <span style={{ color: '#3fae57' }}>✓ Done</span>}
                      {item.status === 'error' && <span style={{ color: 'var(--danger)' }}>✗ {item.message}</span>}
                      {item.status === 'pending' && <span style={{ opacity: 0.5 }}>Pending</span>}
                      {item.status === 'running' && <span style={{ color: '#3b82f6' }}>{item.percent}%</span>}
                      {item.status !== 'running' && (
                        <button
                          className="queue-remove"
                          onClick={() => setQueue((q) => q.filter((_, idx) => idx !== i))}
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={onClose}>Close</button>
              <button
                className="primary"
                disabled={queueRunning || queue.every((q) => q.status !== 'pending')}
                onClick={runQueue}
              >
                {queueRunning ? 'Rendering…' : 'Render Queue'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
