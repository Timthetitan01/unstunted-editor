# SwiftCut

A **super-lightweight, cross-platform NLE** (non-linear video editor). Runs
identically on Windows and macOS because everything renders through Electron's
bundled Chromium and exports through bundled FFmpeg.

## Features

- **Editing basics** — multi-track timeline, cut/split (`S`), drag to move,
  trim handles, zoom, snapping, drag-and-drop import, live canvas preview.
- **Transitions** — cross-dissolve, fade-through-black, wipes.
- **Keyframing** — animate X/Y/scale/rotation/opacity/volume with easing.
- **Auto captions** — local Whisper transcription (transformers.js) with
  word-level timing and viral-shorts styles (Hormozi pop, karaoke, boxed,
  minimal).
- **Export** — H.264 MP4. Frames come from the *same* compositor used for the
  preview, so the export is pixel-identical to what you see.

## Run it

```bash
npm install      # also fetches platform FFmpeg/FFprobe binaries
npm run dev      # launch in development (hot reload)
```

Build distributables:

```bash
npm run dist:mac   # .dmg
npm run dist:win   # .exe (NSIS)
```

> **Note for this sandbox:** the shell here sets `ELECTRON_RUN_AS_NODE=1`, which
> makes Electron run as plain Node and fail to open a window. Launch with it
> unset: `env -u ELECTRON_RUN_AS_NODE npm run dev`. On a normal machine this
> isn't set, so `npm run dev` just works.

## Architecture

```
src/
  shared/types.ts        Project data model (tracks, clips, keyframes, captions)
  main/                  Electron main process
    ffmpeg.ts            probe / thumbnail / 16k audio decode (bundled binaries)
    export.ts            frame-streaming exporter -> pipes rawvideo into ffmpeg
    ipc.ts               typed IPC handlers
  preload/index.ts       contextBridge API surface (window.swift)
  renderer/src/
    store.ts             Zustand store: all timeline operations
    engine/
      compositor.ts      draws a frame at time T (preview AND export)
      keyframes.ts       keyframe sampling + easing
      captions.ts        word-level caption rendering on canvas
    components/          MediaBin, Preview, Timeline, Inspector, ExportDialog
    lib/                 import, transcribe (Whisper), audioMix (offline WAV)
```

### Why it stays identical across OSes
- **Rendering**: one canvas compositor for both preview and export — no
  per-OS rendering paths.
- **Audio**: mixed via `OfflineAudioContext` to a WAV, then muxed by FFmpeg.
- **Encoding**: bundled `ffmpeg-static` / `ffprobe-static` — same binaries
  behaviour everywhere.
- **Captions**: Whisper via WASM/WebGPU (transformers.js) — same runtime on
  every platform; the model downloads once and is then fully offline.

## Keyboard

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `S` | Split clip at playhead |
| `Delete` / `Backspace` | Delete selected clip |
| `Cmd/Ctrl + E` | Export |
