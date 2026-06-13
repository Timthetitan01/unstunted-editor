// Caption font management: a curated list of bold system fonts that ship with
// macOS/Windows, plus user-loaded font files (ttf/otf/woff) registered via
// FontFace so the canvas (preview AND export) can use them.

export interface FontOption {
  label: string
  value: string // canvas font-family string
  custom?: boolean
}

export const BUILTIN_FONTS: FontOption[] = [
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Impact', value: 'Impact, "Arial Narrow Bold", sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Futura', value: 'Futura, "Trebuchet MS", sans-serif' },
  { label: 'Avenir Next', value: '"Avenir Next", Avenir, sans-serif' },
  { label: 'Phosphate', value: 'Phosphate, Impact, sans-serif' },
  { label: 'Copperplate', value: 'Copperplate, fantasy' },
  { label: 'Marker Felt', value: '"Marker Felt", "Comic Sans MS", cursive' },
  { label: 'Chalkboard', value: '"Chalkboard SE", "Comic Sans MS", cursive' },
  { label: 'American Typewriter', value: '"American Typewriter", Georgia, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier', value: '"Courier New", monospace' }
]

interface StoredFont {
  name: string
  path: string
}

const STORAGE_KEY = 'unstunted-custom-fonts'
const loadedNames = new Set<string>()
let customFonts: StoredFont[] = []

function readStored(): StoredFont[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

async function registerFont(name: string, path: string): Promise<void> {
  if (loadedNames.has(name)) return
  const url = await window.swift.fileUrl(path)
  const buf = await (await fetch(url)).arrayBuffer()
  const face = new FontFace(name, buf)
  await face.load()
  document.fonts.add(face)
  loadedNames.add(name)
}

/** Load all previously-added custom fonts (call once at startup). */
export async function loadPersistedFonts(): Promise<FontOption[]> {
  customFonts = readStored()
  const ok: StoredFont[] = []
  for (const f of customFonts) {
    try {
      await registerFont(f.name, f.path)
      ok.push(f)
    } catch {
      /* file moved/deleted — drop it silently */
    }
  }
  customFonts = ok
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ok))
  return getCustomFontOptions()
}

/** Register a user-picked font file and persist it for future sessions. */
export async function addCustomFont(file: File): Promise<FontOption> {
  const path = window.swift.pathForFile(file)
  if (!path) throw new Error('Could not resolve the font file path')
  const name = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF)$/i, '').replace(/[_-]+/g, ' ').trim()
  await registerFont(name, path)
  if (!customFonts.some((f) => f.name === name)) {
    customFonts.push({ name, path })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customFonts))
  }
  return { label: name, value: `"${name}"`, custom: true }
}

export function getCustomFontOptions(): FontOption[] {
  return customFonts.map((f) => ({ label: f.name, value: `"${f.name}"`, custom: true }))
}
