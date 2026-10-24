/**
 * Player development meetings + goals (PRD v1.1 §2.2).
 * Coach CRUD; player/parent SELECT only when is_published.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PlayerMeeting = {
  id: string;
  teamId: string;
  playerId: string;
  playerName?: string;
  coachId: string;
  meetingDate: string;
  summary: string;
  goals: string[];
  isPublished: boolean;
  createdAt: string;
};

type MeetingRow = {
  id: string;
  team_id: string;
  player_id: string;
  coach_id: string;
  meeting_date: string;
  summary: string;
  goals: string[] | null;
  is_published: boolean;
  created_at: string;
};

export function mapMeetingRow(row: MeetingRow, playerName?: string): PlayerMeeting {
  return {
    id: row.id,
    teamId: row.team_id,
    playerId: row.player_id,
    playerName,
    coachId: row.coach_id,
    meetingDate: row.meeting_date,
    summary: row.summary,
    goals: Array.isArray(row.goals) ? row.goals.filter((g) => g.trim().length > 0) : [],
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

function normalizeGoals(goals: string[]): string[] {
  const cleaned = goals.map((g) => g.trim()).filter(Boolean);
  if (cleaned.length < 1 || cleaned.length > 3) {
    throw new Error('goals_count');
  }
  return cleaned;
}

/** Meetings visible to the current user under RLS (published for player/parent). */
export async function fetchPlayerMeetings(
  client: SupabaseClient,
  opts: { teamId: string; playerId?: string },
): Promise<PlayerMeeting[]> {
  let query = client
    .from('player_meetings')
    .select('id, team_id, player_id, coach_id, meeting_date, summary, goals, is_published, created_at')
    .eq('team_id', opts.teamId)
    .order('meeting_date', { ascending: false });

  if (opts.playerId) {
    query = query.eq('player_id', opts.playerId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data as MeetingRow[] | null) ?? [];
  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const nameById: Record<string, string> = {};
  if (playerIds.length) {
    const { data: users } = await client
      .from('users')
      .select('id, full_name')
      .in('id', playerIds);
    for (const u of users ?? []) {
      nameById[u.id as string] = u.full_name as string;
    }
  }

  return rows.map((row) => mapMeetingRow(row, nameById[row.player_id]));
}

export async function createPlayerMeeting(
  client: SupabaseClient,
  input: {
    teamId: string;
    playerId: string;
    coachId: string;
    meetingDate: string;
    summary: string;
    goals: string[];
    isPublished?: boolean;
  },
): Promise<PlayerMeeting> {
  const summary = input.summary.trim();
  if (!summary) throw new Error('summary_required');
  const goals = normalizeGoals(input.goals);

  const { data, error } = await client
    .from('player_meetings')
    .insert({
      team_id: input.teamId,
      player_id: input.playerId,
      coach_id: input.coachId,
      meeting_date: input.meetingDate,
      summary,
      goals,
      is_published: Boolean(input.isPublished),
    })
    .select('id, team_id, player_id, coach_id, meeting_date, summary, goals, is_published, created_at')
    .single();

  if (error) throw new Error(error.message);
  return mapMeetingRow(data as MeetingRow);
}

export async function updatePlayerMeeting(
  client: SupabaseClient,
  input: {
    id: string;
    summary?: string;
    goals?: string[];
    meetingDate?: string;
    isPublished?: boolean;
  },
): Promise<PlayerMeeting> {
  const patch: Record<string, unknown> = {};
  if (input.summary !== undefined) {
    const summary = input.summary.trim();
    if (!summary) throw new Error('summary_required');
    patch.summary = summary;
  }
  if (input.goals !== undefined) {
    patch.goals = normalizeGoals(input.goals);
  }
  if (input.meetingDate !== undefined) {
    patch.meeting_date = input.meetingDate;
  }
  if (input.isPublished !== undefined) {
    patch.is_published = input.isPublished;
  }

  const { data, error } = await client
    .from('player_meetings')
    .update(patch)
    .eq('id', input.id)
    .select('id, team_id, player_id, coach_id, meeting_date, summary, goals, is_published, created_at')
    .single();

  if (error) throw new Error(error.message);
  return mapMeetingRow(data as MeetingRow);
}

/** Team players for coach meeting picker. */
export async function fetchTeamPlayersForMeetings(
  client: SupabaseClient,
  teamId: string,
): Promise<{ id: string; fullName: string }[]> {
  const { data, error } = await client
    .from('users')
    .select('id, full_name')
    .eq('team_id', teamId)
    .eq('role', 'player')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
  }));
}
