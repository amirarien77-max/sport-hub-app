import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AttendanceMark,
  AttendanceRow,
  CarpoolOffer,
  DualAck,
  RsvpChoice,
  SessionEvent,
  UrgentBanner,
  UserProfile,
} from '@/types';

type EventRow = {
  id: string;
  team_id: string;
  title: string;
  starts_at: string;
  location: string | null;
  type: 'practice' | 'game';
};

type RsvpRow = {
  event_id: string;
  player_id: string;
  player_choice: RsvpChoice;
  player_reason: string | null;
  parent_choice: RsvpChoice;
  parent_reason: string | null;
};

type AttendanceDbRow = {
  event_id: string;
  player_id: string;
  mark: AttendanceMark;
  locked_at: string | null;
};

type CarpoolRow = {
  id: string;
  event_id: string;
  parent_id: string;
  seats_available: number;
  seats_taken: number;
};

type FeedRow = {
  id: string;
  team_id: string;
  body: string | null;
  is_urgent: boolean;
};

export function mapEventRow(row: EventRow): SessionEvent {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    startsAt: row.starts_at,
    location: row.location ?? '',
    type: row.type,
  };
}

export function mapRsvpRow(row: RsvpRow, playerName?: string): DualAck {
  return {
    eventId: row.event_id,
    playerId: row.player_id,
    playerName,
    playerChoice: row.player_choice,
    playerReason: row.player_reason ?? undefined,
    parentChoice: row.parent_choice,
    parentReason: row.parent_reason ?? undefined,
  };
}

export async function fetchScheduleBundle(
  client: SupabaseClient,
  teamId: string,
): Promise<{
  events: SessionEvent[];
  acks: DualAck[];
  attendance: AttendanceRow[];
  carpools: CarpoolOffer[];
  banner: UrgentBanner | null;
  teammates: UserProfile[];
}> {
  const [{ data: eventRows, error: eventsError }, { data: teammateRows }] = await Promise.all([
    client.from('events').select('*').eq('team_id', teamId).order('starts_at', { ascending: true }),
    client.from('users').select('*').eq('team_id', teamId),
  ]);

  if (eventsError) throw new Error(eventsError.message);

  const teammates = (teammateRows ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    role: row.role as UserProfile['role'],
    teamId: row.team_id as string,
    clubId: row.club_id as string,
    dateOfBirth: (row.date_of_birth as string | null) ?? undefined,
    parentPhone: (row.parent_phone as string | null) ?? undefined,
    consentStatus: row.consent_status as UserProfile['consentStatus'],
  }));

  const nameById = Object.fromEntries(teammates.map((u) => [u.id, u.fullName]));
  const events = (eventRows as EventRow[] | null)?.map(mapEventRow) ?? [];
  const eventIds = events.map((e) => e.id);

  if (eventIds.length === 0) {
    return { events, acks: [], attendance: [], carpools: [], banner: null, teammates };
  }

  const [rsvpRes, attendanceRes, carpoolRes, feedRes] = await Promise.all([
    client.from('event_rsvps').select('*').in('event_id', eventIds),
    client.from('attendance_records').select('*').in('event_id', eventIds),
    client
      .from('carpool_offers')
      .select('id, event_id, parent_id, seats_available, seats_taken')
      .in('event_id', eventIds),
    client
      .from('team_feed_posts')
      .select('id, team_id, body, is_urgent')
      .eq('team_id', teamId)
      .eq('is_urgent', true)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Attendance SELECT is staff-only under RLS — ignore errors for player/parent.
  const rsvpRows = rsvpRes.data;
  const attendanceRows = attendanceRes.error ? [] : attendanceRes.data;
  const carpoolRows = carpoolRes.data;
  const feedRows = feedRes.data;

  const acks =
    (rsvpRows as RsvpRow[] | null)?.map((row) => mapRsvpRow(row, nameById[row.player_id])) ?? [];

  const players = teammates.filter((u) => u.role === 'player');
  const primaryEventId = events[0]?.id;
  const markByPlayer = new Map(
    ((attendanceRows as AttendanceDbRow[] | null) ?? [])
      .filter((r) => r.event_id === primaryEventId)
      .map((r) => [r.player_id, r.mark]),
  );

  const attendance: AttendanceRow[] =
    primaryEventId == null
      ? []
      : players.map((p) => ({
          eventId: primaryEventId,
          playerId: p.id,
          playerName: p.fullName,
          mark: markByPlayer.get(p.id) ?? null,
        }));

  const carpools: CarpoolOffer[] = ((carpoolRows as CarpoolRow[] | null) ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    parentId: row.parent_id,
    parentName: nameById[row.parent_id] ?? 'Parent',
    seatsAvailable: row.seats_available,
    seatsTaken: row.seats_taken,
  }));

  const feed = (feedRows as FeedRow[] | null)?.[0] ?? null;
  let banner: UrgentBanner | null = null;
  if (feed) {
    const { data: ackRows } = await client
      .from('urgent_acks')
      .select('user_id')
      .eq('post_id', feed.id);
    banner = {
      id: feed.id,
      teamId: feed.team_id,
      message: feed.body ?? '',
      requiresAck: true,
      acknowledgedBy: (ackRows ?? []).map((a) => a.user_id as string),
    };
  }

  return { events, acks, attendance, carpools, banner, teammates };
}

