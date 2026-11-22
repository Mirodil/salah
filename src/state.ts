import type { PrayerInputs } from './core/prayerTimes';
import { deviceUses12h } from './core/format';
import type { PrayerKey } from './core/schedule';
import { loadState, saveState, type ElevationSource, type StoredState } from './services/storage';

export interface Place {
  lat: number;
  lng: number;
  elevation: number;
  elevationSource: ElevationSource;
}

type Topic = 'settings' | 'place';

class AppState {
  stored: StoredState = loadState();
  private subs: Record<Topic, Set<() => void>> = { settings: new Set(), place: new Set() };

  on(topic: Topic, fn: () => void): () => void {
    this.subs[topic].add(fn);
    return () => this.subs[topic].delete(fn);
  }

  private emit(topic: Topic) {
    this.subs[topic].forEach((f) => f());
  }

  get settings() {
    return this.stored.settings;
  }

  get place(): Place | null {
    const { position, elevation } = this.stored;
    if (!position) return null;
    return {
      lat: position.lat,
      lng: position.lng,
      elevation: elevation?.m ?? 0,
      elevationSource: elevation?.source ?? 'default',
    };
  }

  get hour12(): boolean {
    return this.stored.settings.hour12 ?? deviceUses12h();
  }

  inputs(): PrayerInputs | null {
    const p = this.place;
    if (!p) return null;
    return { lat: p.lat, lng: p.lng, elevation: p.elevation, methodId: this.settings.methodId, asr: this.settings.asr };
  }

  persist() {
    saveState(this.stored);
  }

  updateSettings(patch: Partial<StoredState['settings']>) {
    Object.assign(this.stored.settings, patch);
    this.persist();
    this.emit('settings');
  }

  setNotifyPref(key: PrayerKey, on: boolean) {
    this.stored.settings.notify.prayers[key] = on;
    this.persist();
    this.emit('settings');
  }

  setNotifyEnabled(on: boolean) {
    this.stored.settings.notify.enabled = on;
    this.persist();
    this.emit('settings');
  }

  setPlace(lat: number, lng: number, elevation: number, source: ElevationSource, cacheKey?: string) {
    this.stored.position = { lat, lng, ts: Date.now() };
    this.stored.elevation = { m: elevation, source };
    if (cacheKey) this.stored.elevationCache[cacheKey] = elevation;
    this.persist();
    this.emit('place');
  }

  markSent(id: string) {
    this.stored.sent = [...this.stored.sent, id].slice(-20);
    this.persist();
  }

  dismissIosHint() {
    this.stored.iosHintDismissed = true;
    this.persist();
  }
}

export const app = new AppState();
