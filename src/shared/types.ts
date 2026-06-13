// ── Core data model shared between main & renderer ──────────────────────────
// All times are in SECONDS (floating point) unless suffixed otherwise.

export type MediaKind = 'video' | 'audio' | 'image'

export interface MediaAsset {
  id: string
  name: string
  /** Absolute path on disk (used by ffmpeg for export). */
  path: string
  /** file:// URL the renderer <video>/<img> can load. */
  url: string
  kind: MediaKind
  duration: number // seconds (images get a synthetic default)
  width: number
  height: number
  fps: number
  hasAudio: boolean
  /** data: URL thumbnail for the media bin. */
  thumbnail?: string
  /** data: URL horizontal filmstrip (N frames tiled) for timeline clips. */
  filmstrip?: string
  /** number of frames tiled in the filmstrip image. */
  filmstripFrames?: number
  /** data: URL waveform image (full asset duration) for audio clips. */
  waveform?: string
  /** normalized 0..1 peak amplitudes across the asset — timeline waveforms
   *  draw from these at any zoom without stretching an image. */
  peaks?: number[]
  /** Cached Whisper words with SOURCE-RELATIVE timestamps (no timeline offset).
   *  Re-used to reformat cues without re-transcribing. */
  transcriptionWords?: CaptionWord[]
  /** Low-resolution proxy file path on disk. */
  proxyPath?: string
  /** swift-media:// URL for the proxy file. */
  proxyUrl?: string
}

export interface Marker {
  id: string
  time: number
  label?: string
  color: string
}

// ── Bins (project panel folder hierarchy) ───────────────────────────────────
export interface Bin {
  id: string
  name: string
  parentId?: string
  assetIds: string[]
  expanded?: boolean
}

// ── Keyframing ──────────────────────────────────────────────────────────────
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold' | 'bezier'

/** Optional bezier tangent handle, expressed as delta from the keyframe position.
 *  dx = time offset (seconds), dy = value offset. */
export interface BezierHandle {
  dx: number
  dy: number
}

export interface Keyframe {
  /** Time relative to the clip's start, in seconds. */
  t: number
  value: number
  easing: Easing
  /** Outgoing bezier tangent (only used when easing='bezier'). */
  outHandle?: BezierHandle
  /** Incoming bezier tangent from the previous keyframe's perspective. */
  inHandle?: BezierHandle
}

/** Animatable transform/visual properties. Empty array => use `static` value. */
export interface AnimatableProps {
  x: Keyframe[] // px offset from centered position
  y: Keyframe[]
  scale: Keyframe[] // 1 = fit
  rotation: Keyframe[] // degrees
  opacity: Keyframe[] // 0..1
  volume: Keyframe[] // 0..1 (audio)
}

export type AnimatablePropName = keyof AnimatableProps

/** Static fallback values when a property has no keyframes. */
export interface StaticProps {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  volume: number
  // ── Lumetri Color: Basic Correction ──────────────────────────────────────
  exposure: number    // EV stops, 0 = neutral; maps to brightness(2^exposure)
  brightness: number  // legacy multiplier 1=neutral; kept for backward compat
  contrast: number    // CSS contrast(), 1 = neutral
  highlights: number  // -1..+1, affects bright areas
  shadows: number     // -1..+1, affects dark areas
  whites: number      // -1..+1
  blacks: number      // -1..+1
  saturation: number  // CSS saturate(), 1 = neutral
  temperature: number // -100 (cool/blue) .. +100 (warm/amber), 0 = neutral
  tint: number        // -100 (green) .. +100 (magenta), 0 = neutral
  // ── Lumetri Color: Vignette ───────────────────────────────────────────────
  vignetteStrength: number  // 0..1
  vignetteMidpoint: number  // 0..1, radial gradient midpoint
  vignetteFeather: number   // 0..1
  vignetteRoundness: number // 0 = oval, 1 = round
  // ── Other ────────────────────────────────────────────────────────────────
  blur: number  // px, 0 = none
  flipH: boolean
  flipV: boolean
  // ── audio ──
  pan: number // -1 (L) .. 0 .. 1 (R)
}

/** Neutral content/audio adjustment values — used as fallbacks for clips saved
 *  before these fields existed. */
export const NEUTRAL_ADJUST: Partial<StaticProps> = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vignetteStrength: 0,
  vignetteMidpoint: 0.5,
  vignetteFeather: 0.5,
  vignetteRoundness: 1,
  flipH: false,
  flipV: false,
  pan: 0
}

// ── Sound tagging (Essential Sound panel) ────────────────────────────────────
export type SoundTag = 'dialogue' | 'music' | 'sfx' | 'ambience'

// ── Label colors (Premiere-style clip color coding) ──────────────────────────
export const LABEL_COLORS = [
  { id: 'violet', color: '#9b59b6', label: 'Violet' },
  { id: 'iris', color: '#4a90d9', label: 'Iris' },
  { id: 'caribbean', color: '#00bcd4', label: 'Caribbean' },
  { id: 'forest', color: '#27ae60', label: 'Forest' },
  { id: 'rose', color: '#e91e63', label: 'Rose' },
  { id: 'mango', color: '#ff9800', label: 'Mango' },
  { id: 'lagoon', color: '#1abc9c', label: 'Lagoon' },
  { id: 'cerulean', color: '#2196f3', label: 'Cerulean' },
] as const