export async function ensureParentPlayerLink(
  client: SupabaseClient,
  parentId: string,
  teamId: string,
): Promise<string | null> {
  const { data: existing } = await client
    .from('parent_player_links')
    .select('player_id')
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();

  if (existing?.player_id) return existing.player_id as string;

  const { data: player } = await client
    .from('users')
    .select('id')
    .eq('team_id', teamId)
    .eq('role', 'player')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!player?.id) return null;

  const { error } = await client.from('parent_player_links').insert({
    parent_id: parentId,
    player_id: player.id,
  });
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    console.warn('parent link failed', error.message);
  }
  return player.id as string;
}

export async function upsertRsvp(
  client: SupabaseClient,
  input: {
    eventId: string;
    playerId: string;
    asParent: boolean;
    choice: RsvpChoice;
    reason?: string;
  },
): Promise<void> {
  const { data: existing } = await client
    .from('event_rsvps')
    .select('*')
    .eq('event_id', input.eventId)
    .eq('player_id', input.playerId)
    .maybeSingle();

  const patch = input.asParent
    ? {
        parent_choice: input.choice,
        parent_reason: input.reason ?? null,
      }
    : {
        player_choice: input.choice,
        player_reason: input.reason ?? null,
      };

  if (existing) {
    const { error } = await client
      .from('event_rsvps')
      .update(patch)
      .eq('event_id', input.eventId)
      .eq('player_id', input.playerId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await client.from('event_rsvps').insert({
    event_id: input.eventId,
    player_id: input.playerId,
    player_choice: input.asParent ? null : input.choice,
    player_reason: input.asParent ? null : (input.reason ?? null),
    parent_choice: input.asParent ? input.choice : null,
    parent_reason: input.asParent ? (input.reason ?? null) : null,
  });
  if (error) throw new Error(error.message);
}

export async function upsertAttendanceMark(
  client: SupabaseClient,
  eventId: string,
  playerId: string,
  mark: AttendanceMark,
): Promise<void> {
  const { data: existing } = await client
    .from('attendance_records')
    .select('id')
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from('attendance_records')
      .update({ mark })
      .eq('event_id', eventId)
      .eq('player_id', playerId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await client.from('attendance_records').insert({
    event_id: eventId,
    player_id: playerId,
    mark,
  });
  if (error) throw new Error(error.message);
}

export async function lockAttendanceRecords(
  client: SupabaseClient,
  eventId: string,
): Promise<void> {
  const lockedAt = new Date().toISOString();
  const { error } = await client
    .from('attendance_records')
    .update({ locked_at: lockedAt })
    .eq('event_id', eventId);
  if (error) throw new Error(error.message);
}

export async function claimCarpoolSeatLive(
  client: SupabaseClient,
  offerId: string,
  seatsTaken: number,
  seatsAvailable: number,
): Promise<boolean> {
  if (seatsTaken >= seatsAvailable) return false;
  const { data, error } = await client
    .from('carpool_offers')
    .update({ seats_taken: seatsTaken + 1 })
    .eq('id', offerId)
    .eq('seats_taken', seatsTaken)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function acknowledgeUrgentBanner(
  client: SupabaseClient,
  bannerId: string,
  userId: string,
): Promise<void> {
  const { error } = await client.from('urgent_acks').insert({
    post_id: bannerId,
    user_id: userId,
  });
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    throw new Error(error.message);
  }
}
