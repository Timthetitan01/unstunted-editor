import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import type {
  AnimatablePropName, CaptionAnim, CaptionCue, CaptionHighlightMode, CaptionPreset,
  CaptionReveal, CaptionStyle, Easing, SoundTag, StaticProps, TransitionType
} from '../../../shared/types'
import { NEUTRAL_ADJUST, LABEL_COLORS } from '../../../shared/types'
import { sampleKeyframes } from '../engine/keyframes'
import { transcribe } from '../lib/transcribe'
import { wordsToCues, retimeCueText } from '../engine/captions'
import { BUILTIN_FONTS, addCustomFont, getCustomFontOptions, loadPersistedFonts, type FontOption } from '../lib/fonts'
import { uid } from '../store'
import { IcStopwatch, IcDiamond, IcChevL, IcChevR, IcCC, IcReset } from './icons'

// ── scrubbable blue value, Premiere style ────────────────────────────────—
function DragNumber({
  value,
  step,
  onChange,
  min,
  max,
  suffix = ''
}: {
  value: number
  step: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const startRef = useRef({ x: 0, v: 0 })

  const clamp = (v: number): number => {
    if (min != null) v = Math.max(min, v)
    if (max != null) v = Math.min(max, v)
    return v
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="dragnum-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseFloat(text)
          if (!Number.isNaN(v)) onChange(clamp(v))
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className="dragnum"
      title="Drag to scrub · double-click to type"
      onDoubleClick={() => {
        setText(String(Number(value.toFixed(3))))
        setEditing(true)
      }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        startRef.current = { x: e.clientX, v: value }
      }}
      onPointerMove={(e) => {
        if (!(e.buttons & 1)) return
        const dx = e.clientX - startRef.current.x
        const mult = e.shiftKey ? 10 : 1
        onChange(clamp(startRef.current.v + dx * step * mult))
      }}
    >
      {Number(value.toFixed(2))}{suffix}
    </span>
  )
}

// ── Adobe-style toggle switch ───────────────────────────────────────────—
function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  )
}

// ── twirl-down section (optional Reset action in the header) ─────────────—
function Section({
  title,
  children,
  onReset
}: {
  title: string
  children: React.ReactNode
  onReset?: () => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="fx-section">
      <div className="fx-head-row">
        <button className="fx-head" onClick={() => setOpen(!open)}>
          <span className="twirl">{open ? '▼' : '▶'}</span>
          <span className="fx-tag">fx</span> {title}
        </button>
        {onReset && (
          <button className="reset-btn" title="Reset this group" onClick={onReset}><IcReset size={12} /></button>
        )}
      </div>
      {open && <div className="fx-body">{children}</div>}
    </div>
  )
}

// ── one non-keyframed adjustment row (brightness, blur, pan, …) ──────────—
function AdjustRow({
  clipId,
  label,
  name,
  step,
  min,
  max,
  suffix,
  reset = 0
}: {
  clipId: string
  label: string
  name: keyof StaticProps
  step: number
  min?: number
  max?: number
  suffix?: string
  reset?: number
}): JSX.Element {
  const found = useStore(useShallow((s) => s.clipById(clipId)))
  const updateClipProps = useStore((s) => s.updateClipProps)
  if (!found) return <></>
  const value = (found.clip.props[name] as number) ?? reset
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-values">
        <DragNumber
          value={value}
          step={step}
          min={min}
          max={max}
          suffix={suffix}
          onChange={(v) => updateClipProps(clipId, { [name]: v } as never)}
        />
      </span>
      <button
        className="reset-btn"
        title="Reset to default"
        onClick={() => updateClipProps(clipId, { [name]: reset } as never)}
      ><IcReset size={11} /></button>
    </div>
  )
}

