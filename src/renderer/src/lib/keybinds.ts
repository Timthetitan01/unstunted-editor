// ── Rebindable keyboard shortcuts ────────────────────────────────────────────
// Every keyboard command in the app is declared here. A chord is stored as
// "Mod+Shift+Alt+KEY" (Mod = ⌘ on mac / Ctrl elsewhere). User overrides live
// in localStorage and are merged over the defaults.

export interface CommandDef {
  id: string
  label: string
  category: string
  defaultChord: string
}

export const COMMANDS: CommandDef[] = [
  // File
  { id: 'file.new', label: 'New Project', category: 'File', defaultChord: 'Mod+N' },
  { id: 'file.open', label: 'Open Project…', category: 'File', defaultChord: 'Mod+O' },
  { id: 'file.save', label: 'Save', category: 'File', defaultChord: 'Mod+S' },
  { id: 'file.saveAs', label: 'Save As…', category: 'File', defaultChord: 'Mod+Shift+S' },
  { id: 'file.import', label: 'Import Media…', category: 'File', defaultChord: 'Mod+I' },
  { id: 'file.export', label: 'Export Media…', category: 'File', defaultChord: 'Mod+M' },

  // Edit
  { id: 'edit.undo', label: 'Undo', category: 'Edit', defaultChord: 'Mod+Z' },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', defaultChord: 'Mod+Shift+Z' },
  { id: 'edit.cut', label: 'Cut', category: 'Edit', defaultChord: 'Mod+X' },
  { id: 'edit.copy', label: 'Copy', category: 'Edit', defaultChord: 'Mod+C' },
  { id: 'edit.paste', label: 'Paste at Playhead', category: 'Edit', defaultChord: 'Mod+V' },
  { id: 'edit.selectAll', label: 'Select All Clips', category: 'Edit', defaultChord: 'Mod+A' },
  { id: 'edit.split', label: 'Add Edit (Split)', category: 'Edit', defaultChord: 'Mod+K' },
  { id: 'edit.delete', label: 'Delete (clip or gap)', category: 'Edit', defaultChord: 'Backspace' },
  { id: 'edit.rippleDelete', label: 'Ripple Delete', category: 'Edit', defaultChord: 'Shift+Backspace' },
  { id: 'edit.transition', label: 'Apply Default Transition', category: 'Edit', defaultChord: 'Mod+D' },
  { id: 'edit.rippleTrimPrev', label: 'Ripple Trim Previous Edit to Playhead', category: 'Edit', defaultChord: 'Q' },
  { id: 'edit.rippleTrimNext', label: 'Ripple Trim Next Edit to Playhead', category: 'Edit', defaultChord: 'W' },
  { id: 'edit.insert', label: 'Insert Source at Playhead', category: 'Edit', defaultChord: ',' },
  { id: 'edit.overwrite', label: 'Overwrite Source at Playhead', category: 'Edit', defaultChord: '.' },
  { id: 'edit.addText', label: 'Add Text at Playhead', category: 'Edit', defaultChord: 'T' },

  // Tools
  { id: 'tool.select', label: 'Selection Tool', category: 'Tools', defaultChord: 'V' },
  { id: 'tool.trackfwd', label: 'Track Select Forward', category: 'Tools', defaultChord: 'A' },
  { id: 'tool.razor', label: 'Razor Tool', category: 'Tools', defaultChord: 'C' },
  { id: 'tool.hand', label: 'Hand Tool', category: 'Tools', defaultChord: 'H' },
  { id: 'tool.zoom', label: 'Zoom Tool', category: 'Tools', defaultChord: 'Z' },

  // Marks
  { id: 'mark.in', label: 'Mark In', category: 'Marks', defaultChord: 'I' },
  { id: 'mark.out', label: 'Mark Out', category: 'Marks', defaultChord: 'O' },
  { id: 'mark.clear', label: 'Clear In/Out', category: 'Marks', defaultChord: 'Mod+Shift+X' },
  { id: 'mark.marker', label: 'Add Marker', category: 'Marks', defaultChord: 'M' },

  // Transport
  { id: 'transport.play', label: 'Play / Pause', category: 'Transport', defaultChord: 'Space' },
  { id: 'transport.shuttleRev', label: 'Shuttle Reverse (J)', category: 'Transport', defaultChord: 'J' },
  { id: 'transport.shuttleStop', label: 'Shuttle Stop (K)', category: 'Transport', defaultChord: 'K' },
  { id: 'transport.shuttleFwd', label: 'Shuttle Forward (L)', category: 'Transport', defaultChord: 'L' },
  { id: 'transport.stepBack', label: 'Step Back 1 Frame', category: 'Transport', defaultChord: 'ArrowLeft' },
  { id: 'transport.stepFwd', label: 'Step Forward 1 Frame', category: 'Transport', defaultChord: 'ArrowRight' },
  { id: 'transport.stepBack5', label: 'Step Back 5 Frames', category: 'Transport', defaultChord: 'Shift+ArrowLeft' },
  { id: 'transport.stepFwd5', label: 'Step Forward 5 Frames', category: 'Transport', defaultChord: 'Shift+ArrowRight' },
  { id: 'transport.prevEdit', label: 'Go to Previous Edit', category: 'Transport', defaultChord: 'ArrowUp' },
  { id: 'transport.nextEdit', label: 'Go to Next Edit', category: 'Transport', defaultChord: 'ArrowDown' },
  { id: 'transport.home', label: 'Go to Start', category: 'Transport', defaultChord: 'Home' },
  { id: 'transport.end', label: 'Go to End', category: 'Transport', defaultChord: 'End' },

  // View
  { id: 'view.zoomIn', label: 'Zoom In Timeline', category: 'View', defaultChord: '=' },
  { id: 'view.zoomOut', label: 'Zoom Out Timeline', category: 'View', defaultChord: '-' },
  { id: 'view.zoomFit', label: 'Zoom to Fit Timeline', category: 'View', defaultChord: '\\' },
  { id: 'view.snap', label: 'Toggle Snapping', category: 'View', defaultChord: 'S' }
]

