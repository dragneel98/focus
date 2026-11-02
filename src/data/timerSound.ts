let audioContext: AudioContext | null = null;

export function prepareTimerEndSound(): boolean {
  const AudioContextConstructor = globalThis.AudioContext;
  if (!AudioContextConstructor) return false;
  try {
    audioContext ??= new AudioContextConstructor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return true;
  } catch {
    return false;
  }
}

export function playTimerEndSound(): boolean {
  if (!prepareTimerEndSound() || !audioContext) return false;
  try {
    const context = audioContext;
    const notes = [660, 880];
    notes.forEach((frequency, index) => {
      const startAt = context.currentTime + index * 0.16;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.025);
      gain.gain.linearRampToValueAtTime(0.0001, startAt + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.15);
    });
    globalThis.setTimeout(() => { void context.close(); }, 500);
    return true;
  } catch {
    return false;
  }
}
