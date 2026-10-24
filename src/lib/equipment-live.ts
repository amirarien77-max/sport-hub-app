/**
 * Equipment shortage reports (PRD v1.1 §2.3).
 * Coaches insert for their team; equipment_manager updates status club-wide.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type EquipmentStatus = 'reported' | 'in_progress' | 'ordered' | 'resolved';

export type EquipmentReport = {
  id: string;
  teamId: string;
  teamName?: string;
  reportedBy: string;
  itemDescription: string;
  quantity: number;
  status: EquipmentStatus;
  handledBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type EquipmentRow = {
  id: string;
  team_id: string;
  reported_by: string;
  item_description: string;
  quantity: number;
  status: EquipmentStatus;
  handled_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  'reported',
  'in_progress',
  'ordered',
  'resolved',
];

export function mapEquipmentRow(row: EquipmentRow, teamName?: string): EquipmentReport {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName,
    reportedBy: row.reported_by,
    itemDescription: row.item_description,
    quantity: row.quantity,
    status: row.status,
    handledBy: row.handled_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Team staff: own team. Equipment manager: all club teams (RLS). */
export async function fetchEquipmentReports(
  client: SupabaseClient,
  opts?: { teamId?: string },
): Promise<EquipmentReport[]> {
  let query = client
    .from('equipment_reports')
    .select(
      'id, team_id, reported_by, item_description, quantity, status, handled_by, notes, created_at, updated_at',
    )
    .order('created_at', { ascending: false });

  if (opts?.teamId) {
    query = query.eq('team_id', opts.teamId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data as EquipmentRow[] | null) ?? [];
  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  const nameById: Record<string, string> = {};
  if (teamIds.length) {
    const { data: teams } = await client.from('teams').select('id, name').in('id', teamIds);
    for (const t of teams ?? []) {
      nameById[t.id as string] = t.name as string;
    }
  }

  return rows.map((row) => mapEquipmentRow(row, nameById[row.team_id]));
}

export async function createEquipmentReport(
  client: SupabaseClient,
  input: {
    teamId: string;
    reportedBy: string;
    itemDescription: string;
    quantity?: number;
    notes?: string | null;
  },
): Promise<EquipmentReport> {
  const desc = input.itemDescription.trim();
  if (!desc) throw new Error('description_required');
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));

  const { data, error } = await client
    .from('equipment_reports')
    .insert({
      team_id: input.teamId,
      reported_by: input.reportedBy,
      item_description: desc,
      quantity,
      notes: input.notes?.trim() || null,
      status: 'reported',
    })
    .select(
      'id, team_id, reported_by, item_description, quantity, status, handled_by, notes, created_at, updated_at',
    )
    .single();

  if (error) throw new Error(error.message);
  return mapEquipmentRow(data as EquipmentRow);
}

export async function updateEquipmentStatus(
  client: SupabaseClient,
  input: {
    id: string;
    status: EquipmentStatus;
    handledBy?: string | null;
    notes?: string | null;
  },
): Promise<EquipmentReport> {
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.handledBy !== undefined) patch.handled_by = input.handledBy;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await client
    .from('equipment_reports')
    .update(patch)
    .eq('id', input.id)
    .select(
      'id, team_id, reported_by, item_description, quantity, status, handled_by, notes, created_at, updated_at',
    )
    .single();

  if (error) throw new Error(error.message);
  return mapEquipmentRow(data as EquipmentRow);
}
