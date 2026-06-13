import { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '../store'
import { IcNote } from './icons'

function toTC(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const f = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(f).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

/** Premiere's Source Monitor — plays the selected asset and sets In/Out. */
export function SourceMonitor(): JSX.Element {
  const selectedAssetId = useStore((s) => s.selectedAssetId)
  const asset = useStore((s) => (selectedAssetId ? s.assets[selectedAssetId] : undefined))
  const insertAtPlayhead = useStore((s) => s.insertAtPlayhead)
  const setSourceIn = useStore((s) => s.setSourceIn)
  const setSourceOut = useStore((s) => s.setSourceOut)
  const clearSourceInOut = useStore((s) => s.clearSourceInOut)
  const sourceIn = useStore((s) => s.sourceIn)
  const sourceOut = useStore((s) => s.sourceOut)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  // Reset when asset changes (only when a different asset is selected, not on initial null mount)
  const prevAssetId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevAssetId.current === undefined) { prevAssetId.current = selectedAssetId; return }
    prevAssetId.current = selectedAssetId
    setCurrentTime(0)
    setPlaying(false)
    clearSourceInOut()
  }, [selectedAssetId])

  // Sync playing state
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [playing])

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (v) setCurrentTime(v.currentTime)
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current
    if (v) setDuration(v.duration)
  }, [])

  const handleScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * duration
    v.currentTime = Math.max(0, Math.min(duration, t))
  }, [duration])

  const handleScrubDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleScrub(e)
  }, [handleScrub])

  const setIn = (): void => {
    const v = videoRef.current
    if (v) setSourceIn(v.currentTime)
  }
  const setOut = (): void => {
    const v = videoRef.current
    if (v) setSourceOut(v.currentTime)
  }

  const markIn = sourceIn != null ? sourceIn / (duration || 1) : null
  const markOut = sourceOut != null ? sourceOut / (duration || 1) : null
  const rangeStart = markIn ?? 0
  const rangeEnd = markOut ?? 1
  const rangeDuration = sourceIn != null && sourceOut != null ? sourceOut - sourceIn : null

  if (!asset) {
    return (
      <div className="monitor">
        <div className="monitor-screen">
          <div className="monitor-placeholder">Double-click a clip in the Project panel to open in Source Monitor</div>
        </div>
        <div className="monitor-bar">
          <span className="tc-blue">Source</span>
        </div>
      </div>
    )
  }

  return (
    <div className="monitor source-monitor">
      <div className="monitor-screen sm-screen" style={{ position: 'relative' }}>
        {asset.kind === 'image' ? (
          <img src={asset.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
        ) : asset.kind === 'audio' ? (
          <div className="monitor-audio">
            {asset.waveform ? <img src={asset.waveform} alt="" style={{ width: '92%' }} /> : <IcNote size={32} />}
          </div>
        ) : (
          <video
            ref={videoRef}
            key={asset.id}
            src={asset.url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Scrub bar with in/out markers */}
      <div
        className="sm-scrub"
        onMouseDown={handleScrub}
        onMouseMove={handleScrubDrag}
        style={{ position: 'relative', height: 20, background: '#1a1a1a', cursor: 'col-resize', margin: '4px 0' }}
      >
        {/* range fill */}
        <div className="sm-range" style={{
          position: 'absolute', top: 0, height: '100%',
          left: `${rangeStart * 100}%`,
          width: `${(rangeEnd - rangeStart) * 100}%`,
          background: 'rgba(59,130,246,0.25)'
        }} />
        {/* playhead */}
        <div style={{
          position: 'absolute', top: 0, height: '100%', width: 2,
          background: '#3b82f6',
          left: `${(duration ? currentTime / duration : 0) * 100}%`,
          transform: 'translateX(-1px)'
        }} />
        {/* in marker */}
        {markIn != null && (
          <div style={{
            position: 'absolute', top: 0, height: '100%', width: 2,
            background: '#22c55e', left: `${markIn * 100}%`
          }} />
        )}
        {/* out marker */}
        {markOut != null && (
          <div style={{
            position: 'absolute', top: 0, height: '100%', width: 2,
            background: '#f97316', left: `${markOut * 100}%`
          }} />
        )}
      </div>

      {/* Transport controls */}
      <div className="sm-transport">
        <span className="sm-tc">{toTC(currentTime)}</span>
        <button className="sm-btn" title="Step back one frame (←)" onClick={() => {
          const v = videoRef.current
          if (v) { v.currentTime = Math.max(0, v.currentTime - 1 / 30) }
        }}>◁|</button>
        <button className="sm-btn" title="Play/Pause (Space / K)" onClick={() => setPlaying((p) => !p)}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="sm-btn" title="Step forward one frame (→)" onClick={() => {
          const v = videoRef.current
          if (v) { v.currentTime = Math.min(duration, v.currentTime + 1 / 30) }
        }}>|▷</button>
        <span className="sm-tc">{toTC(duration)}</span>
        <div style={{ flex: 1 }} />
        {rangeDuration != null && (
          <span className="sm-range-dur" title="Selected range duration">
            {toTC(rangeDuration)}
          </span>
        )}
      </div>

      {/* In/Out + Insert/Overwrite bar */}
      <div className="monitor-bar sm-bar">
        <span className="tc-blue sm-name">{asset.name}</span>
        <div style={{ flex: 1 }} />
        <button className="sm-edit-btn" title="Set In point (I)" onClick={setIn}>In (I)</button>
        <button className="sm-edit-btn" title="Set Out point (O)" onClick={setOut}>Out (O)</button>
        <button className="sm-edit-btn danger-text" title="Clear In/Out" onClick={clearSourceInOut}>×</button>
        <button
          className="sm-edit-btn accent"
          disabled={!asset}
          title="Insert at playhead (,)"
          onClick={() => asset && insertAtPlayhead(asset.id, 'insert')}
        >Insert ,</button>
        <button
          className="sm-edit-btn"
          disabled={!asset}
          title="Overwrite at playhead (.)"
          onClick={() => asset && insertAtPlayhead(asset.id, 'overwrite')}
        >Overwrite .</button>
      </div>
    </div>
  )
}
