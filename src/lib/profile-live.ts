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

export type RosterSizeRow = TeamPlayerProfile & {
  fullName: string;
  teamName?: string;
};

/**
 * Equipment manager rollup: all players' sizes in the club (or team fallback).
 * Joins users for names; RLS limits rows for non-EM roles.
 */
export async function fetchRosterSizesRollup(
  client: SupabaseClient,
  opts?: { teamId?: string; clubId?: string },
): Promise<RosterSizeRow[]> {
  let playersQuery = client
    .from('users')
    .select('id, full_name, team_id')
    .eq('role', 'player')
    .order('full_name', { ascending: true });

  if (opts?.teamId) {
    playersQuery = playersQuery.eq('team_id', opts.teamId);
  }

  const { data: players, error: playersErr } = await playersQuery;
  if (playersErr) throw new Error(playersErr.message);
  const roster = players ?? [];
  if (roster.length === 0) return [];

  const playerIds = roster.map((p) => p.id as string);
  const teamIds = [...new Set(roster.map((p) => p.team_id as string))];

  const [{ data: sizeRows, error: sizeErr }, { data: teams }] = await Promise.all([
    client
      .from('team_players')
      .select('player_id, team_id, height_cm, shirt_size, shorts_size, shoe_size, updated_at')
      .in('player_id', playerIds),
    client.from('teams').select('id, name, club_id').in('id', teamIds),
  ]);

  if (sizeErr) throw new Error(sizeErr.message);

  const sizesByPlayer = new Map(
    ((sizeRows as TeamPlayerRow[] | null) ?? []).map((r) => [r.player_id, mapTeamPlayerRow(r)]),
  );
  const teamNameById = new Map(
    (teams ?? [])
      .filter((t) => !opts?.clubId || (t.club_id as string) === opts.clubId)
      .map((t) => [t.id as string, t.name as string]),
  );

  return roster
    .filter((p) => !opts?.clubId || teamNameById.has(p.team_id as string))
    .map((p) => {
      const id = p.id as string;
      const teamId = p.team_id as string;
      const sizes = sizesByPlayer.get(id);
      return {
        playerId: id,
        teamId,
        fullName: p.full_name as string,
        teamName: teamNameById.get(teamId),
        heightCm: sizes?.heightCm ?? null,
        shirtSize: sizes?.shirtSize ?? null,
        shortsSize: sizes?.shortsSize ?? null,
        shoeSize: sizes?.shoeSize ?? null,
        updatedAt: sizes?.updatedAt ?? '',
      };
    });
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
