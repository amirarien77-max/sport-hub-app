/**
 * שערי הרשאות לפי תפקיד — מקור אמת ל־UI ול־Session (לא מחליף RLS בשרת).
 * תמיד לנרמל מחרוזת תפקיד לפני השוואה (DB / טופס עלולים לשלוח ריווחים/רישיות).
 */
import type { Role, Team, UserProfile } from '@/types';

/** Normalize DB / client role strings before gate checks (trim + lower-case). */
export function normalizeRole(role: Role | string | undefined | null): string {
  return (role ?? '').toString().trim().toLowerCase();
}

/** Court attendance + lock — head/assistant coach and admin. */
export function isAttendanceCoach(role: Role | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'head_coach' || r === 'assistant_coach' || r === 'admin';
}

/** Tactical plays create/edit + suggestion review. */
export function isTacticalCoach(role: Role | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'head_coach' || r === 'assistant_coach' || r === 'admin';
}

/** Staff who see coach health / risk surfaces. */
export function isHealthStaff(role: Role | undefined | null): boolean {
  const r = normalizeRole(role);
  return (
    r === 'head_coach' ||
    r === 'assistant_coach' ||
    r === 'admin' ||
    r === 'fitness_coach' ||
    r === 'physio'
  );
}

/** Equipment logistics — club-wide reports; no medical / meetings access. */
export function isEquipmentManager(role: Role | undefined | null): boolean {
  return normalizeRole(role) === 'equipment_manager';
}

/** Dual-Ack RSVP actions (player self or parent for linked player). */
export function canSubmitRsvp(role: Role | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'player' || r === 'parent';
}

/** Carpool seat claim — parents (and players helping family logistics). */
export function canClaimCarpool(role: Role | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'parent' || r === 'player';
}

export function canLogReadiness(role: Role | undefined | null): boolean {
  return normalizeRole(role) === 'player';
}

/**
 * Dynamic staff permissions (PRD §3):
 * fitness/physio → write; head coach inherits write only when no specialist on team;
 * otherwise head coach / assistant / admin → read; others → none.
 */
export function coachHealthAccess(
  team: Team,
  role: UserProfile['role'],
): 'write' | 'read' | 'none' {
  const r = normalizeRole(role);
  if (r === 'fitness_coach' || r === 'physio') return 'write';
  if (r === 'admin') return 'write';
  if (r === 'head_coach') {
    return team.hasFitnessStaff || team.hasPhysioStaff ? 'read' : 'write';
  }
  if (r === 'assistant_coach') return 'read';
  return 'none';
}
