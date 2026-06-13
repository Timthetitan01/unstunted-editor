import type { CaptionWord } from '../../../shared/types'

// Lazy-loaded Whisper pipeline (transformers.js). Models are fetched from the
// HuggingFace hub on first use and cached to disk, then run fully offline.
// Same WASM/WebGPU runtime on Windows and macOS => identical results.

type ProgressCb = (msg: string, pct?: number) => void

// Remote faster-whisper server (CTranslate2 int8 — ~20x realtime on CPU).
// Falls back to local transformers.js if unreachable.
const REMOTE_URL = 'http://100.114.144.102:8765'

async function transcribeRemote(
  path: string,
  offset: number,
  onProgress?: ProgressCb
): Promise<TranscribeResult | null> {
  try {
    onProgress?.('Checking transcription server…')
    const health = await fetch(`${REMOTE_URL}/health`, { signal: AbortSignal.timeout(2000) })
    if (!health.ok) return null

    onProgress?.('Decoding audio…')
    const buf = await window.swift.decodeAudio16k(path)
    if (!buf || buf.byteLength === 0) return null

    onProgress?.('Transcribing on server…')
    const form = new FormData()
    form.append('audio', new Blob([buf], { type: 'application/octet-stream' }), 'audio.pcm')
    form.append('offset', String(offset))

    const res = await fetch(`${REMOTE_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) return null

    const json = await res.json() as { words: CaptionWord[]; text: string }
    return json
  } catch {
    return null
  }
}

// WebGPU is ~10–50× faster than the WASM CPU backend for Whisper. The `jsep`
// onnxruntime build we ship (src/renderer/public/ort) is the WebGPU-capable one,
// so when the GPU is available we run there and only fall back to WASM if it
// isn't or if GPU init throws. Pipelines are keyed by device so a WASM fallback
// after a failed WebGPU attempt doesn't reuse the poisoned promise.
const pipePromises: Record<string, Promise<any> | null> = {}

function configureEnv(tf: any): void {
  tf.env.allowLocalModels = false
  // onnxruntime's wasm runtime ships with the app (src/renderer/public/ort)
  // — never fetch it from a CDN, which is blocked by CSP and needs network
  tf.env.backends.onnx.wasm!.wasmPaths = new URL('ort/', window.location.href).toString()
  // The packaged app runs on file:// where the browser Cache API is
  // unreliable, so model files cache to disk via the main process.
  tf.env.useBrowserCache = false
  tf.env.useCustomCache = true
  tf.env.customCache = {
    match: async (key: string): Promise<Response | undefined> => {
      const buf = await window.swift.cacheGet(String(key))
      return buf ? new Response(buf) : undefined
    },
    put: async (key: string, response: Response): Promise<void> => {
      const data = await response.clone().arrayBuffer()
      await window.swift.cachePut(String(key), data)
    }
  }
}

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

async function buildPipeline(
  tf: any,
  model: string,
  device: 'webgpu' | 'wasm',
  onProgress?: ProgressCb
): Promise<any> {
  return tf.pipeline('automatic-speech-recognition', model, {
    device,
    // On WebGPU run the encoder at full precision and the (much larger) decoder
    // quantised to q4 — the config the official transformers.js whisper-webgpu
    // demo uses. On WASM fall back to q8, which keeps CPU inference tractable.
    dtype:
      device === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : 'q8',
    progress_callback: (p: any) => {
      if (p?.status === 'progress' && p.file)
        onProgress?.('Setting things up…', Math.round(p.progress ?? 0))
    }
  })
}

async function getPipeline(model: string, onProgress?: ProgressCb): Promise<any> {
  const tf = await import('@huggingface/transformers')
  configureEnv(tf)

  const wantGPU = await hasWebGPU()
  const device: 'webgpu' | 'wasm' = wantGPU ? 'webgpu' : 'wasm'

  if (!pipePromises[device]) {
    pipePromises[device] = buildPipeline(tf, model, device, onProgress).catch((e) => {
      pipePromises[device] = null
      if (e instanceof TypeError && /fetch/i.test(e.message)) {
        throw new Error(
          'Could not download the speech model (~75 MB, one time). Check your internet connection and try again.'
        )
      }
      throw e
    })
  }

  try {
    return await pipePromises[device]
  } catch (e) {
    // GPU init can fail on some drivers even when an adapter exists — fall back
    // to the CPU backend rather than failing the whole transcription.
    if (device === 'webgpu') {
      onProgress?.('GPU unavailable — using CPU…')
      if (!pipePromises.wasm)
        pipePromises.wasm = buildPipeline(tf, model, 'wasm', onProgress).catch((err) => {
          pipePromises.wasm = null
          throw err
        })
      return pipePromises.wasm
    }
    throw e
  }
}

export interface TranscribeResult {
  words: CaptionWord[]
  text: string
}

/**
 * Transcribe an asset to word-level timestamps.
 * Tries the remote faster-whisper server first (~20x realtime), falls back to
 * local transformers.js (WebGPU/WASM) if the server is unreachable.
 * @param path absolute media path (audio is decoded in the main process)
 * @param offset timeline offset (seconds) added to every word's timing
 */
export async function transcribe(
  path: string,
  offset: number,
  model = 'Xenova/whisper-base.en',
  onProgress?: ProgressCb
): Promise<TranscribeResult> {
  const remote = await transcribeRemote(path, offset, onProgress)
  if (remote) return remote

  // --- local fallback ---
  onProgress?.('Decoding audio…')
  const buf = await window.swift.decodeAudio16k(path)
  const audio = new Float32Array(buf)
  if (audio.length === 0) throw new Error('No audio track found in this clip')

  onProgress?.('Loading transcription model…')
  const transcriber = await getPipeline(model, onProgress)

  onProgress?.('Transcribing…')
  const out = await transcriber(audio, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5
  })

  const chunks: { text: string; timestamp: [number, number] }[] = out.chunks ?? []
  const words: CaptionWord[] = chunks
    .filter((c) => c.text && c.text.trim())
    .map((c, i, arr) => {
      const start = c.timestamp?.[0] ?? 0
      const end = c.timestamp?.[1] ?? arr[i + 1]?.timestamp?.[0] ?? start + 0.3
      return {
        word: c.text.trim(),
        start: start + offset,
        end: Math.max(start + 0.08, end) + offset
      }
    })

  return { words, text: out.text ?? words.map((w) => w.word).join(' ') }
}