// ── Transitions ───────────────────────────────────────────────────────────—
export type TransitionType = 'dissolve' | 'fadeToBlack' | 'wipeLeft' | 'wipeRight'

export interface Transition {
  type: TransitionType
  duration: number // seconds, overlaps with neighbour
}

// ── Video/Audio Effects ───────────────────────────────────────────────────—
export type VideoEffectType =
  | 'blur' | 'brightness_contrast' | 'hue_saturation' | 'exposure' | 'vignette'
  | 'mosaic' | 'sharpen' | 'edge_detect' | 'emboss'

export type AudioEffectType = 'volume' | 'balance' | 'clipGain'

// ── Captions ─────────────────────────────────────────────────────────────—
export interface CaptionWord {
  word: string
  start: number // absolute timeline seconds
  end: number
}

export type CaptionPreset =
  | 'hormozi' | 'beast' | 'karaoke' | 'boxed' | 'glow' | 'oneword' | 'minimal' | 'comic'

/** How the currently-spoken word is emphasized. */
export type CaptionHighlightMode = 'color' | 'box' | 'glow' | 'underline' | 'karaoke' | 'none'

/** Per-word entrance animation. */
export type CaptionAnim = 'none' | 'pop' | 'bounce' | 'fade' | 'slideup' | 'shake'

/** How much of the cue is visible at once. */
export type CaptionReveal = 'cue' | 'cumulative' | 'word'

export interface CaptionStyle {
  preset: CaptionPreset
  fontFamily: string
  fontSize: number // px at project height
  fontWeight: number // 400..900
  letterSpacing: number // px at project height
  fillColor: string
  highlightColor: string
  strokeColor: string
  strokeWidth: number
  /** vertical anchor 0 (top) .. 1 (bottom) */
  position: number
  uppercase: boolean
  maxWordsPerCue: number
  highlightMode: CaptionHighlightMode
  /** scale applied to the active word (1 = off) */
  popScale: number
  animation: CaptionAnim
  reveal: CaptionReveal
  shadowOn: boolean
  shadowColor: string
  shadowBlur: number
  /** rounded pill drawn behind each caption line */
  bgOn: boolean
  bgColor: string
  bgOpacity: number // 0..1
  /** auto-color the most important word of each cue from this palette */
  autoEmphasis: boolean
  emphasisColors: string[]
}

export interface CaptionCue {
  id: string
  start: number
  end: number
  text: string
  words: CaptionWord[]
}

// ── Clips & tracks ──────────────────────────────────────────────────────────
export interface Clip {
  id: string
  /** 'adjustment' sentinel for adjustment layer clips (no real asset). */
  assetId: string
  /** Position on the timeline (seconds). */
  start: number
  /** Visible length on the timeline (seconds). */
  duration: number
  /** Source trim in-point (seconds into the asset). */
  in: number
  /** Source trim out-point (seconds into the asset). */
  out: number
  props: StaticProps
  keyframes: AnimatableProps
  /** Transition that eases INTO this clip from the previous one. */
  inTransition?: Transition
  /** Shared ID linking a video clip to its paired audio clip (auto-split on import). */
  linkedGroupId?: string
  /** Clip label color id (from LABEL_COLORS). */
  labelColor?: string
  /** Per-clip gain trim in dB (applied before volume keyframe). 0 = neutral. */
  clipGain?: number
  /** Fade-in duration in seconds. */
  fadeIn?: number
  /** Fade-out duration in seconds. */
  fadeOut?: number
  /** Essential Sound tag for AI-assisted audio mixing. */
  soundTag?: SoundTag
}

/** Track height presets matching Premiere's track height options. */
export type TrackHeightPreset = 'small' | 'medium' | 'large' | 'expanded'

export type TrackKind = 'video' | 'audio' | 'caption' | 'adjustment'

export interface Track {
  id: string
  kind: TrackKind
  name: string
  clips: Clip[]
  muted: boolean
  locked: boolean
  hidden: boolean
  /** Visual height preset. Defaults to 'medium'. */
  heightPreset?: TrackHeightPreset
}

export interface Project {
  id: string
  name: string
  width: number
  height: number
  fps: number
  sampleRate: number
  background: string
  tracks: Track[]
  captions: CaptionCue[]
  captionStyle: CaptionStyle
  markers: Marker[]
  /** Media bin folders. Assets not in any bin appear at the root level. */
  bins?: Bin[]
}

// ── Export queue ──────────────────────────────────────────────────────────—
export interface ExportQueueItem {
  id: string
  name: string
  outputPath: string
  bitrateK: number
  rangeStart: number
  rangeEnd: number
  status: 'pending' | 'running' | 'done' | 'error'
  percent: number
  message?: string
}

// ── IPC contracts ─────────────────────────────────────────────────────────—
export interface ProbeResult {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  kind: MediaKind
}

export interface ExportRequest {
  project: Project
  assets: MediaAsset[]
  outputPath: string
  // render range; full project if omitted
  rangeStart?: number
  rangeEnd?: number
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'muxing' | 'done' | 'error'
  percent: number
  message?: string
}

/** Custom privileged scheme the main process serves local media over (not file://). */
export const MEDIA_SCHEME = 'swift-media'
