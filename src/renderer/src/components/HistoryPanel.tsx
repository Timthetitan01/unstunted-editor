import { useStore } from '../store'

/** Premiere's History panel — the undo stack, click an entry to step back. */
export function HistoryPanel(): JSX.Element {
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const stepTo = (index: number): void => {
    // index into the combined timeline: undo until we reach `index`
    const target = past.length - 1 - index
    for (let i = 0; i < target; i++) undo()
  }

  return (
    <div className="history">
      <button className="history-item base" disabled>Open</button>
      {past.map((h, i) => (
        <button key={i} className="history-item" onClick={() => stepTo(past.length - 1 - i)}>
          {h.label}
        </button>
      ))}
      <button className="history-item current" disabled>● Current state</button>
      {future.map((h, i) => (
        <button
          key={`f${i}`}
          className="history-item dim"
          onClick={() => {
            for (let j = 0; j <= i; j++) redo()
          }}
        >
          {h.label}
        </button>
      ))}
    </div>
  )
}
