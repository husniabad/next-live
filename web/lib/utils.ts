import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function timeAgo(timestamp: number | string): string {
  const now = Date.now();
  const time = Number(timestamp);
  const diff = now - time;
  const seconds = Math.floor(diff / 1000);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (seconds < 60) return rtf.format(-seconds, 'second');

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return rtf.format(-days, 'day');

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return rtf.format(-weeks, 'week');

  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, 'month');

  const years = Math.floor(days / 365);
  return rtf.format(-years, 'year');
}

