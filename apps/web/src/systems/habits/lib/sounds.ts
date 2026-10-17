// Low-latency tick sounds. An AudioContext is created on the first pointer
// interaction (autoplay policy), buffers decode once, playback is synchronous.
// Real files drop into public/sounds/{partial,complete,off}.ogg; until they
// exist, tiny synthesized placeholders play instead.
export type SoundSlot = "partial" | "complete" | "off";

const SLOTS: SoundSlot[] = ["partial", "complete", "off"];

let ctx: AudioContext | null = null;
const buffers = new Map<SoundSlot, AudioBuffer>();

function synth(audio: AudioContext, slot: SoundSlot): AudioBuffer {
  const sr = audio.sampleRate;
  const dur = slot === "off" ? 0.14 : slot === "complete" ? 0.09 : 0.03;
  const buf = audio.createBuffer(1, Math.ceil(sr * dur), sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (slot === "off" ? 30 : 90));
    if (slot === "partial") {
      data[i] = Math.sin(2 * Math.PI * 1800 * t) * env * 0.6;
    } else if (slot === "complete") {
      const f = 520 + 380 * Math.min(1, t / 0.04); // short upward blip
      data[i] = Math.sin(2 * Math.PI * f * t) * env * 0.8;
    } else {
      data[i] = (Math.random() * 2 - 1) * env * 0.35; // noise swoosh
    }
  }
  return buf;
}

export function initSounds(): void {
  if (ctx || typeof window === "undefined") return;
  ctx = new AudioContext();
  for (const slot of SLOTS) {
    void fetch(`/sounds/${slot}.ogg`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
      .then((ab) => ctx!.decodeAudioData(ab))
      .then((buf) => {
        buffers.set(slot, buf);
      })
      .catch(() => {
        buffers.set(slot, synth(ctx!, slot));
      });
  }
}

export function playSound(slot: SoundSlot): void {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const buf = buffers.get(slot);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}
