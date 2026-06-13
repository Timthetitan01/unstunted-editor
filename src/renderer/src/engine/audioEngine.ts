// Web Audio mixer for preview. Each media element is routed through its own
// GainNode into a master bus, so volume/keyframes/track-mute are sample-accurate
// and mixing is handled by the audio graph instead of per-element .volume.

interface Node {
  source: MediaElementAudioSourceNode
  gain: GainNode
  pan: StereoPannerNode
}

export class AudioEngine {
  readonly ctx: AudioContext
  private master: GainNode
  private nodes = new Map<HTMLMediaElement, Node>()

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  /** Route an element through the graph exactly once. */
  attach(el: HTMLMediaElement): void {
    if (this.nodes.has(el)) return
    try {
      const source = this.ctx.createMediaElementSource(el)
      const gain = this.ctx.createGain()
      const pan = this.ctx.createStereoPanner()
      gain.gain.value = 0
      source.connect(gain).connect(pan).connect(this.master)
      this.nodes.set(el, { source, gain, pan })
    } catch {
      /* element may already be bound to another context */
    }
  }

  setGain(el: HTMLMediaElement, value: number): void {
    const n = this.nodes.get(el)
    if (n) n.gain.gain.value = Math.max(0, value)
  }

  setPan(el: HTMLMediaElement, value: number): void {
    const n = this.nodes.get(el)
    if (n) n.pan.pan.value = Math.max(-1, Math.min(1, value))
  }

  /** Zero the gain of every element not in `active`. */
  silenceExcept(active: Set<HTMLMediaElement>): void {
    for (const [el, n] of this.nodes) if (!active.has(el)) n.gain.gain.value = 0
  }

  dispose(): void {
    void this.ctx.close()
    this.nodes.clear()
  }
}
