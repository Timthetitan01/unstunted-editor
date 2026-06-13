import { useEffect, useState } from 'react'

interface RecentProject {
  name: string
  path: string
  modified: number
}

const RECENT_KEY = 'unstunted-recent-projects'
const MAX_RECENT = 8

export function saveRecent(name: string, path: string): void {
  try {
    const list: RecentProject[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const filtered = list.filter((r) => r.path !== path)
    filtered.unshift({ name, path, modified: Date.now() })
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch {}
}

function fmtRelTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function WelcomeScreen({
  onNew,
  onOpen,
  onRecent
}: {
  onNew: () => void
  onOpen: () => void
  onRecent: (path: string) => void
}): JSX.Element {
  const [recent, setRecent] = useState<RecentProject[]>([])

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'))
    } catch {}
  }, [])

  return (
    <div className="welcome-screen" onDragOver={(e) => e.preventDefault()}>
      <div className="welcome-panel">
        <div className="welcome-logo">
          <svg className="logo-mark" width="72" height="72" viewBox="0 0 72 72" fill="none">
            <defs>
              <linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#17304f"/>
                <stop offset="100%" stopColor="#090f1c"/>
              </linearGradient>
              <linearGradient id="tri" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e8f4ff"/>
                <stop offset="100%" stopColor="#cde3ff"/>
              </linearGradient>
            </defs>
            <rect width="72" height="72" rx="16" fill="url(#ibg)"/>
            {/* film-strip sprocket holes — top */}
            <rect x="11" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="23" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="35" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="47" y="7" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            {/* film-strip sprocket holes — bottom */}
            <rect x="11" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="23" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="35" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            <rect x="47" y="60" width="7" height="5" rx="1.5" fill="rgba(255,255,255,0.10)"/>
            {/* bold play triangle */}
            <polygon points="21,18 21,54 57,36" fill="url(#tri)"/>
          </svg>
          <div className="logo-wordmark">
            <div className="logo-name">UNSTUNTED</div>
            <div className="logo-sub">EDITOR</div>
          </div>
        </div>
        <p className="welcome-sub">Professional video editing, no limits</p>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={onNew}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="1" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/>
              <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            New Project
          </button>
          <button className="welcome-btn" onClick={onOpen}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h4l2 2h6v8H2z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
            </svg>
            Open Project…
          </button>
        </div>

        {recent.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-recent-header">Recent Projects</div>
            {recent.map((r) => (
              <button key={r.path} className="welcome-recent-item" onClick={() => onRecent(r.path)}>
                <div className="welcome-recent-name">{r.name}</div>
                <div className="welcome-recent-meta">
                  <span className="welcome-recent-path">{r.path.replace(/^.*[\\/]/, '…/')}</span>
                  <span className="welcome-recent-time">{fmtRelTime(r.modified)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
