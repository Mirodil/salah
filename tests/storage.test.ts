import { describe, expect, it } from 'vitest';
import { defaultState, loadState, saveState, STORAGE_KEY } from '../src/services/storage';

const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('storage', () => {
  it('defaults: MWL, standard Asr, notifications off, Qiyam off', () => {
    const s = loadState(fake());
    expect(s.settings.methodId).toBe('mwl');
    expect(s.settings.asr).toBe('standard');
    expect(s.settings.methodChosen).toBe(false);
    expect(s.settings.notify.enabled).toBe(false);
    expect(s.settings.notify.prayers.qiyam).toBe(false);
    expect(s.settings.notify.prayers.fajr).toBe(true);
  });

  it('round-trips', () => {
    const f = fake();
    const s = defaultState();
    s.settings.methodId = 'isna';
    s.settings.methodChosen = true;
    s.position = { lat: 1, lng: 2, ts: 3 };
    saveState(s, f);
    const back = loadState(f);
    expect(back.settings.methodId).toBe('isna');
    expect(back.settings.methodChosen).toBe(true);
    expect(back.position).toEqual({ lat: 1, lng: 2, ts: 3 });
  });

  it('survives corrupt data and a wrong version', () => {
    const f = fake();
    f.m.set(STORAGE_KEY, '{not json');
    expect(loadState(f)).toEqual(defaultState());
    f.m.set(STORAGE_KEY, JSON.stringify({ v: 99, settings: { methodId: 'x' } }));
    expect(loadState(f)).toEqual(defaultState());
  });

  it('fills in missing newer fields from older saves', () => {
    const f = fake();
    f.m.set(STORAGE_KEY, JSON.stringify({ v: 1, settings: { methodId: 'karachi', notify: { enabled: true, prayers: { fajr: false } } } }));
    const s = loadState(f);
    expect(s.settings.methodId).toBe('karachi');
    expect(s.settings.notify.enabled).toBe(true);
    expect(s.settings.notify.prayers.fajr).toBe(false);
    expect(s.settings.notify.prayers.isha).toBe(true);
    expect(s.settings.asr).toBe('standard');
  });

  it('keeps only recent sent ids', () => {
    const f = fake();
    f.m.set(STORAGE_KEY, JSON.stringify({ v: 1, sent: Array.from({ length: 50 }, (_, i) => `id${i}`) }));
    expect(loadState(f).sent).toHaveLength(20);
  });

  it('does not throw when storage is unavailable or full', () => {
    expect(loadState(null)).toEqual(defaultState());
    expect(() => saveState(defaultState(), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});
