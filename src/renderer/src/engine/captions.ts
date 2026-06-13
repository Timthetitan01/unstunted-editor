import type { CaptionCue, CaptionStyle } from '../../../shared/types'

// Word-level caption rendering for "viral shorts" styles: word pop, karaoke
// fill, boxed highlight, glow, underline, entrance animations, auto-emphasis.
// Pure canvas so the preview and the export pipeline render identically.

/** Sample cue used by the style preview (panel + program monitor). */
export const SAMPLE_CUE: CaptionCue = {
  id: '__preview',
  start: 0,
  end: 2.0,
  text: 'CAPTIONS THAT GO VIRAL',
  words: [
    { word: 'CAPTIONS', start: 0.0, end: 0.45 },
    { word: 'THAT', start: 0.5, end: 0.85 },
    { word: 'GO', start: 0.9, end: 1.25 },
    { word: 'VIRAL', start: 1.3, end: 1.95 }
  ]
}
export const SAMPLE_DURATION = 2.4 // loop length incl. a beat of rest

function activeCue(cues: CaptionCue[], time: number): CaptionCue | undefined {
  return cues.find((c) => time >= c.start && time <= c.end)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

function bounceOut(p: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (p < 1 / d1) return n1 * p * p
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375
  return n1 * (p -= 2.625 / d1) * p + 0.984375
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return hex
  const a = Math.round(clamp01(alpha) * 255).toString(16).padStart(2, '0')
  return `#${m[1]}${a}`
}

/** Index of the cue word to auto-emphasize: the longest "meaty" word. */
function emphasisIndex(cue: CaptionCue): number {
  let best = -1
  let bestLen = 3 // require at least 4 chars
  cue.words.forEach((w, i) => {
    const len = w.word.replace(/[^\p{L}\p{N}]/gu, '').length
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  })
  return best
}

const ANIM_DUR = 0.16

export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  cues: CaptionCue[],
  style: CaptionStyle,
  time: number,
  width: number,
  height: number
): void {
  const cue = activeCue(cues, time)
  if (!cue || cue.words.length === 0) return
  const cueIndex = cues.indexOf(cue)

  const fontSize = style.fontSize
  const weight = style.fontWeight ?? 900
  ctx.save()
  ctx.font = `${weight} ${fontSize}px ${style.fontFamily}`
  // canvas letterSpacing applies to both measureText and fillText
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${style.letterSpacing ?? 0}px`
  } catch {
    /* older runtimes without canvas letterSpacing */
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  // last word that has started, and the one actively being spoken
  let spokenIdx = -1
  cue.words.forEach((w, i) => {
    if (time >= w.start) spokenIdx = i
  })
  const activeIdx = cue.words.findIndex((w) => time >= w.start && time <= w.end)

  // which words are visible right now
  const reveal = style.reveal ?? 'cue'
  let visible: number[]
  if (reveal === 'word') visible = [Math.max(0, spokenIdx)]
  else if (reveal === 'cumulative')
    visible = cue.words.map((_, i) => i).filter((i) => i <= Math.max(0, spokenIdx))
  else visible = cue.words.map((_, i) => i)

  const texts = cue.words.map((w) => (style.uppercase ? w.word.toUpperCase().trim() : w.word.trim()))
  const widths = texts.map((t) => ctx.measureText(t).width)
  const gap = fontSize * 0.28

  // wrap visible words into lines that fit ~88% width
  const maxLineW = width * 0.88
  const lines: { idxs: number[]; w: number }[] = []
  let cur: number[] = []
  let curW = 0
  for (const i of visible) {
    const add = widths[i] + (cur.length ? gap : 0)
    if (curW + add > maxLineW && cur.length) {
      lines.push({ idxs: cur, w: curW })
      cur = [i]
      curW = widths[i]
    } else {
      cur.push(i)
      curW += add
    }
  }
  if (cur.length) lines.push({ idxs: cur, w: curW })

  const lineH = fontSize * 1.18
  const blockH = lines.length * lineH
  const cx = width / 2
  let y = height * style.position - blockH / 2 + lineH / 2

  const anim = style.animation ?? 'none'
  const mode = style.highlightMode ?? 'color'
  const popScale = style.popScale ?? 1.12
  const emphIdx = style.autoEmphasis ? emphasisIndex(cue) : -1
  const emphColor =
    emphIdx >= 0 && style.emphasisColors?.length
      ? style.emphasisColors[cueIndex % style.emphasisColors.length]
      : null

  for (const line of lines) {
    // line background pill
    if (style.bgOn) {
      const padX = fontSize * 0.32
      const padY = fontSize * 0.12
      ctx.save()
      ctx.fillStyle = hexWithAlpha(style.bgColor ?? '#000000', style.bgOpacity ?? 0.55)
      roundRect(
        ctx,
        cx - line.w / 2 - padX,
        y - lineH / 2 - padY + lineH * 0.06,
        line.w + padX * 2,
        lineH + padY * 2 - lineH * 0.12,
        fontSize * 0.22
      )
      ctx.fill()
      ctx.restore()
    }

    let x = cx - line.w / 2
    for (const i of line.idxs) {
      const word = texts[i]
      const w = widths[i]
      const isActive = i === activeIdx
      const wordCenter = x + w / 2
      const wd = cue.words[i]

      // entrance animation progress
      const animStart = reveal === 'cue' ? cue.start : wd.start
      const p = clamp01((time - animStart) / ANIM_DUR)
      let scale = 1
      let dy = 0
      let alpha = 1
      let rot = 0
      switch (anim) {
        case 'pop':
          scale *= Math.max(0.01, easeOutBack(p))
          break
        case 'bounce':
          dy -= (1 - bounceOut(p)) * fontSize * 0.7
          alpha = Math.min(1, p * 2)
          break
        case 'fade':
          alpha = easeOutCubic(p)
          break
        case 'slideup':
          dy += (1 - easeOutCubic(p)) * fontSize * 0.55
          alpha = p
          break
        case 'shake':
          scale *= Math.max(0.01, easeOutBack(p))
          if (isActive) rot = Math.sin((time - wd.start) * 42 + i) * 0.05
          break
      }

      // active-word pop on top of the entrance animation
      if (isActive && popScale > 1) {
        const ap = clamp01((time - wd.start) / ANIM_DUR)
        scale *= 1 + (popScale - 1) * easeOutBack(ap)
      }

      // fill color resolution: base → karaoke states → emphasis → active highlight
      let fill = style.fillColor
      if (mode === 'karaoke') {
        if (i <= spokenIdx) fill = style.highlightColor
        else fill = hexWithAlpha(style.fillColor, 0.55)
      }
      if (emphColor && i === emphIdx && !isActive) fill = emphColor
      if (isActive && mode === 'color') fill = style.highlightColor

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(wordCenter, y + dy)
      if (rot) ctx.rotate(rot)
      ctx.scale(scale, scale)

      // highlight chrome behind the active word
      if (isActive && mode === 'box') {
        ctx.save()
        ctx.fillStyle = style.highlightColor
        roundRect(ctx, -w / 2 - gap * 0.45, -lineH * 0.46, w + gap * 0.9, lineH * 0.92, fontSize * 0.18)
        ctx.fill()
        ctx.restore()
      }
      if (isActive && mode === 'underline') {
        ctx.save()
        ctx.fillStyle = style.highlightColor
        roundRect(ctx, -w / 2, lineH * 0.34, w, fontSize * 0.1, fontSize * 0.05)
        ctx.fill()
        ctx.restore()
      }

      // drop shadow / glow
      if (isActive && mode === 'glow') {
        ctx.shadowColor = style.highlightColor
        ctx.shadowBlur = fontSize * 0.5
      } else if (style.shadowOn) {
        ctx.shadowColor = hexWithAlpha(style.shadowColor ?? '#000000', 0.85)
        ctx.shadowBlur = style.shadowBlur ?? 18
        ctx.shadowOffsetY = fontSize * 0.045
      }

      if (style.strokeWidth > 0) {
        ctx.lineWidth = style.strokeWidth
        ctx.strokeStyle = style.strokeColor
        ctx.strokeText(word, 0, 0)
      }
      ctx.fillStyle = fill
      ctx.fillText(word, 0, 0)
      if (isActive && mode === 'glow') ctx.fillText(word, 0, 0) // double pass = stronger glow

      ctx.restore()
      x += w + gap
    }
    y += lineH
  }
  ctx.restore()
}

/** Group raw whisper words into cues of up to maxWords each. */
export function wordsToCues(
  words: { word: string; start: number; end: number }[],
  maxWords: number,
  idgen: () => string
): CaptionCue[] {
  const cues: CaptionCue[] = []
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words.slice(i, i + maxWords)
    if (!slice.length) continue
    cues.push({
      id: idgen(),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      text: slice.map((w) => w.word.trim()).join(' '),
      words: slice
    })
  }
  return cues
}

/** Rebuild a cue's word timings after its text is edited by hand. */
export function retimeCueText(cue: CaptionCue, text: string): CaptionCue {
  const parts = text.split(/\s+/).filter(Boolean)
  const dur = Math.max(0.2, cue.end - cue.start)
  const per = dur / Math.max(1, parts.length)
  return {
    ...cue,
    text,
    words: parts.map((word, i) => ({
      word,
      start: cue.start + i * per,
      end: cue.start + (i + 1) * per - 0.02
    }))
  }
}
