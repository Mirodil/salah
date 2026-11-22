export function formatTime(d: Date | null, hour12: boolean): string {
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 });
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export function hijriDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return '';
  }
}

export function gregorianDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export function deviceUses12h(): boolean {
  try {
    return Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
}
