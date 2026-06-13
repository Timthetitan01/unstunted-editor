import { ReactNode, useState } from 'react'

export interface TabDef {
  id: string
  label: string
  node: ReactNode
}

/** A Premiere-style dockable panel: a row of tabs + the active tab's content. */
export function Panel({
  tabs,
  initial,
  toolbar
}: {
  tabs: TabDef[]
  initial?: string
  toolbar?: ReactNode
}): JSX.Element {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)
  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  return (
    <div className="panel">
      <div className="panel-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`panel-tab ${t.id === current?.id ? 'active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        {toolbar}
      </div>
      <div className="panel-content">{current?.node}</div>
    </div>
  )
}
