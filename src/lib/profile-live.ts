/**
 * Player roster profile (team_players) — sizes + height (PRD v1.1).
 * Upsert by player; RLS allows the player or a linked parent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ClothingSize = string;

export type TeamPlayerProfile = {
  playerId: string;
  teamId: string;
  heightCm: number | null;
  shirtSize: string | null;
  shortsSize: string | null;
  shoeSize: number | null;
  updatedAt: string;
};

type TeamPlayerRow = {
  player_id: string;
  team_id: string;
  height_cm: number | null;
  shirt_size: string | null;
  shorts_size: string | null;
  shoe_size: number | string | null;
  updated_at: string;
};

export function mapTeamPlayerRow(row: TeamPlayerRow): TeamPlayerProfile {
  return {
    playerId: row.player_id,
    teamId: row.team_id,
    heightCm: row.height_cm,
    shirtSize: row.shirt_size,
    shortsSize: row.shorts_size,
    shoeSize: row.shoe_size == null ? null : Number(row.shoe_size),
    updatedAt: row.updated_at,
  };
}

export type PlayerSizesInput = {
  playerId: string;
  teamId: string;
  heightCm?: number | null;
  shirtSize?: string | null;
  shortsSize?: string | null;
  shoeSize?: number | null;
};

function normalizeSize(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Load one player's size/height row (RLS filters). */
export async function fetchTeamPlayerProfile(
  client: SupabaseClient,
  playerId: string,
): Promise<TeamPlayerProfile | null> {
  const { data, error } = await client
    .from('team_players')
    .select('player_id, team_id, height_cm, shirt_size, shorts_size, shoe_size, updated_at')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapTeamPlayerRow(data as TeamPlayerRow);
}

/**
 * Upsert height + clothing sizes on team_players.
 * Pass null to clear a field; omit a key to leave unchanged on update
 * (insert uses null for omitted fields).
 */
export async function updatePlayerSizes(
  client: SupabaseClient,
  input: PlayerSizesInput,
): Promise<TeamPlayerProfile> {
  if (input.heightCm != null && (input.heightCm < 100 || input.heightCm > 250)) {
    throw new Error('height_cm must be between 100 and 250');
  }

  const { data: existing, error: readErr } = await client
    .from('team_players')
    .select('player_id, team_id, height_cm, shirt_size, shorts_size, shoe_size, updated_at')
    .eq('player_id', input.playerId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);

  const patch = {
    player_id: input.playerId,
    team_id: input.teamId,
    height_cm:
      input.heightCm !== undefined
        ? input.heightCm
        : ((existing as TeamPlayerRow | null)?.height_cm ?? null),
    shirt_size:
      input.shirtSize !== undefined
        ? normalizeSize(input.shirtSize)
        : ((existing as TeamPlayerRow | null)?.shirt_size ?? null),
    shorts_size:
      input.shortsSize !== undefined
        ? normalizeSize(input.shortsSize)
        : ((existing as TeamPlayerRow | null)?.shorts_size ?? null),
    shoe_size:
      input.shoeSize !== undefined
        ? input.shoeSize
        : existing?.shoe_size == null
          ? null
          : Number((existing as TeamPlayerRow).shoe_size),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('team_players')
    .upsert(patch, { onConflict: 'player_id' })
    .select('player_id, team_id, height_cm, shirt_size, shorts_size, shoe_size, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return mapTeamPlayerRow(data as TeamPlayerRow);
}
