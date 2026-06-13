import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { CaptionCue, Clip, Marker, MediaAsset, Track, TrackHeightPreset } from '../../../shared/types'
import { LABEL_COLORS } from '../../../shared/types'
import type { MediaPool } from '../engine/compositor'
import { retimeCueText } from '../engine/captions'
import { IcMagnet, IcMarker, IcZoom, IcLock, IcUnlock, IcEye, IcLink } from './icons'
import { getDragAsset, setPendingDropTime } from '../lib/dragMedia'

const HEAD_W = 110
const RULER_H = 26
const SNAP_PX = 8
/** Height of the caption track row shown above the video tracks. */
const CAP_TRACK_H = 26
// Stable empty fallback — a fresh `[]` in a zustand selector returns a new
// reference every render and triggers an infinite useSyncExternalStore loop.
const NO_MARKERS: Marker[] = []

const HEIGHT_PRESET_PX: Record<TrackHeightPreset, number> = {
  small: 28,
  medium: 52,
  large: 80,
  expanded: 120
}
const trackHeight = (t: Track): number => {
  if (t.heightPreset) return HEIGHT_PRESET_PX[t.heightPreset]
  return t.kind === 'audio' ? 52 : 64
}

function snapTimes(exceptIds?: ReadonlySet<string>): number[] {
  const s = useStore.getState()
  const times = [0, s.playhead]
  if (s.inPoint != null) times.push(s.inPoint)
  if (s.outPoint != null) times.push(s.outPoint)
  for (const m of s.project.markers ?? []) times.push(m.time)
  for (const t of s.project.tracks)
    for (const c of t.clips) {
      if (exceptIds?.has(c.id)) continue
      times.push(c.start, c.start + c.duration)
    }
  return times
}

/** Snap a [time, time+dur] block to nearby edit points; returns the new start. */
function snapBlock(time: number, dur: number, zoom: number, exceptIds?: ReadonlySet<string>): number {
  const st = useStore.getState()
  if (!st.snapping) {
    st.setSnapLine(null)
    return time
  }
  let best = time
  let bestD = SNAP_PX / zoom
  let snapped: number | null = null
  for (const c of snapTimes(exceptIds)) {
    const d = Math.abs(c - time)
    if (d < bestD) { bestD = d; best = c; snapped = c }
    const dEnd = Math.abs(c - (time + dur))
    if (dEnd < bestD) { bestD = dEnd; best = c - dur; snapped = c }
  }
  st.setSnapLine(snapped)
  return Math.max(0, best)
}

/** The (single) timeline's track row under a given screen Y, via data-track-id. */
function trackAtY(clientY: number): Track | null {
  for (const el of document.querySelectorAll<HTMLElement>('.tl-track')) {
    const r = el.getBoundingClientRect()
    if (clientY >= r.top && clientY <= r.bottom) {
      return useStore.getState().project.tracks.find((t) => t.id === el.dataset.trackId) ?? null
    }
  }
  return null
}

/** True when Y is inside the timeline scroll area but below the last track row. */
function isBelowTracks(clientY: number): boolean {
  const scroll = document.querySelector<HTMLElement>('.tl-scroll')
  if (!scroll) return false
  const r = scroll.getBoundingClientRect()
  if (clientY < r.top || clientY > r.bottom) return false
  const rows = scroll.querySelectorAll<HTMLElement>('.tl-track')
  const last = rows[rows.length - 1]
  return last ? clientY > last.getBoundingClientRect().bottom : false
}

