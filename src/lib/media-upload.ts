/**
 * העלאת מדיה לתרגיל טקטי (תמונה/וידאו) ל־Storage bucket `tactical-media`.
 * נתיב: `{teamId}/{playId}/…` — תואם מדיניות RLS ב־migration 014.
 * דורש development build / הרשאות ספרייה; Expo Go מוגבל לפי חבילה.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';

const BUCKET = 'tactical-media';

export type MediaPickResult =
  | { ok: true; uri: string; mimeType: string; fileName: string }
  | { ok: false; cancelled?: boolean; error?: string };

/** Pick image or video from library (Hebrew UX handled by caller). */
export async function pickTacticalMedia(): Promise<MediaPickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, error: 'permission_denied' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.85,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { ok: false, cancelled: true };
  }

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const ext =
    mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : mimeType.includes('quicktime')
          ? 'mov'
          : mimeType.includes('webm')
            ? 'webm'
            : mimeType.startsWith('video/')
              ? 'mp4'
              : 'jpg';
  const fileName = asset.fileName ?? `media-${Date.now()}.${ext}`;
  return { ok: true, uri: asset.uri, mimeType, fileName };
}

/**
 * Upload picked file to Supabase Storage under `{teamId}/{playId}/…`
 * and return the public URL for `tactical_plays.media_url`.
 */
export async function uploadTacticalMedia(input: {
  client: SupabaseClient;
  teamId: string;
  playId: string;
  uri: string;
  mimeType: string;
  fileName: string;
}): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  try {
    const safeName = input.fileName.replace(/[^\w.\-]+/g, '_');
    const path = `${input.teamId}/${input.playId}/${Date.now()}-${safeName}`;

    const blobRes = await fetch(input.uri);
    const blob = await blobRes.blob();

    const { error: uploadErr } = await input.client.storage.from(BUCKET).upload(path, blob, {
      contentType: input.mimeType,
      upsert: true,
    });
    if (uploadErr) {
      return { ok: false, error: uploadErr.message };
    }

    const { data } = input.client.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      return { ok: false, error: 'missing_public_url' };
    }
    return { ok: true, publicUrl: data.publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
