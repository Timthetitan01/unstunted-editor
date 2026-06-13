import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Bin, MediaAsset } from '../../../shared/types'
import { IcList, IcGrid, IcNote, IcFilm, IcImage, IcPlus } from './icons'
import { setDragAsset } from '../lib/dragMedia'

// Stable empty fallback — `?? []` in a useStore selector returns a new array
// reference every render and causes an infinite useSyncExternalStore loop.
const NO_BINS: Bin[] = []

function KindIcon({ kind }: { kind: string }): JSX.Element {
  if (kind === 'audio') return <IcNote size={12} />
  if (kind === 'image') return <IcImage size={12} />
  return <IcFilm size={12} />
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface CtxState {
  x: number
  y: number
  assetId: string | null
  binId: string | null
}

function BinContextMenu({
  ctx,
  bins,
  onImport,
  close
}: {
  ctx: CtxState
  bins: Bin[]
  onImport: () => void
  close: () => void
}): JSX.Element {
  const s = useStore.getState()
  const asset = ctx.assetId ? s.assets[ctx.assetId] : undefined
  const allAssets = Object.values(s.assets)

  const item = (label: string, run: () => void, disabled = false, danger = false): JSX.Element => (
    <button
      className={`menu-item${danger ? ' danger' : ''}`}
      key={label}
      disabled={disabled}
      onClick={() => { close(); run() }}
    >
      <span>{label}</span>
    </button>
  )

  return (
    <div
      className="menu-drop ctx"
      style={{ left: ctx.x, top: ctx.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {item('Import Media…', onImport, false)}
      {item('New Bin', () => s.addBin('New Bin'))}
      {ctx.binId && item('Rename Bin', () => { const n = prompt('Bin name:', bins.find((b) => b.id === ctx.binId)?.name ?? ''); if (n) s.renameBin(ctx.binId!, n) })}
      {ctx.binId && item('Delete Bin', () => s.removeBin(ctx.binId!), false, true)}

      {asset && <div className="menu-sep" />}
      {asset && item('Load in Source Monitor', () => s.selectAsset(ctx.assetId!))}
      {asset && item('Insert at Playhead', () => s.insertAtPlayhead(ctx.assetId!, 'insert'))}
      {asset && item('Overwrite at Playhead', () => s.insertAtPlayhead(ctx.assetId!, 'overwrite'))}

      {asset && bins.length > 0 && <div className="menu-sep" />}
      {asset && bins.length > 0 && bins.map((b) =>
        item(`Move to bin: ${b.name}`, () => s.moveAssetToBin(ctx.assetId!, b.id))
      )}
      {asset && (
        <>
          <div className="menu-sep" />
          {item('Attach Proxy…', async () => {
            const path = await window.swift.openProxy()
            if (path) {
              const url = await window.swift.fileUrl(path)
              s.attachProxy(ctx.assetId!, path, url)
            }
          })}
          {asset.proxyPath && item('Detach Proxy', () => s.detachProxy(ctx.assetId!))}
        </>
      )}

      <div className="menu-sep" />
      {asset && item('Remove from Project', () => s.removeAsset(ctx.assetId!), false, true)}
      {allAssets.length > 0 && item('Remove All Media', () => allAssets.forEach((a) => s.removeAsset(a.id)), false, true)}
    </div>
  )
}

function PropertiesOverlay({ asset, onClose }: { asset: MediaAsset; onClose: () => void }): JSX.Element {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card" style={{ width: 360, textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>{asset.name}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {([
              ['Type', asset.kind],
              ['Duration', fmtDur(asset.duration)],
              asset.width ? ['Dimensions', `${asset.width} × ${asset.height}`] : null,
              asset.fps ? ['Frame Rate', `${Math.round(asset.fps * 100) / 100} fps`] : null,
              ['Audio', asset.hasAudio ? 'Yes' : 'No'],
              asset.proxyPath ? ['Proxy', asset.proxyPath] : null,
              ['Path', asset.path]
            ] as ([string, string] | null)[])
              .filter((r): r is [string, string] => r !== null)
              .map(([k, v]) => (
                <tr key={k as string} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ color: '#999', padding: '5px 0', width: 90 }}>{k}</td>
                  <td style={{ padding: '5px 0', wordBreak: 'break-all', color: '#ddd' }}>{v as string}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/** Recursive bin folder row */
function BinRow({
  bin,
  bins,
  depth,
  assets,
  onAssetCtx
}: {
  bin: Bin
  bins: Bin[]
  depth: number
  assets: Record<string, MediaAsset>
  onAssetCtx: (e: React.MouseEvent, assetId: string) => void
}): JSX.Element {
  const toggleBinExpanded = useStore((s) => s.toggleBinExpanded)
  const selectAsset = useStore((s) => s.selectAsset)
  const addLinkedClipsFromAsset = useStore((s) => s.addLinkedClipsFromAsset)
  const selectedAssetId = useStore((s) => s.selectedAssetId)
  const childBins = bins.filter((b) => b.parentId === bin.id)

  return (
    <div className="bin-folder">
      <div
        className="bin-folder-head"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => toggleBinExpanded(bin.id)}
      >
        <span className="bin-chevron">{bin.expanded !== false ? '▾' : '▸'}</span>
        <span className="bin-folder-icon">📁</span>
        <span className="bin-folder-name">{bin.name}</span>
        <span className="bin-folder-count">{bin.assetIds.length}</span>
      </div>
      {bin.expanded !== false && (
        <div className="bin-folder-children">
          {childBins.map((cb) => (
            <BinRow key={cb.id} bin={cb} bins={bins} depth={depth + 1} assets={assets} onAssetCtx={onAssetCtx} />
          ))}
          {bin.assetIds.map((id) => {
            const a = assets[id]
            if (!a) return null
            const isSel = selectedAssetId === id
            return (
              <div
                key={id}
                className={`bin-row ${isSel ? 'selected' : ''}`}
                style={{ paddingLeft: 20 + depth * 14 }}
                draggable
                onClick={() => selectAsset(id)}
                onDoubleClick={() => { selectAsset(id); addLinkedClipsFromAsset(id) }}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-swift-asset', id); setDragAsset(a) }}
                onDragEnd={() => setDragAsset(null)}
                onContextMenu={(e) => { e.preventDefault(); selectAsset(id); onAssetCtx(e, id) }}
              >
                <span className="c-name icon-inline"><KindIcon kind={a.kind} /> {a.name}</span>
                <span>{fmtDur(a.duration)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MediaBin({ onImport }: { onImport: () => void }): JSX.Element {
  const assets = useStore((s) => s.assets)
  const bins = useStore((s) => s.project.bins ?? NO_BINS)
  const proxyMode = useStore((s) => s.proxyMode)
  const toggleProxyMode = useStore((s) => s.toggleProxyMode)
  const addLinkedClipsFromAsset = useStore((s) => s.addLinkedClipsFromAsset)
  const selectAsset = useStore((s) => s.selectAsset)
  const selectedAssetId = useStore((s) => s.selectedAssetId)
  const removeAsset = useStore((s) => s.removeAsset)
  const addBin = useStore((s) => s.addBin)

  const [query, setQuery] = useState('')
  const [view, setView] = useState<'icon' | 'list'>('icon')
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [propsAsset, setPropsAsset] = useState<MediaAsset | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // assets NOT in any bin appear at root level
  const binAssetIds = new Set(bins.flatMap((b) => b.assetIds))
  const rootAssets = Object.values(assets).filter((a) => !binAssetIds.has(a.id))
  const rootBins = bins.filter((b) => !b.parentId)

  const list = rootAssets.filter(
    (a) => !query || a.name.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (!ctx) return
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('.menu-drop')) setCtx(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedAssetId) {
        // Only remove the asset if nothing on the timeline is selected.
        // When clips/gaps/cues are selected the timeline delete handler wins.
        const s = useStore.getState()
        if (!s.selectedClipId && !s.selectedClipIds.length && !s.selectedGap && !s.selectedCueId) {
          removeAsset(selectedAssetId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedAssetId, removeAsset])

  const openCtx = (e: React.MouseEvent, assetId: string | null, binId: string | null = null): void => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, assetId, binId })
  }

  const AssetItem = ({ a }: { a: MediaAsset }): JSX.Element => {
    const isSelected = selectedAssetId === a.id
    const commonProps = {
      className: `asset ${isSelected ? 'selected' : ''}${a.proxyPath ? ' has-proxy' : ''}`,
      draggable: true,
      onClick: () => selectAsset(a.id),
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData('application/x-swift-asset', a.id)
        setDragAsset(a)
      },
      onDragEnd: () => setDragAsset(null),
      onDoubleClick: () => { selectAsset(a.id); addLinkedClipsFromAsset(a.id) },
      onContextMenu: (e: React.MouseEvent) => { selectAsset(a.id); openCtx(e, a.id) },
      title: `${a.name}${a.proxyPath ? '\n[proxy attached]' : ''}\nDouble-click or drag to timeline`
    }

    if (view === 'list') {
      return (
        <div {...commonProps} className={`bin-row ${isSelected ? 'selected' : ''}`}>
          <span className="c-name icon-inline">
            <KindIcon kind={a.kind} /> {a.name} {a.proxyPath && <span className="proxy-badge" title="Proxy attached">P</span>}
          </span>
          <span>{fmtDur(a.duration)}</span>
          <span>{a.width ? `${a.width}×${a.height} · ${Math.round(a.fps)}fps` : '—'}</span>
        </div>
      )
    }

    return (
      <div {...commonProps}>
        {a.thumbnail ? (
          <img className="thumb" src={a.thumbnail} alt="" />
        ) : a.waveform ? (
          <div className="thumb wave" style={{ backgroundImage: `url(${a.waveform})` }} />
        ) : (
          <div className="thumb" style={{ display: 'grid', placeItems: 'center', color: '#667' }}>
            <KindIcon kind={a.kind} />
          </div>
        )}
        <div className="meta">
          <div className="name">{a.name} {a.proxyPath && <span className="proxy-badge">P</span>}</div>
          <div className="sub">
            {fmtDur(a.duration)}
            {a.width ? ` · ${a.width}×${a.height}` : ''}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bin-wrap"
      ref={wrapRef}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.asset, .bin-row:not(.head), .bin-folder-head')) return
        openCtx(e, null)
      }}
    >
      <div className="bin-toolbar">
        <button
          className="iconbtn"
          title="Import Media… (⌘I)"
          onClick={onImport}
          style={{ flexShrink: 0 }}
        ><IcPlus size={14} /></button>
        <input
          type="text"
          placeholder="Search media…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
          onContextMenu={(e) => e.stopPropagation()}
        />
        <button
          className={`iconbtn ${proxyMode ? 'active' : ''}`}
          title={`Proxy mode: ${proxyMode ? 'ON' : 'OFF'}`}
          onClick={toggleProxyMode}
        >P</button>
        <button
          className="iconbtn"
          title="New bin"
          onClick={() => addBin('New Bin')}
        >📁</button>
        <button className={`iconbtn ${view === 'list' ? 'active' : ''}`} title="List view" onClick={() => setView('list')}><IcList /></button>
        <button className={`iconbtn ${view === 'icon' ? 'active' : ''}`} title="Icon view" onClick={() => setView('icon')}><IcGrid /></button>
      </div>

      {/* Bin tree at top */}
      {rootBins.length > 0 && (
        <div className="bin-tree">
          {rootBins.map((b) => (
            <BinRow
              key={b.id}
              bin={b}
              bins={bins}
              depth={0}
              assets={assets}
              onAssetCtx={(e, id) => openCtx(e, id)}
            />
          ))}
        </div>
      )}

      {list.length === 0 && rootBins.length === 0 ? (
        <div
          className="bin-empty"
          onContextMenu={(e) => openCtx(e, null)}
        >
          {Object.keys(assets).length === 0
            ? <>No media yet.<br />Drag &amp; drop or<br /><button style={{ marginTop: 8 }} onClick={onImport}>Import Media…</button></>
            : 'No results for "' + query + '"'
          }
        </div>
      ) : view === 'icon' ? (
        <div className="bin">
          {list.map((a) => <AssetItem key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="bin-list">
          <div className="bin-row head">
            <span className="c-name">Name</span>
            <span>Duration</span>
            <span>Info</span>
          </div>
          {list.map((a) => <AssetItem key={a.id} a={a} />)}
        </div>
      )}

      {ctx && (
        <BinContextMenu
          ctx={ctx}
          bins={bins}
          onImport={() => { setCtx(null); onImport() }}
          close={() => setCtx(null)}
        />
      )}

      {propsAsset && (
        <PropertiesOverlay asset={propsAsset} onClose={() => setPropsAsset(null)} />
      )}
    </div>
  )
}
