import { store } from './store';

/**
 * 임시 사운드 매니저. 실제 음악·효과음 파일이 아직 없어서 WebAudio로 짧은 합성음만 낸다.
 * BGM/SFX 볼륨 분리·저장, 효과음 동시 재생 제한, 경고음 우선순위 구조만 준비한다.
 */
export type Sfx = 'hit' | 'skill' | 'levelUp' | 'warn' | 'pickup' | 'hurt' | 'clear' | 'bell' | 'ult';

const DEFS: Record<Sfx, { freq: number; dur: number; type: OscillatorType; priority: number; slide?: number }> = {
  hit: { freq: 520, dur: 0.05, type: 'square', priority: 0 },
  pickup: { freq: 880, dur: 0.06, type: 'sine', priority: 0 },
  skill: { freq: 330, dur: 0.12, type: 'triangle', priority: 1, slide: 2 },
  hurt: { freq: 160, dur: 0.15, type: 'sawtooth', priority: 2 },
  levelUp: { freq: 660, dur: 0.25, type: 'triangle', priority: 2, slide: 1.5 },
  bell: { freq: 1200, dur: 0.4, type: 'sine', priority: 2 },
  ult: { freq: 220, dur: 0.5, type: 'sawtooth', priority: 2, slide: 3 },
  clear: { freq: 523, dur: 0.6, type: 'triangle', priority: 3, slide: 2 },
  warn: { freq: 440, dur: 0.2, type: 'square', priority: 3 },
};

const MAX_CONCURRENT = 6;

class SoundManager {
  private ctx: AudioContext | null = null;
  private active: { end: number; priority: number; stop: () => void }[] = [];

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { this.ctx = null; }
    return this.ctx;
  }

  unlock(): void { void this.ensure()?.resume(); }

  play(name: Sfx): void {
    const vol = store.save.settings.sfxVolume;
    if (vol <= 0) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const def = DEFS[name];
    const now = ctx.currentTime;
    this.active = this.active.filter((a) => a.end > now);
    if (this.active.length >= MAX_CONCURRENT) {
      // 낮은 우선순위 소리를 끊고 경고음 등 높은 우선순위를 살린다
      const lowest = this.active.reduce((a, b) => (a.priority <= b.priority ? a : b));
      if (lowest.priority > def.priority) return;
      lowest.stop();
      this.active.splice(this.active.indexOf(lowest), 1);
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq, now);
    if (def.slide) osc.frequency.exponentialRampToValueAtTime(def.freq * def.slide, now + def.dur);
    gain.gain.setValueAtTime(0.12 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + def.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + def.dur);
    this.active.push({ end: now + def.dur, priority: def.priority, stop: () => { try { osc.stop(); } catch { /* 이미 멈춤 */ } } });
  }
}

export const sound = new SoundManager();