// ── one animatable property row ─────────────────────────────────────────—
function PropRow({
  clipId,
  label,
  props
}: {
  clipId: string
  label: string
  props: { name: AnimatablePropName; step: number; min?: number; max?: number; suffix?: string }[]
}): JSX.Element {
  const found = useStore(useShallow((s) => s.clipById(clipId)))
  const playhead = useStore((s) => s.playhead)
  const updateClipProps = useStore((s) => s.updateClipProps)
  const addKeyframe = useStore((s) => s.addKeyframe)
  const removeKeyframe = useStore((s) => s.removeKeyframe)
  const updateKeyframe = useStore((s) => s.updateKeyframe)
  const clearKeyframes = useStore((s) => s.clearKeyframes)
  const setPlayhead = useStore((s) => s.setPlayhead)
  if (!found) return <></>
  const { clip } = found
  const localT = Math.max(0, Math.min(clip.duration, playhead - clip.start))

  const primary = props[0].name
  const kfs = clip.keyframes[primary]
  const animated = kfs.length > 0
  const kfHereIdx = kfs.findIndex((k) => Math.abs(k.t - localT) < 0.04)

  const valueOf = (name: AnimatablePropName): number =>
    clip.keyframes[name].length > 0
      ? sampleKeyframes(clip.keyframes[name], localT, clip.props[name])
      : clip.props[name]

  const setValue = (name: AnimatablePropName, v: number): void => {
    updateClipProps(clipId, { [name]: v } as never)
    if (clip.keyframes[name].length > 0) addKeyframe(clipId, name, localT, v)
  }

  const toggleStopwatch = (): void => {
    if (animated) {
      // bake current values, clear all keyframes in one undo entry
      for (const p of props) {
        const v = valueOf(p.name)
        clearKeyframes(clipId, p.name)
        updateClipProps(clipId, { [p.name]: v } as never)
      }
    } else {
      for (const p of props) addKeyframe(clipId, p.name, localT, clip.props[p.name])
    }
  }

  const gotoKf = (dir: -1 | 1): void => {
    const times = kfs.map((k) => clip.start + k.t)
    const target =
      dir > 0 ? times.find((t) => t > playhead + 1e-3) : [...times].reverse().find((t) => t < playhead - 1e-3)
    if (target != null) setPlayhead(target)
  }

  const toggleKfHere = (): void => {
    if (kfHereIdx >= 0) {
      for (const p of props) {
        const idx = clip.keyframes[p.name].findIndex((k) => Math.abs(k.t - localT) < 0.04)
        if (idx >= 0) removeKeyframe(clipId, p.name, idx)
      }
    } else {
      for (const p of props) addKeyframe(clipId, p.name, localT, valueOf(p.name))
    }
  }

  return (
    <div className="prop-row">
      <button
        className={`stopwatch ${animated ? 'on' : ''}`}
        title={animated ? 'Animation on — click to remove all keyframes' : 'Toggle animation (adds a keyframe)'}
        onClick={toggleStopwatch}
      ><IcStopwatch size={13} /></button>
      <span className="prop-label">{label}</span>
      <span className="prop-values">
        {props.map((p) => (
          <DragNumber
            key={p.name}
            value={valueOf(p.name)}
            step={p.step}
            min={p.min}
            max={p.max}
            suffix={p.suffix}
            onChange={(v) => setValue(p.name, v)}
          />
        ))}
      </span>
      {animated && (
        <span className="kf-nav">
          <button className="kfn" title="Previous keyframe" onClick={() => gotoKf(-1)}><IcChevL size={10} /></button>
          <button className={`kfn diamond ${kfHereIdx >= 0 ? 'on' : ''}`} title="Add/remove keyframe" onClick={toggleKfHere}><IcDiamond size={10} /></button>
          <button className="kfn" title="Next keyframe" onClick={() => gotoKf(1)}><IcChevR size={10} /></button>
          {kfHereIdx >= 0 && (
            <select
              className="kf-easing"
              title="Easing out of this keyframe"
              value={kfs[kfHereIdx].easing}
              onChange={(e) => updateKeyframe(clipId, primary, kfHereIdx, { easing: e.target.value as Easing })}
            >
              <option value="linear">Linear</option>
              <option value="easeIn">Ease In</option>
              <option value="easeOut">Ease Out</option>
              <option value="easeInOut">Ease In/Out</option>
              <option value="hold">Hold</option>
            <option value="bezier">Bezier</option>
            </select>
          )}
        </span>
      )}
    </div>
  )
}

function CueTextEditor({ cueId }: { cueId: string }): JSX.Element {
  const cue = useStore((s) => s.project.captions.find((c) => c.id === cueId))
  const updateCue = useStore((s) => s.updateCue)
  const removeCue = useStore((s) => s.removeCue)
  const [text, setText] = useState(cue?.text ?? '')
  useEffect(() => { if (cue) setText(cue.text) }, [cue?.text])

  if (!cue) return <p className="hint" style={{ padding: 10 }}>Caption not found.</p>

  const commit = (): void => {
    const trimmed = text.trim()
    if (trimmed && trimmed !== cue.text) {
      const retimed = retimeCueText(cue, trimmed)
      updateCue(cue.id, { text: retimed.text, words: retimed.words })
    } else {
      setText(cue.text)
    }
  }

  return (
    <div className="cue-fx-editor">
      <div className="fx-clipname">Caption — {fmtCueTime(cue.start)}</div>
      <div className="cap-group-label">Text</div>
      <textarea
        className="cue-fx-textarea"
        value={text}
        autoFocus
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
        }}
      />
      <p className="cap-hint">Enter to commit · Shift+Enter for newline</p>
      <div className="cap-group-label">Timing</div>
      <div className="prop-row">
        <span className="prop-label">In</span>
        <DragNumber value={cue.start} step={0.01} onChange={(v) => updateCue(cue.id, { start: Math.min(v, cue.end - 0.1) })} suffix="s" />
      </div>
      <div className="prop-row">
        <span className="prop-label">Out</span>
        <DragNumber value={cue.end} step={0.01} onChange={(v) => updateCue(cue.id, { end: Math.max(v, cue.start + 0.1) })} suffix="s" />
      </div>
      <button
        className="cap-mini-btn cap-mini-btn--danger"
        style={{ marginTop: 12, width: '100%' }}
        onClick={() => removeCue(cue.id)}
      >
        Delete cue
      </button>
    </div>
  )
}

