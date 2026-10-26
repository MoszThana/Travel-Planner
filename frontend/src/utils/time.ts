// "5 min ago" / "5 นาทีที่แล้ว" using the browser's built-in translations
export function timeAgo(ms: number, locale: string = 'en', now: number = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'th' ? 'th' : 'en', { numeric: 'auto', style: 'short' });
  const seconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(ms).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' });
}
