import { useCallback, useEffect, useRef, useState, useMemo, Component, type ReactNode, type ErrorInfo } from 'react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('React crash:', e, info.componentStack) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      const stack = (this.state.error as Error).stack ?? ''
      return (
        <div style={{ padding: 32, color: '#f87', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: '#111', height: '100%', overflow: 'auto' }}>
          <b style={{ fontSize: 16 }}>Render error — please report this</b>{'\n\n'}{msg}{'\n\n'}{stack}
        </div>
      )
    }
    return this.props.children
  }
}
import { useStore } from './store'
import { importPaths, enrichAsset } from './lib/import'
import { MediaBin } from './components/MediaBin'
import { Preview } from './components/Preview'
import { Timeline } from './components/Timeline'
import { EffectControls, CaptionsPanel } from './components/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { MenuBar, type MenuActions } from './components/MenuBar'
import { Panel } from './components/Panel'
import { Tools } from './components/Tools'
import { SourceMonitor } from './components/SourceMonitor'
import { EffectsPanel } from './components/EffectsPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { WelcomeScreen, saveRecent } from './components/WelcomeScreen'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { resolveCommand } from './lib/keybinds'
import { consumePendingDropTime } from './lib/dragMedia'
import type { MediaPool } from './engine/compositor'

/** Per-track volume/pan faders — a lightweight Audio Clip Mixer. */
function AudioMixer(): JSX.Element {
  const tracks = useStore((s) => s.project.tracks)
  const playhead = useStore((s) => s.playhead)
  const updateClipProps = useStore((s) => s.updateClipProps)
  const toggleTrackMute = useStore((s) => s.toggleTrackMute)
  const clips = useMemo(
    () => tracks.map((t) => ({ track: t, clip: t.clips.find((c) => playhead >= c.start && playhead < c.start + c.duration) })),
    [tracks, playhead]
  )

  if (clips.length === 0) return <p className="hint" style={{ padding: 12 }}>No tracks yet.</p>

  return (
    <div className="audio-mixer">
      {clips.map(({ track, clip }) => {
        const vol = clip?.props.volume ?? 1
        const pan = clip?.props.pan ?? 0
        return (
          <div key={track.id} className="mixer-channel">
            <div className="mixer-track-name" title={track.name}>{track.name}</div>
            <div className="mixer-fader-wrap">
              <input
                type="range"
                className="mixer-fader"
                min={0}
                max={2}
                step={0.01}
                value={clip ? vol : 1}
                disabled={!clip}
                title={`Volume: ${Math.round(vol * 100)}%`}
                onChange={(e) => clip && updateClipProps(clip.id, { volume: Number(e.target.value) })}
              />
              <div className="mixer-vol-label">{clip ? `${Math.round(vol * 100)}%` : '—'}</div>
            </div>
            <input
              type="range"
              className="mixer-pan"
              min={-1}
              max={1}
              step={0.01}
              value={pan}
              disabled={!clip}
              title={`Pan: ${pan < 0 ? `${Math.round(Math.abs(pan) * 100)}L` : pan > 0 ? `${Math.round(pan * 100)}R` : 'C'}`}
              onChange={(e) => clip && updateClipProps(clip.id, { pan: Number(e.target.value) })}
            />
            <button
              className={`mixer-mute ${track.muted ? 'active' : ''}`}
              title="Mute"
              onClick={() => toggleTrackMute(track.id)}
            >M</button>
          </div>
        )
      })}
    </div>
  )
}

interface Layout {
  topPct: number
  srcPct: number
  rightPct: number
  projPct: number
}
const DEFAULT_LAYOUT: Layout = { topPct: 46, srcPct: 27, rightPct: 27, projPct: 25 }