function fmtTC(t: number, fps: number): string {
  const f = Math.floor((t % 1) * fps)
  const sec = Math.floor(t) % 60
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const p = (n: number): string => n.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(sec)}:${p(f)}`
}

interface CtxMenu {
  x: number
  y: number
  clipId: string | null
  trackId: string | null
}

interface Marquee {
  x1: number; y1: number; x2: number; y2: number
}

/** Preview rectangle shown while dragging media over the timeline. */
interface DropGhost {
  left: number
  top: number
  width: number
  height: number
  newTrack: boolean
  label: string
}

export function Timeline({
  poolRef: _poolRef
}: {
  poolRef: MutableRefObject<MediaPool | null>
}): JSX.Element {
  const tracks = useStore((s) => s.project.tracks)
  const fps = useStore((s) => s.project.fps)
  const playhead = useStore((s) => s.playhead)
  const zoom = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)
  const duration = useStore((s) => {
    let end = 0
    for (const t of s.project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
    for (const cue of s.project.captions) end = Math.max(end, cue.end)
    return end
  })
  const snapping = useStore((s) => s.snapping)
  const toggleSnapping = useStore((s) => s.toggleSnapping)
  const linkedSelection = useStore((s) => s.linkedSelection)
  const toggleLinkedSelection = useStore((s) => s.toggleLinkedSelection)
  const addTrack = useStore((s) => s.addTrack)
  const tool = useStore((s) => s.tool)
  const snapLine = useStore((s) => s.snapLine)
  const markers = useStore((s) => s.project.markers ?? NO_MARKERS)
  const inPoint = useStore((s) => s.inPoint)
  const outPoint = useStore((s) => s.outPoint)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<CtxMenu | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const marqueeAnchor = useRef<{ x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<DropGhost | null>(null)

  const cueCount = useStore((s) => s.project.captions.length)
  const capH = cueCount > 0 ? CAP_TRACK_H : 0

  const contentSeconds = Math.max(duration + 5, 20)
  const contentWidth = HEAD_W + contentSeconds * zoom
  const tracksHeight = tracks.reduce((acc, t) => acc + trackHeight(t), 0) + capH

  const pxToTime = useCallback(
    (clientX: number): number => {
      const el = scrollRef.current!
      const rect = el.getBoundingClientRect()
      return Math.max(0, (clientX - rect.left + el.scrollLeft - HEAD_W) / zoom)
    },
    [zoom]
  )

  // Alt+wheel = zoom centered on cursor
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.altKey) return
      e.preventDefault()
      const s = useStore.getState()
      const tAtCursor = (e.clientX - el.getBoundingClientRect().left + el.scrollLeft - HEAD_W) / s.zoom
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
      const newZoom = Math.min(800, Math.max(4, s.zoom * factor))
      s.setZoom(newZoom)
      el.scrollLeft = tAtCursor * newZoom - (e.clientX - el.getBoundingClientRect().left - HEAD_W)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const niceStep = (() => {
    const raw = 90 / zoom
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    return steps.find((s) => s >= raw) ?? 600
  })()
  const ticks: number[] = []
  for (let t = 0; t <= contentSeconds; t += niceStep) ticks.push(t)

  // ── drag-over ghost + drop handling for bin assets & OS files ──
  const updateGhost = useCallback(
    (e: React.DragEvent): void => {
      const asset = getDragAsset()
      const dur = asset ? (asset.kind === 'image' ? 5 : asset.duration) : 5
      const kind: 'audio' | 'video' = asset?.kind === 'audio' ? 'audio' : 'video'
      const t = snapBlock(pxToTime(e.clientX), dur, zoom)
      const st = useStore.getState()

      // land on the hovered row when compatible, else the default target
      // track, else a "new track" strip below the existing rows
      const hovered = trackAtY(e.clientY)
      let target: Track | null = hovered && hovered.kind === kind && !hovered.locked ? hovered : null
      let newTrack = false
      if (!target) {
        if (isBelowTracks(e.clientY)) newTrack = true
        else target = st.project.tracks.find((tr) => tr.kind === kind && !tr.locked) ?? null
      }
      const ghostCapH = st.project.captions.length > 0 ? CAP_TRACK_H : 0
      let top = RULER_H + ghostCapH
      let height = 36
      if (newTrack) {
        top = RULER_H + ghostCapH + st.project.tracks.reduce((a, tr) => a + trackHeight(tr), 0)
        height = kind === 'audio' ? 52 : 64
      } else if (target) {
        for (const tr of st.project.tracks) {
          if (tr.id === target.id) break
          top += trackHeight(tr)
        }
        height = trackHeight(target)
      } else {
        setGhost(null)
        return
      }
      setGhost({
        left: HEAD_W + t * zoom,
        top: top + 2,
        height: height - 4,
        width: Math.max(8, dur * zoom),
        newTrack,
        label: asset?.name ?? ''
      })
    },
    [pxToTime, zoom]
  )

  const onTimelineDragOver = (e: React.DragEvent): void => {
    const isAsset = e.dataTransfer.types.includes('application/x-swift-asset')
    const isFiles = e.dataTransfer.types.includes('Files')
    if (!isAsset && !isFiles) return
    e.preventDefault()
    if (isAsset) e.stopPropagation()
    updateGhost(e)
  }

  const onTimelineDrop = (e: React.DragEvent): void => {
    setGhost(null)
    useStore.getState().setSnapLine(null)
    const id = e.dataTransfer.getData('application/x-swift-asset')
    if (!id) {
      // OS file drop: note where it landed, then let the window importer run
      if (e.dataTransfer.types.includes('Files')) setPendingDropTime(pxToTime(e.clientX))
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    const asset = st.assets[id]
    if (!asset) return
    const kind: 'audio' | 'video' = asset.kind === 'audio' ? 'audio' : 'video'
    const dur = asset.kind === 'image' ? 5 : asset.duration
    const t = snapBlock(pxToTime(e.clientX), dur, zoom)
    const hovered = trackAtY(e.clientY)
    let targetId = hovered && hovered.kind === kind && !hovered.locked ? hovered.id : undefined
    if (!hovered && isBelowTracks(e.clientY)) targetId = st.addTrack(kind)
    st.addLinkedClipsFromAsset(id, t, targetId)
    // dropping over existing clips overwrites them, like Premiere
    useStore.getState().resolveOverwrite(useStore.getState().selectedClipIds)
  }

  // click in empty track space: select the gap between clips (Premiere-style)
  const selectGapOrClear = (clientX: number, clientY: number): void => {
    const st = useStore.getState()
    const tr = trackAtY(clientY)
    if (tr && !tr.locked) {
      const t = pxToTime(clientX)
      let prevEnd = 0
      let nextStart = Infinity
      let inside = false
      for (const c of tr.clips) {
        const cEnd = c.start + c.duration
        if (t >= c.start - 1e-6 && t <= cEnd + 1e-6) inside = true
        if (cEnd <= t && cEnd > prevEnd) prevEnd = cEnd
        if (c.start >= t && c.start < nextStart) nextStart = c.start
      }
      if (!inside && Number.isFinite(nextStart) && nextStart - prevEnd > 0.01) {
        st.setSelectedGap({ trackId: tr.id, start: prevEnd, end: nextStart })
        return
      }
    }
    st.select(null)
  }

  const scrubFromRuler = (e: React.PointerEvent): void => {
    const set = (clientX: number): void => useStore.getState().setPlayhead(pxToTime(clientX))
    set(e.clientX)
    const move = (ev: PointerEvent): void => set(ev.clientX)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Marquee drag on the track area (not on a clip)
  const onTracksAreaDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.clip, .track-head, .cap-clip')) return
    marqueeAnchor.current = { x: e.clientX, y: e.clientY }
    let moved = false

    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - marqueeAnchor.current!.x
      const dy = ev.clientY - marqueeAnchor.current!.y
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      moved = true
      setMarquee({
        x1: Math.min(marqueeAnchor.current!.x, ev.clientX),
        y1: Math.min(marqueeAnchor.current!.y, ev.clientY),
        x2: Math.max(marqueeAnchor.current!.x, ev.clientX),
        y2: Math.max(marqueeAnchor.current!.y, ev.clientY)
      })
    }

    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved && marqueeAnchor.current) {
        const mx1 = Math.min(marqueeAnchor.current.x, ev.clientX)
        const mx2 = Math.max(marqueeAnchor.current.x, ev.clientX)
        const my1 = Math.min(marqueeAnchor.current.y, ev.clientY)
        const my2 = Math.max(marqueeAnchor.current.y, ev.clientY)
        selectClipsInRect(mx1, mx2, my1, my2)
      } else {
        selectGapOrClear(ev.clientX, ev.clientY)
      }
      setMarquee(null)
      marqueeAnchor.current = null
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const selectClipsInRect = (mx1: number, mx2: number, my1: number, my2: number): void => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scrollLeft = el.scrollLeft

    // compute screen Y offset of each track (caption row sits above them)
    const st = useStore.getState()
    let yOff = rect.top + RULER_H + (st.project.captions.length > 0 ? CAP_TRACK_H : 0)
    const ids: string[] = []

    for (const track of st.project.tracks) {
      const th = trackHeight(track)
      const trackTop = yOff
      const trackBot = yOff + th
      yOff += th

      for (const clip of track.clips) {
        const clipLeft = rect.left + HEAD_W + clip.start * zoom - scrollLeft
        const clipRight = clipLeft + clip.duration * zoom
        const clipTop = trackTop + 3
        const clipBot = trackBot - 3

        // overlap check
        if (clipRight > mx1 && clipLeft < mx2 && clipBot > my1 && clipTop < my2) {
          ids.push(clip.id)
        }
      }
    }

    if (ids.length > 0) {
      st.setSelectedClipIds(ids)
    } else {
      st.select(null)
    }
  }

  const toolClass =
    tool === 'razor' ? 'razor-cursor'
    : tool === 'hand' ? 'hand-cursor'
    : tool === 'zoom' ? 'zoom-cursor'
    : tool === 'rolling' ? 'rolling-cursor'
    : tool === 'slip' ? 'slip-cursor'
    : tool === 'slide' ? 'slide-cursor'
    : ''

  return (
    <div className={`timeline ${toolClass}`} onClick={() => menu && setMenu(null)}>
      <div className="tl-toolbar">
        <span className="tc-main">{fmtTC(playhead, fps)}</span>
        <button
          className={`iconbtn ${snapping ? 'active' : ''}`}
          onClick={toggleSnapping}
          title="Snap (S)"
        ><IcMagnet /></button>
        <button
          className={`iconbtn ${linkedSelection ? 'active' : ''}`}
          onClick={toggleLinkedSelection}
          title={linkedSelection
            ? 'Linked Selection: ON — clicking a clip selects its A/V pair; click it again to isolate just the audio or video, then Delete'
            : 'Linked Selection: OFF — audio and video are always selected and edited independently'}
        ><IcLink /></button>
        <button
          className="iconbtn"
          onClick={() => useStore.getState().addMarker(useStore.getState().playhead)}
          title="Add Marker (M)"
        ><IcMarker /></button>
        <div className="spacer" />
        <button className="tl-add-track-btn" onClick={() => addTrack('video')} title="Add video track">+ Video</button>
        <button className="tl-add-track-btn" onClick={() => addTrack('audio')} title="Add audio track">+ Audio</button>
        <button className="tl-add-track-btn" onClick={() => useStore.getState().addAdjustmentLayer()} title="Add adjustment layer">+ Adj</button>
        <div style={{ width: 10 }} />
        <span className="dim icon-inline"><IcZoom size={13} /></span>
        <input
          type="range"
          min={4}
          max={500}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          onDoubleClick={() => setZoom(80)}
          title="Zoom (double-click to reset)"
          style={{ width: 100 }}
        />
        <span className="zoom-label">{Math.round(zoom)}px/s</span>
      </div>

      <div
        className="tl-scroll"
        ref={scrollRef}
        onDragOver={onTimelineDragOver}
        onDrop={onTimelineDrop}
        onDragLeave={(e) => {
          if (!scrollRef.current?.contains(e.relatedTarget as Node)) {
            setGhost(null)
            useStore.getState().setSnapLine(null)
          }
        }}
      >
        <div className="tl-inner" style={{ width: contentWidth }}>
          <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={scrubFromRuler}>
            {inPoint != null && outPoint != null && outPoint > inPoint && (
              <div
                className="inout-range"
                style={{ left: HEAD_W + inPoint * zoom, width: (outPoint - inPoint) * zoom }}
              />
            )}
            {ticks.map((t) => (
              <div key={t} className="tl-tick" style={{ left: HEAD_W + t * zoom }}>
                {fmtTick(t)}
              </div>
            ))}
            {markers.map((m) => (
              <div
                key={m.id}
                className="tl-marker"
                style={{ left: HEAD_W + m.time * zoom, background: m.color }}
                title="Marker — double-click to remove"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  useStore.getState().setPlayhead(m.time)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  useStore.getState().removeMarker(m.id)
                }}
              />
            ))}
            {inPoint != null && <div className="inout-flag in" style={{ left: HEAD_W + inPoint * zoom }}>{'{'}</div>}
            {outPoint != null && <div className="inout-flag out" style={{ left: HEAD_W + outPoint * zoom }}>{'}'}</div>}
          </div>

          <div className="tl-tracks" onPointerDown={onTracksAreaDown}>
            <CaptionTrackRow zoom={zoom} />
            {tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                zoom={zoom}
                pxToTime={pxToTime}
                openMenu={(m) => setMenu(m)}
              />
            ))}
            {tracks.every((t) => t.clips.length === 0) && (
              <div className="tl-empty-hint">Drop media here or drag from the bin</div>
            )}
          </div>

          {ghost && (
            <div
              className={`drop-ghost ${ghost.newTrack ? 'new-track' : ''}`}
              style={{ left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height }}
            >
              {ghost.label && <span className="drop-ghost-label">{ghost.label}</span>}
              {ghost.newTrack && <span className="drop-ghost-new">New track</span>}
            </div>
          )}

          <div className="playhead" style={{ left: HEAD_W + playhead * zoom, height: RULER_H + tracksHeight }} />
          {snapLine != null && (
            <div className="snap-line" style={{ left: HEAD_W + snapLine * zoom, height: RULER_H + tracksHeight }} />
          )}
        </div>
      </div>

      {marquee && (
        <div
          className="marquee-rect"
          style={{ left: marquee.x1, top: marquee.y1, width: marquee.x2 - marquee.x1, height: marquee.y2 - marquee.y1 }}
        />
      )}

      {menu && <ContextMenu menu={menu} close={() => setMenu(null)} />}
    </div>
  )
}

function fmtTick(t: number): string {
  if (t < 60) return `${t}s`
  const m = Math.floor(t / 60)
  const s = Math.round(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ContextMenu({ menu, close }: { menu: CtxMenu; close: () => void }): JSX.Element {
  const s = useStore.getState()
  const hasClip = !!menu.clipId
  const found = menu.clipId ? s.clipById(menu.clipId) : undefined
  const clip = found?.clip
  const track = found?.track
  const canPaste = !!s.clipboard
  const allClips = s.project.tracks.flatMap((t) => t.clips)
  const isLinked = !!clip?.linkedGroupId
  const trackCount = s.project.tracks.length

  const item = (label: string, run: () => void, disabled = false, accel = '', danger = false): JSX.Element => (
    <button
      key={label}
      className={`menu-item${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={() => { close(); run() }}
    >
      <span>{label}</span>
      {accel && <span className="accel">{accel}</span>}
    </button>
  )

  return (
    <div
      className="menu-drop ctx"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Clipboard */}
      {hasClip && item('Cut', () => { s.select(menu.clipId!); s.cutSelected() }, false, '⌘X')}
      {hasClip && item('Copy', () => { s.select(menu.clipId!); s.copySelected() }, false, '⌘C')}
      {item('Paste at Playhead', () => s.pasteAtPlayhead(), !canPaste, '⌘V')}

      <div className="menu-sep" />

      {/* Edit operations on clip */}
      {hasClip && item('Split at Playhead', () => { s.splitAt(s.playhead, track?.id) }, false, '⌘K')}
      {hasClip && item('Ripple Delete', () => s.rippleDelete(menu.clipId!), false, '⇧⌫', true)}
      {hasClip && item('Delete', () => s.removeClip(menu.clipId!), false, '⌫', true)}
      {hasClip && isLinked && track?.kind === 'video' && item('Delete Video Only', () => s.removeClipOnly(menu.clipId!), false, '', true)}
      {hasClip && isLinked && track?.kind === 'audio' && item('Delete Audio Only', () => s.removeClipOnly(menu.clipId!), false, '', true)}
      {menu.trackId && !hasClip && trackCount > 2 && item('Delete Track', () => s.removeTrack(menu.trackId!), false, '', true)}

      <div className="menu-sep" />

      {/* Transitions */}
      {hasClip && item('Apply Default Transition', () => { s.select(menu.clipId!); s.applyDefaultTransition() }, false, '⌘D')}
      {hasClip && clip?.inTransition && item('Remove Transition', () => s.setTransition(menu.clipId!, undefined))}

      {/* Ripple trim */}
      {hasClip && <div className="menu-sep" />}
      {hasClip && item('Ripple Trim Previous to Here', () => s.rippleTrimEdit('prev'), false, 'Q')}
      {hasClip && item('Ripple Trim Next to Here', () => s.rippleTrimEdit('next'), false, 'W')}

      <div className="menu-sep" />

      {/* Selection */}
      {allClips.length > 0 && item('Select All', () => s.setSelectedClipIds(allClips.map((c) => c.id)), false, '⌘A')}
      {s.selectedClipIds.length > 0 && item('Deselect All', () => s.select(null), false, 'Esc')}

      {/* Label colors */}
      {hasClip && <div className="menu-sep" />}
      {hasClip && (
        <div className="menu-item menu-item-labels" style={{ cursor: 'default' }}>
          <span style={{ marginRight: 6, opacity: 0.6, fontSize: 10 }}>Label</span>
          {LABEL_COLORS.map((lc) => (
            <button
              key={lc.id}
              className="menu-label-chip"
              style={{ background: lc.color, outline: clip?.labelColor === lc.id ? '2px solid white' : 'none' }}
              title={lc.label}
              onClick={() => { close(); s.setClipLabel(menu.clipId!, lc.id) }}
            />
          ))}
          {clip?.labelColor && (
            <button className="menu-label-chip-clear" title="Clear label" onClick={() => { close(); s.setClipLabel(menu.clipId!, undefined) }}>×</button>
          )}
        </div>
      )}

      {/* Track height */}
      {menu.trackId && <div className="menu-sep" />}
      {menu.trackId && (
        <div className="menu-item menu-sub-head" style={{ cursor: 'default', opacity: 0.6, fontSize: 10 }}>Track Height</div>
      )}
      {menu.trackId && (['small', 'medium', 'large', 'expanded'] as TrackHeightPreset[]).map((p) =>
        item(p.charAt(0).toUpperCase() + p.slice(1), () => s.setTrackHeight(menu.trackId!, p))
      )}

      {/* Track-level */}
      {menu.trackId && !hasClip && <div className="menu-sep" />}
      {menu.trackId && !hasClip && item('Add Marker Here', () => s.addMarker(s.playhead), false, 'M')}
      {menu.trackId && !hasClip && item('Paste at Playhead', () => s.pasteAtPlayhead(), !canPaste, '⌘V')}
    </div>
  )
}

