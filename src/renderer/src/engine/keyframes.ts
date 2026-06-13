import type { AnimatableProps, AnimatablePropName, Clip, Easing, Keyframe } from '../../../shared/types'

function ease(e: Easing, x: number): number {
  switch (e) {
    case 'linear': return x
    case 'easeIn': return x * x
    case 'easeOut': return 1 - (1 - x) * (1 - x)
    case 'easeInOut': return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
    case 'hold': return 0
    case 'bezier': return x // handled separately below
  }
}

/**
 * Cubic bezier interpolation between two keyframes.
 * Uses the keyframe's outHandle (from a) and inHandle (from b) as tangents.
 * Solves t-parameter numerically via bisection, then evaluates value.
 */
function solveBezier(a: Keyframe, b: Keyframe, time: number): number {
  const span = b.t - a.t || 1e-6
  const x = (time - a.t) / span
  // P0=0, P3=1 on the normalized time axis
  const p1x = Math.max(0, Math.min(1, a.outHandle ? a.outHandle.dx / span : 1 / 3))
  const p2x = Math.max(0, Math.min(1, b.inHandle ? 1 - b.inHandle.dx / span : 2 / 3))
  // bisect to find the bezier parameter u where B_x(u) == x
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const u = (lo + hi) / 2
    const bx = 3 * u * (1 - u) * (1 - u) * p1x + 3 * u * u * (1 - u) * p2x + u * u * u
    if (bx < x) lo = u; else hi = u
  }
  const u = (lo + hi) / 2
  // Evaluate the value bezier with matching tangents
  const vSpan = b.value - a.value
  const p1y = a.value + (a.outHandle ? a.outHandle.dy : vSpan / 3)
  const p2y = b.value - (b.inHandle ? b.inHandle.dy : vSpan / 3)
  return (
    a.value * Math.pow(1 - u, 3) +
    3 * p1y * u * Math.pow(1 - u, 2) +
    3 * p2y * u * u * (1 - u) +
    b.value * u * u * u
  )
}

/** Evaluate a keyframed property at clip-local time `t` (seconds). */
export function sampleKeyframes(kfs: Keyframe[], t: number, fallback: number): number {
  if (kfs.length === 0) return fallback
  if (kfs.length === 1) return kfs[0].value
  if (t <= kfs[0].t) return kfs[0].value
  const last = kfs[kfs.length - 1]
  if (t >= last.t) return last.value
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]
    const b = kfs[i + 1]
    if (t >= a.t && t <= b.t) {
      if (a.easing === 'bezier') return solveBezier(a, b, t)
      const span = b.t - a.t || 1e-6
      const x = (t - a.t) / span
      const k = ease(a.easing, x)
      return a.value + (b.value - a.value) * k
    }
  }
  return last.value
}

export interface ResolvedProps {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  volume: number
}

/** Resolve all animatable props for a clip at absolute timeline time. */
export function resolveClipProps(clip: Clip, timelineTime: number): ResolvedProps {
  const t = timelineTime - clip.start // clip-local
  const p = clip.props
  const k = clip.keyframes
  const get = (name: AnimatablePropName, fallback: number): number =>
    sampleKeyframes(k[name], t, fallback)
  return {
    x: get('x', p.x),
    y: get('y', p.y),
    scale: get('scale', p.scale),
    rotation: get('rotation', p.rotation),
    opacity: get('opacity', p.opacity),
    volume: get('volume', p.volume)
  }
}

export function hasAnyKeyframes(k: AnimatableProps): boolean {
  return (Object.keys(k) as AnimatablePropName[]).some((key) => k[key].length > 0)
}
