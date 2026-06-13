import { useEffect, useMemo, useState } from 'react'
import {
  COMMANDS,
  chordFromEvent,
  formatChord,
  getBindings,
  isOverridden,
  resetAllBindings,
  setBinding
} from '../lib/keybinds'

export function ShortcutsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [listening, setListening] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState('')

  const bindings = useMemo(() => getBindings(), [version])

  // chords used by more than one command get flagged
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>()
    for (const id of Object.keys(bindings)) {
      const c = bindings[id]
      if (c) seen.set(c, (seen.get(c) ?? 0) + 1)
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c))
  }, [bindings])

  // while a row is armed, the next keydown becomes its new binding
  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setListening(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return // bare modifier — keep waiting
      setBinding(listening, chord)
      setListening(null)
      setVersion((v) => v + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening])

  const categories = useMemo(() => {
    const cats: { name: string; items: typeof COMMANDS }[] = []
    for (const c of COMMANDS) {
      if (query && !c.label.toLowerCase().includes(query.toLowerCase())) continue
      let cat = cats.find((x) => x.name === c.category)
      if (!cat) {
        cat = { name: c.category, items: [] }
        cats.push(cat)
      }
      cat.items.push(c)
    }
    return cats
  }, [query])

  return (
    <div className="overlay" onClick={() => (listening ? setListening(null) : onClose())}>
      <div className="card shortcuts-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-head">
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <input
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => {
              resetAllBindings()
              setVersion((v) => v + 1)
            }}
          >
            Restore Defaults
          </button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>

        <div className="shortcuts-body">
          {categories.map((cat) => (
            <div key={cat.name} className="shortcuts-group">
              <div className="shortcuts-cat">{cat.name}</div>
              {cat.items.map((cmd) => {
                const chord = bindings[cmd.id]
                const isConflict = chord && conflicts.has(chord)
                return (
                  <div key={cmd.id} className="shortcuts-row">
                    <span className="shortcuts-label">{cmd.label}</span>
                    {isOverridden(cmd.id) && listening !== cmd.id && (
                      <button
                        className="shortcuts-reset"
                        title={`Reset to ${formatChord(cmd.defaultChord)}`}
                        onClick={() => {
                          setBinding(cmd.id, null)
                          setVersion((v) => v + 1)
                        }}
                      >
                        ↺
                      </button>
                    )}
                    <button
                      className={`shortcuts-bind ${listening === cmd.id ? 'listening' : ''} ${isConflict ? 'conflict' : ''}`}
                      title={
                        listening === cmd.id
                          ? 'Press the new shortcut (Esc to cancel)'
                          : isConflict
                            ? 'This shortcut is used by another command'
                            : 'Click, then press the new shortcut'
                      }
                      onClick={() => setListening(listening === cmd.id ? null : cmd.id)}
                    >
                      {listening === cmd.id ? 'Press keys…' : formatChord(chord)}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
