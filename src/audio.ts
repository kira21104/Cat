// ════════════════════════════════════════════════════════════════════════════════
// KOTOKU AUDIO SFX ENGINE (Web Audio API Synthesizer)
// Provides cozy, high-quality, zero-latency sound effects designed specifically
// for Kotoku Sudoku: UI click, correct ding, soft mistake, fanfare, loss, hint, pencil.
// ════════════════════════════════════════════════════════════════════════════════

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false; // Sound FX mute
  private isMusicMuted: boolean = false; // Background music mute
  private musicVolume: number = 0.45; // Dedicated background music volume (0.0 to 1.0)
  private musicGainNode: GainNode | null = null;
  private musicFilterNode: BiquadFilterNode | null = null;
  private isMusicPlaying: boolean = false;
  private musicTimer: number | null = null;
  private currentBeat: number = 0;
  private nextBeatTime: number = 0;
  private bpm: number = 72;
  private vinylNode: AudioBufferSourceNode | null = null;
  private vinylGain: GainNode | null = null;

  constructor() {
    // Check saved mute & music preferences
    if (typeof window !== 'undefined') {
      const savedSound = localStorage.getItem('kotoku_sound_muted');
      if (savedSound !== null) {
        this.isMuted = savedSound === 'true';
      }

      const savedMusic = localStorage.getItem('kotoku_music_muted');
      if (savedMusic !== null) {
        this.isMusicMuted = savedMusic === 'true';
      }

      const savedVol = localStorage.getItem('kotoku_music_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v)) {
          this.musicVolume = Math.max(0, Math.min(1, v));
        }
      }
    }
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && !this.musicGainNode) {
      this.musicGainNode = this.ctx.createGain();
      this.musicFilterNode = this.ctx.createBiquadFilter();
      this.musicFilterNode.type = 'lowpass';
      this.musicFilterNode.frequency.setValueAtTime(2600, this.ctx.currentTime); // gentle warm lo-fi ceiling
      this.musicGainNode.connect(this.musicFilterNode);
      this.musicFilterNode.connect(this.ctx.destination);
      this.updateMusicGain(false);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('kotoku_sound_muted', String(muted));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    if (!this.isMuted) {
      this.playClick();
    }
    return this.isMuted;
  }

  // ── Dedicated Background Music Controls ──────────────────────────────────
  public getMusicMuted(): boolean {
    return this.isMusicMuted;
  }

  public setMusicMuted(muted: boolean) {
    this.isMusicMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('kotoku_music_muted', String(muted));
    }
    this.updateMusicGain(true);
    if (!muted && !this.isMusicPlaying) {
      this.startMusic();
    }
  }

  public toggleMusicMute(): boolean {
    this.setMusicMuted(!this.isMusicMuted);
    return this.isMusicMuted;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('kotoku_music_volume', String(this.musicVolume));
    }
    this.updateMusicGain(true);
    if (this.musicVolume > 0 && this.isMusicMuted) {
      this.setMusicMuted(false);
    }
  }

  private updateMusicGain(smooth: boolean = true) {
    if (!this.ctx || !this.musicGainNode) return;
    const now = this.ctx.currentTime;
    // Master volume multiplier is 0.15 so background music sits quietly behind SFX (ding/click/win)
    const targetGain = this.isMusicMuted ? 0 : this.musicVolume * 0.15;
    this.musicGainNode.gain.cancelScheduledValues(now);
    if (smooth) {
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + 0.35);
    } else {
      this.musicGainNode.gain.setValueAtTime(targetGain, now);
    }
  }

  public ensureMusicStarted() {
    if (this.isMusicPlaying) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    if (!this.isMusicMuted) {
      this.startMusic();
    }
  }

  public isPlayingMusic(): boolean {
    return this.isMusicPlaying && !this.isMusicMuted;
  }

  // Cozy Rhodes electric piano chord with gentle staggered strum and lowpass warmth
  private playRhodesChord(time: number, freqs: number[], vol: number, dur: number) {
    if (!this.ctx || !this.musicGainNode) return;
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.musicGainNode) return;
      const noteTime = time + idx * 0.018; // gentle finger strum stagger
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, noteTime);
      filter.Q.setValueAtTime(0.7, noteTime);

      const noteVol = vol * (0.8 + Math.random() * 0.2);
      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.linearRampToValueAtTime(noteVol * 0.14, noteTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(noteVol * 0.06, noteTime + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + dur);

      osc.connect(filter);
      overtone.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGainNode);

      osc.start(noteTime);
      overtone.start(noteTime);
      osc.stop(noteTime + dur + 0.05);
      overtone.stop(noteTime + dur + 0.05);
    });
  }

  // Soft acoustic guitar / nylon pluck
  private playAcousticPluck(time: number, freq: number, vol: number, dur: number) {
    if (!this.ctx || !this.musicGainNode) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.Q.setValueAtTime(1.2, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol * 0.12, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGainNode);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // Warm round acoustic bass note
  private playBassNote(time: number, freq: number, vol: number, dur: number) {
    if (!this.ctx || !this.musicGainNode) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol * 0.22, time + 0.035);
    gain.gain.exponentialRampToValueAtTime(vol * 0.08, time + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGainNode);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // Ultra-subtle lo-fi tape / vinyl warmth
  private initVinylLoop() {
    if (!this.ctx || !this.musicGainNode || this.vinylNode) return;
    try {
      const bufferSize = this.ctx.sampleRate * 2.5;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.05;
        b2 = 0.85 * b2 + white * 0.05;
        data[i] = (b0 + b1 + b2) * 0.08;
      }

      this.vinylNode = this.ctx.createBufferSource();
      this.vinylNode.buffer = noiseBuffer;
      this.vinylNode.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      filter.Q.setValueAtTime(0.8, this.ctx.currentTime);

      this.vinylGain = this.ctx.createGain();
      this.vinylGain.gain.setValueAtTime(0.025, this.ctx.currentTime);

      this.vinylNode.connect(filter);
      filter.connect(this.vinylGain);
      this.vinylGain.connect(this.musicGainNode);

      this.vinylNode.start();
    } catch (e) {
      console.warn('[KotokuAudio] Vinyl warmth init error:', e);
    }
  }

  private scheduleMusicBeat(beat: number, time: number) {
    if (!this.ctx || !this.musicGainNode) return;

    // ── 1. Rhodes Chords & Acoustic Bass ───────────────────
    switch (beat) {
      case 0: // Measure 1: Fmaj7
        this.playBassNote(time, 87.31, 0.45, 3.2); // F2
        this.playRhodesChord(time, [174.61, 261.63, 329.63, 440.00], 0.38, 3.0); // F3, C4, E4, A4
        break;
      case 4: // Measure 2: Fmaj7 variation
        this.playRhodesChord(time, [220.00, 261.63, 329.63, 392.00], 0.32, 2.8); // A3, C4, E4, G4
        break;
      case 8: // Measure 3: Em7
        this.playBassNote(time, 82.41, 0.45, 3.2); // E2
        this.playRhodesChord(time, [164.81, 246.94, 293.66, 392.00], 0.38, 3.0); // E3, B3, D4, G4
        break;
      case 12: // Measure 4: Em7 variation
        this.playRhodesChord(time, [196.00, 246.94, 293.66, 493.88], 0.32, 2.8); // G3, B3, D4, B4
        break;
      case 16: // Measure 5: Dm9
        this.playBassNote(time, 73.42, 0.45, 3.2); // D2
        this.playRhodesChord(time, [146.83, 220.00, 261.63, 329.63], 0.38, 3.0); // D3, A3, C4, E4
        break;
      case 20: // Measure 6: Dm7 variation
        this.playRhodesChord(time, [174.61, 220.00, 261.63, 349.23], 0.32, 2.8); // F3, A3, C4, F4
        break;
      case 24: // Measure 7: Cmaj7
        this.playBassNote(time, 65.41, 0.45, 3.2); // C2
        this.playRhodesChord(time, [130.81, 196.00, 246.94, 329.63], 0.38, 3.0); // C3, G3, B3, E4
        break;
      case 28: // Measure 8: Cmaj7 variation
        this.playRhodesChord(time, [164.81, 196.00, 246.94, 392.00], 0.32, 2.8); // E3, G3, B3, G4
        break;

      case 32: // Measure 9: Fmaj7
        this.playBassNote(time, 87.31, 0.45, 3.2); // F2
        this.playRhodesChord(time, [174.61, 261.63, 329.63, 440.00], 0.38, 3.0);
        break;
      case 36: // Measure 10: Fmaj7 high inversion
        this.playRhodesChord(time, [220.00, 261.63, 329.63, 523.25], 0.34, 2.8); // A3, C4, E4, C5
        break;
      case 40: // Measure 11: G7sus4
        this.playBassNote(time, 98.00, 0.45, 3.2); // G2
        this.playRhodesChord(time, [196.00, 261.63, 293.66, 349.23], 0.38, 3.0); // G3, C4, D4, F4
        break;
      case 44: // Measure 12: G7 resolution
        this.playRhodesChord(time, [196.00, 246.94, 293.66, 349.23], 0.34, 2.8); // G3, B3, D4, F4
        break;
      case 48: // Measure 13: Em7
        this.playBassNote(time, 82.41, 0.45, 3.2); // E2
        this.playRhodesChord(time, [164.81, 196.00, 246.94, 293.66], 0.36, 3.0);
        break;
      case 52: // Measure 14: Am7
        this.playBassNote(time, 110.00, 0.45, 3.2); // A2
        this.playRhodesChord(time, [220.00, 261.63, 329.63, 392.00], 0.36, 3.0); // A3, C4, E4, G4
        break;
      case 56: // Measure 15: Dm9
        this.playBassNote(time, 73.42, 0.45, 3.2); // D2
        this.playRhodesChord(time, [146.83, 174.61, 220.00, 261.63], 0.36, 3.0); // D3, F3, A3, C4
        break;
      case 60: // Measure 16: G9 turnaround
        this.playBassNote(time, 98.00, 0.42, 1.6); // G2
        this.playRhodesChord(time, [196.00, 246.94, 349.23, 440.00], 0.34, 1.5); // G3, B3, F4, A4
        break;
      case 62: // Beat 62: Cmaj7 soft anticipation
        this.playBassNote(time, 65.41, 0.40, 1.6); // C2
        this.playRhodesChord(time, [130.81, 196.00, 246.94, 329.63], 0.32, 1.5);
        break;
    }

    // ── 2. Acoustic Guitar / Pluck Melodies ─────────────────
    const beatDuration = 60 / this.bpm;
    const plucks: { offset: number; freq: number; vol: number; dur: number }[] = [];

    // Subtle cozy notes distributed gracefully across the measures
    if (beat === 1) plucks.push({ offset: 0.5, freq: 523.25, vol: 0.32, dur: 0.8 }); // C5
    if (beat === 2) plucks.push({ offset: 0.5, freq: 440.00, vol: 0.28, dur: 0.7 }); // A4
    if (beat === 5) plucks.push({ offset: 0.0, freq: 392.00, vol: 0.26, dur: 0.7 }); // G4
    if (beat === 6) plucks.push({ offset: 0.5, freq: 493.88, vol: 0.28, dur: 0.8 }); // B4
    if (beat === 9) plucks.push({ offset: 0.5, freq: 329.63, vol: 0.26, dur: 0.6 }); // E4
    if (beat === 10) plucks.push({ offset: 0.5, freq: 392.00, vol: 0.28, dur: 0.7 }); // G4
    if (beat === 13) plucks.push({ offset: 0.0, freq: 587.33, vol: 0.30, dur: 0.8 }); // D5
    if (beat === 14) plucks.push({ offset: 0.5, freq: 493.88, vol: 0.26, dur: 0.6 }); // B4
    if (beat === 17) plucks.push({ offset: 0.5, freq: 440.00, vol: 0.28, dur: 0.7 }); // A4
    if (beat === 18) plucks.push({ offset: 0.5, freq: 523.25, vol: 0.30, dur: 0.8 }); // C5
    if (beat === 21) plucks.push({ offset: 0.0, freq: 659.25, vol: 0.32, dur: 0.9 }); // E5
    if (beat === 22) plucks.push({ offset: 0.5, freq: 587.33, vol: 0.28, dur: 0.7 }); // D5
    if (beat === 25) plucks.push({ offset: 0.5, freq: 392.00, vol: 0.26, dur: 0.6 }); // G4
    if (beat === 27) plucks.push({ offset: 0.0, freq: 329.63, vol: 0.24, dur: 0.8 }); // E4

    if (beat === 33) plucks.push({ offset: 0.0, freq: 523.25, vol: 0.30, dur: 0.7 }); // C5
    if (beat === 34) plucks.push({ offset: 0.5, freq: 659.25, vol: 0.32, dur: 0.8 }); // E5
    if (beat === 37) plucks.push({ offset: 0.0, freq: 587.33, vol: 0.28, dur: 0.7 }); // D5
    if (beat === 38) plucks.push({ offset: 0.5, freq: 523.25, vol: 0.28, dur: 0.7 }); // C5
    if (beat === 41) plucks.push({ offset: 0.5, freq: 698.46, vol: 0.32, dur: 0.8 }); // F5
    if (beat === 43) plucks.push({ offset: 0.0, freq: 587.33, vol: 0.28, dur: 0.7 }); // D5
    if (beat === 45) plucks.push({ offset: 0.5, freq: 493.88, vol: 0.26, dur: 0.6 }); // B4
    if (beat === 46) plucks.push({ offset: 0.5, freq: 392.00, vol: 0.26, dur: 0.6 }); // G4
    if (beat === 49) plucks.push({ offset: 0.0, freq: 783.99, vol: 0.34, dur: 0.9 }); // G5
    if (beat === 50) plucks.push({ offset: 0.5, freq: 659.25, vol: 0.30, dur: 0.8 }); // E5
    if (beat === 53) plucks.push({ offset: 0.0, freq: 523.25, vol: 0.28, dur: 0.7 }); // C5
    if (beat === 54) plucks.push({ offset: 0.5, freq: 440.00, vol: 0.26, dur: 0.6 }); // A4
    if (beat === 57) plucks.push({ offset: 0.5, freq: 349.23, vol: 0.26, dur: 0.6 }); // F4
    if (beat === 59) plucks.push({ offset: 0.0, freq: 440.00, vol: 0.28, dur: 0.7 }); // A4
    if (beat === 61) plucks.push({ offset: 0.5, freq: 493.88, vol: 0.30, dur: 0.7 }); // B4
    if (beat === 63) plucks.push({ offset: 0.0, freq: 523.25, vol: 0.32, dur: 1.0 }); // C5

    plucks.forEach(p => {
      this.playAcousticPluck(time + p.offset * beatDuration, p.freq, p.vol, p.dur);
    });
  }

  public startMusic() {
    if (this.isMusicPlaying) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.isMusicPlaying = true;
    this.initVinylLoop();
    this.updateMusicGain(true);

    const beatDuration = 60 / this.bpm;
    this.nextBeatTime = this.ctx.currentTime + 0.15;
    this.currentBeat = 0;

    // Lookahead scheduler every 80ms scheduling up to 350ms ahead
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.isMusicPlaying) return;
      const lookahead = this.ctx.currentTime + 0.35;
      while (this.nextBeatTime < lookahead) {
        this.scheduleMusicBeat(this.currentBeat % 64, this.nextBeatTime);
        this.nextBeatTime += beatDuration;
        this.currentBeat++;
      }
    }, 80);
  }

  public stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.isMusicPlaying = false;
  }

  // 1. Click/Select (~0.2 сек) — "A soft, gentle UI click sound, like a light tap, warm and cozy, no harsh digital beep"
  public playClick() {
    this.ensureMusicStarted();
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Warm wooden/ceramic tap oscillator
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Pitch envelope: fast gentle downward drop
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

      // Amplitude envelope: soft click tap
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      // Subtle noise puff to simulate tactile organic tap
      const bufferSize = this.ctx.sampleRate * 0.04;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(1.5, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      noise.start(now);
      osc.stop(now + 0.1);
      noise.stop(now + 0.05);
    } catch (e) {
      console.warn('[KotokuAudio] Click sound error:', e);
    }
  }

  // 2. Correct number (~0.5 сек) — "A cheerful, pleasant 'ding' chime, positive and rewarding, soft bell-like tone, short"
  public playCorrect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Two harmonious bell frequencies (G5 = 783.99 Hz, D6 = 1174.66 Hz, octave touch)
      const freqs = [784, 1174.66, 1568];
      const gains = [0.22, 0.12, 0.05];

      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        // Very fast attack, then sweet bell decay
        gain.gain.linearRampToValueAtTime(gains[idx], now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (0.45 + idx * 0.05));

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.55);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Correct sound error:', e);
    }
  }

  // 3. Wrong number / mistake (~0.5 сек) — "A soft, muted negative sound, gentle 'buzz' or low thud, not harsh or startling, kid-friendly"
  public playWrong() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Soft muted warm triangle detuned pair with low-pass filter (cozy "bonk/oops" thud)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      // Low, gentle frequencies (150Hz detuned with 142Hz)
      osc1.frequency.setValueAtTime(145, now);
      osc1.frequency.exponentialRampToValueAtTime(115, now + 0.35);

      osc2.frequency.setValueAtTime(152, now);
      osc2.frequency.exponentialRampToValueAtTime(110, now + 0.35);

      // Low pass to ensure zero harsh digital edge
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      filter.Q.setValueAtTime(1.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('[KotokuAudio] Wrong sound error:', e);
    }
  }

  // 4. Victory/Win (~2-3 сек) — "A short cheerful victory fanfare, playful and warm, like a cute triumphant jingle with soft bells, upbeat"
  public playWin() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Triumphant happy melody with chime bells: C5 -> E5 -> G5 -> A5 -> C6 chime flourish!
      const melody = [
        { freq: 523.25, time: 0.00, dur: 0.22, vol: 0.20 }, // C5
        { freq: 659.25, time: 0.16, dur: 0.22, vol: 0.22 }, // E5
        { freq: 783.99, time: 0.32, dur: 0.24, vol: 0.24 }, // G5
        { freq: 880.00, time: 0.48, dur: 0.26, vol: 0.26 }, // A5
        { freq: 1046.50, time: 0.68, dur: 0.85, vol: 0.30 }, // C6
        // Sparkling celebratory glockenspiel finish
        { freq: 1318.51, time: 1.15, dur: 0.65, vol: 0.18 }, // E6
        { freq: 1567.98, time: 1.30, dur: 0.80, vol: 0.20 }, // G6
        { freq: 2093.00, time: 1.48, dur: 1.20, vol: 0.22 }, // C7
      ];

      melody.forEach(note => {
        if (!this.ctx) return;
        const noteStart = now + note.time;

        const osc = this.ctx.createOscillator();
        const overtone = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, noteStart);

        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(note.freq * 2, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(note.vol, noteStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        overtone.start(noteStart);
        osc.stop(noteStart + note.dur + 0.05);
        overtone.stop(noteStart + note.dur + 0.05);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Win fanfare error:', e);
    }
  }

  // 5. Loss (~1-2 сек) — "A soft, gentle sad sound, melancholic but not harsh, short descending tone, cozy not depressing"
  public playLoss() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Soft melancholic marimba/flute-like descending steps: E4 -> D4 -> C4 -> A3
      const notes = [
        { freq: 329.63, time: 0.00, dur: 0.40, vol: 0.16 }, // E4
        { freq: 293.66, time: 0.32, dur: 0.45, vol: 0.15 }, // D4
        { freq: 261.63, time: 0.68, dur: 0.50, vol: 0.14 }, // C4
        { freq: 220.00, time: 1.05, dur: 0.70, vol: 0.15 }, // A3
      ];

      notes.forEach(note => {
        if (!this.ctx) return;
        const noteStart = now + note.time;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, noteStart);
        // Very subtle comforting downward glide
        osc.frequency.exponentialRampToValueAtTime(note.freq * 0.96, noteStart + note.dur);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(note.vol, noteStart + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + note.dur + 0.05);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Loss sound error:', e);
    }
  }

  // 6. Hint (~0.5 сек) — "A light magical sparkle sound, twinkling chime, like a gentle 'whoosh' with bells"
  public playHint() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Magical fairy sparkle whoosh
      const sparkles = [
        { freq: 1046.50, time: 0.00, dur: 0.35, vol: 0.14 }, // C6
        { freq: 1318.51, time: 0.07, dur: 0.35, vol: 0.15 }, // E6
        { freq: 1567.98, time: 0.14, dur: 0.38, vol: 0.16 }, // G6
        { freq: 2093.00, time: 0.22, dur: 0.42, vol: 0.18 }, // C7
        { freq: 2637.02, time: 0.30, dur: 0.45, vol: 0.16 }, // E7
      ];

      sparkles.forEach(s => {
        if (!this.ctx) return;
        const sTime = now + s.time;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(s.freq, sTime);

        gain.gain.setValueAtTime(0.0001, sTime);
        gain.gain.linearRampToValueAtTime(s.vol, sTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, sTime + s.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(sTime);
        osc.stop(sTime + s.dur + 0.02);
      });

      // Gentle magical white-noise whoosh shimmer
      const bufferSize = this.ctx.sampleRate * 0.35;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2500, now);
      filter.frequency.exponentialRampToValueAtTime(4500, now + 0.35);
      filter.Q.setValueAtTime(2.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.07, now + 0.12);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 0.38);
    } catch (e) {
      console.warn('[KotokuAudio] Hint sparkle sound error:', e);
    }
  }

  // 7. Pencil toggle (~0.2 сек) — "A very soft pencil scratch or light paper tap sound, subtle"
  public playPencil() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Filtered textured noise burst simulating graphite paper scratch
      const bufferSize = this.ctx.sampleRate * 0.12;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2800, now);
      filter.Q.setValueAtTime(2.2, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

      // Subtle light paper tap body
      const tapOsc = this.ctx.createOscillator();
      const tapGain = this.ctx.createGain();
      tapOsc.type = 'sine';
      tapOsc.frequency.setValueAtTime(320, now);
      tapOsc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

      tapGain.gain.setValueAtTime(0.001, now);
      tapGain.gain.linearRampToValueAtTime(0.08, now + 0.008);
      tapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      tapOsc.connect(tapGain);
      tapGain.connect(this.ctx.destination);

      noise.start(now);
      tapOsc.start(now);
      noise.stop(now + 0.13);
      tapOsc.stop(now + 0.08);
    } catch (e) {
      console.warn('[KotokuAudio] Pencil sound error:', e);
    }
  }

  // 8. Daily streak milestone (~1.2 сек) — bright, punchy, warm rewarding fanfare chime
  public playStreakMilestone() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // G5 -> B5 -> D6 -> G6 joyful arpeggio with cozy bell harmonics
      const notes = [
        { freq: 783.99, time: 0.00, dur: 0.35, vol: 0.22 },
        { freq: 987.77, time: 0.12, dur: 0.38, vol: 0.24 },
        { freq: 1174.66, time: 0.24, dur: 0.45, vol: 0.26 },
        { freq: 1567.98, time: 0.38, dur: 0.75, vol: 0.28 }
      ];

      notes.forEach(n => {
        if (!this.ctx) return;
        const noteStart = now + n.time;
        const osc = this.ctx.createOscillator();
        const overtone = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, noteStart);

        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(n.freq * 2, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(n.vol, noteStart + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + n.dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        overtone.start(noteStart);
        osc.stop(noteStart + n.dur + 0.05);
        overtone.stop(noteStart + n.dur + 0.05);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Streak milestone sound error:', e);
    }
  }

  // 9. Achievement unlock (~0.7 сек) — distinct pleasant unlock chime with soft bell + sparkle
  public playAchievement() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Soft uplifting unlock triad: F#5 (740Hz) -> A#5 (932Hz) -> C#6 (1109Hz)
      const chimes = [
        { freq: 739.99, time: 0.00, dur: 0.40, vol: 0.20 },
        { freq: 932.33, time: 0.09, dur: 0.45, vol: 0.22 },
        { freq: 1108.73, time: 0.18, dur: 0.60, vol: 0.25 },
        { freq: 1479.98, time: 0.28, dur: 0.45, vol: 0.15 } // shimmer sparkle
      ];

      chimes.forEach(c => {
        if (!this.ctx) return;
        const startTime = now + c.time;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(c.freq, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(c.vol, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + c.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + c.dur + 0.05);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Achievement unlock sound error:', e);
    }
  }

  // 10. Level up moment (~0.9 сек) — ascending chime/sparkle signaling growth & progress
  public playLevelUp() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // C5 -> E5 -> G5 -> C6 ascending bright arpeggio with celebratory resonance
      const steps = [
        { freq: 523.25, time: 0.00, dur: 0.25, vol: 0.18 },
        { freq: 659.25, time: 0.10, dur: 0.25, vol: 0.20 },
        { freq: 783.99, time: 0.20, dur: 0.30, vol: 0.22 },
        { freq: 1046.50, time: 0.32, dur: 0.55, vol: 0.26 }
      ];

      steps.forEach(s => {
        if (!this.ctx) return;
        const sTime = now + s.time;
        const osc = this.ctx.createOscillator();
        const overtone = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(s.freq, sTime);

        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(s.freq * 2, sTime);

        gain.gain.setValueAtTime(0.0001, sTime);
        gain.gain.linearRampToValueAtTime(s.vol, sTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, sTime + s.dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(sTime);
        overtone.start(sTime);
        osc.stop(sTime + s.dur + 0.05);
        overtone.stop(sTime + s.dur + 0.05);
      });
    } catch (e) {
      console.warn('[KotokuAudio] Level up sound error:', e);
    }
  }
}

export const sound = new SoundEngine();

