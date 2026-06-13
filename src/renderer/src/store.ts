import { create } from 'zustand'
import { retimeCueText } from './engine/captions'
import type {
  Project,
  MediaAsset,
  Clip,
  Track,
  TrackKind,
  TrackHeightPreset,
  CaptionStyle,
  CaptionCue,
  AnimatablePropName,
  Easing,
  Marker,
  Transition,
  StaticProps,
  SoundTag,
  Bin
} from '../../shared/types'

export const uid = (): string => Math.random().toString(36).slice(2, 10)
const clone = <T,>(v: T): T => structuredClone(v)

export type Tool = 'select' | 'trackfwd' | 'razor' | 'hand' | 'zoom' | 'rolling' | 'slip' | 'slide'

export interface GapSelection {
  trackId: string
  start: number
  end: number
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'hormozi',
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 84,
  fontWeight: 900,
  letterSpacing: 0,
  fillColor: '#ffffff',
  highlightColor: '#19e36b',
  strokeColor: '#000000',
  strokeWidth: 10,
  position: 0.78,
  uppercase: true,
  maxWordsPerCue: 4,
  highlightMode: 'color',
  popScale: 1.12,
  animation: 'pop',
  reveal: 'cue',
  shadowOn: true,
  shadowColor: '#000000',
  shadowBlur: 18,
  bgOn: false,
  bgColor: '#000000',
  bgOpacity: 0.55,
  autoEmphasis: false,
  emphasisColors: ['#ffd400', '#ff3b3b', '#19e36b']
}

export const DEFAULT_PROPS: StaticProps = {
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, volume: 1,
  exposure: 0, brightness: 1, contrast: 1,
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  saturation: 1, temperature: 0, tint: 0,
  vignetteStrength: 0, vignetteMidpoint: 0.5, vignetteFeather: 0.5, vignetteRoundness: 1,
  blur: 0, flipH: false, flipV: false, pan: 0
}

const EMPTY_KEYFRAMES = (): Clip['keyframes'] =>
  ({ x: [], y: [], scale: [], rotation: [], opacity: [], volume: [] })

function emptyProject(): Project {
  return {
    id: uid(),
    name: 'Untitled',
    width: 1080,
    height: 1920,
    fps: 30,
    sampleRate: 48000,
    background: '#000000',
    captions: [],
    captionStyle: { ...DEFAULT_CAPTION_STYLE },
    markers: [],
    bins: [],
    tracks: [
      { id: uid(), kind: 'video', name: 'V1', clips: [], muted: false, locked: false, hidden: false },
      { id: uid(), kind: 'audio', name: 'A1', clips: [], muted: false, locked: false, hidden: false }
    ]
  }
}

interface HistoryEntry {
  label: string
  project: Project
}

export interface SavedFile {
  version: 1
  project: Project
  assets: MediaAsset[]
}

export interface EditorState {
  project: Project
  assets: Record<string, MediaAsset>
  playhead: number
  playing: boolean
  shuttle: number // J/K/L shuttle rate (-N..0..+N), 0 = normal
  zoom: number
  tool: Tool
  selectedClipId: string | null
  selectedClipIds: string[]
  selectedTrackId: string | null
  selectedAssetId: string | null
  selectedProp: AnimatablePropName | null
  projectPath: string | null
  snapping: boolean
  /** Premiere "Linked Selection": when on, A/V pairs move/trim/delete together. */
  linkedSelection: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]
  inPoint: number | null
  outPoint: number | null
  /** Source monitor in/out points for 3-point editing. */
  sourceIn: number | null
  sourceOut: number | null
  targetVideoTrackId: string | null
  targetAudioTrackId: string | null
  clipboard: Clip | null
  clipboardTrackKind: TrackKind | null
  snapLine: number | null
  selectedGap: GapSelection | null
  /** When true, media elements use proxyUrl instead of url. */
  proxyMode: boolean
  /** Last auto-save timestamp (ms). */
  lastAutoSave: number | null

  // selectors
  duration: () => number
  trackById: (id: string) => Track | undefined
  clipById: (id: string) => { clip: Clip; track: Track } | undefined

  // history
  record: (label: string) => void
  undo: () => void
  redo: () => void

  // transport
  setPlayhead: (t: number) => void
  stepFrame: (dir: number) => void
  gotoEdit: (dir: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  setShuttle: (rate: number) => void
  setZoom: (z: number) => void
  zoomToFit: (containerPx: number) => void
  toggleSnapping: () => void
  toggleLinkedSelection: () => void
  setTool: (t: Tool) => void

  // project
  setProject: (p: Project) => void
  setProjectMeta: (patch: Partial<Pick<Project, 'name' | 'width' | 'height' | 'fps' | 'background'>>) => void
  newProject: () => void
  serialize: () => string
  loadFrom: (json: string, path: string | null) => void
  setProjectPath: (p: string | null) => void

  // assets
  addAsset: (a: MediaAsset) => void
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void
  removeAsset: (id: string) => void
  selectAsset: (id: string | null) => void

  // source monitor
  setSourceIn: (t: number | null) => void
  setSourceOut: (t: number | null) => void
  clearSourceInOut: () => void

  // tracks
  addTrack: (kind: TrackKind) => string
  removeTrack: (id: string) => void
  renameTrack: (id: string, name: string) => void
  setTrackHeight: (id: string, preset: TrackHeightPreset) => void
  toggleTrackMute: (id: string) => void
  toggleTrackHidden: (id: string) => void
  toggleTrackLock: (id: string) => void
  setTargetTrack: (kind: TrackKind, id: string) => void

  // markers & range
  addMarker: (time: number) => void
  removeMarker: (id: string) => void
  setInPoint: (t: number | null) => void
  setOutPoint: (t: number | null) => void
  clearInOut: () => void

  // clipboard & premiere edits
  copySelected: () => void
  cutSelected: () => void
  pasteAtPlayhead: () => void
  applyDefaultTransition: () => void
  insertAtPlayhead: (assetId: string, mode: 'insert' | 'overwrite') => void
  setClipStarts: (updates: { id: string; start: number }[]) => void
  setSnapLine: (t: number | null) => void

  // clips
  addClipFromAsset: (assetId: string, trackId?: string, at?: number) => string | undefined
  addLinkedClipsFromAsset: (assetId: string, at?: number, targetTrackId?: string) => void
  /** Move a set of clips by the same time delta (keeps relative offsets, clamps at 0). */
  moveClipsBy: (ids: string[], delta: number) => void
  /** Premiere-style overwrite: clips just dropped trim/remove whatever they cover. */
  resolveOverwrite: (movedIds: string[]) => void
  /** Close the currently selected gap, rippling later clips left in sync. */
  closeGap: () => void
  setSelectedGap: (g: GapSelection | null) => void
  rippleTrimEdit: (dir: 'prev' | 'next') => void
  moveClip: (clipId: string, newStart: number, newTrackId?: string) => void
  trimClip: (clipId: string, edge: 'start' | 'end', deltaSeconds: number) => void
  splitAt: (time: number, trackId?: string) => void
  rippleDelete: (clipId: string) => void
  removeClip: (clipId: string) => void
  removeClipOnly: (clipId: string) => void
  removeClips: (clipIds: string[]) => void
  updateClipProps: (clipId: string, patch: Partial<StaticProps>) => void
  setTransition: (clipId: string, t: Transition | undefined) => void
  setClipLabel: (clipId: string, color: string | undefined) => void
  setClipGain: (clipId: string, gainDb: number) => void
  setClipFade: (clipId: string, edge: 'in' | 'out', duration: number) => void
  setSoundTag: (clipId: string, tag: SoundTag | undefined) => void
  /** Rolling edit — move the boundary between two adjacent clips. */
  rollingTrim: (clipAId: string, clipBId: string, delta: number) => void
  /** Slip — shift source in/out without moving clip on timeline. */
  slipClip: (clipId: string, delta: number) => void
  /** Slide — move clip, trimming neighbors to fill/vacate space. */
  slideClip: (clipId: string, delta: number) => void
  /** Add an adjustment layer track + empty clip spanning the full project. */
  addAdjustmentLayer: () => void
  // proxy
  toggleProxyMode: () => void
  attachProxy: (assetId: string, proxyPath: string, proxyUrl: string) => void
  detachProxy: (assetId: string) => void
  // bins
  addBin: (name: string, parentId?: string) => string
  renameBin: (id: string, name: string) => void
  removeBin: (id: string) => void
  moveAssetToBin: (assetId: string, binId: string | null) => void
  toggleBinExpanded: (id: string) => void
  // auto-save
  setLastAutoSave: (ts: number) => void

  // selection
  select: (clipId: string | null) => void
  toggleSelectClip: (id: string) => void
  setSelectedClipIds: (ids: string[]) => void
  selectTrack: (trackId: string | null) => void
  setSelectedProp: (p: AnimatablePropName | null) => void

  // keyframes
  addKeyframe: (clipId: string, prop: AnimatablePropName, t: number, value: number, easing?: Easing) => void
  updateKeyframe: (clipId: string, prop: AnimatablePropName, index: number, patch: { t?: number; value?: number; easing?: Easing }) => void
  removeKeyframe: (clipId: string, prop: AnimatablePropName, index: number) => void
  clearKeyframes: (clipId: string, prop: AnimatablePropName) => void

  // captions
  setCaptions: (cues: CaptionCue[]) => void
  updateCaptionStyle: (patch: Partial<CaptionStyle>) => void
  updateCue: (id: string, patch: Partial<CaptionCue>) => void
  removeCue: (id: string) => void
  /** While true (Captions panel open) the program monitor previews the style. */
  captionPreview: boolean
  setCaptionPreview: (on: boolean) => void
  // caption clips on the timeline
  selectedCueId: string | null
  selectCue: (id: string | null) => void
  /** Manually add a text/caption cue at `at` seconds (the "T" tool). */
  addTextCue: (at: number, text?: string) => string
  moveCue: (id: string, newStart: number) => void
  trimCue: (id: string, edge: 'start' | 'end', t: number) => void
}

