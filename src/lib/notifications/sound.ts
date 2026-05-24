const MUTE_KEY = "elkayam_notif_sound"; // "on" | "off"
let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;
function getCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

// Call from a user gesture so the AudioContext is allowed to start.
export function primeAudio(): void {
  if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
  const Ctor = getCtor();
  if (!Ctor) return;
  try { ctx = new Ctor(); if (ctx.state === "suspended") void ctx.resume(); } catch { ctx = null; }
}

export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "off";
}

export function setMuted(muted: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
}

// Gentle two-note chime (A5 -> D6). No-op when muted or audio unavailable.
export function playChime(): void {
  if (isMuted()) return;
  if (!ctx) { primeAudio(); }
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes: Array<[number, number]> = [[880, 0], [1175, 0.18]];
  for (const [freq, delay] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.linearRampToValueAtTime(0.12, t + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.4);
  }
}
