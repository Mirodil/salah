import { findDue, nextNotifyTime, type NotifyPrefs } from '../core/notify';
import { formatTime } from '../core/format';
import { PRAYER_LABEL, type PrayerKey, type Row } from '../core/schedule';

export type Permission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Must be called from a tap. */
export async function requestNotificationPermission(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showSalahNotification(key: PrayerKey, time: Date, hour12: boolean): Promise<void> {
  const label = PRAYER_LABEL[key];
  const options: NotificationOptions = {
    body: `It is time for ${label}, ${formatTime(time, hour12)}`,
    tag: key,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  };
  // Mobile browsers only allow notifications through a service worker registration.
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(label, options);
  } catch {
    /* fall through */
  }
  new Notification(label, options);
}

export interface SchedulerContext {
  now: Date;
  rows: Row[];
  nextFajr: Date | null;
  prefs: NotifyPrefs;
  enabled: boolean;
  hour12: boolean;
  sent: string[];
}

/**
 * Client-side scheduling: one timer for the next enabled salah plus a one-minute heartbeat and a
 * visibilitychange check, since browsers throttle timers in background tabs.
 */
export class NotificationScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private onVisible = () => document.visibilityState === 'visible' && this.check();

  constructor(
    private ctx: () => SchedulerContext,
    private markSent: (id: string) => void,
    private show: typeof showSalahNotification = showSalahNotification,
  ) {}

  start(): void {
    this.stop();
    this.beat = setInterval(() => this.check(), 60_000);
    document.addEventListener('visibilitychange', this.onVisible);
    this.check();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.beat) clearInterval(this.beat);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.timer = this.beat = null;
  }

  /** Re-evaluate now and re-arm the timer, e.g. after a recalculation or a settings change. */
  check(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const c = this.ctx();
    if (!c.enabled || notificationPermission() !== 'granted') return;
    const due = findDue(c.now, c.rows, c.prefs, c.sent);
    if (due) {
      this.markSent(due.id);
      void this.show(due.key, due.time, c.hour12);
    }
    const next = nextNotifyTime(c.now, c.rows, c.prefs, c.nextFajr);
    if (next) {
      const wait = Math.min(60_000, Math.max(500, next.getTime() - c.now.getTime() + 300));
      this.timer = setTimeout(() => this.check(), wait);
    }
  }
}