function TrackRow({
  track,
  zoom,
  pxToTime,
  openMenu
}: {
  track: Track
  zoom: number
  pxToTime: (x: number) => number
  openMenu: (m: CtxMenu) => void
}): JSX.Element {
  const toggleMute = useStore((s) => s.toggleTrackMute)
  const toggleHidden = useStore((s) => s.toggleTrackHidden)
  const toggleLock = useStore((s) => s.toggleTrackLock)
  const removeTrack = useStore((s) => s.removeTrack)
  const renameTrack = useStore((s) => s.renameTrack)
  const setTargetTrack = useStore((s) => s.setTargetTrack)
  const canDelete = useStore((s) => s.project.tracks.length > 2)
  const targeted = useStore((s) =>
    track.kind === 'video'
      ? (s.targetVideoTrackId ?? s.project.tracks.find((t) => t.kind === 'video')?.id) === track.id
      : (s.targetAudioTrackId ?? s.project.tracks.find((t) => t.kind === 'audio')?.id) === track.id
  )
  const gap = useStore((s) => (s.selectedGap?.trackId === track.id ? s.selectedGap : null))
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(track.name)
  const nameRef = useRef<HTMLInputElement>(null)

  const commitRename = (): void => {
    setRenaming(false)
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== track.name) renameTrack(track.id, trimmed)
    else setDraftName(track.name)
  }

  return (
    <div
      className={`tl-track ${track.kind} ${track.locked ? 'locked' : ''} ${track.hidden ? 'hidden-track' : ''} ${track.muted ? 'muted-track' : ''}`}
      data-track-id={track.id}
      style={{ height: trackHeight(track) }}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu({ x: e.clientX, y: e.clientY, clipId: null, trackId: track.id })
      }}
    >
      <div className="track-head">
        <div className="track-head-row">
          {renaming ? (
            <input
              ref={nameRef}
              className="track-rename-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(false); setDraftName(track.name) } }}
              autoFocus
            />
          ) : (
            <button
              className={`tgt ${targeted ? 'on' : ''}`}
              title="Click to target — double-click to rename"
              onClick={() => setTargetTrack(track.kind, track.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setDraftName(track.name); setRenaming(true) }}
            >
              {track.name}
            </button>
          )}
          <button
            className={`thbtn ${track.locked ? 'active' : ''}`}
            title="Lock track"
            onClick={() => toggleLock(track.id)}
          >
            {track.locked ? <IcLock size={11} /> : <IcUnlock size={11} />}
          </button>
        </div>
        <div className="track-head-row">
          {track.kind === 'video' ? (
            <button
              className={`thbtn ${track.hidden ? 'active' : ''}`}
              title="Toggle track output"
              onClick={() => toggleHidden(track.id)}
            ><IcEye size={11} /></button>
          ) : (
            <button
              className={`thbtn ${track.muted ? 'active' : ''}`}
              title="Mute"
              onClick={() => toggleMute(track.id)}
            >M</button>
          )}
          {track.kind === 'video' && (
            <button
              className={`thbtn ${track.muted ? 'active' : ''}`}
              title="Mute clip audio"
              onClick={() => toggleMute(track.id)}
            >M</button>
          )}
          {canDelete && (
            <button
              className="thbtn track-del"
              title="Delete track"
              onClick={() => removeTrack(track.id)}
            >×</button>
          )}
        </div>
      </div>

      {gap && (
        <div
          className="gap-selected"
          style={{ left: HEAD_W + gap.start * zoom, width: Math.max(2, (gap.end - gap.start) * zoom) }}
          title="Selected gap — press Delete to close it"
        />
      )}

      {track.clips.map((clip) => (
        <ClipView key={clip.id} clip={clip} track={track} zoom={zoom} pxToTime={pxToTime} openMenu={openMenu} />
      ))}
    </div>
  )
}

