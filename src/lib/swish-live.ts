/**
 * Swish opt-in credentials (PRD v1.1 §2.5).
 * Plaintext password is sent only as an RPC argument; DB stores ciphertext.
 * Client never selects `swish_password_encrypted` (column revoked + omit).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SwishLinkStatus = {
  playerId: string;
  swishUsername: string | null;
  linked: boolean;
  lastSyncedAt: string | null;
  createdAt: string | null;
};

/** Safe columns only — never request swish_password_encrypted. */
const SWISH_SAFE_SELECT = 'player_id, swish_username, last_synced_at, created_at';

type SwishSafeRow = {
  player_id: string;
  swish_username: string | null;
  last_synced_at: string | null;
  created_at: string | null;
};

export function mapSwishStatus(row: SwishSafeRow | null, playerId: string): SwishLinkStatus {
  if (!row) {
    return {
      playerId,
      swishUsername: null,
      linked: false,
      lastSyncedAt: null,
      createdAt: null,
    };
  }
  return {
    playerId: row.player_id,
    swishUsername: row.swish_username,
    linked: Boolean(row.swish_username),
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  };
}

/** Read link status for the current player (RLS: own row; no ciphertext). */
export async function fetchSwishLinkStatus(
  client: SupabaseClient,
  playerId: string,
): Promise<SwishLinkStatus> {
  const { data, error } = await client
    .from('player_external_auth')
    .select(SWISH_SAFE_SELECT)
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mapSwishStatus((data as SwishSafeRow | null) ?? null, playerId);
}

/**
 * Encrypt-at-write path: calls `save_swish_credentials` (pgcrypto SECURITY DEFINER).
 * Do not insert/update `player_external_auth` from the client.
 */
export async function saveSwishCredentials(
  client: SupabaseClient,
  input: { username: string; password: string },
): Promise<SwishLinkStatus> {
  const username = input.username.trim();
  if (!username) throw new Error('Swish username required');
  if (!input.password) throw new Error('Swish password required');

  const { data, error } = await client.rpc('save_swish_credentials', {
    p_username: username,
    p_password: input.password,
  });

  if (error) throw new Error(error.message);

  const payload = data as {
    ok?: boolean;
    player_id?: string;
    swish_username?: string;
    linked?: boolean;
  } | null;

  const playerId = payload?.player_id;
  if (!playerId) {
    throw new Error('save_swish_credentials returned no player_id');
  }

  return {
    playerId,
    swishUsername: payload?.swish_username ?? username,
    linked: payload?.linked !== false,
    lastSyncedAt: null,
    createdAt: null,
  };
}

/** Remove Swish link for the current player (RPC clears ciphertext). */
export async function clearSwishCredentials(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('clear_swish_credentials');
  if (error) throw new Error(error.message);
}
