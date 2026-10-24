import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PlayAssignment,
  PlaySuggestion,
  SuggestionStatus,
  TacticalPlay,
} from '@/types';

export type BoardMarker = {
  x: number;
  y: number;
  label: string;
};

export type BoardData = {
  markers: BoardMarker[];
};

type PlayRow = {
  id: string;
  team_id: string;
  title: string;
  media_url: string | null;
  allow_suggestions: boolean | null;
  board_json: string | null;
  game_iq_json: string | null;
  created_at: string;
};

type AssignmentRow = {
  id: string;
  play_id: string;
  player_id: string;
  position_name: string | null;
  action_prompt_question: string | null;
  player_answer: string | null;
};

type SuggestionRow = {
  id: string;
  play_id: string;
  player_id: string;
  suggestion_text: string;
  status: SuggestionStatus;
  created_at: string;
};

export function parseBoardJson(raw?: string | null): BoardData {
  if (!raw?.trim()) return { markers: [] };
  try {
    const parsed = JSON.parse(raw) as BoardData;
    if (!parsed || !Array.isArray(parsed.markers)) return { markers: [] };
    return {
      markers: parsed.markers
        .filter(
          (m) =>
            typeof m?.x === 'number' &&
            typeof m?.y === 'number' &&
            typeof m?.label === 'string',
        )
        .map((m) => ({
          x: Math.min(100, Math.max(0, m.x)),
          y: Math.min(100, Math.max(0, m.y)),
          label: m.label.slice(0, 4),
        })),
    };
  } catch {
    return { markers: [] };
  }
}

export function serializeBoardJson(data: BoardData): string {
  return JSON.stringify({ markers: data.markers.slice(0, 20) });
}

