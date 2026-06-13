import { useState, useMemo } from 'react'
import { useStore } from '../store'
import type { TransitionType } from '../../../shared/types'
import { IcTransition } from './icons'

const TRANSITIONS: { type: TransitionType; label: string }[] = [
  { type: 'dissolve', label: 'Cross Dissolve' },
  { type: 'fadeToBlack', label: 'Dip to Black' },
  { type: 'wipeLeft', label: 'Wipe Left' },
  { type: 'wipeRight', label: 'Wipe Right' }
]

interface VideoEffect {
  id: string
  label: string
  category: string
  apply: (props: Record<string, number | boolean>) => Record<string, number | boolean>
  defaults: Record<string, number | boolean>
}

interface AudioEffect {
  id: string
  label: string
  category: string
}

const VIDEO_EFFECTS: VideoEffect[] = [
  { id: 'blur', label: 'Gaussian Blur', category: 'Blur & Sharpen', apply: (p) => ({ ...p, blur: 10 }), defaults: { blur: 10 } },
  { id: 'brightness_contrast', label: 'Brightness & Contrast', category: 'Color Correction', apply: (p) => ({ ...p, brightness: 1.2, contrast: 1.1 }), defaults: { brightness: 1.2, contrast: 1.1 } },
  { id: 'hue_saturation', label: 'Hue/Saturation', category: 'Color Correction', apply: (p) => ({ ...p, saturation: 1.3 }), defaults: { saturation: 1.3 } },
  { id: 'exposure', label: 'Exposure', category: 'Color Correction', apply: (p) => ({ ...p, exposure: 0.5 }), defaults: { exposure: 0.5 } },
  { id: 'vignette', label: 'Vignette', category: 'Stylize', apply: (p) => ({ ...p, vignetteStrength: 0.6 }), defaults: { vignetteStrength: 0.6 } },
  { id: 'desaturate', label: 'Black & White', category: 'Color Correction', apply: (p) => ({ ...p, saturation: 0 }), defaults: { saturation: 0 } },
  { id: 'warm', label: 'Warm Tone', category: 'Color Grading', apply: (p) => ({ ...p, temperature: 40 }), defaults: { temperature: 40 } },
  { id: 'cool', label: 'Cool Tone', category: 'Color Grading', apply: (p) => ({ ...p, temperature: -40 }), defaults: { temperature: -40 } },
  { id: 'flipH', label: 'Flip Horizontal', category: 'Transform', apply: (p) => ({ ...p, flipH: true }), defaults: { flipH: true } },
  { id: 'flipV', label: 'Flip Vertical', category: 'Transform', apply: (p) => ({ ...p, flipV: true }), defaults: { flipV: true } },
]

const AUDIO_EFFECTS: AudioEffect[] = [
  { id: 'volume', label: 'Volume', category: 'Amplitude' },
  { id: 'balance', label: 'Balance (Pan)', category: 'Amplitude' },
  { id: 'clipGain', label: 'Clip Gain', category: 'Amplitude' },
]

/** Group by category */
function groupBy<T extends { category: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const arr = map.get(item.category) ?? []
    arr.push(item)
    map.set(item.category, arr)
  }
  return map
}

export function EffectsPanel(): JSX.Element {
  const selectedClipId = useStore((s) => s.selectedClipId)
  const setTransition = useStore((s) => s.setTransition)
  const updateClipProps = useStore((s) => s.updateClipProps)
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()
  const filteredTransitions = TRANSITIONS.filter((t) => !q || t.label.toLowerCase().includes(q))
  const filteredVideo = VIDEO_EFFECTS.filter((e) => !q || e.label.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  const filteredAudio = AUDIO_EFFECTS.filter((e) => !q || e.label.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))

  const videoGroups = useMemo(() => groupBy(filteredVideo), [filteredVideo])
  const audioGroups = useMemo(() => groupBy(filteredAudio), [filteredAudio])

  const applyVideo = (effect: VideoEffect): void => {
    if (!selectedClipId) return
    updateClipProps(selectedClipId, effect.defaults as Parameters<typeof updateClipProps>[1])
  }

  const applyAudio = (id: string): void => {
    if (!selectedClipId) return
    if (id === 'volume') updateClipProps(selectedClipId, { volume: 1 })
    if (id === 'balance') updateClipProps(selectedClipId, { pan: 0 })
  }

  return (
    <div className="effects">
      <div className="fx-search-row">
        <input
          className="fx-search"
          type="text"
          placeholder="Search effects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="fx-search-clear" onClick={() => setSearch('')}>×</button>
        )}
      </div>

      {!selectedClipId && (
        <p className="hint fx-hint">Select a clip on the timeline to apply effects.</p>
      )}

      {filteredTransitions.length > 0 && (
        <div className="fx-section">
          <div className="effects-group">Video Transitions</div>
          {filteredTransitions.map((t) => (
            <button
              key={t.type}
              className="effect-item"
              disabled={!selectedClipId}
              title={selectedClipId ? 'Double-click or press Apply' : 'Select a clip first'}
              onDoubleClick={() => selectedClipId && setTransition(selectedClipId, { type: t.type, duration: 0.5 })}
              onClick={() => selectedClipId && setTransition(selectedClipId, { type: t.type, duration: 0.5 })}
            >
              <span className="effect-icon"><IcTransition size={13} /></span> {t.label}
            </button>
          ))}
        </div>
      )}

      {videoGroups.size > 0 && (
        <div className="fx-section">
          {Array.from(videoGroups.entries()).map(([cat, effects]) => (
            <div key={cat}>
              <div className="effects-group">{cat}</div>
              {effects.map((eff) => (
                <button
                  key={eff.id}
                  className="effect-item"
                  disabled={!selectedClipId}
                  title={selectedClipId ? 'Click to apply' : 'Select a clip first'}
                  onClick={() => applyVideo(eff)}
                  onDoubleClick={() => applyVideo(eff)}
                >
                  <span className="effect-icon fx-icon-v">V</span> {eff.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {audioGroups.size > 0 && (
        <div className="fx-section">
          {Array.from(audioGroups.entries()).map(([cat, effects]) => (
            <div key={cat}>
              <div className="effects-group">{cat}</div>
              {effects.map((eff) => (
                <button
                  key={eff.id}
                  className="effect-item"
                  disabled={!selectedClipId}
                  title={selectedClipId ? 'Click to apply' : 'Select a clip first'}
                  onClick={() => applyAudio(eff.id)}
                  onDoubleClick={() => applyAudio(eff.id)}
                >
                  <span className="effect-icon fx-icon-a">A</span> {eff.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {filteredTransitions.length === 0 && filteredVideo.length === 0 && filteredAudio.length === 0 && (
        <p className="hint fx-hint">No effects match "{search}"</p>
      )}
    </div>
  )
}
