/**
 * קודי הזמנה לדמו הפועל ירושלים.
 * אחרי מיתוג מחדש הקוד הקנוני הוא HAP-U16-2026; MAC-U16-2026 נשאר alias
 * כדי שלא ישברו קישורים/בדיקות ישנים. תמיד לעבור דרך normalizeInviteCode.
 */
/** Canonical demo invite for הפועל ירושלים. Legacy MAC code still works as alias. */
export const DEMO_INVITE_CODE = 'HAP-U16-2026';
export const DEMO_INVITE_LEGACY_ALIAS = 'MAC-U16-2026';

const ALIAS_TO_CANONICAL: Record<string, string> = {
  [DEMO_INVITE_CODE]: DEMO_INVITE_CODE,
  [DEMO_INVITE_LEGACY_ALIAS]: DEMO_INVITE_CODE,
};

/** Normalize user input; map legacy MAC-U16-2026 → HAP-U16-2026. */
export function normalizeInviteCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return ALIAS_TO_CANONICAL[upper] ?? upper;
}

export function isDemoInviteCode(code: string): boolean {
  const upper = code.trim().toUpperCase();
  return upper === DEMO_INVITE_CODE || upper === DEMO_INVITE_LEGACY_ALIAS;
}