function loadLayout(): Layout {
  try {
    return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem('unstunted-layout') || '{}') }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function App(): JSX.Element {
  const project = useStore((s) => s.project)
  const setProjectMeta = useStore((s) => s.setProjectMeta)
  const addAsset = useStore((s) => s.addAsset)
  const addLinkedClipsFromAsset = useStore((s) => s.addLinkedClipsFromAsset)

  const [showWelcome, setShowWelcome] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const poolRef = useRef<MediaPool | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  const saveLayout = useCallback((l: Layout) => {
    setLayout(l)
    localStorage.setItem('unstunted-layout', JSON.stringify(l))
  }, [])

  const flash = useCallback((m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2400)
  }, [])

  // Auto-save every 2 minutes
  useEffect(() => {
    const id = setInterval(async () => {
      const s = useStore.getState()
      if (!s.project.tracks.some((t) => t.clips.length > 0)) return
      try {
        const ts: number = await window.swift.autosave(s.serialize())
        s.setLastAutoSave(ts)
        const d = new Date(ts)
        setToast(`Auto-saved ${d.toLocaleTimeString()}`)
        setTimeout(() => setToast(null), 3000)
      } catch {
        // autosave failures are silent
      }
    }, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const doImport = useCallback(
    async (paths: string[], placeLinked = false) => {
      if (!paths.length) return
      flash(`Importing ${paths.length} file(s)…`)
      const assets = await importPaths(paths)
      const update = useStore.getState().updateAsset
      // if the files were dropped on the timeline, place them at the cursor
      const dropAt = consumePendingDropTime()
      let cursor = dropAt
      assets.forEach((a) => {
        addAsset(a)
        enrichAsset(a, update)
        if (placeLinked) {
          addLinkedClipsFromAsset(a.id, cursor ?? undefined)
          if (cursor != null) {
            const st = useStore.getState()
            st.resolveOverwrite(st.selectedClipIds)
            cursor += a.kind === 'image' ? 5 : a.duration
          }
        }
      })
      flash(`Imported ${assets.length} file(s)`)
    },
    [addAsset, addLinkedClipsFromAsset, flash]
  )

  const openImport = useCallback(async () => {
    const paths = await window.swift.openMedia()
    await doImport(paths)
  }, [doImport])

  const saveAs = useCallback(async () => {
    const path = await window.swift.saveDialog()
    if (!path) return
    const s = useStore.getState()
    await window.swift.saveProject(path, s.serialize())
    s.setProjectPath(path)
    saveRecent(s.project.name || 'Untitled', path)
    flash('Project saved')
  }, [flash])

  const save = useCallback(async () => {
    const path = useStore.getState().projectPath
    if (!path) return saveAs()
    const s = useStore.getState()
    await window.swift.saveProject(path, s.serialize())
    saveRecent(s.project.name || 'Untitled', path)
    flash('Project saved')
  }, [saveAs, flash])

  // older projects lack waveform peaks (and sometimes thumbnails) — rebuild
  // them in the background so timeline visuals upgrade on open
  const enrichMissing = useCallback(() => {
    const st = useStore.getState()
    for (const a of Object.values(st.assets)) {
      const needsPeaks = (a.hasAudio || a.kind === 'audio') && !a.peaks?.length
      const needsThumb = a.kind !== 'audio' && !a.thumbnail
      if (needsPeaks || needsThumb) enrichAsset(a, st.updateAsset)
    }
  }, [])

  const open = useCallback(async () => {
    const path = await window.swift.openDialog()
    if (!path) return
    const json = await window.swift.loadProject(path)
    useStore.getState().loadFrom(json, path)
    const name = useStore.getState().project.name || 'Untitled'
    saveRecent(name, path)
    setShowWelcome(false)
    enrichMissing()
    flash('Project opened')
  }, [flash, enrichMissing])

  const newProject = useCallback(() => {
    useStore.getState().newProject()
    setShowWelcome(false)
    flash('New project')
  }, [flash])

  const openRecent = useCallback(async (path: string) => {
    try {
      const json = await window.swift.loadProject(path)
      useStore.getState().loadFrom(json, path)
      saveRecent(useStore.getState().project.name || 'Untitled', path)
      setShowWelcome(false)
      enrichMissing()
      flash('Project opened')
    } catch {
      flash('Could not open project')
    }
  }, [flash, enrichMissing])

  const actions: MenuActions = {
    newProject,
    open,
    save,
    saveAs,
    exportMedia: () => setShowExport(true),
    importMedia: openImport,
    openShortcuts: () => setShowShortcuts(true)
  }

  // drag & drop import (files dropped anywhere on app window)
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDragging(true) }
    }
    const onDragLeave = (e: DragEvent): void => { if (e.relatedTarget === null) setDragging(false) }
    const onDrop = async (e: DragEvent): Promise<void> => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files.map((f) => window.swift.pathForFile(f)).filter(Boolean)
      if (showWelcome) setShowWelcome(false)
      await doImport(paths, true)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [doImport, showWelcome])

  // Rebindable keyboard commands (Tools → Keyboard Shortcuts… to customize)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (showShortcuts) return // the shortcuts dialog owns the keyboard
      const el = e.target as HTMLElement
      const tag = el?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable
      const s = useStore.getState()

      if (e.key === 'Escape' && !typing) {
        s.select(null)
        return
      }

      const id = resolveCommand(e, typing)
      if (!id) return

      // Delete commands share the Backspace/Delete keys with the MediaBin's
      // asset-delete handler (a separate window keydown listener). When the
      // timeline actually consumes the key we must stop that listener from
      // also firing — otherwise it reads the now-cleared selection and deletes
      // the bin asset too. Only stop propagation when something on the timeline
      // was really selected, so a bare Backspace can still delete a bin asset.
      if (id === 'edit.delete' || id === 'edit.rippleDelete') {
        let consumed = true
        if (s.selectedGap) s.closeGap()
        else if (id === 'edit.delete' && s.selectedClipIds.length) s.removeClips(s.selectedClipIds)
        else if (id === 'edit.rippleDelete' && s.selectedClipId) s.rippleDelete(s.selectedClipId)
        else if (s.selectedCueId) s.removeCue(s.selectedCueId)
        else consumed = false
        if (consumed) {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
        return
      }

      const actions: Record<string, () => void> = {
        'file.new': newProject,
        'file.open': open,
        'file.save': save,
        'file.saveAs': saveAs,
        'file.import': openImport,
        'file.export': () => setShowExport(true),

        'edit.undo': () => {
          const entry = s.past[s.past.length - 1]
          s.undo()
          if (entry) { setToast(`↩ Undo: ${entry.label}`); setTimeout(() => setToast(null), 2200) }
        },
        'edit.redo': () => {
          const entry = s.future[0]
          s.redo()
          if (entry) { setToast(`↪ Redo: ${entry.label}`); setTimeout(() => setToast(null), 2200) }
        },
        'edit.cut': s.cutSelected,
        'edit.copy': s.copySelected,
        'edit.paste': s.pasteAtPlayhead,
        'edit.selectAll': () => {
          const all = s.project.tracks.flatMap((t) => t.clips).map((c) => c.id)
          s.setSelectedClipIds(all)
        },
        'edit.split': () => s.splitAt(s.playhead),
        'edit.addText': () => s.addTextCue(s.playhead),
        'edit.transition': s.applyDefaultTransition,
        'edit.rippleTrimPrev': () => s.rippleTrimEdit('prev'),
        'edit.rippleTrimNext': () => s.rippleTrimEdit('next'),
        'edit.insert': () => s.selectedAssetId && s.insertAtPlayhead(s.selectedAssetId, 'insert'),
        'edit.overwrite': () => s.selectedAssetId && s.insertAtPlayhead(s.selectedAssetId, 'overwrite'),

        'tool.select': () => s.setTool('select'),
        'tool.trackfwd': () => s.setTool('trackfwd'),
        'tool.razor': () => s.setTool('razor'),
        'tool.hand': () => s.setTool('hand'),
        'tool.zoom': () => s.setTool('zoom'),

        'mark.in': () => s.setInPoint(s.playhead),
        'mark.out': () => s.setOutPoint(s.playhead),
        'mark.clear': s.clearInOut,
        'mark.marker': () => s.addMarker(s.playhead),

        'transport.play': s.togglePlay,
        'transport.shuttleRev': () => s.setShuttle(s.shuttle > -1 ? -1 : Math.max(-4, s.shuttle - 1)),
        'transport.shuttleStop': () => s.setShuttle(0),
        'transport.shuttleFwd': () => s.setShuttle(s.shuttle < 1 ? 1 : Math.min(4, s.shuttle + 1)),
        'transport.stepBack': () => s.stepFrame(-1),
        'transport.stepFwd': () => s.stepFrame(1),
        'transport.stepBack5': () => s.stepFrame(-5),
        'transport.stepFwd5': () => s.stepFrame(5),
        'transport.prevEdit': () => s.gotoEdit(-1),
        'transport.nextEdit': () => s.gotoEdit(1),
        'transport.home': () => s.setPlayhead(0),
        'transport.end': () => s.setPlayhead(s.duration()),

        'view.zoomIn': () => s.setZoom(s.zoom * 1.3),
        'view.zoomOut': () => s.setZoom(s.zoom / 1.3),
        'view.zoomFit': () => {
          const w = document.querySelector('.tl-scroll')?.clientWidth ?? window.innerWidth
          s.zoomToFit(w)
        },
        'view.snap': s.toggleSnapping
      }

      const run = actions[id]
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saveAs, open, newProject, openImport, showShortcuts])

  // splitter drags
  const dragSplit = (which: 'top' | 'src' | 'right' | 'proj') => (e: React.PointerEvent): void => {
    e.preventDefault()
    const ws = workspaceRef.current
    if (!ws) return
    const rect = ws.getBoundingClientRect()
    const move = (ev: PointerEvent): void => {
      if (which === 'top') {
        const pct = Math.min(75, Math.max(20, ((ev.clientY - rect.top) / rect.height) * 100))
        saveLayout({ ...layout, topPct: pct })
      } else if (which === 'src') {
        const pct = Math.min(50, Math.max(15, ((ev.clientX - rect.left) / rect.width) * 100))
        saveLayout({ ...layout, srcPct: pct })
      } else if (which === 'right') {
        const pct = Math.min(50, Math.max(15, ((rect.right - ev.clientX) / rect.width) * 100))
        saveLayout({ ...layout, rightPct: pct })
      } else {
        const pct = Math.min(50, Math.max(15, ((ev.clientX - rect.left) / rect.width) * 100))
        saveLayout({ ...layout, projPct: pct })
      }
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const aspect = `${project.width}:${project.height}`

  if (showWelcome) {
    return (
      <div className="pp-app">
        <MenuBar actions={actions} />
        <WelcomeScreen onNew={newProject} onOpen={open} onRecent={openRecent} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="pp-app">
      <MenuBar actions={actions} />

      <div className="top-bar">
        <svg className="topbar-logo" width="20" height="20" viewBox="0 0 72 72" fill="none">
          <defs>
            <linearGradient id="tbg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#17304f"/>
              <stop offset="100%" stopColor="#090f1c"/>
            </linearGradient>
          </defs>
          <rect width="72" height="72" rx="16" fill="url(#tbg)"/>
          <rect x="11" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="23" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="35" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="47" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="11" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="23" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="35" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="47" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
          <polygon points="21,18 21,54 57,36" fill="white"/>
        </svg>
        <input
          className="proj-name"
          value={project.name}
          onChange={(e) => setProjectMeta({ name: e.target.value })}
          title="Project name"
        />
        <select
          value={aspect}
          title="Sequence settings"
          onChange={(e) => {
            const [w, h] = e.target.value.split(':').map(Number)
            setProjectMeta({ width: w, height: h })
          }}
        >
          <option value="1080:1920">9:16 Vertical (1080×1920)</option>
          <option value="1920:1080">16:9 Widescreen (1920×1080)</option>
          <option value="1080:1080">1:1 Square (1080×1080)</option>
          <option value="1080:1350">4:5 Portrait (1080×1350)</option>
          <option value="3840:2160">4K UHD (3840×2160)</option>
        </select>
        <div className="spacer" />
        <button onClick={openImport}>Import</button>
        <button className="primary" onClick={() => setShowExport(true)}>Export</button>
      </div>

      <div className="pp-workspace" ref={workspaceRef}>
        {/* ── top row: source | program | effect controls ── */}
        <div className="pp-row" style={{ flex: `0 0 ${layout.topPct}%` }}>
          <div className="pp-cell" style={{ flex: `0 0 ${layout.srcPct}%` }}>
            <Panel
              tabs={[
                { id: 'source', label: 'Source', node: <SourceMonitor /> },
                { id: 'cap', label: 'Captions', node: <div className="inspector"><CaptionsPanel flash={flash} /></div> }
              ]}
              initial="source"
            />
          </div>
          <div className="splitter-v" onPointerDown={dragSplit('src')} />
          <div className="pp-cell" style={{ flex: 1 }}>
            <div className="panel">
              <div className="panel-tabs">
                <span className="panel-tab active">Program: {project.name}</span>
              </div>
              <div className="panel-content"><Preview poolRef={poolRef} /></div>
            </div>
          </div>
          <div className="splitter-v" onPointerDown={dragSplit('right')} />
          <div className="pp-cell" style={{ flex: `0 0 ${layout.rightPct}%` }}>
            <Panel
              tabs={[
                { id: 'fx', label: 'Effect Controls', node: <EffectControls /> },
                { id: 'effects', label: 'Effects', node: <EffectsPanel /> }
              ]}
              initial="fx"
            />
          </div>
        </div>

        <div className="splitter-h" onPointerDown={dragSplit('top')} />

        {/* ── bottom row: project bin | tools | timeline ── */}
        <div className="pp-row" style={{ flex: 1 }}>
          <div className="pp-cell" style={{ flex: `0 0 ${layout.projPct}%` }}>
            <Panel
              tabs={[
                { id: 'project', label: 'Project', node: <MediaBin onImport={openImport} /> },
                { id: 'mixer', label: 'Audio Mixer', node: <AudioMixer /> },
                { id: 'history', label: 'History', node: <HistoryPanel /> }
              ]}
            />
          </div>
          <div className="splitter-v" onPointerDown={dragSplit('proj')} />
          <Tools />
          <div className="pp-cell" style={{ flex: 1 }}>
            <div className="panel">
              <div className="panel-tabs">
                <span className="panel-tab active">Timeline: {project.name}</span>
              </div>
              <div className="panel-content"><Timeline poolRef={poolRef} /></div>
            </div>
          </div>
        </div>
      </div>

      {dragging && <div className="dropzone-hint">Drop media to import &amp; place</div>}
      {showExport && <ExportDialog poolRef={poolRef} onClose={() => setShowExport(false)} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
    </ErrorBoundary>
  )
}