function withTrackClips(p: Project, trackId: string, clips: Clip[]): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)) }
}

function findClip(p: Project, clipId: string): { clip: Clip; track: Track } | undefined {
  for (const track of p.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { clip, track }
  }
  return undefined
}

const sortClips = (clips: Clip[]): Clip[] => [...clips].sort((a, b) => a.start - b.start)

export const useStore = create<EditorState>((set, get) => {
  // push current project onto undo stack before a mutation
  const record = (label: string): void =>
    set((s) => ({
      past: [...s.past, { label, project: clone(s.project) }].slice(-200),
      future: []
    }))

  return {
    project: emptyProject(),
    assets: {},
    playhead: 0,
    playing: false,
    shuttle: 0,
    zoom: 80,
    tool: 'select',
    selectedClipId: null,
    selectedClipIds: [],
    selectedTrackId: null,
    selectedAssetId: null,
    selectedProp: null,
    projectPath: null,
    snapping: true,
    linkedSelection: true,
    past: [],
    future: [],
    inPoint: null,
    outPoint: null,
    sourceIn: null,
    sourceOut: null,
    proxyMode: false,
    lastAutoSave: null,
    targetVideoTrackId: null,
    targetAudioTrackId: null,
    clipboard: null,
    clipboardTrackKind: null,
    snapLine: null,
    selectedGap: null,

    duration: () => {
      const p = get().project
      let end = 0
      for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration)
      for (const cue of p.captions) end = Math.max(end, cue.end)
      return end
    },
    trackById: (id) => get().project.tracks.find((t) => t.id === id),
    clipById: (id) => findClip(get().project, id),

    record,
    undo: () =>
      set((s) => {
        if (!s.past.length) return {}
        const entry = s.past[s.past.length - 1]
        return {
          past: s.past.slice(0, -1),
          future: [{ label: entry.label, project: clone(s.project) }, ...s.future].slice(0, 200),
          project: entry.project,
          selectedClipId: null, selectedClipIds: [], selectedGap: null
        }
      }),
    redo: () =>
      set((s) => {
        if (!s.future.length) return {}
        const entry = s.future[0]
        return {
          future: s.future.slice(1),
          past: [...s.past, { label: entry.label, project: clone(s.project) }].slice(-200),
          project: entry.project,
          selectedClipId: null, selectedClipIds: [], selectedGap: null
        }
      }),

    setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
    stepFrame: (dir) =>
      set((s) => ({ playhead: Math.max(0, s.playhead + (dir / s.project.fps)) })),
    gotoEdit: (dir) =>
      set((s) => {
        const edits = new Set<number>([0])
        for (const tr of s.project.tracks)
          for (const c of tr.clips) {
            edits.add(c.start)
            edits.add(c.start + c.duration)
          }
        const sorted = [...edits].sort((a, b) => a - b)
        const cur = s.playhead
        if (dir > 0) return { playhead: sorted.find((e) => e > cur + 1e-4) ?? cur }
        return { playhead: [...sorted].reverse().find((e) => e < cur - 1e-4) ?? 0 }
      }),
    play: () =>
      set((s) => {
        // pressing play at the end restarts from the top (Premiere behavior)
        const dur = get().duration()
        const atEnd = dur > 0 && s.playhead >= dur - 1e-3
        return { playing: true, shuttle: 0, ...(atEnd ? { playhead: 0 } : {}) }
      }),
    pause: () => set({ playing: false, shuttle: 0 }),
    togglePlay: () =>
      set((s) => {
        if (!s.playing) {
          const dur = get().duration()
          if (dur > 0 && s.playhead >= dur - 1e-3) return { playing: true, shuttle: 0, playhead: 0 }
        }
        return { playing: !s.playing, shuttle: 0 }
      }),
    setShuttle: (rate) => set({ shuttle: rate, playing: rate !== 0 }),
    setZoom: (z) => set({ zoom: Math.min(800, Math.max(4, z)) }),
    zoomToFit: (containerPx) =>
      set((s) => {
        const dur = Math.max(1, get().duration())
        return { zoom: Math.min(800, Math.max(4, (containerPx - 80) / dur)) }
      }),
    toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
    toggleLinkedSelection: () => set((s) => ({ linkedSelection: !s.linkedSelection })),
    setTool: (t) => set({ tool: t }),

    setProject: (p) => set({ project: p, playhead: 0, selectedClipId: null, past: [], future: [] }),
    setProjectMeta: (patch) => {
      record('Sequence settings')
      set((s) => ({ project: { ...s.project, ...patch } }))
    },
    newProject: () =>
      set({
        project: emptyProject(),
        assets: {},
        playhead: 0,
        playing: false,
        shuttle: 0,
        selectedClipId: null,
        selectedClipIds: [],
        selectedTrackId: null,
        selectedAssetId: null,
        selectedCueId: null,
        selectedGap: null,
        inPoint: null,
        outPoint: null,
        sourceIn: null,
        sourceOut: null,
        projectPath: null,
        past: [],
        future: []
      }),
    serialize: () => {
      const s = get()
      const data: SavedFile = { version: 1, project: s.project, assets: Object.values(s.assets) }
      return JSON.stringify(data, null, 2)
    },
    loadFrom: (json, path) => {
      const data = JSON.parse(json) as SavedFile
      const assets: Record<string, MediaAsset> = {}
      for (const a of data.assets) assets[a.id] = a
      // normalize older project files
      data.project.markers = data.project.markers ?? []
      data.project.captionStyle = { ...DEFAULT_CAPTION_STYLE, ...data.project.captionStyle }
      set({
        project: data.project,
        assets,
        playhead: 0,
        selectedClipId: null,
        selectedClipIds: [],
        selectedCueId: null,
        projectPath: path,
        past: [],
        future: []
      })
    },
    setProjectPath: (p) => set({ projectPath: p }),

    addAsset: (a) => set((s) => ({ assets: { ...s.assets, [a.id]: a } })),
    updateAsset: (id, patch) =>
      set((s) => (s.assets[id] ? { assets: { ...s.assets, [id]: { ...s.assets[id], ...patch } } } : {})),
    removeAsset: (id) => {
      record('Remove media')
      set((s) => {
        const newAssets = { ...s.assets }
        delete newAssets[id]
        const tracks = s.project.tracks.map((t) => ({
          ...t, clips: t.clips.filter((c) => c.assetId !== id)
        }))
        return {
          assets: newAssets,
          project: { ...s.project, tracks },
          selectedAssetId: s.selectedAssetId === id ? null : s.selectedAssetId,
          selectedClipId: null,
          selectedClipIds: []
        }
      })
    },
    selectAsset: (id) => set({ selectedAssetId: id }),

    // source monitor
    setSourceIn: (t) => set({ sourceIn: t }),
    setSourceOut: (t) => set({ sourceOut: t }),
    clearSourceInOut: () => set({ sourceIn: null, sourceOut: null }),

    // proxy
    toggleProxyMode: () => set((s) => ({ proxyMode: !s.proxyMode })),
    attachProxy: (assetId, proxyPath, proxyUrl) =>
      set((s) => ({
        assets: s.assets[assetId] ? { ...s.assets, [assetId]: { ...s.assets[assetId], proxyPath, proxyUrl } } : s.assets
      })),
    detachProxy: (assetId) =>
      set((s) => {
        if (!s.assets[assetId]) return {}
        const { proxyPath: _p, proxyUrl: _u, ...rest } = s.assets[assetId]
        return { assets: { ...s.assets, [assetId]: rest as MediaAsset } }
      }),

    // bins
    addBin: (name, parentId) => {
      const id = uid()
      set((s) => ({
        project: {
          ...s.project,
          bins: [...(s.project.bins ?? []), { id, name, parentId, assetIds: [], expanded: true }]
        }
      }))
      return id
    },
    renameBin: (id, name) =>
      set((s) => ({
        project: {
          ...s.project,
          bins: (s.project.bins ?? []).map((b) => (b.id === id ? { ...b, name } : b))
        }
      })),
    removeBin: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          bins: (s.project.bins ?? []).filter((b) => b.id !== id && b.parentId !== id)
        }
      })),
    moveAssetToBin: (assetId, binId) =>
      set((s) => ({
        project: {
          ...s.project,
          bins: (s.project.bins ?? []).map((b) =>
            b.id === binId
              ? { ...b, assetIds: b.assetIds.includes(assetId) ? b.assetIds : [...b.assetIds, assetId] }
              : { ...b, assetIds: b.assetIds.filter((id) => id !== assetId) }
          )
        }
      })),
    toggleBinExpanded: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          bins: (s.project.bins ?? []).map((b) => (b.id === id ? { ...b, expanded: !b.expanded } : b))
        }
      })),

    setLastAutoSave: (ts) => set({ lastAutoSave: ts }),

    toggleTrackLock: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, locked: !t.locked } : t))
        }
      })),
    setTargetTrack: (kind, id) =>
      set(kind === 'video' ? { targetVideoTrackId: id } : { targetAudioTrackId: id }),

    addMarker: (time) => {
      const m: Marker = { id: uid(), time, color: '#3fae57' }
      set((s) => ({
        project: { ...s.project, markers: [...(s.project.markers ?? []), m].sort((a, b) => a.time - b.time) }
      }))
    },
    removeMarker: (id) =>
      set((s) => ({
        project: { ...s.project, markers: (s.project.markers ?? []).filter((m) => m.id !== id) }
      })),
    setInPoint: (t) => set({ inPoint: t }),
    setOutPoint: (t) => set({ outPoint: t }),
    clearInOut: () => set({ inPoint: null, outPoint: null }),

    copySelected: () => {
      const s = get()
      if (!s.selectedClipId) return
      const found = findClip(s.project, s.selectedClipId)
      if (!found) return
      set({ clipboard: clone(found.clip), clipboardTrackKind: found.track.kind })
    },
    cutSelected: () => {
      const s = get()
      if (!s.selectedClipId) return
      s.copySelected()
      s.removeClip(s.selectedClipId)
    },
    pasteAtPlayhead: () => {
      const s = get()
      if (!s.clipboard) return
      const kind = s.clipboardTrackKind ?? 'video'
      const targetId = kind === 'video' ? s.targetVideoTrackId : s.targetAudioTrackId
      const track =
        (targetId && s.project.tracks.find((t) => t.id === targetId && t.kind === kind)) ||
        s.project.tracks.find((t) => t.kind === kind)
      if (!track || track.locked) return
      const pasted: Clip = { ...clone(s.clipboard), id: uid(), start: s.playhead }
      record('Paste')
      set((st) => ({
        project: withTrackClips(st.project, track.id, sortClips([...track.clips, pasted])),
        selectedClipId: pasted.id
      }))
    },
    applyDefaultTransition: () => {
      const s = get()
      if (!s.selectedClipId) return
      s.setTransition(s.selectedClipId, { type: 'dissolve', duration: 0.5 })
    },

    insertAtPlayhead: (assetId, mode) => {
      const s = get()
      const asset = s.assets[assetId]
      if (!asset) return
      const kind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video'
      const targetId = kind === 'video' ? s.targetVideoTrackId : s.targetAudioTrackId
      const track =
        (targetId && s.project.tracks.find((t) => t.id === targetId && t.kind === kind)) ||
        s.project.tracks.find((t) => t.kind === kind)
      if (!track || track.locked) return

      const t0 = s.playhead
      // Honor 3-point editing: use source in/out if set
      const srcIn = s.sourceIn ?? 0
      const srcDur = (s.sourceOut != null && s.sourceIn != null)
        ? Math.max(0.05, s.sourceOut - s.sourceIn)
        : (asset.kind === 'image' ? 5 : asset.duration)
      const dur = srcDur
      const t1 = t0 + dur
      const fresh: Clip = {
        id: uid(),
        assetId,
        start: t0,
        duration: dur,
        in: srcIn,
        out: srcIn + dur,
        props: { ...DEFAULT_PROPS },
        keyframes: EMPTY_KEYFRAMES()
      }

      record(mode === 'insert' ? 'Insert' : 'Overwrite')
      set((st) => {
        const tr = st.project.tracks.find((x) => x.id === track.id)!
        let clips: Clip[] = []
        if (mode === 'overwrite') {
          for (const c of tr.clips) {
            const cEnd = c.start + c.duration
            if (cEnd <= t0 || c.start >= t1) {
              clips.push(c) // untouched
            } else if (c.start < t0 && cEnd > t1) {
              // spans the whole insert: split into left + right remnants
              const left: Clip = { ...c, duration: t0 - c.start, out: c.in + (t0 - c.start) }
              const cutR = t1 - c.start
              const right: Clip = {
                ...c, id: uid(), start: t1, duration: cEnd - t1, in: c.in + cutR, inTransition: undefined
              }
              clips.push(left, right)
            } else if (c.start < t0) {
              clips.push({ ...c, duration: t0 - c.start, out: c.in + (t0 - c.start) })
            } else if (cEnd > t1) {
              const cut = t1 - c.start
              clips.push({ ...c, start: t1, duration: cEnd - t1, in: c.in + cut, inTransition: undefined })
            }
            // fully covered clips are dropped
          }
        } else {
          // insert: split anything straddling t0, then shift everything at/after t0 right
          for (const c of tr.clips) {
            const cEnd = c.start + c.duration
            if (cEnd <= t0 + 1e-6) {
              clips.push(c)
            } else if (c.start < t0) {
              const off = t0 - c.start
              clips.push({ ...c, duration: off, out: c.in + off })
              clips.push({
                ...c, id: uid(), start: t0 + dur, duration: c.duration - off, in: c.in + off, inTransition: undefined
              })
            } else {
              clips.push({ ...c, start: c.start + dur })
            }
          }
        }
        clips.push(fresh)
        return {
          project: withTrackClips(st.project, track.id, sortClips(clips)),
          selectedClipId: fresh.id,
          playhead: t1
        }
      })
    },

    setClipStarts: (updates) =>
      set((s) => {
        const map = new Map(updates.map((u) => [u.id, u.start]))
        return {
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) =>
              t.clips.some((c) => map.has(c.id))
                ? {
                    ...t,
                    clips: sortClips(
                      t.clips.map((c) => (map.has(c.id) ? { ...c, start: Math.max(0, map.get(c.id)!) } : c))
                    )
                  }
                : t
            )
          }
        }
      }),
    setSnapLine: (t) => set({ snapLine: t }),

    addTrack: (kind) => {
      const id = uid()
      set((s) => {
        const count = s.project.tracks.filter((t) => t.kind === kind).length + 1
        const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'C'
        const track: Track = {
          id,
          kind,
          name: `${prefix}${count}`,
          clips: [],
          muted: false,
          locked: false,
          hidden: false
        }
        const tracks = kind === 'audio' ? [...s.project.tracks, track] : [track, ...s.project.tracks]
        return { project: { ...s.project, tracks } }
      })
      return id
    },
    removeTrack: (id) => {
      set((s) => {
        if (s.project.tracks.length <= 2) return {}
        record('Remove track')
        const track = s.project.tracks.find((t) => t.id === id)
        const removedClipIds = new Set(track?.clips.map((c) => c.id) ?? [])
        return {
          project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== id) },
          selectedClipIds: s.selectedClipIds.filter((cId) => !removedClipIds.has(cId)),
          selectedClipId: removedClipIds.has(s.selectedClipId ?? '') ? null : s.selectedClipId,
          selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId
        }
      })
    },
    renameTrack: (id, name) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, name } : t))
        }
      })),
    setTrackHeight: (id, preset) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, heightPreset: preset } : t))
        }
      })),
    toggleTrackMute: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t))
        }
      })),
    toggleTrackHidden: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t))
        }
      })),

    addClipFromAsset: (assetId, trackId, at) => {
      const s = get()
      const asset = s.assets[assetId]
      if (!asset) return undefined
      const wantKind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video'
      let track = trackId ? s.trackById(trackId) : undefined
      if (!track || track.kind !== wantKind) track = s.project.tracks.find((t) => t.kind === wantKind)
      if (!track) {
        const newId = s.addTrack(wantKind)
        track = get().trackById(newId)
      }
      if (!track) return undefined

      const start =
        at ?? (track.clips.length ? Math.max(...track.clips.map((c) => c.start + c.duration)) : 0)
      const dur = asset.kind === 'image' ? 5 : asset.duration
      const clip: Clip = {
        id: uid(),
        assetId,
        start: Math.max(0, start),
        duration: dur,
        in: 0,
        out: dur,
        props: { ...DEFAULT_PROPS },
        keyframes: EMPTY_KEYFRAMES()
      }
      record('Insert clip')
      set((st) => ({
        project: withTrackClips(st.project, track!.id, sortClips([...track!.clips, clip])),
        selectedClipId: clip.id,
        selectedTrackId: track!.id
      }))
      return clip.id
    },

    addLinkedClipsFromAsset: (assetId, at, targetTrackId) => {
      const s = get()
      const asset = s.assets[assetId]
      if (!asset) return
      const dur = asset.kind === 'image' ? 5 : asset.duration
      const groupId = uid()
      record('Insert clip')
      set((st) => {
        let project = st.project
        let newSelected: string | null = null
        const createdIds: string[] = []

        const wantKind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video'
        const target = targetTrackId
          ? st.project.tracks.find((t) => t.id === targetTrackId && t.kind === wantKind && !t.locked)
          : undefined
        const vTrack =
          (wantKind === 'video' && target) ||
          st.project.tracks.find((t) => t.kind === 'video' && !t.locked)
        const aTrack =
          (wantKind === 'audio' && target) ||
          st.project.tracks.find((t) => t.kind === 'audio' && !t.locked)

        if (asset.kind !== 'audio' && vTrack) {
          const startT = at != null ? at : (vTrack.clips.length ? Math.max(...vTrack.clips.map((c) => c.start + c.duration)) : 0)
          const vClip: Clip = {
            id: uid(), assetId, start: Math.max(0, startT), duration: dur, in: 0, out: dur,
            props: { ...DEFAULT_PROPS }, keyframes: EMPTY_KEYFRAMES(),
            linkedGroupId: asset.hasAudio ? groupId : undefined
          }
          project = withTrackClips(project, vTrack.id, sortClips([...vTrack.clips, vClip]))
          newSelected = vClip.id
          createdIds.push(vClip.id)
          if (asset.hasAudio && aTrack) {
            const aClip: Clip = {
              id: uid(), assetId, start: vClip.start, duration: dur, in: 0, out: dur,
              props: { ...DEFAULT_PROPS }, keyframes: EMPTY_KEYFRAMES(),
              linkedGroupId: groupId
            }
            project = withTrackClips(project, aTrack.id, sortClips([...aTrack.clips, aClip]))
            createdIds.push(aClip.id)
          }
        } else if (asset.kind === 'audio' && aTrack) {
          const startT = at != null ? at : (aTrack.clips.length ? Math.max(...aTrack.clips.map((c) => c.start + c.duration)) : 0)
          const aClip: Clip = {
            id: uid(), assetId, start: Math.max(0, startT), duration: dur, in: 0, out: dur,
            props: { ...DEFAULT_PROPS }, keyframes: EMPTY_KEYFRAMES()
          }
          project = withTrackClips(project, aTrack.id, sortClips([...aTrack.clips, aClip]))
          newSelected = aClip.id
          createdIds.push(aClip.id)
        }
        return {
          project,
          selectedClipId: newSelected,
          selectedClipIds: createdIds,
          selectedGap: null
        }
      })
    },

    rippleTrimEdit: (dir) => {
      record(`Ripple trim ${dir === 'prev' ? 'previous' : 'next'} edit`)
      set((s) => {
        const t = s.playhead
        let project = s.project
        for (const track of project.tracks) {
          if (track.locked) continue
          if (dir === 'prev') {
            const prev = [...track.clips]
              .filter((c) => c.start + c.duration <= t + 0.04)
              .sort((a, b) => (b.start + b.duration) - (a.start + a.duration))[0]
            if (prev) {
              const asset = s.assets[prev.assetId]
              const room = asset && asset.kind !== 'image' ? asset.duration - prev.out : Infinity
              const delta = t - (prev.start + prev.duration)
              const d = Math.max(-(prev.duration - 0.05), Math.min(room, delta))
              if (Math.abs(d) > 0.01) {
                const updated = { ...prev, duration: prev.duration + d, out: prev.out + d }
                project = withTrackClips(project, track.id, sortClips(track.clips.map((c) => c.id === prev.id ? updated : c)))
              }
            }
          } else {
            const next = [...track.clips]
              .filter((c) => c.start >= t - 0.04)
              .sort((a, b) => a.start - b.start)[0]
            if (next) {
              const delta = t - next.start
              const d = Math.max(-next.in, Math.min(next.duration - 0.05, delta))
              if (Math.abs(d) > 0.01) {
                const updated = { ...next, start: next.start + d, duration: next.duration - d, in: next.in + d }
                project = withTrackClips(project, track.id, sortClips(track.clips.map((c) => c.id === next.id ? updated : c)))
              }
            }
          }
        }
        return { project }
      })
    },

    moveClip: (clipId, newStart, newTrackId) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found || found.track.locked) return {}
        const targetTrackId = newTrackId ?? found.track.id
        const start = Math.max(0, newStart)
        const delta = start - found.clip.start
        let project = s.project

        // Collect all clips in the same linked group to move together
        const groupId = s.linkedSelection ? found.clip.linkedGroupId : undefined
        const linkedClips = groupId
          ? project.tracks.flatMap((t) => t.clips.filter((c) => c.linkedGroupId === groupId && c.id !== clipId))
          : []

        // Remove the primary clip
        project = withTrackClips(project, found.track.id, found.track.clips.filter((c) => c.id !== clipId))
        const target = project.tracks.find((t) => t.id === targetTrackId)
        if (!target) return {}
        project = withTrackClips(project, targetTrackId, sortClips([...target.clips, { ...found.clip, start }]))

        // Move linked clips by the same delta
        for (const lc of linkedClips) {
          const lf = findClip(project, lc.id)
          if (!lf || lf.track.locked) continue
          const ls = Math.max(0, lc.start + delta)
          project = withTrackClips(project, lf.track.id, sortClips(lf.track.clips.map((c) => c.id === lc.id ? { ...c, start: ls } : c)))
        }

        return { project }
      }),

    moveClipsBy: (ids, delta) =>
      set((s) => {
        const idSet = new Set(ids)
        const moving = s.project.tracks.flatMap((t) => t.clips.filter((c) => idSet.has(c.id)))
        if (!moving.length) return {}
        // clamp the shared delta so the earliest clip can't go below 0
        const minStart = Math.min(...moving.map((c) => c.start))
        const d = Math.max(delta, -minStart)
        if (d === 0) return {}
        return {
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) =>
              t.clips.some((c) => idSet.has(c.id)) && !t.locked
                ? { ...t, clips: sortClips(t.clips.map((c) => (idSet.has(c.id) ? { ...c, start: c.start + d } : c))) }
                : t
            )
          }
        }
      }),

    resolveOverwrite: (movedIds) =>
      set((s) => {
        const moved = new Set(movedIds)
        const eps = 1e-4
        let project = s.project
        for (const track of project.tracks) {
          const movers = track.clips.filter((c) => moved.has(c.id))
          if (!movers.length) continue
          let clips = track.clips
          let changed = false
          for (const m of movers) {
            const t0 = m.start
            const t1 = m.start + m.duration
            const out: Clip[] = []
            for (const c of clips) {
              const cEnd = c.start + c.duration
              if (moved.has(c.id) || cEnd <= t0 + eps || c.start >= t1 - eps) {
                out.push(c)
                continue
              }
              changed = true
              if (c.start < t0 - eps && cEnd > t1 + eps) {
                // dropped clip lands inside this one: keep both remnants
                out.push({ ...c, duration: t0 - c.start, out: c.in + (t0 - c.start) })
                out.push({ ...c, id: uid(), start: t1, duration: cEnd - t1, in: c.in + (t1 - c.start), inTransition: undefined })
              } else if (c.start < t0 - eps) {
                out.push({ ...c, duration: t0 - c.start, out: c.in + (t0 - c.start) })
              } else if (cEnd > t1 + eps) {
                out.push({ ...c, start: t1, duration: cEnd - t1, in: c.in + (t1 - c.start), inTransition: undefined })
              }
              // fully covered clips are dropped
            }
            clips = out
          }
          if (changed) project = withTrackClips(project, track.id, sortClips(clips))
        }
        return project === s.project ? {} : { project }
      }),

    closeGap: () => {
      const s = get()
      const gap = s.selectedGap
      if (!gap) return
      const eps = 1e-4
      // Uniform ripple across all unlocked tracks so video/audio stay in sync,
      // limited by whatever clip ends latest before the gap on each track.
      let shift = gap.end - gap.start
      const movingIds = new Set<string>()
      for (const t of s.project.tracks) {
        if (t.locked) continue
        const moving = t.clips.filter((c) => c.start >= gap.end - eps)
        if (!moving.length) continue
        const minStart = Math.min(...moving.map((c) => c.start))
        const blockerEnd = t.clips
          .filter((c) => c.start < gap.end - eps)
          .reduce((m, c) => Math.max(m, c.start + c.duration), 0)
        shift = Math.min(shift, minStart - blockerEnd)
        for (const c of moving) movingIds.add(c.id)
      }
      if (shift <= eps || movingIds.size === 0) {
        set({ selectedGap: null })
        return
      }
      record('Close gap')
      set((st) => ({
        selectedGap: null,
        project: {
          ...st.project,
          tracks: st.project.tracks.map((t) =>
            t.clips.some((c) => movingIds.has(c.id))
              ? { ...t, clips: sortClips(t.clips.map((c) => (movingIds.has(c.id) ? { ...c, start: Math.max(0, c.start - shift) } : c))) }
              : t
          )
        }
      }))
    },

    trimClip: (clipId, edge, delta) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found || found.track.locked) return {}

        // trim the linked partner with the same clamped delta so A/V stay in sync
        const groupId = s.linkedSelection ? found.clip.linkedGroupId : undefined
        const targets = [found]
        if (groupId) {
          for (const t of s.project.tracks) {
            if (t.locked) continue
            const linked = t.clips.find((c) => c.linkedGroupId === groupId && c.id !== clipId)
            if (linked) targets.push({ clip: linked, track: t })
          }
        }

        // clamp once against every target so the pair never drifts apart
        let d = delta
        for (const { clip } of targets) {
          if (edge === 'start') {
            d = Math.max(-clip.in, Math.min(clip.duration - 0.05, d))
          } else {
            const asset = get().assets[clip.assetId]
            const room = asset && asset.kind !== 'image' ? asset.duration - clip.out : Infinity
            d = Math.max(-(clip.duration - 0.05), Math.min(room, d))
          }
        }
        if (d === 0) return {}

        let project = s.project
        for (const { clip, track } of targets) {
          const c = { ...clip }
          if (edge === 'start') {
            c.start += d
            c.duration -= d
            c.in += d
          } else {
            c.duration += d
            c.out += d
          }
          const tr = project.tracks.find((t) => t.id === track.id)!
          project = withTrackClips(project, tr.id, sortClips(tr.clips.map((x) => (x.id === c.id ? c : x))))
        }
        return { project }
      }),

    splitAt: (time, trackId) => {
      record('Add edit')
      set((s) => {
        let project = s.project
        let newSelected = s.selectedClipId
        // When splitting all tracks at once (no trackId filter), right-halves of
        // linked pairs get a fresh shared groupId so they stay linked to each other.
        // Map old groupId -> new groupId for right halves.
        const rightGroupMap = new Map<string, string>()
        for (const track of project.tracks) {
          if (trackId && track.id !== trackId) continue
          if (track.locked) continue
          const hits = track.clips.filter(
            (c) => time > c.start + 0.02 && time < c.start + c.duration - 0.02
          )
          if (!hits.length) continue
          let clips = [...track.clips]
          for (const c of hits) {
            const offset = time - c.start
            const left: Clip = { ...c, duration: offset, out: c.in + offset }
            // Determine right half's linkedGroupId:
            // - Single-track razor split: unlink right half (undefined)
            // - All-track split (⌘K): right halves of the same original pair share a new group
            let rightGroupId: string | undefined
            if (!trackId && c.linkedGroupId) {
              if (!rightGroupMap.has(c.linkedGroupId)) rightGroupMap.set(c.linkedGroupId, uid())
              rightGroupId = rightGroupMap.get(c.linkedGroupId)
            }
            const right: Clip = {
              ...c,
              id: uid(),
              start: time,
              duration: c.duration - offset,
              in: c.in + offset,
              linkedGroupId: rightGroupId,
              keyframes: {
                x: shiftKeyframes(c.keyframes.x, offset),
                y: shiftKeyframes(c.keyframes.y, offset),
                scale: shiftKeyframes(c.keyframes.scale, offset),
                rotation: shiftKeyframes(c.keyframes.rotation, offset),
                opacity: shiftKeyframes(c.keyframes.opacity, offset),
                volume: shiftKeyframes(c.keyframes.volume, offset)
              },
              inTransition: undefined
            }
            left.keyframes = {
              x: c.keyframes.x.filter((k) => k.t <= offset),
              y: c.keyframes.y.filter((k) => k.t <= offset),
              scale: c.keyframes.scale.filter((k) => k.t <= offset),
              rotation: c.keyframes.rotation.filter((k) => k.t <= offset),
              opacity: c.keyframes.opacity.filter((k) => k.t <= offset),
              volume: c.keyframes.volume.filter((k) => k.t <= offset)
            }
            clips = clips.flatMap((x) => (x.id === c.id ? [left, right] : [x]))
            if (s.selectedClipId === c.id) newSelected = left.id
          }
          project = withTrackClips(project, track.id, sortClips(clips))
        }
        return {
          project,
          selectedClipId: newSelected,
          selectedClipIds: newSelected ? [newSelected] : []
        }
      })
    },

    rippleDelete: (clipId) => {
      record('Ripple delete')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const gap = found.clip.duration
        const at = found.clip.start
        const groupId = s.linkedSelection ? found.clip.linkedGroupId : undefined
        let project = s.project
        // Ripple the primary track
        const newClips = found.track.clips
          .filter((c) => c.id !== clipId)
          .map((c) => (c.start > at ? { ...c, start: Math.max(0, c.start - gap) } : c))
        project = withTrackClips(project, found.track.id, sortClips(newClips))
        // Ripple the linked clip's track too
        if (groupId) {
          for (const t of project.tracks) {
            const linked = t.clips.find((c) => c.linkedGroupId === groupId && c.id !== clipId)
            if (linked) {
              const lAt = linked.start
              const nc2 = t.clips
                .filter((c) => c.id !== linked.id)
                .map((c) => (c.start > lAt ? { ...c, start: Math.max(0, c.start - gap) } : c))
              project = withTrackClips(project, t.id, sortClips(nc2))
            }
          }
        }
        return { project, selectedClipId: null, selectedClipIds: [] }
      })
    },

    removeClip: (clipId) => {
      record('Delete clip')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found || found.track.locked) return {}
        const groupId = found.clip.linkedGroupId
        let project = withTrackClips(s.project, found.track.id, found.track.clips.filter((c) => c.id !== clipId))
        if (groupId) {
          for (const t of project.tracks) {
            const linked = t.clips.find((c) => c.linkedGroupId === groupId && c.id !== clipId)
            if (!linked) continue
            // Linked Selection on → remove the partner too; off → keep it but
            // unlink it (it no longer has a pair).
            project = s.linkedSelection
              ? withTrackClips(project, t.id, t.clips.filter((c) => c.id !== linked.id))
              : withTrackClips(project, t.id, t.clips.map((c) =>
                  c.id === linked.id ? { ...c, linkedGroupId: undefined } : c))
          }
        }
        const newIds = s.selectedClipIds.filter((id) => id !== clipId)
        return { project, selectedClipId: newIds[0] ?? null, selectedClipIds: newIds }
      })
    },

    removeClipOnly: (clipId) => {
      record('Delete clip')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found || found.track.locked) return {}
        const groupId = found.clip.linkedGroupId
        let project = withTrackClips(s.project, found.track.id, found.track.clips.filter((c) => c.id !== clipId))
        // Unlink the remaining partner — it no longer has a pair
        if (groupId) {
          for (const t of project.tracks) {
            const partner = t.clips.find((c) => c.linkedGroupId === groupId)
            if (partner) {
              project = withTrackClips(project, t.id, t.clips.map((c) =>
                c.id === partner.id ? { ...c, linkedGroupId: undefined } : c
              ))
              break
            }
          }
        }
        const newIds = s.selectedClipIds.filter((id) => id !== clipId)
        return { project, selectedClipId: newIds[0] ?? null, selectedClipIds: newIds }
      })
    },

    removeClips: (clipIds) => {
      if (!clipIds.length) return
      record(clipIds.length > 1 ? 'Delete clips' : 'Delete clip')
      set((s) => {
        // Delete exactly what's selected — the selection itself already says
        // whether a linked A/V pair (both clips) or a single isolated clip is
        // the target (see the click-cycle in Timeline's onBodyDown). Any clip
        // whose linked partner is being deleted gets unlinked.
        const ids = new Set(clipIds)
        const groups = new Set<string>()
        for (const t of s.project.tracks)
          for (const c of t.clips) if (ids.has(c.id) && c.linkedGroupId) groups.add(c.linkedGroupId)
        return {
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) =>
              t.locked
                ? t
                : {
                    ...t,
                    clips: t.clips
                      .filter((c) => !ids.has(c.id))
                      // unlink survivors whose partner was just deleted
                      .map((c) =>
                        !s.linkedSelection && c.linkedGroupId && groups.has(c.linkedGroupId)
                          ? { ...c, linkedGroupId: undefined }
                          : c
                      )
                  }
            )
          },
          selectedClipId: null,
          selectedClipIds: []
        }
      })
    },

    updateClipProps: (clipId, patch) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const c = { ...found.clip, props: { ...found.clip.props, ...patch } }
        return {
          project: withTrackClips(
            s.project,
            found.track.id,
            found.track.clips.map((x) => (x.id === clipId ? c : x))
          )
        }
      }),

    setTransition: (clipId, t) => {
      record(t ? 'Apply transition' : 'Remove transition')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const c = { ...found.clip, inTransition: t }
        return {
          project: withTrackClips(
            s.project,
            found.track.id,
            found.track.clips.map((x) => (x.id === clipId ? c : x))
          )
        }
      })
    },

    setClipLabel: (clipId, color) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const updated = { ...found.clip, labelColor: color }
        return {
          project: withTrackClips(s.project, found.track.id, found.track.clips.map((x) => (x.id === clipId ? updated : x)))
        }
      }),

    setClipGain: (clipId, gainDb) => {
      record('Clip gain')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const updated = { ...found.clip, clipGain: gainDb }
        return {
          project: withTrackClips(s.project, found.track.id, found.track.clips.map((x) => (x.id === clipId ? updated : x)))
        }
      })
    },

    setClipFade: (clipId, edge, duration) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const patch = edge === 'in' ? { fadeIn: duration } : { fadeOut: duration }
        const updated = { ...found.clip, ...patch }
        return {
          project: withTrackClips(s.project, found.track.id, found.track.clips.map((x) => (x.id === clipId ? updated : x)))
        }
      }),

    setSoundTag: (clipId, tag) =>
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const updated = { ...found.clip, soundTag: tag }
        return {
          project: withTrackClips(s.project, found.track.id, found.track.clips.map((x) => (x.id === clipId ? updated : x)))
        }
      }),

    rollingTrim: (clipAId, clipBId, delta) => {
      record('Rolling edit')
      set((s) => {
        const fA = findClip(s.project, clipAId)
        const fB = findClip(s.project, clipBId)
        if (!fA || !fB) return {}
        const assetA = s.assets[fA.clip.assetId]
        const roomA = assetA && assetA.kind !== 'image' ? assetA.duration - fA.clip.out : Infinity
        const d = Math.max(-(fA.clip.duration - 0.05), Math.min(roomA, Math.max(-fB.clip.duration + 0.05, delta)))
        if (Math.abs(d) < 1e-4) return {}
        const cA = { ...fA.clip, duration: fA.clip.duration + d, out: fA.clip.out + d }
        const cB = { ...fB.clip, start: fB.clip.start + d, duration: fB.clip.duration - d, in: fB.clip.in + d }
        let project = withTrackClips(s.project, fA.track.id, sortClips(fA.track.clips.map((x) => (x.id === clipAId ? cA : x))))
        const trB = project.tracks.find((t) => t.id === fB.track.id)!
        project = withTrackClips(project, fB.track.id, sortClips(trB.clips.map((x) => (x.id === clipBId ? cB : x))))
        return { project }
      })
    },

    slipClip: (clipId, delta) => {
      record('Slip clip')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found) return {}
        const asset = s.assets[found.clip.assetId]
        if (!asset || asset.kind === 'image') return {}
        const maxIn = asset.duration - found.clip.duration
        const d = Math.max(-found.clip.in, Math.min(maxIn - found.clip.in, delta))
        if (Math.abs(d) < 1e-4) return {}
        const updated = { ...found.clip, in: found.clip.in + d, out: found.clip.out + d }
        return {
          project: withTrackClips(s.project, found.track.id, found.track.clips.map((x) => (x.id === clipId ? updated : x)))
        }
      })
    },

    slideClip: (clipId, delta) => {
      record('Slide clip')
      set((s) => {
        const found = findClip(s.project, clipId)
        if (!found || found.track.locked) return {}
        const sorted = sortClips(found.track.clips)
        const idx = sorted.findIndex((c) => c.id === clipId)
        const prev = idx > 0 ? sorted[idx - 1] : null
        const next = idx < sorted.length - 1 ? sorted[idx + 1] : null

        const minDelta = prev ? -(found.clip.start - (prev.start + Math.min(prev.duration - 0.05, prev.out - prev.in))) : -found.clip.start
        const maxDelta = next ? (next.start + next.duration - 0.05) - (found.clip.start + found.clip.duration) : Infinity
        const d = Math.max(minDelta, Math.min(maxDelta, delta))
        if (Math.abs(d) < 1e-4) return {}

        const clips = sorted.map((c) => {
          if (c.id === clipId) return { ...c, start: c.start + d }
          if (prev && c.id === prev.id) {
            const newDur = (found.clip.start + d) - c.start
            return { ...c, duration: Math.max(0.05, newDur), out: c.in + Math.max(0.05, newDur) }
          }
          if (next && c.id === next.id) {
            const newStart = found.clip.start + found.clip.duration + d
            const newDur = (next.start + next.duration) - newStart
            return { ...c, start: newStart, duration: Math.max(0.05, newDur), in: c.in + (newStart - next.start) }
          }
          return c
        })
        return { project: withTrackClips(s.project, found.track.id, sortClips(clips)) }
      })
    },

    addAdjustmentLayer: () => {
      record('Add adjustment layer')
      set((s) => {
        const dur = get().duration() || 30
        const trackId = uid()
        const clipId = uid()
        const adjTrack: Track = {
          id: trackId, kind: 'adjustment', name: 'Adj', clips: [], muted: false, locked: false, hidden: false
        }
        const adjClip: Clip = {
          id: clipId, assetId: '_adj', start: 0, duration: dur,
          in: 0, out: dur, props: { ...DEFAULT_PROPS }, keyframes: EMPTY_KEYFRAMES()
        }
        const tracks = [{ ...adjTrack, clips: [adjClip] }, ...s.project.tracks]
        return { project: { ...s.project, tracks }, selectedClipId: clipId, selectedTrackId: trackId }
      })
    },

    select: (clipId) =>
      set({
        selectedClipId: clipId,
        selectedClipIds: clipId ? [clipId] : [],
        selectedGap: null,
        selectedCueId: null
      }),
    toggleSelectClip: (id) =>
      set((s) => {
        const ids = s.selectedClipIds.includes(id)
          ? s.selectedClipIds.filter((x) => x !== id)
          : [...s.selectedClipIds, id]
        return { selectedClipIds: ids, selectedClipId: ids[0] ?? null, selectedGap: null, selectedCueId: null }
      }),
    setSelectedClipIds: (ids) =>
      set({ selectedClipIds: ids, selectedClipId: ids[0] ?? null, selectedGap: null, selectedCueId: null }),
    setSelectedGap: (g) =>
      set(
        g
          ? { selectedGap: g, selectedClipId: null, selectedClipIds: [], selectedCueId: null }
          : { selectedGap: null }
      ),
    selectTrack: (trackId) => set({ selectedTrackId: trackId }),
    setSelectedProp: (p) => set({ selectedProp: p }),

    addKeyframe: (clipId, prop, t, value, easing = 'easeInOut') =>
      set((s) =>
        mutateKeyframes(s, clipId, prop, (arr) => {
          const next = arr.filter((k) => Math.abs(k.t - t) > 1e-3)
          next.push({ t, value, easing })
          return next.sort((a, b) => a.t - b.t)
        })
      ),
    updateKeyframe: (clipId, prop, index, patch) =>
      set((s) =>
        mutateKeyframes(s, clipId, prop, (arr) => {
          const next = arr.map((k, i) => (i === index ? { ...k, ...patch } : k))
          return next.sort((a, b) => a.t - b.t)
        })
      ),
    removeKeyframe: (clipId, prop, index) =>
      set((s) => mutateKeyframes(s, clipId, prop, (arr) => arr.filter((_, i) => i !== index))),
    clearKeyframes: (clipId, prop) => {
      record('Clear keyframes')
      set((s) => mutateKeyframes(s, clipId, prop, () => []))
    },

    setCaptions: (cues) => {
      record('Generate captions')
      set((s) => ({ project: { ...s.project, captions: cues } }))
    },
    updateCaptionStyle: (patch) =>
      set((s) => ({ project: { ...s.project, captionStyle: { ...s.project.captionStyle, ...patch } } })),
    updateCue: (id, patch) =>
      set((s) => ({
        project: {
          ...s.project,
          captions: s.project.captions.map((c) => (c.id === id ? { ...c, ...patch } : c))
        }
      })),
    removeCue: (id) => {
      record('Delete caption')
      set((s) => ({
        project: { ...s.project, captions: s.project.captions.filter((c) => c.id !== id) },
        selectedCueId: s.selectedCueId === id ? null : s.selectedCueId
      }))
    },
    captionPreview: false,
    setCaptionPreview: (on) => set({ captionPreview: on }),

    selectedCueId: null,
    selectCue: (id) =>
      set(
        id
          ? { selectedCueId: id, selectedClipId: null, selectedClipIds: [], selectedGap: null }
          : { selectedCueId: null }
      ),
    addTextCue: (at, text = 'Your text') => {
      record('Add text')
      const id = uid()
      const base: CaptionCue = { id, start: Math.max(0, at), end: Math.max(0, at) + 3, text: '', words: [] }
      const cue = retimeCueText(base, text)
      set((s) => ({
        project: {
          ...s.project,
          captions: [...s.project.captions, cue].sort((a, b) => a.start - b.start)
        },
        selectedCueId: id,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null
      }))
      return id
    },
    moveCue: (id, newStart) =>
      set((s) => {
        const cue = s.project.captions.find((c) => c.id === id)
        if (!cue) return {}
        const delta = Math.max(0, newStart) - cue.start
        if (delta === 0) return {}
        const moved: CaptionCue = {
          ...cue,
          start: cue.start + delta,
          end: cue.end + delta,
          words: cue.words.map((w) => ({ ...w, start: w.start + delta, end: w.end + delta }))
        }
        return {
          project: {
            ...s.project,
            captions: s.project.captions.map((c) => (c.id === id ? moved : c)).sort((a, b) => a.start - b.start)
          }
        }
      }),
    trimCue: (id, edge, t) =>
      set((s) => ({
        project: {
          ...s.project,
          captions: s.project.captions
            .map((c) => {
              if (c.id !== id) return c
              if (edge === 'start') return { ...c, start: Math.max(0, Math.min(t, c.end - 0.2)) }
              return { ...c, end: Math.max(c.start + 0.2, t) }
            })
            .sort((a, b) => a.start - b.start)
        }
      }))
  }
})

// debug hook: lets devtools (and automated checks) drive the editor
;(window as unknown as { __unstuntedStore?: typeof useStore }).__unstuntedStore = useStore

function shiftKeyframes<T extends { t: number }>(arr: T[], offset: number): T[] {
  return arr.filter((k) => k.t >= offset).map((k) => ({ ...k, t: k.t - offset }))
}

function mutateKeyframes(
  s: EditorState,
  clipId: string,
  prop: AnimatablePropName,
  fn: (arr: Clip['keyframes'][AnimatablePropName]) => Clip['keyframes'][AnimatablePropName]
): Partial<EditorState> {
  const found = findClip(s.project, clipId)
  if (!found) return {}
  const c = {
    ...found.clip,
    keyframes: { ...found.clip.keyframes, [prop]: fn(found.clip.keyframes[prop]) }
  }
  return {
    project: withTrackClips(
      s.project,
      found.track.id,
      found.track.clips.map((x) => (x.id === clipId ? c : x))
    )
  }
}
