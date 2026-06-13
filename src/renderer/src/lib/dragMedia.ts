import type { MediaAsset } from '../../../shared/types'

// HTML5 drag-and-drop can't expose payload data during dragover, only on drop,
// so the media bin parks the dragged asset here for the timeline ghost to read.
let dragAsset: MediaAsset | null = null

export const setDragAsset = (a: MediaAsset | null): void => {
  dragAsset = a
}
export const getDragAsset = (): MediaAsset | null => dragAsset

// When OS files are dropped on the timeline we note the drop time here; the
// window-level import handler consumes it to place the new clips at the cursor.
let pendingDropTime: number | null = null

export const setPendingDropTime = (t: number | null): void => {
  pendingDropTime = t
}
export const consumePendingDropTime = (): number | null => {
  const t = pendingDropTime
  pendingDropTime = null
  return t
}
