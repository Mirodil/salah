import { DEFAULT_METHOD_ID } from '../core/methods';
import { DEFAULT_PREFS, type NotifyPrefs } from '../core/notify';
import type { AsrRule } from '../core/prayerTimes';

export type ElevationSource = 'gps' | 'lookup' | 'default';

export interface StoredState {
  v: 1;
  position: { lat: number; lng: number; ts: number } | null;
  elevation: { m: number; source: ElevationSource } | null;
  /** Cached lookups keyed by coordinates rounded to three decimals. */
  elevationCache: Record<string, number>;
  settings: {
    methodId: string;
    asr: AsrRule;
    /** null = follow the device locale. */
    hour12: boolean | null;
    /** True once the user has made the first-launch method choice. */
    methodChosen: boolean;
    notify: { enabled: boolean; prayers: NotifyPrefs };
  };
  sent: string[];
  iosHintDismissed: boolean;
}

export const STORAGE_KEY = 'salah.state.v1';

export function defaultState(): StoredState {
  return {
    v: 1,
    position: null,
    elevation: null,
    elevationCache: {},
    settings: {
      methodId: DEFAULT_METHOD_ID,
      asr: 'standard',
      hour12: null,
      methodChosen: false,
      notify: { enabled: false, prayers: { ...DEFAULT_PREFS } },
    },
    sent: [],
    iosHintDismissed: false,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadState(store: Store | null = safeLocalStorage()): StoredState {
  const base = defaultState();
  if (!store) return base;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<StoredState>;
    if (p.v !== 1) return base;
    return {
      ...base,
      ...p,
      settings: {
        ...base.settings,
        ...p.settings,
        notify: {
          enabled: p.settings?.notify?.enabled ?? false,
          prayers: { ...DEFAULT_PREFS, ...p.settings?.notify?.prayers },
        },
      },
      elevationCache: p.elevationCache ?? {},
      sent: Array.isArray(p.sent) ? p.sent.slice(-20) : [],
    };
  } catch {
    return base;
  }
}

export function saveState(state: StoredState, store: Store | null = safeLocalStorage()): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep running without persistence */
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
