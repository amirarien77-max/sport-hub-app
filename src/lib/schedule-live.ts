/**
 * מודול 2 (live): לוח זמנים, Dual-Ack, נוכחות, carpool, באנר דחוף.
 * ממפה שורות DB → טיפוסי האפליקציה. קריאות SELECT כפופות ל־RLS
 * (למשל attendance לצוות בלבד — שגיאה נבלעת לשחקן/הורה).
 */
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

/** טעינה מקבילה של אירועים + RSVP + נוכחות + carpool + באנר דחוף לקבוצה. */
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

/**
 * הורה צריך player_id ל־Dual-Ack. אם אין קישור — יוצרים לילד הראשון בקבוצה (דמו/bootstrap).
 * בפרודקשן אמיתי עדיף קישור מפורש; כאן זה מאפשר RSVP בלי מסך קישור נפרד.
 */
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

/**
 * Dual-Ack: עמודה נפרדת לשחקן ולהורה על אותו (event_id, player_id).
 * asParent=true מעדכן רק parent_*; אחרת רק player_*.
 */
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

export type ClaimCarpoolResult =
  | { ok: true; seatsTaken: number; seatsAvailable: number }
  | { ok: false; reason: 'full' | 'not_found' | 'error'; message?: string };

export type CreateCarpoolResult =
  | { ok: true; offer: CarpoolOffer }
  | { ok: false; reason: 'error'; message?: string };

/** Parent creates a carpool offer (RLS: parent_id = self, role = parent). */
export async function createCarpoolOfferLive(
  client: SupabaseClient,
  input: {
    eventId: string;
    parentId: string;
    parentName: string;
    seatsAvailable: number;
  },
): Promise<CreateCarpoolResult> {
  const seats = Math.min(8, Math.max(1, Math.round(input.seatsAvailable)));
  const { data, error } = await client
    .from('carpool_offers')
    .insert({
      event_id: input.eventId,
      parent_id: input.parentId,
      seats_available: seats,
      seats_taken: 0,
    })
    .select('id, event_id, parent_id, seats_available, seats_taken')
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'error', message: error.message };
  }
  if (!data) {
    return { ok: false, reason: 'error', message: 'insert_blocked' };
  }

  return {
    ok: true,
    offer: {
      id: data.id as string,
      eventId: data.event_id as string,
      parentId: data.parent_id as string,
      parentName: input.parentName,
      seatsAvailable: data.seats_available as number,
      seatsTaken: data.seats_taken as number,
    },
  };
}

/**
 * תפיסת מושב carpool.
 * מעדיף RPC `claim_carpool_seat` (אטומי, migration 007); אם הפונקציה חסרה —
 * נסיגה ל־UPDATE מותנה ב־seats_taken הישן (optimistic concurrency).
 */
export async function claimCarpoolSeatLive(
  client: SupabaseClient,
  offerId: string,
  seatsTaken: number,
  seatsAvailable: number,
): Promise<ClaimCarpoolResult> {
  if (seatsTaken >= seatsAvailable) {
    return { ok: false, reason: 'full' };
  }

  const rpc = await client.rpc('claim_carpool_seat', { p_offer_id: offerId });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (row && typeof row === 'object' && 'seats_taken' in row) {
      return {
        ok: true,
        seatsTaken: Number((row as { seats_taken: number }).seats_taken),
        seatsAvailable: Number((row as { seats_available: number }).seats_available),
      };
    }
    // RPC succeeded with empty set — treat as full/missing
    return { ok: false, reason: 'full' };
  }

  const rpcMsg = rpc.error.message.toLowerCase();
  if (rpcMsg.includes('offer_full')) return { ok: false, reason: 'full' };
  if (rpcMsg.includes('offer_not_found')) return { ok: false, reason: 'not_found' };
  // Function missing / not migrated yet — fall back to direct update
  const canFallback =
    rpcMsg.includes('function') ||
    rpcMsg.includes('could not find') ||
    rpc.error.code === 'PGRST202' ||
    rpc.error.code === '42883';

  if (!canFallback) {
    return { ok: false, reason: 'error', message: rpc.error.message };
  }

  const { data: fresh, error: readErr } = await client
    .from('carpool_offers')
    .select('id, seats_taken, seats_available')
    .eq('id', offerId)
    .maybeSingle();
  if (readErr) return { ok: false, reason: 'error', message: readErr.message };
  if (!fresh) return { ok: false, reason: 'not_found' };
  if (fresh.seats_taken >= fresh.seats_available) return { ok: false, reason: 'full' };

  const nextTaken = (fresh.seats_taken as number) + 1;
  const { data: updated, error: updateErr } = await client
    .from('carpool_offers')
    .update({ seats_taken: nextTaken })
    .eq('id', offerId)
    .eq('seats_taken', fresh.seats_taken)
    .select('id, seats_taken, seats_available')
    .maybeSingle();

  if (updateErr) return { ok: false, reason: 'error', message: updateErr.message };
  if (!updated) {
    // 0 rows: RLS or race — surface as error so UI is not silent
    return {
      ok: false,
      reason: 'error',
      message: 'update_blocked',
    };
  }

  return {
    ok: true,
    seatsTaken: updated.seats_taken as number,
    seatsAvailable: updated.seats_available as number,
  };
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

/** Staff create practice/game (RLS: events_insert_staff). */
export async function createEventLive(
  client: SupabaseClient,
  input: {
    teamId: string;
    title: string;
    startsAt: string;
    location: string;
    type: 'practice' | 'game';
  },
): Promise<SessionEvent> {
  const title = input.title.trim();
  if (!title) throw new Error('title_required');

  const { data, error } = await client
    .from('events')
    .insert({
      team_id: input.teamId,
      title,
      starts_at: input.startsAt,
      location: input.location.trim() || null,
      type: input.type,
    })
    .select('id, team_id, title, starts_at, location, type')
    .single();

  if (error) throw new Error(error.message);
  return mapEventRow(data as EventRow);
}

/**
 * Staff update event fields (RLS: events_update_staff — migration 016).
 */
export async function updateEventLive(
  client: SupabaseClient,
  input: {
    id: string;
    title?: string;
    startsAt?: string;
    location?: string;
    type?: 'practice' | 'game';
  },
): Promise<SessionEvent> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error('title_required');
    patch.title = title;
  }
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.location !== undefined) patch.location = input.location.trim() || null;
  if (input.type !== undefined) patch.type = input.type;

  const { data, error } = await client
    .from('events')
    .update(patch)
    .eq('id', input.id)
    .select('id, team_id, title, starts_at, location, type')
    .single();

  if (error) throw new Error(error.message);
  return mapEventRow(data as EventRow);
}