export function EffectControls(): JSX.Element {
  const selectedClipId = useStore((s) => s.selectedClipId)
  const selectedCueId = useStore((s) => s.selectedCueId)
  return (
    <div className="inspector">
      {selectedCueId ? (
        <CueTextEditor cueId={selectedCueId} />
      ) : selectedClipId ? (
        <ClipControls clipId={selectedClipId} />
      ) : (
        <p className="hint" style={{ padding: 10 }}>Select a clip or caption in the Timeline to edit.</p>
      )}
    </div>
  )
}

const SOUND_TAG_LABELS: { id: SoundTag; label: string; color: string }[] = [
  { id: 'dialogue', label: 'Dialogue', color: '#3b82f6' },
  { id: 'music', label: 'Music', color: '#8b5cf6' },
  { id: 'sfx', label: 'SFX', color: '#f59e0b' },
  { id: 'ambience', label: 'Ambience', color: '#10b981' },
]

function ClipControls({ clipId }: { clipId: string }): JSX.Element {
  const found = useStore(useShallow((s) => s.clipById(clipId)))
  const asset = useStore((s) => (found ? s.assets[found.clip.assetId] : undefined))
  const setTransition = useStore((s) => s.setTransition)
  const updateClipProps = useStore((s) => s.updateClipProps)
  const setClipGain = useStore((s) => s.setClipGain)
  const setSoundTag = useStore((s) => s.setSoundTag)
  const setClipLabel = useStore((s) => s.setClipLabel)
  if (!found) return <p className="hint">Clip not found.</p>
  const { clip, track } = found
  const isVideo = track.kind !== 'audio'
  const tr = clip.inTransition
  const flipH = clip.props.flipH ?? false
  const flipV = clip.props.flipV ?? false
  const hasAudio = asset?.hasAudio || track.kind === 'audio'

  return (
    <>
      <div className="fx-clipname">{asset?.name ?? 'Clip'}</div>

      {/* Label color */}
      <div className="prop-row label-row">
        <span className="prop-label">Label</span>
        <span className="label-chips">
          {LABEL_COLORS.map((lc) => (
            <button
              key={lc.id}
              className={`label-chip ${clip.labelColor === lc.id ? 'active' : ''}`}
              style={{ background: lc.color }}
              title={lc.label}
              onClick={() => setClipLabel(clipId, clip.labelColor === lc.id ? undefined : lc.id)}
            />
          ))}
          {clip.labelColor && (
            <button className="label-chip-clear" title="Clear label" onClick={() => setClipLabel(clipId, undefined)}>×</button>
          )}
        </span>
      </div>

      {isVideo && (
        <>
          <Section
            title="Motion"
            onReset={() => updateClipProps(clipId, { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false })}
          >
            <PropRow clipId={clipId} label="Position" props={[
              { name: 'x', step: 1 },
              { name: 'y', step: 1 }
            ]} />
            <PropRow clipId={clipId} label="Scale" props={[{ name: 'scale', step: 0.005, min: 0 }]} />
            <PropRow clipId={clipId} label="Rotation" props={[{ name: 'rotation', step: 0.5, suffix: '°' }]} />
            <div className="prop-row">
              <span className="prop-label">Flip</span>
              <span className="toggle-pair">
                <span className="toggle-cap">H</span>
                <Toggle on={flipH} title="Flip horizontal" onChange={(v) => updateClipProps(clipId, { flipH: v })} />
                <span className="toggle-cap">V</span>
                <Toggle on={flipV} title="Flip vertical" onChange={(v) => updateClipProps(clipId, { flipV: v })} />
              </span>
            </div>
          </Section>
          <Section title="Opacity">
            <PropRow clipId={clipId} label="Opacity" props={[{ name: 'opacity', step: 0.005, min: 0, max: 1 }]} />
          </Section>

          {/* Lumetri Color panel */}
          <Section
            title="Lumetri Color"
            onReset={() => updateClipProps(clipId, {
              exposure: 0, brightness: 1, contrast: 1, saturation: 1,
              highlights: 0, shadows: 0, whites: 0, blacks: 0,
              temperature: 0, tint: 0,
              vignetteStrength: 0, vignetteMidpoint: 0.5, vignetteFeather: 0.5, vignetteRoundness: 1
            })}
          >
            <div className="lc-subhead">Basic Correction</div>
            <AdjustRow clipId={clipId} label="Exposure" name="exposure" step={0.01} min={-5} max={5} reset={0} />
            <AdjustRow clipId={clipId} label="Contrast" name="contrast" step={0.01} min={0} max={3} reset={1} />
            <AdjustRow clipId={clipId} label="Highlights" name="highlights" step={0.01} min={-1} max={1} reset={0} />
            <AdjustRow clipId={clipId} label="Shadows" name="shadows" step={0.01} min={-1} max={1} reset={0} />
            <AdjustRow clipId={clipId} label="Whites" name="whites" step={0.01} min={-1} max={1} reset={0} />
            <AdjustRow clipId={clipId} label="Blacks" name="blacks" step={0.01} min={-1} max={1} reset={0} />
            <AdjustRow clipId={clipId} label="Saturation" name="saturation" step={0.01} min={0} max={3} reset={1} />
            <AdjustRow clipId={clipId} label="Temperature" name="temperature" step={1} min={-100} max={100} reset={0} />
            <AdjustRow clipId={clipId} label="Tint" name="tint" step={1} min={-100} max={100} reset={0} />
            <div className="lc-subhead">Vignette</div>
            <AdjustRow clipId={clipId} label="Amount" name="vignetteStrength" step={0.01} min={0} max={1} reset={0} />
            <AdjustRow clipId={clipId} label="Midpoint" name="vignetteMidpoint" step={0.01} min={0} max={1} reset={0.5} />
            <AdjustRow clipId={clipId} label="Feather" name="vignetteFeather" step={0.01} min={0} max={1} reset={0.5} />
            <div className="lc-subhead">Legacy</div>
            <AdjustRow clipId={clipId} label="Brightness" name="brightness" step={0.01} min={0} max={3} reset={1} />
            <AdjustRow clipId={clipId} label="Blur" name="blur" step={0.5} min={0} max={80} suffix="px" reset={0} />
          </Section>
        </>
      )}
      {hasAudio && (
        <Section title="Audio" onReset={() => { updateClipProps(clipId, { volume: 1, pan: 0 }); setClipGain(clipId, 0) }}>
          <PropRow clipId={clipId} label="Level" props={[{ name: 'volume', step: 0.005, min: 0, max: 2 }]} />
          <div className="prop-row">
            <span className="prop-label">Clip Gain</span>
            <span className="prop-values">
              <DragNumber
                value={clip.clipGain ?? 0}
                step={0.1}
                min={-48}
                max={24}
                suffix=" dB"
                onChange={(v) => setClipGain(clipId, v)}
              />
            </span>
          </div>
          <AdjustRow clipId={clipId} label="Pan (L/R)" name="pan" step={0.01} min={-1} max={1} reset={0} />
        </Section>
      )}
      {hasAudio && (
        <Section title="Essential Sound">
          <div className="es-tags">
            {SOUND_TAG_LABELS.map((t) => (
              <button
                key={t.id}
                className={`es-tag ${clip.soundTag === t.id ? 'active' : ''}`}
                style={{ '--tag-color': t.color } as React.CSSProperties}
                onClick={() => setSoundTag(clipId, clip.soundTag === t.id ? undefined : t.id)}
              >{t.label}</button>
            ))}
          </div>
          {clip.soundTag === 'dialogue' && (
            <div className="es-settings">
              <AdjustRow clipId={clipId} label="Clarity" name="contrast" step={0.01} min={0} max={2} reset={1} />
            </div>
          )}
          {clip.soundTag === 'music' && (
            <div className="es-settings">
              <PropRow clipId={clipId} label="Level" props={[{ name: 'volume', step: 0.005, min: 0, max: 2 }]} />
            </div>
          )}
          <p className="hint es-hint">Tag audio for AI-aware mixing (coming soon).</p>
        </Section>
      )}
      <Section title="Transition (in)">
        <div className="row" style={{ padding: '2px 8px' }}>
          <select
            value={tr?.type ?? 'none'}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') setTransition(clipId, undefined)
              else setTransition(clipId, { type: v as TransitionType, duration: tr?.duration ?? 0.5 })
            }}
          >
            <option value="none">None</option>
            <option value="dissolve">Cross Dissolve</option>
            <option value="fadeToBlack">Dip to Black</option>
            <option value="wipeLeft">Wipe Left</option>
            <option value="wipeRight">Wipe Right</option>
          </select>
          {tr && (
            <>
              <DragNumber
                value={tr.duration}
                step={0.01}
                min={0.1}
                max={5}
                suffix="s"
                onChange={(v) => setTransition(clipId, { type: tr.type, duration: v })}
              />
            </>
          )}
        </div>
      </Section>
    </>
  )
}

