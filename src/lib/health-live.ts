/**
 * מודול 3 (live): מוכנות יומית + מפת כאב + חישוב סיכון למאמן.
 * sleep/water מוגבלים ל־0–24 (גם ב־DB וגם ב־clamp24). הורים לא אמורים
 * לקבל SELECT רפואי — SessionContext מנקה להם את הבאנדל.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PainReport, PainSeverity, ReadinessReport, Role } from '@/types';

type ReadinessRow = {
  id: string;
  player_id: string;
  report_date: string;
  rpe: number;
  sleep_hours: number | string;
  water_liters: number | string;
};

type PainRow = {
  id: string;
  player_id: string;
  region: string;
  sub_region: string;
  severity: PainSeverity;
  created_at: string;
};

export type PlayerRiskLevel = 'ok' | 'watch' | 'high';

export type PlayerRiskRow = {
  playerId: string;
  playerName: string;
  level: PlayerRiskLevel;
  latestRpe: number | null;
  latestSleep: number | null;
  latestWater: number | null;
  openPain: PainReport[];
  reasons: string[];
};

export function mapReadinessRow(row: ReadinessRow): ReadinessReport {
  return {
    id: row.id,
    playerId: row.player_id,
    date: row.report_date,
    rpe: Number(row.rpe),
    sleepHours: Number(row.sleep_hours),
    waterLiters: Number(row.water_liters),
  };
}

export function mapPainRow(row: PainRow): PainReport {
  return {
    id: row.id,
    playerId: row.player_id,
    region: row.region,
    subRegion: row.sub_region,
    severity: row.severity,
    createdAt: row.created_at,
  };
}

/** תקרת שינה/מים לפי PRD — מעל 24 נחתך (לא נזרק). */
function clamp24(n: number): number {
  return Math.min(24, Math.max(0, n));
}

/** Load readiness + pain visible to the current auth user (RLS filters). */
export async function fetchHealthBundle(
  client: SupabaseClient,
  opts: { teamId: string; asStaff: boolean },
): Promise<{ readiness: ReadinessReport[]; pain: PainReport[]; players: { id: string; fullName: string }[] }> {
  const playersRes = await client
    .from('users')
    .select('id, full_name, role')
    .eq('team_id', opts.teamId)
    .eq('role', 'player');

  if (playersRes.error) throw new Error(playersRes.error.message);

  const players = (playersRes.data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
  }));

  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) {
    return { readiness: [], pain: [], players };
  }

  // Staff: team players. Players: RLS still limits to own rows even if we query broadly.
  const [readyRes, painRes] = await Promise.all([
    client
      .from('readiness_reports')
      .select('*')
      .in('player_id', playerIds)
      .order('report_date', { ascending: false })
      .limit(opts.asStaff ? 200 : 30),
    client
      .from('pain_reports')
      .select('*')
      .in('player_id', playerIds)
      .order('created_at', { ascending: false })
      .limit(opts.asStaff ? 200 : 50),
  ]);

  if (readyRes.error) throw new Error(readyRes.error.message);
  if (painRes.error) throw new Error(painRes.error.message);

  return {
    readiness: ((readyRes.data as ReadinessRow[] | null) ?? []).map(mapReadinessRow),
    pain: ((painRes.data as PainRow[] | null) ?? []).map(mapPainRow),
    players,
  };
}

export async function upsertReadinessLive(
  client: SupabaseClient,
  input: {
    playerId: string;
    rpe: number;
    sleepHours: number;
    waterLiters: number;
    reportDate?: string;
  },
): Promise<ReadinessReport> {
  const reportDate = input.reportDate ?? new Date().toISOString().slice(0, 10);
  const payload = {
    player_id: input.playerId,
    report_date: reportDate,
    rpe: input.rpe,
    sleep_hours: clamp24(input.sleepHours),
    water_liters: clamp24(input.waterLiters),
  };

  const { data, error } = await client
    .from('readiness_reports')
    .upsert(payload, { onConflict: 'player_id,report_date' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapReadinessRow(data as ReadinessRow);
}

export async function insertPainLive(
  client: SupabaseClient,
  input: {
    playerId: string;
    region: string;
    subRegion: string;
    severity: PainSeverity;
  },
): Promise<PainReport> {
  const { data, error } = await client
    .from('pain_reports')
    .insert({
      player_id: input.playerId,
      region: input.region,
      sub_region: input.subRegion,
      severity: input.severity,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapPainRow(data as PainRow);
}

/** חלון «כאב כרוני»: ≥2 דיווחים לאותו אזור בתוך 7 ימים → watch/high. */
const CHRONIC_DAYS = 7;
const CHRONIC_COUNT = 2;

/**
 * לוח סיכון מאמן: אדום/צהוב לפי עומס (RPE) וכאב כרוני/מגביל.
 * מפתחות reasons → i18n תחת health.riskReasons.*
 */
export function buildPlayerRiskRows(
  players: { id: string; fullName: string }[],
  readiness: ReadinessReport[],
  pain: PainReport[],
): PlayerRiskRow[] {
  const now = Date.now();
  const chronicCutoff = now - CHRONIC_DAYS * 24 * 60 * 60 * 1000;

  return players.map((player) => {
    const playerReady = readiness
      .filter((r) => r.playerId === player.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const latest = playerReady[0] ?? null;
    const playerPain = pain.filter((p) => p.playerId === player.id);
    const recentPain = playerPain.filter(
      (p) => new Date(p.createdAt).getTime() >= chronicCutoff,
    );

    const reasons: string[] = [];
    let level: PlayerRiskLevel = 'ok';

    if (latest && latest.rpe >= 9) {
      level = 'high';
      reasons.push('highRpe');
    } else if (latest && latest.rpe >= 7) {
      level = 'watch';
      reasons.push('elevatedRpe');
    }

    if (playerPain.some((p) => p.severity === 'disabling')) {
      level = 'high';
      reasons.push('disablingPain');
    } else if (playerPain.some((p) => p.severity === 'soreness') && level === 'ok') {
      level = 'watch';
      reasons.push('soreness');
    }

    const byRegion = new Map<string, number>();
    for (const p of recentPain) {
      const key = `${p.region}:${p.subRegion}`;
      byRegion.set(key, (byRegion.get(key) ?? 0) + 1);
    }
    const chronic = [...byRegion.entries()].filter(([, count]) => count >= CHRONIC_COUNT);
    if (chronic.length > 0) {
      level = level === 'ok' ? 'watch' : 'high';
      reasons.push('chronicPain');
    }

    return {
      playerId: player.id,
      playerName: player.fullName,
      level,
      latestRpe: latest?.rpe ?? null,
      latestSleep: latest?.sleepHours ?? null,
      latestWater: latest?.waterLiters ?? null,
      openPain: playerPain.slice(0, 3),
      reasons: [...new Set(reasons)],
    };
  });
}

export function roleSeesHealthStaffUi(role: Role | undefined | null): boolean {
  return (
    role === 'head_coach' ||
    role === 'assistant_coach' ||
    role === 'admin' ||
    role === 'fitness_coach' ||
    role === 'physio'
  );
}
