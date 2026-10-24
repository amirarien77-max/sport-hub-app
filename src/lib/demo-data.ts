/**
 * נתוני דמו מקומיים (הפועל ירושלים / U16) כש־isDemoMode.
 * משמשים גם ל־QA בלי Supabase. לא לייבא ללוגיקת live כמקור אמת —
 * רק כש־supabase === null או לבדיקות תפקיד בדמו.
 */
import { he } from '@/i18n';
import type {
  AttendanceRow,
  CarpoolOffer,
  ClubBrand,
  DualAck,
  PainReport,
  PlayAssignment,
  PlaySuggestion,
  ReadinessReport,
  SessionEvent,
  TacticalPlay,
  Team,
  UrgentBanner,
  UserProfile,
} from '@/types';

import { DEMO_INVITE_CODE, isDemoInviteCode } from '@/lib/invite-codes';

export { DEMO_INVITE_CODE } from '@/lib/invite-codes';

export const demoClub: ClubBrand = {
  id: 'club-hapoel-jerusalem',
  name: he.demo.clubName,
  primaryColor: '#C8102E',
  secondaryColor: '#1A1A1A',
  accentColor: '#F5F5F5',
};

export const demoTeam: Team = {
  id: 'team-u16',
  clubId: demoClub.id,
  name: he.demo.teamName,
  inviteCode: DEMO_INVITE_CODE,
  hasFitnessStaff: false,
  hasPhysioStaff: false,
};

export const demoUsers: UserProfile[] = [
  {
    id: 'user-coach',
    fullName: 'Coach Dana',
    role: 'head_coach',
    teamId: demoTeam.id,
    clubId: demoClub.id,
    consentStatus: 'active',
  },
  {
    id: 'user-player-roi',
    fullName: 'Roi Cohen',
    role: 'player',
    teamId: demoTeam.id,
    clubId: demoClub.id,
    dateOfBirth: '2012-04-12',
    consentStatus: 'active',
  },
  {
    id: 'user-player-dan',
    fullName: 'Dan Levi',
    role: 'player',
    teamId: demoTeam.id,
    clubId: demoClub.id,
    dateOfBirth: '2014-09-01',
    consentStatus: 'pending_parental_consent',
    parentPhone: '+972501234567',
  },
  {
    id: 'user-parent',
    fullName: 'Parent Cohen',
    role: 'parent',
    teamId: demoTeam.id,
    clubId: demoClub.id,
    consentStatus: 'active',
  },
];

export const demoEvents: SessionEvent[] = [
  {
    id: 'event-practice-1',
    teamId: demoTeam.id,
    title: he.demo.eventPractice,
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    location: he.demo.locationHallA,
    type: 'practice',
  },
  {
    id: 'event-game-1',
    teamId: demoTeam.id,
    title: he.demo.eventGame,
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
    location: he.demo.locationAway,
    type: 'game',
  },
];

export const demoAcks: DualAck[] = [
  {
    eventId: 'event-practice-1',
    playerId: 'user-player-roi',
    playerChoice: 'attending',
    parentChoice: 'not_attending',
    parentReason: 'Family event',
  },
  {
    eventId: 'event-practice-1',
    playerId: 'user-player-dan',
    playerChoice: null,
    parentChoice: null,
  },
];

export const demoAttendance: AttendanceRow[] = [
  {
    eventId: 'event-practice-1',
    playerId: 'user-player-roi',
    playerName: 'Roi Cohen',
    mark: null,
  },
  {
    eventId: 'event-practice-1',
    playerId: 'user-player-dan',
    playerName: 'Dan Levi',
    mark: null,
  },
];

export const demoReadiness: ReadinessReport[] = [];

export const demoPain: PainReport[] = [
  {
    id: 'pain-1',
    playerId: 'user-player-roi',
    region: 'lower_leg',
    subRegion: 'Achilles',
    severity: 'soreness',
    createdAt: new Date().toISOString(),
  },
];

export const demoPlays: TacticalPlay[] = [
  {
    id: 'play-1',
    teamId: demoTeam.id,
    title: he.demo.playTitle,
    mediaUrl: undefined,
    boardJson:
      '{"markers":[{"x":22,"y":70,"label":"1"},{"x":50,"y":55,"label":"4"},{"x":78,"y":70,"label":"2"},{"x":35,"y":35,"label":"5"},{"x":65,"y":35,"label":"3"}]}',
    allowSuggestions: true,
    createdAt: new Date().toISOString(),
  },
];

export const demoAssignments: PlayAssignment[] = [
  {
    id: 'assign-1',
    playId: 'play-1',
    playerId: 'user-player-roi',
    playerName: 'Roi Cohen',
    positionName: '1',
    actionPromptQuestion: he.demo.assignQ1,
    playerAnswer: undefined,
  },
  {
    id: 'assign-2',
    playId: 'play-1',
    playerId: 'user-player-dan',
    playerName: 'Dan Levi',
    positionName: '1',
    actionPromptQuestion: he.demo.assignQ2,
  },
];

export const demoSuggestions: PlaySuggestion[] = [];

export const demoCarpools: CarpoolOffer[] = [
  {
    id: 'carpool-1',
    eventId: 'event-game-1',
    parentId: 'user-parent',
    parentName: 'Parent Cohen',
    seatsAvailable: 3,
    seatsTaken: 1,
  },
];

export const demoBanner: UrgentBanner = {
  id: 'banner-1',
  teamId: demoTeam.id,
  message: he.demo.banner,
  requiresAck: true,
  acknowledgedBy: [],
};

export function resolveInvite(code: string): ClubBrand | null {
  if (isDemoInviteCode(code)) {
    return demoClub;
  }
  return null;
}

/** מתחת ל־13 → דורש אישור הורה (SMS) לפני feed מלא. */
export function isUnder13(dateOfBirth?: string): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 13);
  return dob > cutoff;
}

/** Dual-Ack: שחקן והורה בחרו RSVP שונה — מציגים אזהרה בלו״ז. */
export function dualAckConflict(ack: DualAck): boolean {
  return (
    ack.playerChoice !== null &&
    ack.parentChoice !== null &&
    ack.playerChoice !== ack.parentChoice
  );
}