/** Premiere-style caption track pinned above the video tracks. */
function CaptionTrackRow({ zoom }: { zoom: number }): JSX.Element | null {
  const cues = useStore((s) => s.project.captions)
  if (cues.length === 0) return null
  return (
    <div className="tl-captrack" style={{ height: CAP_TRACK_H }}>
      <div className="track-head captrack-head">
        <span className="cc-chip">CC</span>
        <span className="captrack-name">Captions</span>
      </div>
      {cues.map((cue) => (
        <CaptionBlock key={cue.id} cue={cue} zoom={zoom} />
      ))}
    </div>
  )
}

function CaptionBlock({ cue, zoom }: { cue: CaptionCue; zoom: number }): JSX.Element {
  const selected = useStore((s) => s.selectedCueId === cue.id)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(cue.text)

  const left = HEAD_W + cue.start * zoom
  const width = Math.max(8, (cue.end - cue.start) * zoom)

  const commitText = (): void => {
    setEditing(false)
    const next = text.trim()
    if (next && next !== cue.text) {
      const st = useStore.getState()
      st.record('Edit text')
      const retimed = retimeCueText(cue, next)
      st.updateCue(cue.id, { text: retimed.text, words: retimed.words })
    }
  }

  const onDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || editing) return
    e.stopPropagation()
    const st = useStore.getState()
    st.selectCue(cue.id)
    st.setPlayhead(Math.max(cue.start + 0.01, Math.min(cue.end - 0.01, st.playhead)))
    const startX = e.clientX
    const orig = cue.start
    const dur = cue.end - cue.start
    let recorded = false
    const move = (ev: PointerEvent): void => {
      if (!recorded) {
        if (Math.abs(ev.clientX - startX) < 4) return
        useStore.getState().record('Move caption')
        recorded = true
      }
      const dt = (ev.clientX - startX) / zoom
      const ns = snapBlock(Math.max(0, orig + dt), dur, zoom)
      useStore.getState().moveCue(cue.id, ns)
    }
    const up = (): void => {
      useStore.getState().setSnapLine(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onTrim =
    (edge: 'start' | 'end') =>
    (e: React.PointerEvent): void => {
      e.stopPropagation()
      useStore.getState().selectCue(cue.id)
      const startX = e.clientX
      const origT = edge === 'start' ? cue.start : cue.end
      let recorded = false
      const move = (ev: PointerEvent): void => {
        if (!recorded) {
          if (Math.abs(ev.clientX - startX) < 3) return
          useStore.getState().record('Trim caption')
          recorded = true
        }
        useStore.getState().trimCue(cue.id, edge, origT + (ev.clientX - startX) / zoom)
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  return (
    <div
      className={`cap-clip ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      title={`${cue.text}\nDouble-click to edit text`}
      onPointerDown={onDown}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setText(cue.text)
        setEditing(true)
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="cap-clip-edit"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { setText(cue.text); setEditing(false) }
          }}
        />
      ) : (
        <span className="cap-clip-label">{cue.text}</span>
      )}
      <div className="trim l" onPointerDown={onTrim('start')} />
      <div className="trim r" onPointerDown={onTrim('end')} />
    </div>
  )
}

/** Per-clip video frame strip: draws the correct source frames at each zoom level. */
function VideoFrameStrip({
  asset,
  width,
  height
}: {
  asset: MediaAsset
  clip: Clip
  width: number
  height: number
}): JSX.Element | null {
  // Premiere's default: a crisp head thumbnail pinned at the clip start and a
  // tail thumbnail pinned at the end, with the clip's body colour between them.
  // Each thumbnail is sized purely by track height × the frame's aspect ratio,
  // so it never stretches as you zoom — only the colour gap in the middle grows.
  const src = asset.thumbnail ?? asset.filmstrip
  const [aspect, setAspect] = useState(16 / 9)

  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
    }
    img.src = src
  }, [src])

  if (!src) return null
  const thumbW = Math.max(1, height * aspect)
  const showTail = width >= thumbW * 2.3
  const thumbStyle = { width: thumbW, backgroundImage: `url(${src})` }

  return (
    <div className="frame-strip">
      <div className="frame-thumb head" style={thumbStyle} />
      {showTail && <div className="frame-thumb tail" style={thumbStyle} />}
    </div>
  )
}

/** Premiere-style audio clip body: waveform + gain rubber band + fade handles. */
function AudioClipBody({
  asset,
  clip,
  width,
  height,
  onFadeDrag,
  onGainDrag
}: {
  asset: MediaAsset
  clip: Clip
  width: number
  height: number
  onFadeDrag: (edge: 'in' | 'out', e: React.PointerEvent) => void
  onGainDrag: (e: React.PointerEvent) => void
}): JSX.Element {
  const waveRef = useRef<HTMLCanvasElement>(null)

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = waveRef.current
    const peaks = asset.peaks
    if (!canvas || !peaks?.length) return
    const w = Math.max(1, Math.min(8192, width))
    const h = Math.max(1, height)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    const assetDur = asset.duration || clip.duration
    const mid = h / 2
    ctx.fillStyle = 'rgba(82, 198, 162, 0.9)'
    for (let x = 0; x < w; x++) {
      const t = clip.in + (x / w) * clip.duration
      const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor((t / assetDur) * peaks.length)))
      const amp = Math.pow(peaks[idx] ?? 0, 0.75)
      const bh = Math.max(1, amp * (h * 0.72))
      ctx.fillRect(x, mid - bh / 2, 1, bh)
    }
  }, [asset.peaks, asset.duration, clip.in, clip.duration, width, height])

  const gainDb = clip.clipGain ?? 0
  // Map dB to vertical position: 0dB = center, +6dB = 20% from top, -inf = bottom
  const gainLinear = Math.pow(10, gainDb / 20)
  const gainY = Math.round(height * (1 - Math.min(1, gainLinear * 0.5 + 0.2)))
  const fadeInPx = Math.round((clip.fadeIn ?? 0) * (width / clip.duration))
  const fadeOutPx = Math.round((clip.fadeOut ?? 0) * (width / clip.duration))
  const HANDLE_W = 14

  return (
    <div className="audio-clip-body" style={{ width, height }}>
      {/* waveform */}
      <canvas ref={waveRef} className="audio-wave" />

      {/* fade-in overlay */}
      {fadeInPx > 0 && (
        <svg className="fade-overlay fade-in" width={fadeInPx} height={height}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <defs>
            <linearGradient id={`fi-${clip.id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width={fadeInPx} height={height} fill={`url(#fi-${clip.id})`} />
          <line x1="0" y1={height} x2={fadeInPx} y2={gainY} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        </svg>
      )}

      {/* fade-out overlay */}
      {fadeOutPx > 0 && (
        <svg className="fade-overlay fade-out" width={fadeOutPx} height={height}
          style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none' }}>
          <defs>
            <linearGradient id={`fo-${clip.id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <rect width={fadeOutPx} height={height} fill={`url(#fo-${clip.id})`} />
          <line x1="0" y1={gainY} x2={fadeOutPx} y2={height} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        </svg>
      )}

      {/* gain rubber band */}
      <svg className="gain-band" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        width={width} height={height}>
        <line
          x1={fadeInPx} y1={gainY} x2={width - fadeOutPx} y2={gainY}
          stroke="#ffe066" strokeWidth="1.5" strokeLinecap="round"
        />
      </svg>

      {/* gain drag area (invisible wide hit target over the rubber band) */}
      <div
        className="gain-drag"
        style={{ position: 'absolute', left: fadeInPx, right: fadeOutPx,
          top: Math.max(0, gainY - 6), height: 12, cursor: 'ns-resize' }}
        onPointerDown={onGainDrag}
      />

      {/* fade-in handle */}
      <div
        className="fade-handle fade-handle-in"
        style={{ position: 'absolute', left: Math.max(0, fadeInPx - HANDLE_W / 2), top: 0,
          width: HANDLE_W, height: HANDLE_W, cursor: 'ew-resize' }}
        onPointerDown={(e) => { e.stopPropagation(); onFadeDrag('in', e) }}
        title="Drag to set fade-in"
      />
      {/* fade-out handle */}
      <div
        className="fade-handle fade-handle-out"
        style={{ position: 'absolute', right: Math.max(0, fadeOutPx - HANDLE_W / 2), top: 0,
          width: HANDLE_W, height: HANDLE_W, cursor: 'ew-resize' }}
        onPointerDown={(e) => { e.stopPropagation(); onFadeDrag('out', e) }}
        title="Drag to set fade-out"
      />
    </div>
  )
}

function ClipView({
  clip,
  track,
  zoom,
  pxToTime,
  openMenu
}: {
  clip: Clip
  track: Track
  zoom: number
  pxToTime: (x: number) => number
  openMenu: (m: CtxMenu) => void
}): JSX.Element {
  const selected = useStore((s) => s.selectedClipIds.includes(clip.id))
  const asset = useStore((s) => s.assets[clip.assetId])
  const select = useStore((s) => s.select)
  const toggleSelectClip = useStore((s) => s.toggleSelectClip)
  const setSelectedClipIds = useStore((s) => s.setSelectedClipIds)
  const selectAsset = useStore((s) => s.selectAsset)
  const moveClip = useStore((s) => s.moveClip)
  const trimClip = useStore((s) => s.trimClip)
  const setClipGain = useStore((s) => s.setClipGain)
  const setClipFade = useStore((s) => s.setClipFade)

  const left = clip.start * zoom
  const width = Math.max(6, clip.duration * zoom)
  const hasKf = Object.values(clip.keyframes).some((arr) => arr.length > 0)
  const isLinked = !!clip.linkedGroupId

  const onBodyDown = (e: React.PointerEvent): void => {
    if (e.button === 2) return
    e.stopPropagation()
    const st = useStore.getState()

    if (st.tool === 'razor') { st.splitAt(pxToTime(e.clientX), track.id); return }
    if (st.tool === 'zoom') { st.setZoom(e.altKey ? st.zoom / 1.5 : st.zoom * 1.5); return }

    // Rolling edit: drag the end of the clip before or start of the clip after
    if (st.tool === 'rolling') {
      select(clip.id)
      const sorted = track.clips.slice().sort((a, b) => a.start - b.start)
      const idx = sorted.findIndex((c) => c.id === clip.id)
      const prevClip = idx > 0 ? sorted[idx - 1] : null
      if (!prevClip) return
      const startX = e.clientX
      let recorded = false
      const move = (ev: PointerEvent): void => {
        const d = (ev.clientX - startX) / zoom
        if (!recorded && Math.abs(d) > 0.5 / zoom) { useStore.getState().record('Rolling edit'); recorded = true }
        if (recorded) useStore.getState().rollingTrim(prevClip.id, clip.id, d)
      }
      const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }

    // Slip: shift source in/out without moving clip on timeline
    if (st.tool === 'slip') {
      select(clip.id)
      const startX = e.clientX
      let recorded = false
      const move = (ev: PointerEvent): void => {
        const d = (ev.clientX - startX) / zoom
        if (!recorded && Math.abs(d) > 0.5 / zoom) { useStore.getState().record('Slip clip'); recorded = true }
        if (recorded) useStore.getState().slipClip(clip.id, d)
      }
      const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }

    // Slide: move clip, trimming neighbors
    if (st.tool === 'slide') {
      select(clip.id)
      const startX = e.clientX
      let recorded = false
      const move = (ev: PointerEvent): void => {
        const d = (ev.clientX - startX) / zoom
        if (!recorded && Math.abs(d) > 0.5 / zoom) { useStore.getState().record('Slide clip'); recorded = true }
        if (recorded) useStore.getState().slideClip(clip.id, d)
      }
      const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }

    // Shift+click = multi-select
    if (e.shiftKey) {
      toggleSelectClip(clip.id)
      return
    }

    // Linked A/V clips: the first click selects the whole pair (both clips
    // highlight); a second click (no drag) on the same clip narrows the
    // selection to just that one, so a plain Delete removes only the audio or
    // only the video. The pair⇄single toggle is resolved on pointer-up so that
    // dragging an already-selected pair still moves both together.
    const linkedIds =
      st.linkedSelection && clip.linkedGroupId
        ? st.project.tracks
            .flatMap((t) => t.clips)
            .filter((c) => c.linkedGroupId === clip.linkedGroupId)
            .map((c) => c.id)
        : [clip.id]
    const selAtDown = st.selectedClipIds
    const pairWasSelected =
      linkedIds.length > 1 &&
      linkedIds.length === selAtDown.length &&
      linkedIds.every((id) => selAtDown.includes(id))
    const wasIsolated = selAtDown.length === 1 && selAtDown[0] === clip.id

    // A fresh click grabs the whole pair; clicking a clip that's already part
    // of the selection keeps it so the current selection can be dragged as-is.
    if (!selAtDown.includes(clip.id)) setSelectedClipIds(linkedIds)
    if (track.locked || st.tool === 'hand') return

    // build the set of clips that moves with this drag:
    // trackfwd tool = everything to the right on this track;
    // otherwise = current selection plus all linked A/V partners
    const now = useStore.getState()
    let groupIds: string[]
    if (st.tool === 'trackfwd') {
      groupIds = track.clips.filter((c) => c.start >= clip.start - 1e-6).map((c) => c.id)
    } else {
      const ids = new Set(now.selectedClipIds.length ? now.selectedClipIds : [clip.id])
      if (now.linkedSelection) {
        const groups = new Set<string>()
        for (const t of now.project.tracks)
          for (const c of t.clips) if (ids.has(c.id) && c.linkedGroupId) groups.add(c.linkedGroupId)
        for (const t of now.project.tracks)
          for (const c of t.clips) if (c.linkedGroupId && groups.has(c.linkedGroupId)) ids.add(c.id)
      }
      groupIds = [...ids]
    }
    const groupSet = new Set(groupIds)
    // a lone clip — or a single selected A/V pair — may also change tracks
    const selNow = now.selectedClipIds
    const isLinkedPairSel =
      linkedIds.length > 1 &&
      selNow.length === linkedIds.length &&
      linkedIds.every((id) => selNow.includes(id))
    const canChangeTrack = (selNow.length <= 1 || isLinkedPairSel) && st.tool !== 'trackfwd'

    const startsById = new Map<string, number>()
    for (const t of now.project.tracks)
      for (const c of t.clips) if (groupSet.has(c.id)) startsById.set(c.id, c.start)
    const minOrig = Math.min(...[...startsById.values()])

    const startX = e.clientX
    const startY = e.clientY
    const origStart = clip.start
    let recorded = false

    const move = (ev: PointerEvent): void => {
      // ignore sub-4px jitters so plain clicks never create undo entries
      if (!recorded) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
        useStore.getState().record('Move clip')
        recorded = true
      }
      const dt = (ev.clientX - startX) / zoom
      const snapped = snapBlock(Math.max(0, origStart + dt), clip.duration, zoom, groupSet)
      const delta = Math.max(snapped - origStart, -minOrig)

      if (canChangeTrack) {
        // moveClip drags the linked partner along and can switch rows
        let targetTrackId: string | undefined
        const hovered = trackAtY(ev.clientY)
        if (hovered && hovered.kind === track.kind && !hovered.locked) targetTrackId = hovered.id
        moveClip(clip.id, origStart + delta, targetTrackId)
      } else {
        useStore
          .getState()
          .setClipStarts(groupIds.map((id) => ({ id, start: (startsById.get(id) ?? 0) + delta })))
      }
    }
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const stEnd = useStore.getState()
      stEnd.setSnapLine(null)
      if (!recorded) {
        // Pure click (no drag) on a linked clip: toggle pair ⇄ single so the
        // next Delete can target just the audio or just the video.
        if (linkedIds.length > 1) {
          if (pairWasSelected) select(clip.id)                 // pair → isolate this clip
          else if (wasIsolated) setSelectedClipIds(linkedIds)  // isolated → re-select pair
        }
        return
      }
      // dropping into the empty space under the tracks spawns a new track
      if (canChangeTrack && isBelowTracks(ev.clientY)) {
        const cur = stEnd.clipById(clip.id)
        if (cur) {
          const newTrackId = stEnd.addTrack(track.kind)
          stEnd.moveClip(clip.id, cur.clip.start, newTrackId)
        }
      }
      // landing on other clips overwrites them, like Premiere
      useStore.getState().resolveOverwrite(groupIds)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onTrim =
    (edge: 'start' | 'end') =>
    (e: React.PointerEvent): void => {
      e.stopPropagation()
      if (track.locked) return
      select(clip.id)
      const startX = e.clientX
      const origEdgeTime = edge === 'start' ? clip.start : clip.start + clip.duration
      // exclude the clip and its linked partner: their edges move with the trim
      const selfIds = new Set([clip.id])
      if (clip.linkedGroupId) {
        for (const t of useStore.getState().project.tracks)
          for (const c of t.clips) if (c.linkedGroupId === clip.linkedGroupId) selfIds.add(c.id)
      }
      let recorded = false
      let lastDelta = 0
      const move = (ev: PointerEvent): void => {
        if (!recorded) {
          if (Math.abs(ev.clientX - startX) < 3) return
          useStore.getState().record('Trim clip')
          recorded = true
        }
        let delta = (ev.clientX - startX) / zoom
        // snap the dragged edge to nearby edit points
        const st = useStore.getState()
        if (st.snapping) {
          const want = origEdgeTime + delta
          let bestD = SNAP_PX / zoom
          let snapped: number | null = null
          for (const c of snapTimes(selfIds)) {
            const d = Math.abs(c - want)
            if (d < bestD) { bestD = d; snapped = c }
          }
          st.setSnapLine(snapped)
          if (snapped != null) delta = snapped - origEdgeTime
        }
        trimClip(clip.id, edge, delta - lastDelta)
        lastDelta = delta
      }
      const up = (): void => {
        useStore.getState().setSnapLine(null)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  const clipH = trackHeight(track) - 4
  const isAudio = track.kind === 'audio'

  const onGainDrag = (e: React.PointerEvent): void => {
    e.stopPropagation()
    const startY = e.clientY
    const startGain = clip.clipGain ?? 0
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const dy = ev.clientY - startY
      const newGain = Math.max(-60, Math.min(6, startGain - dy * 0.2))
      setClipGain(clip.id, Math.round(newGain * 10) / 10)
    }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onFadeDrag = (edge: 'in' | 'out', e: React.PointerEvent): void => {
    e.stopPropagation()
    const startX = e.clientX
    const startFade = (edge === 'in' ? clip.fadeIn : clip.fadeOut) ?? 0
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - startX) / zoom
      const sign = edge === 'in' ? 1 : -1
      const newFade = Math.max(0, Math.min(clip.duration * 0.9, startFade + dx * sign))
      setClipFade(clip.id, edge, Math.round(newFade * 100) / 100)
    }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const labelColor = LABEL_COLORS.find((lc) => lc.id === clip.labelColor)?.color

  return (
    <div
      className={`clip ${isAudio ? 'audio' : 'video'} ${selected ? 'selected' : ''} ${isLinked ? 'linked' : ''}`}
      style={{ left: HEAD_W + left, width, '--label-color': labelColor } as React.CSSProperties}
      onPointerDown={onBodyDown}
      onDoubleClick={() => asset && selectAsset(asset.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        select(clip.id)
        openMenu({ x: e.clientX, y: e.clientY, clipId: clip.id, trackId: track.id })
      }}
    >
      {labelColor && <div className="clip-label-stripe" style={{ background: labelColor }} />}

      {/* video: frame strip */}
      {!isAudio && asset && (asset.filmstrip || asset.thumbnail) && (
        <VideoFrameStrip asset={asset} clip={clip} width={width} height={clipH} />
      )}

      {/* audio: Premiere-style body with waveform + gain rubber band + fades */}
      {isAudio && asset && asset.peaks?.length ? (
        <AudioClipBody
          asset={asset} clip={clip} width={width} height={clipH}
          onFadeDrag={onFadeDrag} onGainDrag={onGainDrag}
        />
      ) : isAudio && asset?.waveform ? (
        <div className="clip-media" style={{
          backgroundImage: `url(${asset.waveform})`,
          backgroundSize: `${width * ((asset.duration || clip.duration) / clip.duration)}px 100%`,
          backgroundPosition: `${-width * (clip.in / (asset.duration || clip.duration))}px 0`,
          backgroundRepeat: 'no-repeat'
        }} />
      ) : null}

      {clip.inTransition && <div className="transition-badge" title={`Transition: ${clip.inTransition.type}`}><span>↔</span></div>}
      {isLinked && <div className="link-badge" title="Linked A/V pair"><IcLink size={10} /></div>}
      <div className="clip-label">{asset?.name ?? 'clip'}</div>
      {hasKf && <div className="fx-badge" title="Has keyframes">kf</div>}
      {hasKf && (() => {
        const seen = new Set<number>()
        return Object.values(clip.keyframes).flat().flatMap((k) => {
          const px = Math.round(k.t * zoom)
          if (seen.has(px)) return []
          seen.add(px)
          return [<div key={px} className="kf-dot" style={{ left: k.t * zoom }} />]
        })
      })()}
      <div className="trim l" onPointerDown={onTrim('start')} />
      <div className="trim r" onPointerDown={onTrim('end')} />
    </div>
  )
}
