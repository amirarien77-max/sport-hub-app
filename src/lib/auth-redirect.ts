/**
 * Absolute URL for Supabase email confirmation / magic-link redirects.
 *
 * Supabase Auth embeds this in the confirmation email. If it is missing,
 * undefined, or the string "null", the browser opens localhost or shows
 * Hebrew Chrome error «לא ניתן לגשת ל-null».
 *
 * Resolution order:
 * 1. EXPO_PUBLIC_AUTH_REDIRECT_URL (production / explicit override)
 * 2. Linking.createURL('/') with app scheme `basketballhub`
 *    — web: current origin (e.g. http://localhost:8081/)
 *    — Expo Go: exp://…
 *    — native build: basketballhub://
 * 3. window.location.origin on web
 * 4. basketballhub:// deep-link fallback
 */
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const APP_SCHEME = 'basketballhub';

function isUsableUrl(value: string | null | undefined): value is string {
  if (value == null) return false;
  const v = value.trim();
  if (!v || v === 'null' || v === 'undefined') return false;
  if (/^null:/i.test(v)) return false;
  return true;
}

export function getAuthEmailRedirectTo(): string {
  const fromEnv = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (isUsableUrl(fromEnv)) return fromEnv;

  try {
    const created = Linking.createURL('/', { scheme: APP_SCHEME });
    if (isUsableUrl(created)) return created;
  } catch {
    // Linking may throw before the Expo manifest is ready — fall through.
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location?.origin;
    if (isUsableUrl(origin)) return origin;
  }

  return `${APP_SCHEME}://`;
}
