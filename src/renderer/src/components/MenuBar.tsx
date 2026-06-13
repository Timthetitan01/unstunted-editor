import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { formatChord, getBinding } from '../lib/keybinds'

export interface MenuActions {
  newProject: () => void
  open: () => void
  save: () => void
  saveAs: () => void
  exportMedia: () => void
  importMedia: () => void
  openShortcuts: () => void
}

interface Item {
  label: string
  accel?: string
  run?: () => void
  disabled?: boolean
  sep?: boolean
}

export function MenuBar({ actions }: { actions: MenuActions }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const splitAt = useStore((s) => s.splitAt)
  const setTool = useStore((s) => s.setTool)

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // accelerators always reflect the user's current (rebindable) shortcuts
  const accel = (cmdId: string): string => formatChord(getBinding(cmdId))

  const menus: Record<string, Item[]> = {
    File: [
      { label: 'New Project', accel: accel('file.new'), run: actions.newProject },
      { label: 'Open Project…', accel: accel('file.open'), run: actions.open },
      { label: '', sep: true },
      { label: 'Import Media…', accel: accel('file.import'), run: actions.importMedia },
      { label: '', sep: true },
      { label: 'Save', accel: accel('file.save'), run: actions.save },
      { label: 'Save As…', accel: accel('file.saveAs'), run: actions.saveAs },
      { label: '', sep: true },
      { label: 'Export Media…', accel: accel('file.export'), run: actions.exportMedia }
    ],
    Edit: [
      { label: 'Undo', accel: accel('edit.undo'), run: undo, disabled: !canUndo },
      { label: 'Redo', accel: accel('edit.redo'), run: redo, disabled: !canRedo },
      { label: '', sep: true },
      { label: 'Cut', accel: accel('edit.cut'), run: () => useStore.getState().cutSelected() },
      { label: 'Copy', accel: accel('edit.copy'), run: () => useStore.getState().copySelected() },
      { label: 'Paste', accel: accel('edit.paste'), run: () => useStore.getState().pasteAtPlayhead() },
      { label: '', sep: true },
      { label: 'Add Edit (Split)', accel: accel('edit.split'), run: () => splitAt(useStore.getState().playhead) },
      { label: 'Apply Default Transition', accel: accel('edit.transition'), run: () => useStore.getState().applyDefaultTransition() }
    ],
    Sequence: [
      { label: 'Mark In', accel: accel('mark.in'), run: () => { const s = useStore.getState(); s.setInPoint(s.playhead) } },
      { label: 'Mark Out', accel: accel('mark.out'), run: () => { const s = useStore.getState(); s.setOutPoint(s.playhead) } },
      { label: 'Clear In/Out', accel: accel('mark.clear'), run: () => useStore.getState().clearInOut() },
      { label: '', sep: true },
      { label: 'Add Marker', accel: accel('mark.marker'), run: () => { const s = useStore.getState(); s.addMarker(s.playhead) } },
      { label: '', sep: true },
      { label: 'Add Video Track', run: () => useStore.getState().addTrack('video') },
      { label: 'Add Audio Track', run: () => useStore.getState().addTrack('audio') }
    ],
    Tools: [
      { label: 'Selection Tool', accel: accel('tool.select'), run: () => setTool('select') },
      { label: 'Track Select Forward', accel: accel('tool.trackfwd'), run: () => setTool('trackfwd') },
      { label: 'Razor Tool', accel: accel('tool.razor'), run: () => setTool('razor') },
      { label: 'Hand Tool', accel: accel('tool.hand'), run: () => setTool('hand') },
      { label: 'Zoom Tool', accel: accel('tool.zoom'), run: () => setTool('zoom') },
      { label: '', sep: true },
      { label: 'Keyboard Shortcuts…', run: actions.openShortcuts }
    ]
  }

  return (
    <div className="menubar" ref={ref}>
      <div className="app-title">Unstunted<span>Editors</span></div>
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className="menu">
          <button
            className={`menu-label ${open === name ? 'active' : ''}`}
            onClick={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <div className="menu-drop">
              {items.map((it, i) =>
                it.sep ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    className="menu-item"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null)
                      it.run?.()
                    }}
                  >
                    <span>{it.label}</span>
                    {it.accel && <span className="accel">{it.accel}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
