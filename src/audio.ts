export class BridgeAudio {
  private context?: AudioContext;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | undefined {
    if (this.muted) {
      return undefined;
    }
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    gain = 0.035,
    endFrequency?: number,
    delay = 0,
  ): void {
    const context = this.getContext();
    if (!context) {
      return;
    }
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    }
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  place(): void {
    this.tone(520, 0.07, "triangle", 0.025, 690);
  }

  remove(): void {
    this.tone(280, 0.08, "triangle", 0.02, 180);
  }

  test(): void {
    this.tone(180, 0.12, "sawtooth", 0.018, 260);
    this.tone(260, 0.16, "triangle", 0.022, 390, 0.1);
  }

  break(): void {
    this.tone(150, 0.22, "sawtooth", 0.045, 48);
    this.tone(780, 0.08, "square", 0.012, 210);
  }

  success(): void {
    [392, 494, 587, 784].forEach((frequency, index) => {
      this.tone(frequency, 0.24, "triangle", 0.025, frequency * 1.01, index * 0.11);
    });
  }

  failure(): void {
    this.tone(240, 0.25, "sawtooth", 0.028, 120);
    this.tone(175, 0.34, "triangle", 0.025, 72, 0.16);
  }
}
