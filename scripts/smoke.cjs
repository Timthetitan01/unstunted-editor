/* Headless end-to-end test of SwiftCut's FFmpeg pipeline (mirrors src/main). */
const { spawn } = require('node:child_process')
const { writeFile, mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const FFMPEG = require('ffmpeg-static')
const FFPROBE = require('ffprobe-static').path

function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(bin, args, { windowsHide: true })
    const out = [], err = []
    c.stdout.on('data', (d) => out.push(d))
    c.stderr.on('data', (d) => err.push(d))
    c.on('error', reject)
    c.on('close', (code) =>
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() })
    )
    if (input) { c.stdin.write(input); c.stdin.end() }
  })
}

async function probe(path) {
  const { stdout } = await run(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path])
  return JSON.parse(stdout.toString() || '{}')
}

;(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'swiftcut-smoke-'))
  const src = join(dir, 'src.mp4')
  const wav = join(dir, 'audio.wav')
  const out = join(dir, 'out.mp4')
  let pass = 0, fail = 0
  const ok = (label, cond, extra = '') => {
    console.log(`${cond ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`)
    cond ? pass++ : fail++
  }

  try {
    // 1) generate a 4s 1280x720 test clip with a 440Hz tone (like an imported file)
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src
    ])

    // 2) probe (ffmpeg.ts probe)
    const meta = await probe(src)
    const v = meta.streams.find((s) => s.codec_type === 'video')
    const a = meta.streams.find((s) => s.codec_type === 'audio')
    ok('probe: video stream', v && v.width === 1280 && v.height === 720, `${v?.width}x${v?.height}`)
    ok('probe: audio stream detected', !!a)
    ok('probe: duration ~4s', Math.abs(parseFloat(meta.format.duration) - 4) < 0.5, `${meta.format.duration}s`)

    // 3) thumbnail (ffmpeg.ts thumbnail)
    const thumb = await run(FFMPEG, ['-ss', '0.5', '-i', src, '-frames:v', '1', '-vf', 'scale=240:-1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'])
    ok('thumbnail: produced JPEG bytes', thumb.stdout.length > 1000, `${thumb.stdout.length} bytes`)

    // 4) decode to 16k mono f32 (ipc audio:decode16k — feeds Whisper)
    const pcm = await run(FFMPEG, ['-i', src, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'])
    const samples = pcm.stdout.length / 4
    ok('decode16k: ~64000 mono samples (4s @16k)', Math.abs(samples - 64000) < 2000, `${samples} samples`)

    // 5) EXPORT PIPELINE — exact args from export.ts: rawvideo frames + wav -> mp4
    const W = 1080, H = 1920, FPS = 30, SECONDS = 2
    // mixed-audio WAV, like audioMix.ts output
    await run(FFMPEG, ['-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${SECONDS}`, '-ac', '2', '-ar', '48000', wav])

    const args = [
      '-y',
      '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
      '-i', wav,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-b:v', '12000k', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '192k', '-shortest',
      '-r', String(FPS), out
    ]
    const ff = spawn(FFMPEG, args, { windowsHide: true })
    let ffErr = ''
    ff.stderr.on('data', (d) => (ffErr += d))

    // stream synthetic animated frames (gradient that moves) with backpressure
    const frameBuf = Buffer.alloc(W * H * 4)
    const total = FPS * SECONDS
    for (let f = 0; f < total; f++) {
      const phase = (f / total) * 255
      for (let i = 0; i < W * H; i++) {
        const o = i * 4
        frameBuf[o] = (i + phase) & 255         // R
        frameBuf[o + 1] = (phase * 2) & 255      // G
        frameBuf[o + 2] = ((i >> 2) + phase) & 255 // B
        frameBuf[o + 3] = 255                    // A
      }
      const okWrite = ff.stdin.write(frameBuf)
      if (!okWrite) await new Promise((r) => ff.stdin.once('drain', r))
    }
    const code = await new Promise((res) => { ff.on('close', res); ff.stdin.end() })
    ok('export: ffmpeg exited 0', code === 0, code !== 0 ? ffErr.slice(-300) : '')

    // 6) verify the exported mp4 is valid with both streams
    const outMeta = await probe(out)
    const ov = outMeta.streams.find((s) => s.codec_type === 'video')
    const oa = outMeta.streams.find((s) => s.codec_type === 'audio')
    ok('export: output is 1080x1920 h264', ov && ov.width === 1080 && ov.height === 1920 && ov.codec_name === 'h264', `${ov?.codec_name} ${ov?.width}x${ov?.height}`)
    ok('export: output has AAC audio', oa && oa.codec_name === 'aac')
    ok('export: duration ~2s', Math.abs(parseFloat(outMeta.format.duration) - 2) < 0.5, `${outMeta.format.duration}s`)

    console.log(`\n${fail === 0 ? '🎉 ALL PASS' : '⚠ FAILURES'} — ${pass} passed, ${fail} failed`)
    process.exitCode = fail === 0 ? 0 : 1
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1 })
