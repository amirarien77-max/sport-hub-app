import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isDemoMode =
  process.env.EXPO_PUBLIC_DEMO_MODE === 'true' || !url || !anon || url.includes('YOUR_PROJECT');

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
