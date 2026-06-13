import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ProbeResult, ExportProgress } from '../shared/types'

const api = {
  // Electron 32+ removed File.path; this is the supported way to resolve a
  // dropped file's absolute path.
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  openMedia: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia'),
  probe: (path: string): Promise<ProbeResult> => ipcRenderer.invoke('media:probe', path),
  thumbnail: (path: string, time?: number): Promise<string> =>
    ipcRenderer.invoke('media:thumbnail', path, time),
  filmstrip: (path: string, duration: number, frames?: number): Promise<string> =>
    ipcRenderer.invoke('media:filmstrip', path, duration, frames),
  saveFrameDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFrame', defaultName),
  fileUrl: (path: string): Promise<string> => ipcRenderer.invoke('media:fileUrl', path),
  decodeAudio16k: (path: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('audio:decode16k', path),

  // disk-backed cache for ML model downloads
  cacheGet: (key: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke('cache:get', key),
  cachePut: (key: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('cache:put', key, data),

  // project persistence
  saveDialog: (): Promise<string | null> => ipcRenderer.invoke('project:saveDialog'),
  openDialog: (): Promise<string | null> => ipcRenderer.invoke('project:openDialog'),
  saveProject: (path: string, json: string): Promise<boolean> =>
    ipcRenderer.invoke('project:save', path, json),
  loadProject: (path: string): Promise<string> => ipcRenderer.invoke('project:load', path),
  autosave: (json: string): Promise<number> => ipcRenderer.invoke('project:autosave', json),
  openProxy: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProxy'),

  /** 'darwin' | 'win32' | 'linux' — lets the renderer adapt UI for the host OS. */
  platform: process.platform as string,

  // export (frame streaming)
  saveExportDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveExport', defaultName),
  exportBegin: (opts: unknown): Promise<string> => ipcRenderer.invoke('export:begin', opts),
  exportFrame: (id: string, frame: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('export:frame', id, frame),
  exportEnd: (id: string): Promise<string> => ipcRenderer.invoke('export:end', id),
  exportCancel: (id: string): Promise<boolean> => ipcRenderer.invoke('export:cancel', id),
  writeExportFile: (path: string, data: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('export:writeFile', path, data),
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: ExportProgress): void => cb(p)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  }
}

contextBridge.exposeInMainWorld('swift', api)

export type SwiftApi = typeof api
