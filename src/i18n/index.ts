import { I18nManager, Platform } from 'react-native';
import { he } from './he';

export { he } from './he';

type NestedValue = string | { [key: string]: NestedValue };

function getPath(obj: NestedValue, path: string): string | undefined {
  const parts = path.split('.');
  let cur: NestedValue | undefined = obj;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Look up a Hebrew string by dotted key, with optional `{token}` interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = getPath(he as NestedValue, key) ?? key;
  if (!params) return raw;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}

export const ABSENCE_REASON_KEYS = [
  'Sick',
  'School exam',
  'Injury',
  'Family event',
  'Travel',
  'Other',
] as const;

function fromMap(map: Record<string, string>, key: string, fallback = key): string {
  return map[key] ?? fallback;
}

export function translateAbsenceReason(reason: string): string {
  return fromMap(he.absenceReasons as Record<string, string>, reason);
}

export function translateRole(role: string): string {
  return fromMap(he.roles as Record<string, string>, role);
}

export function translateConsent(status: string): string {
  return fromMap(he.consent as Record<string, string>, status);
}

export function translateRsvp(choice: string | null): string {
  if (choice == null) return '—';
  return fromMap(he.rsvp as Record<string, string>, choice);
}

export function translateAttendanceMark(mark: string | null): string {
  if (mark == null) return he.attendanceMark.unmarked;
  return fromMap(he.attendanceMark as Record<string, string>, mark);
}

export function translatePainSeverity(severity: string): string {
  return fromMap(he.painSeverity as Record<string, string>, severity);
}

export function translateSuggestionStatus(status: string): string {
  return fromMap(he.suggestionStatus as Record<string, string>, status);
}

export function translateBodyRegion(key: string): string {
  return fromMap(he.bodyRegions as Record<string, string>, key, key.replace('_', ' '));
}

export function translateBodySubRegion(label: string): string {
  return fromMap(he.bodySubRegions as Record<string, string>, label);
}

/**
 * Force RTL for Hebrew. Config plugin also sets forcesRTL for native builds;
 * runtime call helps Expo Go after a reload.
 */
export function enableHebrewRtl(): void {
  try {
    I18nManager.allowRTL(true);
    if (!I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    }
  } catch {
    // Web / environments without full I18nManager support
  }

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'he');
  }
}

enableHebrewRtl();
