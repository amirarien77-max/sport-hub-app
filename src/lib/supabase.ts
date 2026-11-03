/**
 * לקוח Supabase יחיד לאפליקציה.
 *
 * מצב דמו (`isDemoMode`) כשאין URL/anon או כש־EXPO_PUBLIC_DEMO_MODE=true —
 * אז `supabase === null` וכל ה־SessionContext עובד על demo-data מקומי.
 * לא להשתמש ב־service_role בצד הלקוח; RLS מגן על הנתונים.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isDemoMode =
  process.env.EXPO_PUBLIC_DEMO_MODE === 'true' || !url || !anon || url.includes('YOUR_PROJECT');

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(url, anon, {
      auth: {
        // Persist session across reloads (Expo / RN); not browser localStorage.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Web: pick up tokens from the email-confirm redirect URL.
        // Native: deep-link session handling is separate; avoid false positives.
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