const STORAGE_KEY = 'unstunted-keybinds'

let overrides: Record<string, string> = loadOverrides()

function loadOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getBindings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of COMMANDS) out[c.id] = overrides[c.id] ?? c.defaultChord
  return out
}

export function getBinding(id: string): string {
  return overrides[id] ?? COMMANDS.find((c) => c.id === id)?.defaultChord ?? ''
}

export function setBinding(id: string, chord: string | null): void {
  if (chord == null || chord === COMMANDS.find((c) => c.id === id)?.defaultChord) {
    delete overrides[id]
  } else {
    overrides[id] = chord
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function resetAllBindings(): void {
  overrides = {}
  localStorage.removeItem(STORAGE_KEY)
}

export function isOverridden(id: string): boolean {
  return id in overrides
}

const MOD_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt'])

/** Normalize a KeyboardEvent into a chord string, or null for bare modifiers. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('Mod')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  let k = e.key
  if (k === ' ') k = 'Space'
  if (k === 'Delete') k = 'Backspace' // treat both delete keys the same
  if (k.length === 1) k = k.toUpperCase()
  parts.push(k)
  return parts.join('+')
}

// chords the browser/native inputs need while the user is typing in a field
const NATIVE_WHILE_TYPING = new Set(['Mod+A', 'Mod+C', 'Mod+X', 'Mod+V', 'Mod+Z', 'Mod+Shift+Z', 'Backspace', 'Shift+Backspace'])

/** Find which command (if any) a keydown should run. */
export function resolveCommand(e: KeyboardEvent, typing: boolean): string | null {
  const chord = chordFromEvent(e)
  if (!chord) return null
  if (typing && (!chord.includes('Mod+') || NATIVE_WHILE_TYPING.has(chord))) return null
  const bindings = getBindings()
  for (const c of COMMANDS) {
    if (bindings[c.id] === chord) return c.id
  }
  return null
}

const IS_MAC = navigator.platform.includes('Mac')
const KEY_GLYPHS: Record<string, string> = {
  Space: 'Space',
  Backspace: '⌫',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Home: '↖',
  End: '↘',
  Escape: 'Esc'
}

/** Human-readable chord, e.g. "⌘⇧S" on mac or "Ctrl+Shift+S" elsewhere. */
export function formatChord(chord: string): string {
  if (!chord) return ''
  const parts = chord.split('+')
  let key = parts.pop() ?? ''
  if (key === '') {
    // a trailing empty part means the bound key itself was '+'
    key = '+'
    parts.pop()
  }
  const glyph = KEY_GLYPHS[key] ?? key
  if (IS_MAC) {
    const mods = parts
      .map((p) => (p === 'Mod' ? '⌘' : p === 'Shift' ? '⇧' : p === 'Alt' ? '⌥' : p))
      .join('')
    return mods + glyph
  }
  const mods = parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  return mods ? `${mods}+${glyph}` : glyph
}
