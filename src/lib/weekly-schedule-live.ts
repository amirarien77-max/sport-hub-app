/**
 * לו״ז שבועי קבוע (תבנית): יום / שעת התחלה-סיום / מיקום.
 * נפרד מ־events (אירועים חד-פעמיים). שבוע ישראלי: 0=ראשון … 6=שבת.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeeklyScheduleSlot } from '@/types';

type SlotRow = {
  id: string;
  team_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  created_at: string;
  updated_at: string;
};

/** Postgres TIME may arrive as "17:00:00" — normalize to HH:MM for UI. */
export function formatTimeHm(value: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return value;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function mapWeeklySlotRow(row: SlotRow): WeeklyScheduleSlot {
  return {
    id: row.id,
    teamId: row.team_id,
    dayOfWeek: row.day_of_week as WeeklyScheduleSlot['dayOfWeek'],
    startTime: formatTimeHm(row.start_time),
    endTime: formatTimeHm(row.end_time),
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWeeklySchedule(
  client: SupabaseClient,
  teamId: string,
): Promise<WeeklyScheduleSlot[]> {
  const { data, error } = await client
    .from('weekly_schedule_slots')
    .select('id, team_id, day_of_week, start_time, end_time, location, created_at, updated_at')
    .eq('team_id', teamId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as SlotRow[] | null) ?? []).map(mapWeeklySlotRow);
}

export type WeeklySlotInput = {
  dayOfWeek: WeeklyScheduleSlot['dayOfWeek'];
  startTime: string;
  endTime: string;
  location: string;
};

export async function insertWeeklySlot(
  client: SupabaseClient,
  teamId: string,
  createdBy: string | null,
  input: WeeklySlotInput,
): Promise<WeeklyScheduleSlot> {
  const { data, error } = await client
    .from('weekly_schedule_slots')
    .insert({
      team_id: teamId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      location: input.location.trim(),
      created_by: createdBy,
    })
    .select('id, team_id, day_of_week, start_time, end_time, location, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return mapWeeklySlotRow(data as SlotRow);
}

export async function updateWeeklySlot(
  client: SupabaseClient,
  slotId: string,
  input: WeeklySlotInput,
): Promise<WeeklyScheduleSlot> {
  const { data, error } = await client
    .from('weekly_schedule_slots')
    .update({
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      location: input.location.trim(),
    })
    .eq('id', slotId)
    .select('id, team_id, day_of_week, start_time, end_time, location, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return mapWeeklySlotRow(data as SlotRow);
}

export async function deleteWeeklySlot(client: SupabaseClient, slotId: string): Promise<void> {
  const { error } = await client.from('weekly_schedule_slots').delete().eq('id', slotId);
  if (error) throw new Error(error.message);
}
