/**
 * Procedural sound effects using Web Audio API
 */

class SoundManager {
  private audioContext: AudioContext;
  private isMuted: boolean = false;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.audioContext.suspend();
    } else if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  isMuted_(): boolean {
    return this.isMuted;
  }

  /**
   * Play a simple beep sound (UI interaction)
   */
  playBeep(frequency: number = 440, duration: number = 0.1): void {
    if (this.isMuted) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }

  /**
   * Play a success chime (three ascending beeps)
   */
  playSuccess(): void {
    if (this.isMuted) return;

    const freqs = [523, 659, 784]; // C5, E5, G5
    for (let i = 0; i < freqs.length; i++) {
      const delay = i * 0.15;
      setTimeout(() => this.playBeep(freqs[i], 0.2), delay * 1000);
    }
  }

  /**
   * Play failure sound (descending buzz)
   */
  playFailure(): void {
    if (this.isMuted) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sawtooth';
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.frequency.setValueAtTime(400, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.5);

    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + 0.5);
  }

  /**
   * Play break sound (impact noise)
   */
  playBreak(): void {
    if (this.isMuted) return;

    const now = this.audioContext.currentTime;
    const bufferLength = this.audioContext.sampleRate * 0.1;
    const noiseBuffer = this.audioContext.createBuffer(1, bufferLength, this.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferLength; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();

    source.buffer = noiseBuffer;
    source.connect(gain);
    gain.connect(this.audioContext.destination);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    source.start(now);
  }

  /**
   * Play a click sound (subtle UI feedback)
   */
  playClick(): void {
    if (this.isMuted) return;
    this.playBeep(1000, 0.05);
  }
}

// Singleton instance
let soundManager: SoundManager | null = null;

export function getSoundManager(): SoundManager {
  if (!soundManager) {
    soundManager = new SoundManager();
  }
  return soundManager;
}
