/**
 * דף קשר חי — CRUD על team_contacts (migration 021).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamContact } from '@/types';

type ContactRow = {
  id: string;
  team_id: string;
  role_label: string;
  full_name: string;
  phone: string | null;
  is_head_coach: boolean;
  sort_order: number;
};

export function mapContactRow(row: ContactRow): TeamContact {
  return {
    id: row.id,
    teamId: row.team_id,
    roleLabel: row.role_label,
    fullName: row.full_name,
    phone: row.phone?.trim() ? row.phone.trim() : undefined,
    isHeadCoach: Boolean(row.is_head_coach),
    sortOrder: row.sort_order ?? 0,
  };
}

export async function fetchTeamContactsLive(
  client: SupabaseClient,
  teamId: string,
): Promise<TeamContact[]> {
  const { data, error } = await client
    .from('team_contacts')
    .select('id, team_id, role_label, full_name, phone, is_head_coach, sort_order')
    .eq('team_id', teamId)
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true });

  if (error) {
    console.warn('fetchTeamContactsLive', error.message);
    return [];
  }
  return ((data as ContactRow[] | null) ?? []).map(mapContactRow);
}

export type ContactWriteInput = {
  teamId: string;
  roleLabel: string;
  fullName: string;
  phone?: string;
  isHeadCoach?: boolean;
  sortOrder?: number;
};

export async function createTeamContactLive(
  client: SupabaseClient,
  input: ContactWriteInput,
): Promise<{ ok: true; contact: TeamContact } | { ok: false; error: string }> {
  const { data, error } = await client
    .from('team_contacts')
    .insert({
      team_id: input.teamId,
      role_label: input.roleLabel.trim(),
      full_name: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      is_head_coach: Boolean(input.isHeadCoach),
      sort_order: input.sortOrder ?? 0,
    })
    .select('id, team_id, role_label, full_name, phone, is_head_coach, sort_order')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert_blocked' };
  }
  return { ok: true, contact: mapContactRow(data as ContactRow) };
}

export async function updateTeamContactLive(
  client: SupabaseClient,
  id: string,
  input: Partial<Omit<ContactWriteInput, 'teamId'>>,
): Promise<{ ok: true; contact: TeamContact } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.roleLabel !== undefined) patch.role_label = input.roleLabel.trim();
  if (input.fullName !== undefined) patch.full_name = input.fullName.trim();
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.isHeadCoach !== undefined) patch.is_head_coach = Boolean(input.isHeadCoach);
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await client
    .from('team_contacts')
    .update(patch)
    .eq('id', id)
    .select('id, team_id, role_label, full_name, phone, is_head_coach, sort_order')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'update_blocked' };
  }
  return { ok: true, contact: mapContactRow(data as ContactRow) };
}

export async function deleteTeamContactLive(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from('team_contacts').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
