import { useStore, type Tool } from '../store'
import { IcSelect, IcTrackFwd, IcRazor, IcHand, IcZoom, IcType, IcRolling, IcSlip, IcSlide } from './icons'
import { formatChord, getBinding } from '../lib/keybinds'

const TOOLS: { id: Tool; icon: JSX.Element; label: string; cmd: string }[] = [
  { id: 'select', icon: <IcSelect />, label: 'Selection Tool', cmd: 'tool.select' },
  { id: 'trackfwd', icon: <IcTrackFwd />, label: 'Track Select Forward', cmd: 'tool.trackfwd' },
  { id: 'rolling', icon: <IcRolling />, label: 'Rolling Edit Tool — drag edit points', cmd: 'tool.select' },
  { id: 'slip', icon: <IcSlip />, label: 'Slip Tool — shift clip source without moving it', cmd: 'tool.select' },
  { id: 'slide', icon: <IcSlide />, label: 'Slide Tool — move clip, trim neighbors', cmd: 'tool.select' },
  { id: 'razor', icon: <IcRazor />, label: 'Razor Tool', cmd: 'tool.razor' },
  { id: 'hand', icon: <IcHand />, label: 'Hand Tool', cmd: 'tool.hand' },
  { id: 'zoom', icon: <IcZoom />, label: 'Zoom Tool (alt-click to zoom out)', cmd: 'tool.zoom' }
]

export function Tools(): JSX.Element {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  return (
    <div className="tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool ${tool === t.id ? 'active' : ''}`}
          title={`${t.label} (${formatChord(getBinding(t.cmd))})`}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
        </button>
      ))}
      <div className="tools-sep" />
      <button
        className="tool"
        title={`Type Tool — add text at playhead (${formatChord(getBinding('edit.addText'))})`}
        onClick={() => {
          const s = useStore.getState()
          s.addTextCue(s.playhead)
        }}
      >
        <IcType />
      </button>
    </div>
  )
}
