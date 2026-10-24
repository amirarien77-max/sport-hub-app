/**
 * טיפוסי דומיין משותפים (camelCase בצד הלקוח).
 * מיפוי מ־snake_case של Supabase נעשה ב־*-live.ts / SessionContext.
 */
export type Role =
  | 'admin'
  | 'head_coach'
  | 'assistant_coach'
  | 'fitness_coach'
  | 'physio'
  | 'equipment_manager'
  | 'player'
  | 'parent';

export type ConsentStatus = 'active' | 'pending_parental_consent';

export type RsvpChoice = 'attending' | 'not_attending' | null;

export type AttendanceMark = 'present' | 'excused' | 'no_show' | null;

export type PainSeverity = 'soreness' | 'disabling';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface ClubBrand {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  role: Role;
  teamId: string;
  clubId: string;
  dateOfBirth?: string;
  consentStatus: ConsentStatus;
  parentPhone?: string;
}

export interface Team {
  id: string;
  clubId: string;
  name: string;
  inviteCode: string;
  hasFitnessStaff: boolean;
  hasPhysioStaff: boolean;
}

export interface SessionEvent {
  id: string;
  teamId: string;
  title: string;
  startsAt: string;
  location: string;
  type: 'practice' | 'game';
  /** כתובת אולם — shown for games; optional. */
  hallAddress?: string;
  /** מספר טלפון ליצירת קשר — shown for games; optional. */
  contactPhone?: string;
}

/** Recurring weekly grid slot (Israeli week: 0=Sunday … 6=Saturday). */
export type WeekDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeeklyScheduleSlot {
  id: string;
  teamId: string;
  dayOfWeek: WeekDayIndex;
  /** HH:MM (24h) */
  startTime: string;
  /** HH:MM (24h) */
  endTime: string;
  location: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DualAck {
  eventId: string;
  playerId: string;
  playerName?: string;
  playerChoice: RsvpChoice;
  playerReason?: string;
  parentChoice: RsvpChoice;
  parentReason?: string;
}

export interface AttendanceRow {
  eventId: string;
  playerId: string;
  playerName: string;
  mark: AttendanceMark;
}

export interface ReadinessReport {
  id: string;
  playerId: string;
  date: string;
  rpe: number;
  sleepHours: number;
  waterLiters: number;
}

export interface PainReport {
  id: string;
  playerId: string;
  region: string;
  subRegion: string;
  severity: PainSeverity;
  createdAt: string;
}

export interface TacticalPlay {
  id: string;
  teamId: string;
  title: string;
  mediaUrl?: string;
  /** JSON court sketch: markers + arrows (`{"markers":[...],"arrows":[...]}`). */
  boardJson?: string;
  /** Cached Game IQ insight JSON (OpenAI or offline stub). */
  gameIqJson?: string;
  /** Cached AI drill video overlay JSON (timed paths/arrows across the clip). */
  drillOverlayJson?: string;
  allowSuggestions: boolean;
  createdAt: string;
}

export interface PlayAssignment {
  id: string;
  playId: string;
  playerId: string;
  playerName: string;
  positionName: string;
  actionPromptQuestion: string;
  playerAnswer?: string;
}

export interface PlaySuggestion {
  id: string;
  playId: string;
  playerId: string;
  playerName: string;
  suggestionText: string;
  status: SuggestionStatus;
  createdAt: string;
}

export interface CarpoolOffer {
  id: string;
  eventId: string;
  parentId: string;
  parentName: string;
  seatsAvailable: number;
  seatsTaken: number;
}

export interface UrgentBanner {
  id: string;
  teamId: string;
  message: string;
  requiresAck: boolean;
  acknowledgedBy: string[];
}
