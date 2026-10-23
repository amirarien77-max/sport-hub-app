import type { Role } from '@/types';

/** Court attendance + lock — head/assistant coach and admin. */
export function isAttendanceCoach(role: Role | undefined | null): boolean {
  return role === 'head_coach' || role === 'assistant_coach' || role === 'admin';
}

/** Staff who see coach health / risk surfaces. */
export function isHealthStaff(role: Role | undefined | null): boolean {
  return (
    role === 'head_coach' ||
    role === 'assistant_coach' ||
    role === 'admin' ||
    role === 'fitness_coach' ||
    role === 'physio'
  );
}

/** Dual-Ack RSVP actions (player self or parent for linked player). */
export function canSubmitRsvp(role: Role | undefined | null): boolean {
  return role === 'player' || role === 'parent';
}

/** Carpool seat claim — parents (and players helping family logistics). */
export function canClaimCarpool(role: Role | undefined | null): boolean {
  return role === 'parent' || role === 'player';
}

export function canLogReadiness(role: Role | undefined | null): boolean {
  return role === 'player';
}