// ── viral caption preset templates ─────────────────────────────────────────
// Clicking a preset applies the full look; every field stays editable after.
const PRESETS: { id: CaptionPreset; label: string; sub: string; style: Partial<CaptionStyle> }[] = [
  {
    id: 'hormozi', label: 'Hormozi', sub: 'Pop + emphasis',
    style: {
      fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#19e36b', strokeColor: '#000000', strokeWidth: 10,
      highlightMode: 'color', popScale: 1.14, animation: 'pop', reveal: 'cue',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 18, bgOn: false,
      autoEmphasis: true, emphasisColors: ['#ffd400', '#ff3b3b', '#19e36b'], maxWordsPerCue: 4
    }
  },
  {
    id: 'beast', label: 'Beast', sub: 'Bounce-in',
    style: {
      fontFamily: 'Impact, "Arial Narrow Bold", sans-serif', fontWeight: 900, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#ffd400', strokeColor: '#000000', strokeWidth: 12,
      highlightMode: 'color', popScale: 1.2, animation: 'bounce', reveal: 'cumulative',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 14, bgOn: false,
      autoEmphasis: true, emphasisColors: ['#ff3b3b', '#41a4ff', '#ffd400'], maxWordsPerCue: 3
    }
  },
  {
    id: 'karaoke', label: 'Karaoke', sub: 'Fill as spoken',
    style: {
      fontFamily: 'Inter, Arial, sans-serif', fontWeight: 800, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#41a4ff', strokeColor: '#000000', strokeWidth: 8,
      highlightMode: 'karaoke', popScale: 1, animation: 'none', reveal: 'cue',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 14, bgOn: false,
      autoEmphasis: false, maxWordsPerCue: 5
    }
  },
  {
    id: 'boxed', label: 'Boxed', sub: 'Highlight box',
    style: {
      fontFamily: 'Inter, Arial, sans-serif', fontWeight: 800, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#ff2d2d', strokeColor: '#000000', strokeWidth: 0,
      highlightMode: 'box', popScale: 1.06, animation: 'none', reveal: 'cue',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 16, bgOn: false,
      autoEmphasis: false, maxWordsPerCue: 4
    }
  },
  {
    id: 'glow', label: 'Glow', sub: 'Neon word',
    style: {
      fontFamily: '"Avenir Next", Avenir, sans-serif', fontWeight: 800, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#00e5ff', strokeColor: '#000000', strokeWidth: 0,
      highlightMode: 'glow', popScale: 1.08, animation: 'fade', reveal: 'cue',
      shadowOn: false, bgOn: false, autoEmphasis: false, maxWordsPerCue: 4
    }
  },
  {
    id: 'oneword', label: 'One Word', sub: 'Word at a time',
    style: {
      fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900, uppercase: true,
      fillColor: '#ffffff', highlightColor: '#ffd400', strokeColor: '#000000', strokeWidth: 12,
      highlightMode: 'none', popScale: 1, animation: 'pop', reveal: 'word',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 20, bgOn: false,
      autoEmphasis: false, maxWordsPerCue: 4
    }
  },
  {
    id: 'minimal', label: 'Minimal', sub: 'Clean pill',
    style: {
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 700, uppercase: false,
      fillColor: '#ffffff', highlightColor: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
      highlightMode: 'none', popScale: 1, animation: 'fade', reveal: 'cue',
      shadowOn: false, bgOn: true, bgColor: '#000000', bgOpacity: 0.6,
      autoEmphasis: false, maxWordsPerCue: 6
    }
  },
  {
    id: 'comic', label: 'Comic', sub: 'Shaky fun',
    style: {
      fontFamily: '"Marker Felt", "Comic Sans MS", cursive', fontWeight: 700, uppercase: true,
      fillColor: '#fff85e', highlightColor: '#ff5ec7', strokeColor: '#000000', strokeWidth: 8,
      highlightMode: 'color', popScale: 1.15, animation: 'shake', reveal: 'cue',
      shadowOn: true, shadowColor: '#000000', shadowBlur: 12, bgOn: false,
      autoEmphasis: false, maxWordsPerCue: 4
    }
  }
]

