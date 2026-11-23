/**
 * Web Audio API Sound Synthesizer for Clinical Glucose Alerts.
 * Generates distinct, synthesized multi-frequency alert tones without external audio file dependencies.
 * Works across desktop and mobile browsers.
 */

class AudioAlertService {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private lastAlertSoundTime: Record<string, number> = {};
  private cooldownMs = 3 * 60 * 1000; // 3-minute cooldown between repeated automatic sounds of same type

  constructor() {
    const saved = localStorage.getItem('diatwin_sound_enabled');
    this.soundEnabled = saved !== null ? saved === 'true' : true;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('diatwin_sound_enabled', String(enabled));
  }

  /**
   * Unlocks AudioContext upon user gesture (click/tap) to satisfy browser autoplay policies.
   */
  public unlockAudio() {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * Plays a synthesized tone of frequency `freq` for `duration` seconds.
   */
  private playTone(freq: number, type: OscillatorType, duration: number, delay = 0, gainLevel = 0.25) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(gainLevel, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch (e) {
      console.warn('Audio tone error:', e);
    }
  }

  /**
   * Plays alarm sound based on alert severity.
   */
  public playAlertSound(
    alertType: 'critical_low' | 'low' | 'critical_high' | 'high' | 'predicted_low' | 'predicted_high',
    force = false
  ) {
    if (!this.soundEnabled && !force) return;

    const now = Date.now();
    if (!force) {
      const last = this.lastAlertSoundTime[alertType] || 0;
      if (now - last < this.cooldownMs) {
        return; // Suppress duplicate alarm within cooldown
      }
    }
    this.lastAlertSoundTime[alertType] = now;
    this.unlockAudio();

    switch (alertType) {
      case 'critical_low':
        // Urgent 3-pulse alternating alarm (880 Hz / 1046 Hz)
        for (let burst = 0; burst < 3; burst++) {
          const t = burst * 0.45;
          this.playTone(880, 'square', 0.15, t, 0.3);
          this.playTone(1046, 'square', 0.18, t + 0.18, 0.35);
        }
        break;

      case 'low':
      case 'predicted_low':
        // Descending warning chime (784 -> 659 -> 523 Hz)
        this.playTone(784, 'sine', 0.18, 0.0, 0.25);
        this.playTone(659, 'sine', 0.18, 0.2, 0.25);
        this.playTone(523, 'sine', 0.25, 0.4, 0.3);
        break;

      case 'critical_high':
        // Double urgent chime (987 Hz -> 880 Hz repeated)
        this.playTone(987, 'triangle', 0.2, 0.0, 0.3);
        this.playTone(880, 'triangle', 0.22, 0.22, 0.3);
        this.playTone(987, 'triangle', 0.2, 0.5, 0.3);
        this.playTone(880, 'triangle', 0.25, 0.72, 0.3);
        break;

      case 'high':
      case 'predicted_high':
        // Ascending alert chime (523 -> 659 Hz)
        this.playTone(523, 'sine', 0.2, 0.0, 0.22);
        this.playTone(659, 'sine', 0.28, 0.22, 0.25);
        break;
    }
  }

  /**
   * Dispatches a native browser notification if permitted.
   */
  public async dispatchBrowserNotification(title: string, body: string, icon = '🩸') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      if (Notification.permission === 'granted') {
        new Notification(`${icon} DiaTwin: ${title}`, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico'
        });
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(`${icon} DiaTwin: ${title}`, { body });
        }
      }
    } catch (e) {
      console.warn('Browser notification error:', e);
    }
  }
}

export const audioAlertService = new AudioAlertService();