export function mapPlayRow(row: PlayRow): TacticalPlay {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    mediaUrl: row.media_url ?? undefined,
    allowSuggestions: row.allow_suggestions !== false,
    boardJson: row.board_json ?? undefined,
    gameIqJson: row.game_iq_json ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapAssignmentRow(
  row: AssignmentRow,
  nameById: Record<string, string>,
): PlayAssignment {
  return {
    id: row.id,
    playId: row.play_id,
    playerId: row.player_id,
    playerName: nameById[row.player_id] ?? '—',
    positionName: row.position_name ?? '',
    actionPromptQuestion: row.action_prompt_question ?? '',
    playerAnswer: row.player_answer ?? undefined,
  };
}

export function mapSuggestionRow(
  row: SuggestionRow,
  nameById: Record<string, string>,
): PlaySuggestion {
  return {
    id: row.id,
    playId: row.play_id,
    playerId: row.player_id,
    playerName: nameById[row.player_id] ?? '—',
    suggestionText: row.suggestion_text,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function fetchTacticalBundle(
  client: SupabaseClient,
  teamId: string,
): Promise<{
  plays: TacticalPlay[];
  assignments: PlayAssignment[];
  suggestions: PlaySuggestion[];
  players: { id: string; fullName: string }[];
}> {
  const [playsRes, playersRes] = await Promise.all([
    client
      .from('tactical_plays')
      .select('id, team_id, title, media_url, allow_suggestions, board_json, game_iq_json, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }),
    client
      .from('users')
      .select('id, full_name')
      .eq('team_id', teamId)
      .eq('role', 'player')
      .order('full_name'),
  ]);

  if (playsRes.error) throw new Error(playsRes.error.message);
  if (playersRes.error) throw new Error(playersRes.error.message);

  const plays = ((playsRes.data ?? []) as PlayRow[]).map(mapPlayRow);
  const players = (playersRes.data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
  }));
  const nameById = Object.fromEntries(players.map((p) => [p.id, p.fullName]));

  const playIds = plays.map((p) => p.id);
  if (playIds.length === 0) {
    return { plays, assignments: [], suggestions: [], players };
  }

  const [assignRes, sugRes] = await Promise.all([
    client
      .from('play_assignments')
      .select('id, play_id, player_id, position_name, action_prompt_question, player_answer')
      .in('play_id', playIds),
    client
      .from('play_suggestions')
      .select('id, play_id, player_id, suggestion_text, status, created_at')
      .in('play_id', playIds)
      .order('created_at', { ascending: false }),
  ]);

  if (assignRes.error) throw new Error(assignRes.error.message);
  if (sugRes.error) throw new Error(sugRes.error.message);

  return {
    plays,
    assignments: ((assignRes.data ?? []) as AssignmentRow[]).map((row) =>
      mapAssignmentRow(row, nameById),
    ),
    suggestions: ((sugRes.data ?? []) as SuggestionRow[]).map((row) =>
      mapSuggestionRow(row, nameById),
    ),
    players,
  };
}

export async function createPlayLive(
  client: SupabaseClient,
  input: {
    teamId: string;
    title: string;
    allowSuggestions?: boolean;
    boardJson?: string;
    mediaUrl?: string;
  },
): Promise<TacticalPlay> {
  const { data, error } = await client
    .from('tactical_plays')
    .insert({
      team_id: input.teamId,
      title: input.title.trim(),
      allow_suggestions: input.allowSuggestions ?? true,
      board_json: input.boardJson ?? null,
      media_url: input.mediaUrl?.trim() || null,
    })
    .select('id, team_id, title, media_url, allow_suggestions, board_json, game_iq_json, created_at')
    .single();

  if (error) throw new Error(error.message);
  return mapPlayRow(data as PlayRow);
}

export async function updatePlayLive(
  client: SupabaseClient,
  playId: string,
  patch: {
    allowSuggestions?: boolean;
    mediaUrl?: string | null;
    boardJson?: string | null;
    gameIqJson?: string | null;
    title?: string;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.allowSuggestions !== undefined) row.allow_suggestions = patch.allowSuggestions;
  if (patch.mediaUrl !== undefined) row.media_url = patch.mediaUrl;
  if (patch.boardJson !== undefined) row.board_json = patch.boardJson;
  if (patch.gameIqJson !== undefined) row.game_iq_json = patch.gameIqJson;
  if (patch.title !== undefined) row.title = patch.title.trim();

  const { error } = await client.from('tactical_plays').update(row).eq('id', playId);
  if (error) throw new Error(error.message);
}

export async function createAssignmentLive(
  client: SupabaseClient,
  input: {
    playId: string;
    playerId: string;
    positionName: string;
    actionPromptQuestion: string;
  },
): Promise<PlayAssignment> {
  const { data, error } = await client
    .from('play_assignments')
    .insert({
      play_id: input.playId,
      player_id: input.playerId,
      position_name: input.positionName.trim(),
      action_prompt_question: input.actionPromptQuestion.trim(),
    })
    .select('id, play_id, player_id, position_name, action_prompt_question, player_answer')
    .single();

  if (error) throw new Error(error.message);

  const { data: userRow } = await client
    .from('users')
    .select('full_name')
    .eq('id', input.playerId)
    .maybeSingle();

  return mapAssignmentRow(data as AssignmentRow, {
    [input.playerId]: (userRow?.full_name as string | undefined) ?? '—',
  });
}

export async function answerAssignmentLive(
  client: SupabaseClient,
  assignmentId: string,
  answer: string,
): Promise<void> {
  const { error } = await client
    .from('play_assignments')
    .update({ player_answer: answer.trim() })
    .eq('id', assignmentId);
  if (error) throw new Error(error.message);
}

export async function submitSuggestionLive(
  client: SupabaseClient,
  input: { playId: string; playerId: string; text: string },
): Promise<PlaySuggestion> {
  const { data, error } = await client
    .from('play_suggestions')
    .insert({
      play_id: input.playId,
      player_id: input.playerId,
      suggestion_text: input.text.trim(),
      status: 'pending',
    })
    .select('id, play_id, player_id, suggestion_text, status, created_at')
    .single();

  if (error) throw new Error(error.message);

  const { data: userRow } = await client
    .from('users')
    .select('full_name')
    .eq('id', input.playerId)
    .maybeSingle();

  return mapSuggestionRow(data as SuggestionRow, {
    [input.playerId]: (userRow?.full_name as string | undefined) ?? '—',
  });
}

export async function reviewSuggestionLive(
  client: SupabaseClient,
  suggestionId: string,
  status: SuggestionStatus,
): Promise<void> {
  const { error } = await client
    .from('play_suggestions')
    .update({ status })
    .eq('id', suggestionId);
  if (error) throw new Error(error.message);
}