const HIGHLIGHT_MODES: { id: CaptionHighlightMode; label: string }[] = [
  { id: 'color', label: 'Color pop' },
  { id: 'box', label: 'Box' },
  { id: 'glow', label: 'Glow' },
  { id: 'underline', label: 'Underline' },
  { id: 'karaoke', label: 'Karaoke fill' },
  { id: 'none', label: 'None' }
]

const ANIMS: { id: CaptionAnim; label: string }[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideup', label: 'Slide up' },
  { id: 'shake', label: 'Shake' },
  { id: 'none', label: 'None' }
]

const REVEALS: { id: CaptionReveal; label: string }[] = [
  { id: 'cue', label: 'Full line' },
  { id: 'cumulative', label: 'Word by word' },
  { id: 'word', label: 'One word' }
]

// labeled colour swatch chip
function ColorChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <label className="color-chip" title={label}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="swatch" style={{ background: value }} />
      <span className="chip-label">{label}</span>
    </label>
  )
}

// slider row with a live value badge
function SliderField({
  label, value, min, max, step = 1, fmt, onChange
}: {
  label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="cap-field">
      <div className="cap-field-head">
        <span>{label}</span>
        <span className="val">{fmt ? fmt(value) : value}</span>
      </div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function fmtCueTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function CueRow({ cue }: { cue: CaptionCue }): JSX.Element {
  const updateCue = useStore((s) => s.updateCue)
  const removeCue = useStore((s) => s.removeCue)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const selectCue = useStore((s) => s.selectCue)
  const selected = useStore((s) => s.selectedCueId === cue.id)
  const [text, setText] = useState(cue.text)
  useEffect(() => setText(cue.text), [cue.text])

  const commit = (): void => {
    if (text.trim() && text !== cue.text) {
      const retimed = retimeCueText(cue, text.trim())
      updateCue(cue.id, { text: retimed.text, words: retimed.words })
    } else {
      setText(cue.text)
    }
  }

  return (
    <div
      className={`cue-row ${selected ? 'selected' : ''}`}
      onClick={() => { selectCue(cue.id); setPlayhead(cue.start) }}
    >
      <span className="cue-time">{fmtCueTime(cue.start)}</span>
      <input
        className="cue-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      <button className="cue-del" title="Delete cue" onClick={(e) => { e.stopPropagation(); removeCue(cue.id) }}>×</button>
    </div>
  )
}

export function CaptionsPanel({ flash }: { flash: (m: string) => void }): JSX.Element {
  const captions = useStore((s) => s.project.captions)
  const style = useStore((s) => s.project.captionStyle)
  const setCaptions = useStore((s) => s.setCaptions)
  const updateCaptionStyle = useStore((s) => s.updateCaptionStyle)
  const updateAsset = useStore((s) => s.updateAsset)
  const selectedClipId = useStore((s) => s.selectedClipId)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [tab, setTab] = useState<'style' | 'edit'>('style')
  const [customFonts, setCustomFonts] = useState<FontOption[]>(getCustomFontOptions())
  const fontFileRef = useRef<HTMLInputElement>(null)
  const prevMaxWords = useRef(style.maxWordsPerCue)

  // while this panel is open, the program monitor previews the caption style
  useEffect(() => {
    const s = useStore.getState()
    s.setCaptionPreview(true)
    loadPersistedFonts().then(setCustomFonts).catch(() => {})
    return () => s.setCaptionPreview(false)
  }, [])

  // auto-reformat from cached words when maxWordsPerCue changes
  useEffect(() => {
    if (style.maxWordsPerCue === prevMaxWords.current) return
    prevMaxWords.current = style.maxWordsPerCue
    const s = useStore.getState()
    const target = findAudioTarget(s, selectedClipId)
    if (!target) return
    const asset = s.assets[target.clip.assetId]
    if (!asset?.transcriptionWords?.length) return
    const offset = target.clip.start - target.clip.in
    const shifted = asset.transcriptionWords.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
    setCaptions(wordsToCues(shifted, style.maxWordsPerCue, uid))
  }, [style.maxWordsPerCue])

  function findAudioTarget(s: ReturnType<typeof useStore.getState>, clipId: string | null) {
    let target = clipId ? s.clipById(clipId) : undefined
    if (!target) {
      for (const t of s.project.tracks) {
        const c = t.clips.find((c) => s.assets[c.assetId]?.hasAudio)
        if (c) { target = { clip: c, track: t }; break }
      }
    }
    return target
  }

  const reformatFromCache = (s: ReturnType<typeof useStore.getState>, maxWords: number): boolean => {
    const target = findAudioTarget(s, selectedClipId)
    if (!target) return false
    const asset = s.assets[target.clip.assetId]
    if (!asset?.transcriptionWords?.length) return false
    const offset = target.clip.start - target.clip.in
    const shifted = asset.transcriptionWords.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
    setCaptions(wordsToCues(shifted, maxWords, uid))
    return true
  }

  const generate = async (forceRetranscribe = false): Promise<void> => {
    const s = useStore.getState()
    const target = findAudioTarget(s, selectedClipId)
    if (!target) return flash('Add a clip with audio first')
    const asset = s.assets[target.clip.assetId]
    if (!asset?.hasAudio) return flash('Selected clip has no audio')

    // fast path: use cached transcription words
    if (!forceRetranscribe && reformatFromCache(s, style.maxWordsPerCue)) {
      flash(`Formatted ${useStore.getState().project.captions.length} caption cues`)
      return
    }

    setBusy(true)
    try {
      const offset = target.clip.start - target.clip.in
      const result = await transcribe(asset.path, 0, undefined, (m, pct) =>
        setStatus(pct != null ? `${m} ${pct}%` : m)
      )
      // save source-relative words to asset (no offset) for future reformats
      updateAsset(asset.id, { transcriptionWords: result.words })
      const shifted = result.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
      const cues = wordsToCues(shifted, style.maxWordsPerCue, uid)
      setCaptions(cues)
      flash(`Generated ${cues.length} caption cues`)
    } catch (e) {
      flash(`Caption error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const onFontFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const opt = await addCustomFont(file)
      setCustomFonts(getCustomFontOptions())
      updateCaptionStyle({ fontFamily: opt.value })
      flash(`Font "${opt.label}" added`)
    } catch (e) {
      flash(`Font error: ${(e as Error).message}`)
    }
  }

  const stepWords = (d: number): void =>
    updateCaptionStyle({ maxWordsPerCue: Math.max(1, Math.min(8, style.maxWordsPerCue + d)) })

  const allFonts = [...BUILTIN_FONTS, ...customFonts]
  const fontKnown = allFonts.some((f) => f.value === style.fontFamily)
  const emph = style.emphasisColors ?? []

  // check if we have cached words available for the current target clip
  const hasCachedWords = (() => {
    const s = useStore.getState()
    const target = findAudioTarget(s, selectedClipId)
    if (!target) return false
    return !!(s.assets[target.clip.assetId]?.transcriptionWords?.length)
  })()

  const btnLabel = busy
    ? (status || 'Transcribing…')
    : captions.length === 0
      ? 'Generate captions'
      : hasCachedWords ? 'Reformat cues' : 'Re-generate captions'

  return (
    <div className="cap-panel">
      <div className="cap-header">
        <span className="cap-title"><IcCC size={15} /> Captions</span>
        {captions.length > 0 && <span className="cap-count">{captions.length} cues</span>}
      </div>

      <div className="cap-generate-row">
        <button className={`cap-generate ${busy ? 'busy' : ''}`} onClick={() => generate(false)} disabled={busy}>
          {btnLabel}
        </button>
        {hasCachedWords && !busy && (
          <button className="cap-retranscribe" title="Discard cached transcription and re-run" onClick={() => generate(true)}>
            ↺
          </button>
        )}
      </div>
      <p className="cap-hint">
        {hasCachedWords
          ? 'Transcription cached — style changes apply instantly.'
          : 'Style previews live in the Program monitor →'}
      </p>

      <div className="cap-tabs">
        <button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}>Style</button>
        <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
          Edit Cues {captions.length > 0 && <span className="cap-tab-badge">{captions.length}</span>}
        </button>
      </div>

      {tab === 'style' && (
        <>
          <div className="cap-group-label">Style preset</div>
          <div className="cap-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset-tile ${style.preset === p.id ? 'active' : ''}`}
                onClick={() => updateCaptionStyle({ preset: p.id, ...p.style })}
              >
                <span className={`preset-swatch preset-${p.id}`}>
                  <b>Your <span>word</span></b>
                </span>
                <span className="preset-info">
                  <span className="preset-name">{p.label}</span>
                  <span className="preset-sub">{p.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="cap-group-label">Type</div>
          <div className="cap-field">
            <div className="cap-field-head">
              <span>Font</span>
              <button className="cap-mini-btn" onClick={() => fontFileRef.current?.click()}>+ Add font…</button>
              <input
                ref={fontFileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                style={{ display: 'none' }}
                onChange={(e) => { onFontFile(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>
            <select className="cap-select" value={fontKnown ? style.fontFamily : ''} onChange={(e) => updateCaptionStyle({ fontFamily: e.target.value })}>
              {!fontKnown && <option value="">{style.fontFamily}</option>}
              <optgroup label="Built-in">
                {BUILTIN_FONTS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
              </optgroup>
              {customFonts.length > 0 && (
                <optgroup label="Your fonts">
                  {customFonts.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="cap-row-split">
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>Weight</span></div>
              <select className="cap-select" value={style.fontWeight ?? 900} onChange={(e) => updateCaptionStyle({ fontWeight: Number(e.target.value) })}>
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
                <option value={800}>Extrabold</option>
                <option value={900}>Black</option>
              </select>
            </div>
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>ALL CAPS</span></div>
              <Toggle on={style.uppercase} onChange={(v) => updateCaptionStyle({ uppercase: v })} title="Uppercase captions" />
            </div>
          </div>
          <SliderField label="Size" value={style.fontSize} min={28} max={200} onChange={(v) => updateCaptionStyle({ fontSize: v })} />
          <SliderField label="Letter spacing" value={style.letterSpacing ?? 0} min={-4} max={24} onChange={(v) => updateCaptionStyle({ letterSpacing: v })} />
          <SliderField
            label="Position" value={style.position} min={0.1} max={0.95} step={0.01}
            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateCaptionStyle({ position: v })}
          />
          <div className="cap-field">
            <div className="cap-field-head"><span>Words / line</span></div>
            <div className="stepper">
              <button onClick={() => stepWords(-1)} disabled={style.maxWordsPerCue <= 1}>−</button>
              <span>{style.maxWordsPerCue}</span>
              <button onClick={() => stepWords(1)} disabled={style.maxWordsPerCue >= 8}>+</button>
            </div>
          </div>

          <div className="cap-group-label">Highlight &amp; animation</div>
          <div className="cap-row-split">
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>Highlight</span></div>
              <select className="cap-select" value={style.highlightMode ?? 'color'} onChange={(e) => updateCaptionStyle({ highlightMode: e.target.value as CaptionHighlightMode })}>
                {HIGHLIGHT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>Entrance</span></div>
              <select className="cap-select" value={style.animation ?? 'pop'} onChange={(e) => updateCaptionStyle({ animation: e.target.value as CaptionAnim })}>
                {ANIMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div className="cap-field">
            <div className="cap-field-head"><span>Reveal</span></div>
            <select className="cap-select" value={style.reveal ?? 'cue'} onChange={(e) => updateCaptionStyle({ reveal: e.target.value as CaptionReveal })}>
              {REVEALS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <SliderField
            label="Word pop" value={style.popScale ?? 1.12} min={1} max={1.6} step={0.01}
            fmt={(v) => `${Math.round((v - 1) * 100)}%`} onChange={(v) => updateCaptionStyle({ popScale: v })}
          />

          <div className="cap-group-label">Colors</div>
          <div className="swatch-row">
            <ColorChip label="Fill" value={style.fillColor} onChange={(v) => updateCaptionStyle({ fillColor: v })} />
            <ColorChip label="Highlight" value={style.highlightColor} onChange={(v) => updateCaptionStyle({ highlightColor: v })} />
            <ColorChip label="Stroke" value={style.strokeColor} onChange={(v) => updateCaptionStyle({ strokeColor: v })} />
          </div>
          <SliderField label="Outline" value={style.strokeWidth} min={0} max={24} onChange={(v) => updateCaptionStyle({ strokeWidth: v })} />

          <div className="cap-row-split">
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>Shadow</span></div>
              <Toggle on={style.shadowOn ?? false} onChange={(v) => updateCaptionStyle({ shadowOn: v })} title="Drop shadow" />
            </div>
            <div className="cap-field" style={{ flex: 1 }}>
              <div className="cap-field-head"><span>Background</span></div>
              <Toggle on={style.bgOn ?? false} onChange={(v) => updateCaptionStyle({ bgOn: v })} title="Pill behind each line" />
            </div>
          </div>
          {style.shadowOn && (
            <div className="cap-row-split">
              <div className="cap-field" style={{ flex: '0 0 64px' }}>
                <ColorChip label="Shadow" value={style.shadowColor ?? '#000000'} onChange={(v) => updateCaptionStyle({ shadowColor: v })} />
              </div>
              <div className="cap-field" style={{ flex: 1 }}>
                <SliderField label="Blur" value={style.shadowBlur ?? 18} min={0} max={60} onChange={(v) => updateCaptionStyle({ shadowBlur: v })} />
              </div>
            </div>
          )}
          {style.bgOn && (
            <div className="cap-row-split">
              <div className="cap-field" style={{ flex: '0 0 64px' }}>
                <ColorChip label="BG" value={style.bgColor ?? '#000000'} onChange={(v) => updateCaptionStyle({ bgColor: v })} />
              </div>
              <div className="cap-field" style={{ flex: 1 }}>
                <SliderField
                  label="Opacity" value={style.bgOpacity ?? 0.55} min={0} max={1} step={0.01}
                  fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateCaptionStyle({ bgOpacity: v })}
                />
              </div>
            </div>
          )}

          <div className="cap-group-label">Auto emphasis</div>
          <div className="cap-row-split">
            <div className="cap-field" style={{ flex: '0 0 52px' }}>
              <div className="cap-field-head"><span>On</span></div>
              <Toggle on={style.autoEmphasis ?? false} onChange={(v) => updateCaptionStyle({ autoEmphasis: v })} title="Auto-color the key word of each line" />
            </div>
            {style.autoEmphasis && (
              <div className="swatch-row" style={{ flex: 1 }}>
                {[0, 1, 2].map((i) => (
                  <ColorChip
                    key={i}
                    label={`#${i + 1}`}
                    value={emph[i] ?? '#ffd400'}
                    onChange={(v) => {
                      const next = [...emph]
                      while (next.length < 3) next.push('#ffd400')
                      next[i] = v
                      updateCaptionStyle({ emphasisColors: next })
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {style.autoEmphasis && <p className="cap-hint">The biggest word of each line gets colored automatically.</p>}
        </>
      )}

      {tab === 'edit' && (
        <div className="cue-edit-tab">
          {captions.length === 0 ? (
            <p className="cap-hint" style={{ padding: '16px 0' }}>Generate captions first, then edit each line here.</p>
          ) : (
            <>
              <div className="cue-list-header">
                <span>{captions.length} cues — click a row to jump</span>
                <button className="cap-mini-btn cap-mini-btn--danger" onClick={() => setCaptions([])}>Clear all</button>
              </div>
              <div className="cue-list">
                {captions.map((c) => <CueRow key={c.id} cue={c} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
