/**
 * SessionContext — מקור האמת בצד הלקוח לכל מודולי ה־PRD.
 *
 * מצבי הפעלה:
 * - דמו: isDemoMode → נתונים מ־demo-data, בלי auth אמיתי.
 * - live: hydrate מ־auth + users/teams/clubs, ואז באנדלים (לו״ז / בריאות / טקטי).
 *
 * דורות (scheduleGen / tacticalGen / healthGen / hydrateGen): מונעים ש־fetch איטי
 * ידרוס create/answer חדשים. tacticalGen מקופץ לפני כתיבה מקומית אחרי createPlay.
 * אל תשנו את הסדר הזה בלי להבין את מרוצי ה־hydrate.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  listPendingConsentPlayers,
  markParentalConsentLive,
  requestParentalConsentSms,
  type PendingConsentPlayer,
} from '@/lib/consent-live';
import {
  DEMO_INVITE_CODE,
  demoAcks,
  demoAssignments,
  demoAttendance,
  demoBanner,
  demoCarpools,
  demoContacts,
  demoEvents,
  demoPain,
  demoPlays,
  demoReadiness,
  demoSuggestions,
  demoTeam,
  demoUsers,
  demoWeeklySlots,
  isUnder13,
  resolveInvite,
} from '@/lib/demo-data';
import {
  createTeamContactLive,
  deleteTeamContactLive,
  fetchTeamContactsLive,
  updateTeamContactLive,
} from '@/lib/contacts-live';
import { normalizeInviteCode } from '@/lib/invite-codes';
import {
  clearPendingInvite,
  loadPendingInvite,
  savePendingInvite,
} from '@/lib/pending-invite';
import {
  fetchHealthBundle,
  insertPainLive,
  upsertReadinessLive,
} from '@/lib/health-live';
import { isAttendanceCoach, isHealthStaff, isTacticalCoach } from '@/lib/roles';
import {
  acknowledgeUrgentBanner,
  claimCarpoolSeatLive,
  createCarpoolOfferLive,
  createEventLive,
  createUrgentBannerLive,
  ensureParentPlayerLink,
  fetchLinkedChildIds,
  fetchScheduleBundle,
  lockAttendanceRecords,
  updateEventLive,
  upsertAttendanceMark,
  upsertRsvp,
  type EventWriteInput,
} from '@/lib/schedule-live';
import {
  deleteWeeklySlot as deleteWeeklySlotLive,
  fetchWeeklySchedule,
  insertWeeklySlot,
  updateWeeklySlot,
  type WeeklySlotInput,
} from '@/lib/weekly-schedule-live';
import {
  answerAssignmentLive,
  createAssignmentLive,
  createPlayLive,
  fetchTacticalBundle,
  reviewSuggestionLive,
  submitSuggestionLive,
  updatePlayLive,
} from '@/lib/tactical-live';
import { ABSENCE_REASON_KEYS, t, translateRole } from '@/i18n';
import { getAuthEmailRedirectTo } from '@/lib/auth-redirect';
import { isDemoMode, supabase } from '@/lib/supabase';
import type {
  AttendanceMark,
  AttendanceRow,
  CarpoolOffer,
  DualAck,
  PainReport,
  PainSeverity,
  PlayAssignment,
  PlaySuggestion,
  ReadinessReport,
  RsvpChoice,
  SessionEvent,
  SuggestionStatus,
  TacticalPlay,
  Team,
  TeamContact,
  UrgentBanner,
  UserProfile,
  WeeklyScheduleSlot,
  WeekDayIndex,
  Role,
  ConsentStatus,
  ClubBrand,
} from '@/types';
import { useTheme } from '@/theme/ThemeContext';

type EventMutationResult = { ok: true; event: SessionEvent } | { ok: false; error: string };

type OkOrError = { ok: true; note?: string } | { ok: false; error: string };
type CreatePlayResult = { ok: true; playId: string } | { ok: false; error: string };

const EMPTY_BANNER: UrgentBanner = {
  id: '',
  teamId: '',
  message: '',
  requiresAck: false,
  acknowledgedBy: [],
};

type SessionContextValue = {
  user: UserProfile | null;
  team: Team | null;
  events: SessionEvent[];
  acks: DualAck[];
  attendance: AttendanceRow[];
  weeklySlots: WeeklyScheduleSlot[];
  readiness: ReadinessReport[];
  pain: PainReport[];
  plays: TacticalPlay[];
  assignments: PlayAssignment[];
  suggestions: PlaySuggestion[];
  carpools: CarpoolOffer[];
  contacts: TeamContact[];
  banner: UrgentBanner;
  absenceReasons: readonly string[];
  onboarded: boolean;
  authReady: boolean;
  authUserId: string | null;
  inviteOk: boolean;
  redeemInvite: (code: string) => Promise<OkOrError> | OkOrError;
  completeOnboarding: (input: {
    fullName: string;
    role: UserProfile['role'];
    dateOfBirth?: string;
    parentPhone?: string;
    /** When join screen still needs a code (skipped invite / hydrate wipe). */
    inviteCode?: string;
  }) => Promise<OkOrError> | OkOrError;
  signIn: (email: string, password: string) => Promise<OkOrError>;
  signUp: (email: string, password: string) => Promise<OkOrError>;
  setRsvp: (
    eventId: string,
    choice: RsvpChoice,
    reason?: string,
    asParent?: boolean,
  ) => void | Promise<void>;
  cycleAttendance: (playerId: string, eventId: string) => void | Promise<void>;
  lockAttendance: (eventId: string) => string[] | Promise<string[]>;
  healthPlayers: { id: string; fullName: string }[];
  submitReadiness: (
    rpe: number,
    sleepHours: number,
    waterLiters: number,
  ) => Promise<OkOrError> | OkOrError;
  submitPain: (
    region: string,
    subRegion: string,
    severity: PainSeverity,
  ) => Promise<OkOrError> | OkOrError;
  refreshHealth: () => Promise<void>;
  refreshTactical: () => Promise<void>;
  tacticalPlayers: { id: string; fullName: string }[];
  createPlay: (title: string) => Promise<CreatePlayResult>;
  updatePlayMedia: (playId: string, mediaUrl: string) => Promise<OkOrError>;
  updatePlayVoiceover: (playId: string, voiceoverUrl: string | null) => Promise<OkOrError>;
  updatePlayBoard: (playId: string, boardJson: string) => Promise<OkOrError>;
  cachePlayGameIq: (playId: string, gameIqJson: string) => Promise<OkOrError>;
  cachePlayDrillOverlay: (playId: string, drillOverlayJson: string) => Promise<OkOrError>;
  createAssignment: (input: {
    playId: string;
    playerId: string;
    positionName: string;
    actionPromptQuestion: string;
  }) => Promise<OkOrError>;
  togglePlaySuggestions: (playId: string) => void | Promise<OkOrError>;
  answerAssignment: (assignmentId: string, answer: string) => void | Promise<OkOrError>;
  submitSuggestion: (playId: string, text: string) => void | Promise<OkOrError>;
  reviewSuggestion: (id: string, status: SuggestionStatus) => void | Promise<OkOrError>;
  claimCarpoolSeat: (
    offerId: string,
  ) =>
    | Promise<{ ok: true; seatsTaken: number; seatsAvailable: number } | { ok: false; reason: 'full' | 'not_found' | 'error'; message?: string }>
    | { ok: true; seatsTaken: number; seatsAvailable: number }
    | { ok: false; reason: 'full' | 'not_found' | 'error'; message?: string };
  /** Parent-only: create a carpool offer for an event. */
  createCarpoolOffer: (
    eventId: string,
    seatsAvailable: number,
    extras?: { departureLocation?: string; pickupPoints?: string },
  ) =>
    | Promise<
        | { ok: true; offer: CarpoolOffer }
        | { ok: false; reason: 'error'; message?: string }
      >
    | { ok: true; offer: CarpoolOffer }
    | { ok: false; reason: 'error'; message?: string };
  /** Coach CRUD for דף קשר; parents/players read via contacts. */
  upsertTeamContact: (input: {
    id?: string;
    roleLabel: string;
    fullName: string;
    phone?: string;
    isHeadCoach?: boolean;
    sortOrder?: number;
  }) => Promise<OkOrError> | OkOrError;
  deleteTeamContact: (id: string) => Promise<OkOrError> | OkOrError;
  /** In-app message to a directory contact (demo queue / stub). */
  sendInAppContactMessage: (
    contactId: string,
    body: string,
  ) => Promise<OkOrError> | OkOrError;
  /** Coach CRUD for recurring weekly schedule rows; players/parents read via weeklySlots. */
  upsertWeeklySlot: (
    input: WeeklySlotInput & { id?: string },
  ) => Promise<OkOrError> | OkOrError;
  deleteWeeklySlot: (slotId: string) => Promise<OkOrError> | OkOrError;
  acknowledgeBanner: () => void | Promise<void>;
  /** Head coach: compose urgent team message + refresh ack roster source. */
  composeUrgentBanner: (message: string) => Promise<OkOrError>;
  /** Re-fetch events / RSVP / attendance / carpool / urgent banner / weekly slots. */
  refreshTeamSchedule: () => Promise<void>;
  switchDemoRole: (role: UserProfile['role']) => void;
  /** Demo-only: flip team fitness/physio flags to test head-coach inheritance. */
  toggleDemoMedicalStaff: (kind: 'fitness' | 'physio') => void;
  /** Coach: under-13 players awaiting parental SMS consent. */
  refreshPendingConsent: () => Promise<PendingConsentPlayer[]>;
  markPlayerConsented: (playerId: string) => Promise<OkOrError>;
  resendParentalConsentSms: (player: PendingConsentPlayer) => Promise<OkOrError>;
  /** Staff: create practice/game (includes hall address + contact phone). */
  createSessionEvent: (input: EventWriteInput) => Promise<EventMutationResult>;
  /** Staff: update event fields including venue contact. */
  updateSessionEvent: (
    input: Partial<EventWriteInput> & { id: string },
  ) => Promise<EventMutationResult>;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function mapUserRow(row: {
  id: string;
  full_name: string;
  role: Role;
  team_id: string;
  club_id: string;
  date_of_birth?: string | null;
  parent_phone?: string | null;
  consent_status: ConsentStatus;
}): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    teamId: row.team_id,
    clubId: row.club_id,
    dateOfBirth: row.date_of_birth ?? undefined,
    parentPhone: row.parent_phone ?? undefined,
    consentStatus: row.consent_status,
  };
}

function mapTeamRow(row: {
  id: string;
  club_id: string;
  name: string;
  invite_code: string;
  has_fitness_staff: boolean | null;
  has_physio_staff: boolean | null;
}): Team {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    inviteCode: row.invite_code,
    hasFitnessStaff: Boolean(row.has_fitness_staff),
    hasPhysioStaff: Boolean(row.has_physio_staff),
  };
}

function mapClubRow(row: {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url?: string | null;
}): ClubBrand {
  return {
    id: row.id,
    name: row.name,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_url ?? undefined,
  };
}

function nextAttendanceMark(mark: AttendanceMark): AttendanceMark {
  const order: AttendanceMark[] = [null, 'present', 'excused', 'no_show'];
  const idx = order.indexOf(mark);
  return order[(idx + 1) % order.length];
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setBrand, clearBrand, brand } = useTheme();
  const [authReady, setAuthReady] = useState(isDemoMode);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>(isDemoMode ? demoEvents : []);
  const [acks, setAcks] = useState<DualAck[]>(isDemoMode ? demoAcks : []);
  const [attendance, setAttendance] = useState<AttendanceRow[]>(
    isDemoMode ? demoAttendance : [],
  );
  const [weeklySlots, setWeeklySlots] = useState<WeeklyScheduleSlot[]>(
    isDemoMode ? demoWeeklySlots : [],
  );
  const [readiness, setReadiness] = useState<ReadinessReport[]>(
    isDemoMode ? demoReadiness : [],
  );
  const [pain, setPain] = useState<PainReport[]>(isDemoMode ? demoPain : []);
  const [healthPlayers, setHealthPlayers] = useState<{ id: string; fullName: string }[]>(
    isDemoMode
      ? demoUsers.filter((u) => u.role === 'player').map((u) => ({ id: u.id, fullName: u.fullName }))
      : [],
  );
  const [plays, setPlays] = useState<TacticalPlay[]>(isDemoMode ? demoPlays : []);
  const [assignments, setAssignments] = useState<PlayAssignment[]>(
    isDemoMode ? demoAssignments : [],
  );
  const [suggestions, setSuggestions] = useState<PlaySuggestion[]>(
    isDemoMode ? demoSuggestions : [],
  );
  const [tacticalPlayers, setTacticalPlayers] = useState<{ id: string; fullName: string }[]>(
    isDemoMode
      ? demoUsers.filter((u) => u.role === 'player').map((u) => ({ id: u.id, fullName: u.fullName }))
      : [],
  );
  const [carpools, setCarpools] = useState<CarpoolOffer[]>(isDemoMode ? demoCarpools : []);
  const [contacts, setContacts] = useState<TeamContact[]>(isDemoMode ? demoContacts : []);
  const contactMessagesRef = useRef<{ contactId: string; body: string; at: string }[]>([]);
  const [banner, setBanner] = useState<UrgentBanner>(isDemoMode ? demoBanner : EMPTY_BANNER);

  /** Monotonic gens so a slow hydrate fetch cannot wipe a newer create/answer. */
  const scheduleGen = useRef(0);
  const tacticalGen = useRef(0);
  const healthGen = useRef(0);
  const hydrateGenRef = useRef(0);
  /** signIn/signUp already await hydrate — ignore the matching SIGNED_IN event. */
  const skipNextSignedIn = useRef(false);

  const refreshSchedule = useCallback(async (teamId: string) => {
    if (isDemoMode || !supabase) return;
    const gen = ++scheduleGen.current;
    try {
      const [bundle, slots] = await Promise.all([
        fetchScheduleBundle(supabase, teamId),
        fetchWeeklySchedule(supabase, teamId).catch((err) => {
          console.warn(
            'Failed to load weekly schedule',
            err instanceof Error ? err.message : err,
          );
          return [] as WeeklyScheduleSlot[];
        }),
      ]);
      if (gen !== scheduleGen.current) return;
      setEvents(bundle.events);
      setAcks(bundle.acks);
      setAttendance(bundle.attendance);
      setCarpools(bundle.carpools);
      setBanner(bundle.banner ?? EMPTY_BANNER);
      setWeeklySlots(slots);
      try {
        const nextContacts = await fetchTeamContactsLive(supabase, teamId);
        if (gen === scheduleGen.current) setContacts(nextContacts);
      } catch (err) {
        console.warn(
          'Failed to load team contacts',
          err instanceof Error ? err.message : err,
        );
      }
    } catch (err) {
      console.warn('Failed to load schedule', err instanceof Error ? err.message : err);
    }
  }, []);

  const refreshTacticalFor = useCallback(async (teamId: string) => {
    if (isDemoMode || !supabase) return;
    const gen = ++tacticalGen.current;
    try {
      const bundle = await fetchTacticalBundle(supabase, teamId);
      if (gen !== tacticalGen.current) return;
      setPlays(bundle.plays);
      setAssignments(bundle.assignments);
      setSuggestions(bundle.suggestions);
      setTacticalPlayers(bundle.players);
    } catch (err) {
      console.warn('Failed to load tactical', err instanceof Error ? err.message : err);
    }
  }, []);

  const refreshTactical = useCallback(async () => {
    if (!team) return;
    await refreshTacticalFor(team.id);
  }, [refreshTacticalFor, team]);

  const refreshHealthFor = useCallback(async (profile: UserProfile, teamId: string) => {
    if (isDemoMode || !supabase) return;

    const gen = ++healthGen.current;
    try {
      // Parent: only linked child(ren) — never other players (Checkpoint 3).
      if (profile.role === 'parent') {
        let childIds = await fetchLinkedChildIds(supabase, profile.id);
        if (childIds.length === 0) {
          const linked = await ensureParentPlayerLink(supabase, profile.id, teamId);
          childIds = linked ? [linked] : [];
        }
        if (childIds.length === 0) {
          if (gen !== healthGen.current) return;
          setReadiness([]);
          setPain([]);
          setHealthPlayers([]);
          return;
        }
        const bundle = await fetchHealthBundle(supabase, {
          teamId,
          asStaff: false,
          playerIds: childIds,
        });
        if (gen !== healthGen.current) return;
        const allowed = new Set(childIds);
        setReadiness(bundle.readiness.filter((r) => allowed.has(r.playerId)));
        setPain(bundle.pain.filter((p) => allowed.has(p.playerId)));
        setHealthPlayers(bundle.players.filter((p) => allowed.has(p.id)));
        return;
      }

      const asStaff = isHealthStaff(profile.role);
      const bundle = await fetchHealthBundle(supabase, { teamId, asStaff });
      if (gen !== healthGen.current) return;
      if (profile.role === 'player') {
        setReadiness(bundle.readiness.filter((r) => r.playerId === profile.id));
        setPain(bundle.pain.filter((p) => p.playerId === profile.id));
        setHealthPlayers([{ id: profile.id, fullName: profile.fullName }]);
      } else {
        setReadiness(bundle.readiness);
        setPain(bundle.pain);
        setHealthPlayers(bundle.players);
      }
    } catch (err) {
      console.warn('Failed to load health', err instanceof Error ? err.message : err);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    if (!user || !team) return;
    await refreshHealthFor(user, team.id);
  }, [refreshHealthFor, team, user]);

  const teamId = team?.id;
  const refreshTeamSchedule = useCallback(async () => {
    if (!teamId) return;
    await refreshSchedule(teamId);
  }, [refreshSchedule, teamId]);

  // ── Hydrate: auth → profile → team → brand → באנדלים ברקע (לא חוסם authReady) ──
  const hydrateFromAuth = useCallback(
    async (session: Session | null) => {
      if (!supabase || isDemoMode) {
        setAuthUserId(null);
        setAuthReady(true);
        return;
      }

      const myHydrate = ++hydrateGenRef.current;
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
        if (myHydrate !== hydrateGenRef.current) return;
        setUser(null);
        setTeam(null);
        setInviteOk(false);
        setEvents([]);
        setAcks([]);
        setAttendance([]);
        setCarpools([]);
        setBanner(EMPTY_BANNER);
        setReadiness([]);
        setPain([]);
        setHealthPlayers([]);
        setPlays([]);
        setAssignments([]);
        setSuggestions([]);
        setTacticalPlayers([]);
        clearBrand();
        setAuthReady(true);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', uid)
          .maybeSingle();

        if (myHydrate !== hydrateGenRef.current) return;

        if (error) {
          console.warn('Failed to load profile', error.message);
        }

        if (!profile) {
          // New account still needs invite/profile — clear local user only.
          // Keep / restore pending invite so TOKEN_REFRESHED mid-onboarding does
          // not wipe redeemInvite and leave ProfileSetup with «הזינו קוד הזמנה קודם».
          setUser(null);

          const pending = await loadPendingInvite(uid);
          if (myHydrate !== hydrateGenRef.current) return;

          if (pending) {
            const { data: pendingTeam } = await supabase
              .from('teams')
              .select('*')
              .eq('id', pending.teamId)
              .maybeSingle();

            if (myHydrate !== hydrateGenRef.current) return;

            if (pendingTeam) {
              const mappedPending = mapTeamRow(pendingTeam);
              setTeam(mappedPending);
              setInviteOk(true);
              const { data: pendingClub } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', mappedPending.clubId)
                .maybeSingle();
              if (myHydrate !== hydrateGenRef.current) return;
              if (pendingClub) setBrand(mapClubRow(pendingClub));
              setAuthReady(true);
              return;
            }
            await clearPendingInvite(uid);
          }

          // No durable pending invite: leave in-memory redeem intact if present
          // (same session after Invite → Profile before AsyncStorage flush).
          setAuthReady(true);
          return;
        }

        const mapped = mapUserRow(profile);

        const { data: teamRow, error: teamErr } = await supabase
          .from('teams')
          .select('*')
          .eq('id', mapped.teamId)
          .maybeSingle();

        if (myHydrate !== hydrateGenRef.current) return;

        if (teamErr) {
          console.warn('Failed to load team', teamErr.message);
        }

        // Apply user+team together so coach create UI never mounts with team=null
        // (createPlay then fails; Alert is a no-op on web → looks like a dead tap).
        const mappedTeam = teamRow ? mapTeamRow(teamRow) : null;
        setUser(mapped);
        setTeam(mappedTeam);
        setInviteOk(Boolean(mappedTeam));
        if (mappedTeam) {
          void clearPendingInvite(uid);
        }
        setAuthReady(true);

        const { data: clubRow } = await supabase
          .from('clubs')
          .select('*')
          .eq('id', mapped.clubId)
          .maybeSingle();

        if (myHydrate !== hydrateGenRef.current) return;

        if (clubRow) {
          setBrand(mapClubRow(clubRow));
        }

        // Bundle loads must NOT block authReady — a hung RLS query previously
        // left the app on an infinite spinner after login.
        if (mappedTeam) {
          void Promise.all([
            refreshSchedule(mappedTeam.id),
            refreshHealthFor(mapped, mappedTeam.id),
            refreshTacticalFor(mappedTeam.id),
          ]).catch((err) => {
            console.warn(
              'post-hydrate bundle refresh failed',
              err instanceof Error ? err.message : err,
            );
          });
        }
      } catch (err) {
        console.warn('hydrateFromAuth failed', err instanceof Error ? err.message : err);
        if (myHydrate === hydrateGenRef.current) setAuthReady(true);
      }
    },
    [clearBrand, refreshHealthFor, refreshSchedule, refreshTacticalFor, setBrand],
  );

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    // INITIAL_SESSION covers cold start. SIGNED_IN from our signIn/signUp is skipped
    // (those paths await hydrate). Avoid double-fetch races that wiped new plays.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_IN' && skipNextSignedIn.current) {
        skipNextSignedIn.current = false;
        return;
      }
      void hydrateFromAuth(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateFromAuth]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        return { ok: false, error: t('errors.demoAuthDisabled') };
      }
      if (!email.trim() || !password) {
        return { ok: false, error: t('errors.emailPasswordRequired') };
      }
      skipNextSignedIn.current = true;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        skipNextSignedIn.current = false;
        return { ok: false, error: error.message };
      }
      // Hydrate profile+team before navigation so index does not send coaches to invite.
      await hydrateFromAuth(data.session);
      return { ok: true };
    },
    [hydrateFromAuth],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        return { ok: false, error: t('errors.demoAuthDisabled') };
      }
      if (!email.trim() || password.length < 6) {
        return { ok: false, error: t('errors.weakPassword') };
      }
      skipNextSignedIn.current = true;
      const emailRedirectTo = getAuthEmailRedirectTo();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo },
      });
      if (error) {
        skipNextSignedIn.current = false;
        return { ok: false, error: error.message };
      }
      await hydrateFromAuth(data.session);
      // Confirm-email ON → session is null until the user clicks the link.
      if (!data.session) {
        skipNextSignedIn.current = false;
        return { ok: true, note: t('auth.checkEmail') };
      }
      return { ok: true };
    },
    [hydrateFromAuth],
  );

  // ── Onboarding: הזמנה → פרופיל (+ SMS להורה אם מתחת ל־13) ──
  const redeemInvite = useCallback(
    async (code: string): Promise<OkOrError> => {
      // HAP-U16-2026 canonical; MAC-U16-2026 legacy alias → same team.
      const normalized = normalizeInviteCode(code);

      if (isDemoMode || !supabase) {
        const brand = resolveInvite(normalized);
        if (!brand) {
          return { ok: false, error: t('errors.invalidInviteDemo') };
        }
        setBrand(brand);
        setTeam(demoTeam);
        setInviteOk(true);
        return { ok: true };
      }

      if (!authUserId) {
        return { ok: false, error: t('errors.signInBeforeInvite') };
      }

      const { data: teamRow, error } = await supabase
        .from('teams')
        .select('*')
        .eq('invite_code', normalized)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!teamRow) {
        return {
          ok: false,
          error: t('errors.invalidInviteLive'),
        };
      }

      const mappedTeam = mapTeamRow(teamRow);
      setTeam(mappedTeam);
      setInviteOk(true);
      await savePendingInvite(authUserId, {
        inviteCode: normalized,
        teamId: mappedTeam.id,
      });

      const { data: clubRow } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', mappedTeam.clubId)
        .maybeSingle();

      if (clubRow) setBrand(mapClubRow(clubRow));

      return { ok: true };
    },
    [authUserId, setBrand],
  );

  const completeOnboarding = useCallback(
    async (input: {
      fullName: string;
      role: UserProfile['role'];
      dateOfBirth?: string;
      parentPhone?: string;
      inviteCode?: string;
    }): Promise<OkOrError> => {
      // Inline redeem when join screen still needs a code (skipped invite / hydrate wipe).
      if ((!inviteOk || !team) && input.inviteCode?.trim()) {
        const redeemed = await redeemInvite(input.inviteCode);
        if (!redeemed.ok) return redeemed;
      }

      // redeemInvite setState is async — resolve the team from the code for this call.
      let activeTeam = team;
      if ((!inviteOk || !activeTeam) && input.inviteCode?.trim()) {
        if (isDemoMode || !supabase) {
          const brandResolved = resolveInvite(normalizeInviteCode(input.inviteCode));
          if (!brandResolved) {
            return { ok: false, error: t('errors.redeemInviteFirst') };
          }
          activeTeam = demoTeam;
        } else {
          const normalized = normalizeInviteCode(input.inviteCode);
          const { data: teamRow } = await supabase
            .from('teams')
            .select('*')
            .eq('invite_code', normalized)
            .maybeSingle();
          if (!teamRow) {
            return { ok: false, error: t('errors.redeemInviteFirst') };
          }
          activeTeam = mapTeamRow(teamRow);
        }
      }

      if (!activeTeam) {
        return { ok: false, error: t('errors.redeemInviteFirst') };
      }
      if (!input.fullName.trim()) {
        return { ok: false, error: t('errors.nameRequired') };
      }
      const under13 = input.role === 'player' && isUnder13(input.dateOfBirth);
      if (under13 && !input.parentPhone?.trim()) {
        return { ok: false, error: t('errors.under13Phone') };
      }

      if (isDemoMode || !supabase) {
        const profile: UserProfile = {
          id: `user-local-${Date.now()}`,
          fullName: input.fullName.trim(),
          role: input.role,
          teamId: activeTeam.id,
          clubId: activeTeam.clubId,
          dateOfBirth: input.dateOfBirth,
          parentPhone: input.parentPhone,
          consentStatus: under13 ? 'pending_parental_consent' : 'active',
        };
        setUser(profile);
        let note: string | undefined;
        if (under13 && input.parentPhone?.trim()) {
          const sms = await requestParentalConsentSms({
            client: null,
            playerId: profile.id,
            teamId: activeTeam.id,
            parentPhone: input.parentPhone.trim(),
            playerName: profile.fullName,
            clubName: brand.name,
          });
          note = sms.ok
            ? sms.mode === 'twilio'
              ? t('profileSetup.smsSent')
              : t('profileSetup.smsSimulated')
            : t('profileSetup.smsPendingNote');
        }
        return { ok: true, note };
      }

      if (!authUserId) {
        return { ok: false, error: t('errors.signInBeforeProfile') };
      }

      const payload = {
        auth_id: authUserId,
        club_id: activeTeam.clubId,
        team_id: activeTeam.id,
        full_name: input.fullName.trim(),
        role: input.role,
        date_of_birth: input.dateOfBirth || null,
        parent_phone: input.parentPhone?.trim() || null,
        consent_status: (under13 ? 'pending_parental_consent' : 'active') as ConsentStatus,
      };

      const { data, error } = await supabase.from('users').insert(payload).select('*').single();
      if (error) return { ok: false, error: error.message };

      await clearPendingInvite(authUserId);

      const mappedUser = mapUserRow(data);
      setUser(mappedUser);
      setTeam(activeTeam);
      setInviteOk(true);

      // Seed roster profile row so sizes UI works on first open (upsert is idempotent).
      if (mappedUser.role === 'player') {
        void supabase
          .from('team_players')
          .upsert(
            {
              player_id: mappedUser.id,
              team_id: activeTeam.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'player_id' },
          )
          .then(({ error: tpErr }) => {
            if (tpErr) {
              console.warn('team_players seed failed', tpErr.message);
            }
          });
      }

      // Do NOT await schedule/health/tactical bundles here — a hung RLS query left
      // profile setup on an infinite spinner after insert (user row already saved).
      // Same pattern as hydrateFromAuth post-ready refresh.
      void Promise.all([
        refreshSchedule(activeTeam.id),
        refreshHealthFor(mappedUser, activeTeam.id),
        refreshTacticalFor(activeTeam.id),
      ]).catch((err) => {
        console.warn(
          'post-onboarding bundle refresh failed',
          err instanceof Error ? err.message : err,
        );
      });

      // Refresh team flags after role insert (fitness/physio trigger) — non-blocking.
      void supabase
        .from('teams')
        .select('*')
        .eq('id', activeTeam.id)
        .maybeSingle()
        .then(({ data: freshTeam }) => {
          if (freshTeam) setTeam(mapTeamRow(freshTeam));
        });

      let note: string | undefined;
      if (under13 && mappedUser.parentPhone) {
        const sms = await requestParentalConsentSms({
          client: supabase,
          playerId: mappedUser.id,
          teamId: activeTeam.id,
          parentPhone: mappedUser.parentPhone,
          playerName: mappedUser.fullName,
          clubName: brand.name,
        });
        note = sms.ok
          ? sms.mode === 'twilio'
            ? t('profileSetup.smsSent')
            : t('profileSetup.smsSimulated')
          : t('profileSetup.smsPendingNote');
      }

      return { ok: true, note };
    },
    [
      authUserId,
      brand.name,
      inviteOk,
      redeemInvite,
      refreshHealthFor,
      refreshSchedule,
      refreshTacticalFor,
      team,
      setBrand,
    ],
  );

  const refreshPendingConsent = useCallback(async (): Promise<PendingConsentPlayer[]> => {
    if (!team || !isAttendanceCoach(user?.role)) return [];
    if (isDemoMode || !supabase) {
      return demoUsers
        .filter((u) => u.consentStatus === 'pending_parental_consent' && u.role === 'player')
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          parentPhone: u.parentPhone ?? null,
          consentStatus: u.consentStatus,
        }));
    }
    try {
      return await listPendingConsentPlayers(supabase, team.id);
    } catch (err) {
      console.warn('refreshPendingConsent', err instanceof Error ? err.message : err);
      return [];
    }
  }, [team, user?.role]);

  const markPlayerConsented = useCallback(
    async (playerId: string): Promise<OkOrError> => {
      if (!isAttendanceCoach(user?.role)) {
        return { ok: false, error: 'not_staff' };
      }
      if (isDemoMode || !supabase) {
        return { ok: true, note: t('profile.markConsentedDone') };
      }
      try {
        await markParentalConsentLive(supabase, playerId);
        return { ok: true, note: t('profile.markConsentedDone') };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [user?.role],
  );

  const resendParentalConsentSms = useCallback(
    async (player: PendingConsentPlayer): Promise<OkOrError> => {
      if (!team || !player.parentPhone) {
        return { ok: false, error: t('errors.under13Phone') };
      }
      const sms = await requestParentalConsentSms({
        client: isDemoMode ? null : supabase,
        playerId: player.id,
        teamId: team.id,
        parentPhone: player.parentPhone,
        playerName: player.fullName,
        clubName: brand.name,
      });
      if (!sms.ok) return { ok: false, error: sms.error };
      return {
        ok: true,
        note: sms.mode === 'twilio' ? t('profileSetup.smsSent') : t('profileSetup.smsSimulated'),
      };
    },
    [brand.name, team],
  );

  // ── מודול 2: Dual-Ack / נוכחות / carpool / באנר ──
  const setRsvp = useCallback(
    async (eventId: string, choice: RsvpChoice, reason?: string, asParent = false) => {
      if (!user) return;

      const parentMode = asParent || user.role === 'parent';
      let playerId = user.id;
      let playerName = user.fullName;

      if (isDemoMode || !supabase) {
        playerId =
          user.role === 'parent' || user.id.startsWith('user-local')
            ? 'user-player-roi'
            : user.id;
        playerName =
          demoUsers.find((u) => u.id === playerId)?.fullName ?? user.fullName;
      } else if (parentMode) {
        const linked = await ensureParentPlayerLink(supabase, user.id, user.teamId);
        if (!linked) {
          console.warn('No team player to link for parent RSVP');
          return;
        }
        playerId = linked;
        const { data: playerRow } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', linked)
          .maybeSingle();
        playerName = (playerRow?.full_name as string | undefined) ?? playerName;
      }

      setAcks((prev) => {
        const existing = prev.find((a) => a.eventId === eventId && a.playerId === playerId);
        if (!existing) {
          const next: DualAck = {
            eventId,
            playerId,
            playerName,
            playerChoice: parentMode ? null : choice,
            parentChoice: parentMode ? choice : null,
            playerReason: parentMode ? undefined : reason,
            parentReason: parentMode ? reason : undefined,
          };
          return [...prev, next];
        }
        return prev.map((a) => {
          if (a.eventId !== eventId || a.playerId !== playerId) return a;
          if (parentMode) {
            return { ...a, playerName: a.playerName ?? playerName, parentChoice: choice, parentReason: reason };
          }
          return {
            ...a,
            playerName: a.playerName ?? playerName,
            playerChoice: choice,
            playerReason: reason,
          };
        });
      });

      if (!isDemoMode && supabase) {
        try {
          await upsertRsvp(supabase, {
            eventId,
            playerId,
            asParent: parentMode,
            choice,
            reason,
          });
        } catch (err) {
          console.warn('RSVP save failed', err instanceof Error ? err.message : err);
        }
      }
    },
    [user],
  );

  const cycleAttendance = useCallback(async (playerId: string, eventId: string) => {
    const current = attendance.find((r) => r.playerId === playerId && r.eventId === eventId);
    const mark = nextAttendanceMark(current?.mark ?? null);
    const playerName =
      current?.playerName ??
      healthPlayers.find((p) => p.id === playerId)?.fullName ??
      tacticalPlayers.find((p) => p.id === playerId)?.fullName ??
      playerId;

    setAttendance((prev) => {
      const exists = prev.some((row) => row.playerId === playerId && row.eventId === eventId);
      if (!exists) {
        return [...prev, { eventId, playerId, playerName, mark }];
      }
      return prev.map((row) =>
        row.playerId === playerId && row.eventId === eventId ? { ...row, mark } : row,
      );
    });

    if (!isDemoMode && supabase) {
      try {
        await upsertAttendanceMark(supabase, eventId, playerId, mark);
      } catch (err) {
        console.warn('Attendance save failed', err instanceof Error ? err.message : err);
      }
    }
  }, [attendance, healthPlayers, tacticalPlayers]);

  const lockAttendance = useCallback(
    async (eventId: string) => {
      const rows = attendance.filter((r) => r.eventId === eventId);
      const noShows = rows.filter((r) => r.mark === 'no_show').map((r) => r.playerName);

      if (!isDemoMode && supabase) {
        try {
          for (const row of rows) {
            await upsertAttendanceMark(supabase, eventId, row.playerId, row.mark);
          }
          await lockAttendanceRecords(supabase, eventId);
        } catch (err) {
          console.warn('Attendance lock failed', err instanceof Error ? err.message : err);
        }
      }

      return noShows;
    },
    [attendance],
  );

  // ── מודול 3: מוכנות + כאב (שחקן כותב; צוות קורא דרך refreshHealth) ──
  const submitReadiness = useCallback(
    async (rpe: number, sleepHours: number, waterLiters: number): Promise<OkOrError> => {
      if (!user) return { ok: false, error: t('errors.signInBeforeProfile') };
      if (user.role !== 'player') {
        return { ok: false, error: t('health.playersOnlyWrite') };
      }
      const clamp24 = (n: number) => Math.min(24, Math.max(0, n));
      const sleep = clamp24(sleepHours);
      const water = clamp24(waterLiters);
      const today = new Date().toISOString().slice(0, 10);

      if (isDemoMode || !supabase) {
        setReadiness((prev) => [
          {
            id: `ready-${Date.now()}`,
            playerId: user.id,
            date: today,
            rpe,
            sleepHours: sleep,
            waterLiters: water,
          },
          ...prev.filter((r) => !(r.playerId === user.id && r.date === today)),
        ]);
        return { ok: true };
      }

      try {
        const saved = await upsertReadinessLive(supabase, {
          playerId: user.id,
          rpe,
          sleepHours: sleep,
          waterLiters: water,
          reportDate: today,
        });
        setReadiness((prev) => [
          saved,
          ...prev.filter((r) => !(r.playerId === saved.playerId && r.date === saved.date)),
        ]);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Readiness save failed', message);
        return { ok: false, error: message };
      }
    },
    [user],
  );

  const submitPain = useCallback(
    async (
      region: string,
      subRegion: string,
      severity: PainSeverity,
    ): Promise<OkOrError> => {
      if (!user) return { ok: false, error: t('errors.signInBeforeProfile') };
      if (user.role !== 'player') {
        return { ok: false, error: t('health.playersOnlyWrite') };
      }

      if (isDemoMode || !supabase) {
        setPain((prev) => [
          {
            id: `pain-${Date.now()}`,
            playerId: user.id,
            region,
            subRegion,
            severity,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        return { ok: true };
      }

      try {
        const saved = await insertPainLive(supabase, {
          playerId: user.id,
          region,
          subRegion,
          severity,
        });
        setPain((prev) => [saved, ...prev]);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Pain save failed', message);
        return { ok: false, error: message };
      }
    },
    [user],
  );

  // ── מודול 4: יצירת תרגיל / לוח / שיבוץ / תשובה / Game IQ cache ──
  const createPlay = useCallback(
    async (title: string): Promise<CreatePlayResult> => {
      if (!user) {
        return { ok: false, error: t('errors.signInBeforeProfile') };
      }
      if (!team) {
        return { ok: false, error: t('errors.redeemInviteFirst') };
      }
      if (!isTacticalCoach(user.role)) {
        return { ok: false, error: t('plays.coachOnlyCreate') };
      }
      if (!title.trim()) {
        return { ok: false, error: t('errors.playTitleRequired') };
      }

      if (isDemoMode || !supabase) {
        const play: TacticalPlay = {
          id: `play-${Date.now()}`,
          teamId: team.id,
          title: title.trim(),
          allowSuggestions: true,
          boardJson: '{"markers":[]}',
          createdAt: new Date().toISOString(),
        };
        // Invalidate in-flight tactical fetches so they cannot drop this play.
        tacticalGen.current += 1;
        setPlays((prev) => [play, ...prev.filter((p) => p.id !== play.id)]);
        return { ok: true, playId: play.id };
      }

      try {
        const play = await createPlayLive(supabase, {
          teamId: team.id,
          title,
          boardJson: '{"markers":[]}',
        });
        // Bump gen BEFORE local write so any older refreshTacticalFor is discarded.
        tacticalGen.current += 1;
        setPlays((prev) => [play, ...prev.filter((p) => p.id !== play.id)]);
        return { ok: true, playId: play.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('createPlay failed', message);
        return { ok: false, error: message };
      }
    },
    [team, user],
  );

  const updatePlayMedia = useCallback(
    async (playId: string, mediaUrl: string): Promise<OkOrError> => {
      const trimmed = mediaUrl.trim();
      if (isDemoMode || !supabase) {
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, mediaUrl: trimmed || undefined } : p)),
        );
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { mediaUrl: trimmed || null });
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, mediaUrl: trimmed || undefined } : p)),
        );
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const updatePlayVoiceover = useCallback(
    async (playId: string, voiceoverUrl: string | null): Promise<OkOrError> => {
      const trimmed = voiceoverUrl?.trim() || null;
      if (isDemoMode || !supabase) {
        setPlays((prev) =>
          prev.map((p) =>
            p.id === playId ? { ...p, voiceoverUrl: trimmed || undefined } : p,
          ),
        );
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { voiceoverUrl: trimmed });
        setPlays((prev) =>
          prev.map((p) =>
            p.id === playId ? { ...p, voiceoverUrl: trimmed || undefined } : p,
          ),
        );
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const updatePlayBoard = useCallback(
    async (playId: string, boardJson: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        tacticalGen.current += 1;
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, boardJson } : p)));
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { boardJson });
        tacticalGen.current += 1;
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, boardJson } : p)));
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const cachePlayGameIq = useCallback(
    async (playId: string, gameIqJson: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        tacticalGen.current += 1;
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, gameIqJson } : p)));
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { gameIqJson });
        tacticalGen.current += 1;
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, gameIqJson } : p)));
        return { ok: true };
      } catch (err) {
        // Column may be missing until migration 012 — still keep local cache.
        tacticalGen.current += 1;
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, gameIqJson } : p)));
        const message = err instanceof Error ? err.message : String(err);
        console.warn('cachePlayGameIq', message);
        return { ok: true };
      }
    },
    [],
  );

  const cachePlayDrillOverlay = useCallback(
    async (playId: string, drillOverlayJson: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        tacticalGen.current += 1;
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, drillOverlayJson } : p)),
        );
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { drillOverlayJson });
        tacticalGen.current += 1;
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, drillOverlayJson } : p)),
        );
        return { ok: true };
      } catch (err) {
        // Column may be missing until migration 015 — still keep local cache.
        tacticalGen.current += 1;
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, drillOverlayJson } : p)),
        );
        const message = err instanceof Error ? err.message : String(err);
        console.warn('cachePlayDrillOverlay', message);
        return { ok: true };
      }
    },
    [],
  );

  const createAssignment = useCallback(
    async (input: {
      playId: string;
      playerId: string;
      positionName: string;
      actionPromptQuestion: string;
    }): Promise<OkOrError> => {
      if (!input.positionName.trim() || !input.actionPromptQuestion.trim() || !input.playerId) {
        return { ok: false, error: t('errors.nameRequired') };
      }

      if (isDemoMode || !supabase) {
        const playerName =
          tacticalPlayers.find((p) => p.id === input.playerId)?.fullName ??
          demoUsers.find((u) => u.id === input.playerId)?.fullName ??
          '—';
        tacticalGen.current += 1;
        setAssignments((prev) => [
          ...prev,
          {
            id: `assign-${Date.now()}`,
            playId: input.playId,
            playerId: input.playerId,
            playerName,
            positionName: input.positionName.trim(),
            actionPromptQuestion: input.actionPromptQuestion.trim(),
          },
        ]);
        return { ok: true };
      }

      try {
        const row = await createAssignmentLive(supabase, input);
        tacticalGen.current += 1;
        setAssignments((prev) => [...prev, row]);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [tacticalPlayers],
  );

  const togglePlaySuggestions = useCallback(
    async (playId: string): Promise<OkOrError> => {
      const current = plays.find((p) => p.id === playId);
      if (!current) return { ok: false, error: 'not_found' };
      const next = !current.allowSuggestions;

      setPlays((prev) =>
        prev.map((p) => (p.id === playId ? { ...p, allowSuggestions: next } : p)),
      );

      if (isDemoMode || !supabase) return { ok: true };

      try {
        await updatePlayLive(supabase, playId, { allowSuggestions: next });
        return { ok: true };
      } catch (err) {
        setPlays((prev) =>
          prev.map((p) =>
            p.id === playId ? { ...p, allowSuggestions: current.allowSuggestions } : p,
          ),
        );
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [plays],
  );

  const answerAssignment = useCallback(
    async (assignmentId: string, answer: string): Promise<OkOrError> => {
      const trimmed = answer.trim();
      if (!trimmed) {
        return { ok: false, error: t('plays.answerRequired') };
      }

      const previous = assignments.find((a) => a.id === assignmentId)?.playerAnswer;

      // Prevent a stale tactical refresh from wiping the answer we are saving.
      tacticalGen.current += 1;
      setAssignments((prev) =>
        prev.map((a) => (a.id === assignmentId ? { ...a, playerAnswer: trimmed } : a)),
      );

      if (isDemoMode || !supabase) return { ok: true };

      try {
        await answerAssignmentLive(supabase, assignmentId, trimmed);
        return { ok: true };
      } catch (err) {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === assignmentId ? { ...a, playerAnswer: previous } : a,
          ),
        );
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [assignments],
  );

  const submitSuggestion = useCallback(
    async (playId: string, text: string): Promise<OkOrError> => {
      if (!user || !text.trim()) {
        return { ok: false, error: t('errors.nameRequired') };
      }

      if (isDemoMode || !supabase) {
        setSuggestions((prev) => [
          {
            id: `sug-${Date.now()}`,
            playId,
            playerId: user.id,
            playerName: user.fullName,
            suggestionText: text.trim(),
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        return { ok: true };
      }

      try {
        const row = await submitSuggestionLive(supabase, {
          playId,
          playerId: user.id,
          text,
        });
        setSuggestions((prev) => [row, ...prev]);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [user],
  );

  const reviewSuggestion = useCallback(
    async (id: string, status: SuggestionStatus): Promise<OkOrError> => {
      const previous = suggestions.find((s) => s.id === id)?.status;
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

      if (isDemoMode || !supabase) return { ok: true };

      try {
        await reviewSuggestionLive(supabase, id, status);
        return { ok: true };
      } catch (err) {
        if (previous) {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status: previous } : s)),
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [suggestions],
  );

  const claimCarpoolSeat = useCallback(
    async (offerId: string) => {
      const offer = carpools.find((c) => c.id === offerId);
      if (!offer) {
        return { ok: false as const, reason: 'not_found' as const };
      }
      if (offer.seatsTaken >= offer.seatsAvailable) {
        return { ok: false as const, reason: 'full' as const };
      }

      if (isDemoMode || !supabase) {
        const seatsTaken = offer.seatsTaken + 1;
        setCarpools((prev) =>
          prev.map((c) =>
            c.id === offerId ? { ...c, seatsTaken } : c,
          ),
        );
        return {
          ok: true as const,
          seatsTaken,
          seatsAvailable: offer.seatsAvailable,
        };
      }

      try {
        const result = await claimCarpoolSeatLive(
          supabase,
          offerId,
          offer.seatsTaken,
          offer.seatsAvailable,
        );
        if (result.ok) {
          setCarpools((prev) =>
            prev.map((c) =>
              c.id === offerId
                ? {
                    ...c,
                    seatsTaken: result.seatsTaken,
                    seatsAvailable: result.seatsAvailable,
                  }
                : c,
            ),
          );
        } else if (result.reason === 'full') {
          setCarpools((prev) =>
            prev.map((c) =>
              c.id === offerId ? { ...c, seatsTaken: c.seatsAvailable } : c,
            ),
          );
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Carpool claim failed', message);
        return { ok: false as const, reason: 'error' as const, message };
      }
    },
    [carpools],
  );

  const createCarpoolOffer = useCallback(
    async (
      eventId: string,
      seatsAvailable: number,
      extras?: { departureLocation?: string; pickupPoints?: string },
    ) => {
      if (!user || user.role !== 'parent') {
        return { ok: false as const, reason: 'error' as const, message: 'parent_only' };
      }
      const seats = Math.min(8, Math.max(1, Math.round(seatsAvailable)));
      const departureLocation = extras?.departureLocation?.trim() || undefined;
      const pickupPoints = extras?.pickupPoints?.trim() || undefined;

      if (isDemoMode || !supabase) {
        const offer: CarpoolOffer = {
          id: `carpool-${Date.now().toString(36)}`,
          eventId,
          parentId: user.id,
          parentName: user.fullName,
          seatsAvailable: seats,
          seatsTaken: 0,
          departureLocation,
          pickupPoints,
        };
        setCarpools((prev) => [offer, ...prev]);
        return { ok: true as const, offer };
      }

      try {
        const result = await createCarpoolOfferLive(supabase, {
          eventId,
          parentId: user.id,
          parentName: user.fullName,
          seatsAvailable: seats,
          departureLocation,
          pickupPoints,
        });
        if (result.ok) {
          setCarpools((prev) => [result.offer, ...prev]);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Carpool offer create failed', message);
        return { ok: false as const, reason: 'error' as const, message };
      }
    },
    [user],
  );

  const upsertTeamContact = useCallback(
    async (input: {
      id?: string;
      roleLabel: string;
      fullName: string;
      phone?: string;
      isHeadCoach?: boolean;
      sortOrder?: number;
    }): Promise<OkOrError> => {
      if (!user || !team) return { ok: false, error: t('errors.redeemInviteFirst') };
      if (!isAttendanceCoach(user.role)) return { ok: false, error: t('contacts.saveError') };

      const roleLabel = input.roleLabel.trim();
      const fullName = input.fullName.trim();
      const phone = input.phone?.trim() || undefined;
      const isHeadCoach = Boolean(input.isHeadCoach);
      const sortOrder = input.sortOrder ?? 0;

      if (isDemoMode || !supabase) {
        if (input.id) {
          setContacts((prev) =>
            prev.map((c) => {
              if (c.id === input.id) {
                return {
                  ...c,
                  roleLabel,
                  fullName,
                  phone,
                  isHeadCoach,
                  sortOrder,
                };
              }
              // Keep a single head-coach flag so «שלח הודעה» stays unambiguous.
              if (isHeadCoach && c.isHeadCoach) return { ...c, isHeadCoach: false };
              return c;
            }),
          );
        } else {
          const contact: TeamContact = {
            id: `contact-${Date.now().toString(36)}`,
            teamId: team.id,
            roleLabel,
            fullName,
            phone,
            isHeadCoach,
            sortOrder,
          };
          setContacts((prev) => [
            ...(isHeadCoach
              ? prev.map((c) => (c.isHeadCoach ? { ...c, isHeadCoach: false } : c))
              : prev),
            contact,
          ]);
        }
        return { ok: true };
      }

      try {
        if (input.id) {
          const result = await updateTeamContactLive(supabase, input.id, {
            roleLabel,
            fullName,
            phone,
            isHeadCoach,
            sortOrder,
          });
          if (!result.ok) return { ok: false, error: result.error };
          setContacts((prev) =>
            prev.map((c) => (c.id === result.contact.id ? result.contact : c)),
          );
          return { ok: true };
        }
        const result = await createTeamContactLive(supabase, {
          teamId: team.id,
          roleLabel,
          fullName,
          phone,
          isHeadCoach,
          sortOrder,
        });
        if (!result.ok) return { ok: false, error: result.error };
        setContacts((prev) => [...prev, result.contact]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [user, team],
  );

  const deleteTeamContact = useCallback(
    async (id: string): Promise<OkOrError> => {
      if (!user || !isAttendanceCoach(user.role)) {
        return { ok: false, error: t('contacts.saveError') };
      }
      if (isDemoMode || !supabase) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        return { ok: true };
      }
      try {
        const result = await deleteTeamContactLive(supabase, id);
        if (!result.ok) return { ok: false, error: result.error };
        setContacts((prev) => prev.filter((c) => c.id !== id));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [user],
  );

  const sendInAppContactMessage = useCallback(
    async (contactId: string, body: string): Promise<OkOrError> => {
      const trimmed = body.trim();
      if (!trimmed) return { ok: false, error: t('contacts.messageRequired') };
      const target = contacts.find((c) => c.id === contactId);
      if (!target) return { ok: false, error: t('contacts.saveError') };
      contactMessagesRef.current.push({
        contactId,
        body: trimmed,
        at: new Date().toISOString(),
      });
      // Demo / offline: queue locally. Live: same stub until a messages table ships.
      return { ok: true, note: `to:${target.fullName}` };
    },
    [contacts],
  );

  const createSessionEvent = useCallback(
    async (input: EventWriteInput): Promise<EventMutationResult> => {
      if (!user || !team) {
        return { ok: false, error: t('errors.redeemInviteFirst') };
      }
      if (!isAttendanceCoach(user.role)) {
        return { ok: false, error: t('schedule.saveError') };
      }
      if (!input.title.trim()) {
        return { ok: false, error: t('schedule.titleRequired') };
      }

      if (isDemoMode || !supabase) {
        const event: SessionEvent = {
          id: `event-${Date.now().toString(36)}`,
          teamId: team.id,
          title: input.title.trim(),
          startsAt: input.startsAt,
          location: input.location.trim(),
          type: input.type,
          hallAddress: input.hallAddress?.trim() || undefined,
          contactPhone: input.contactPhone?.trim() || undefined,
        };
        scheduleGen.current += 1;
        setEvents((prev) =>
          [...prev.filter((e) => e.id !== event.id), event].sort((a, b) =>
            a.startsAt.localeCompare(b.startsAt),
          ),
        );
        return { ok: true, event };
      }

      try {
        const event = await createEventLive(supabase, {
          teamId: team.id,
          ...input,
        });
        scheduleGen.current += 1;
        setEvents((prev) =>
          [...prev.filter((e) => e.id !== event.id), event].sort((a, b) =>
            a.startsAt.localeCompare(b.startsAt),
          ),
        );
        return { ok: true, event };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('createSessionEvent failed', message);
        return { ok: false, error: message };
      }
    },
    [team, user],
  );

  const updateSessionEvent = useCallback(
    async (
      input: Partial<EventWriteInput> & { id: string },
    ): Promise<EventMutationResult> => {
      if (!user || !team) {
        return { ok: false, error: t('errors.redeemInviteFirst') };
      }
      if (!isAttendanceCoach(user.role)) {
        return { ok: false, error: t('schedule.saveError') };
      }
      if (input.title !== undefined && !input.title.trim()) {
        return { ok: false, error: t('schedule.titleRequired') };
      }

      if (isDemoMode || !supabase) {
        let next: SessionEvent | null = null;
        setEvents((prev) => {
          const updated = prev.map((e) => {
            if (e.id !== input.id) return e;
            next = {
              ...e,
              title: input.title?.trim() ?? e.title,
              startsAt: input.startsAt ?? e.startsAt,
              location: input.location !== undefined ? input.location.trim() : e.location,
              type: input.type ?? e.type,
              hallAddress:
                input.hallAddress !== undefined
                  ? input.hallAddress.trim() || undefined
                  : e.hallAddress,
              contactPhone:
                input.contactPhone !== undefined
                  ? input.contactPhone.trim() || undefined
                  : e.contactPhone,
            };
            return next;
          });
          return [...updated].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        });
        if (!next) return { ok: false, error: t('schedule.saveError') };
        scheduleGen.current += 1;
        return { ok: true, event: next };
      }

      try {
        const event = await updateEventLive(supabase, input);
        scheduleGen.current += 1;
        setEvents((prev) =>
          [...prev.filter((e) => e.id !== event.id), event].sort((a, b) =>
            a.startsAt.localeCompare(b.startsAt),
          ),
        );
        return { ok: true, event };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('updateSessionEvent failed', message);
        return { ok: false, error: message };
      }
    },
    [team, user],
  );

  const acknowledgeBanner = useCallback(async () => {
    if (!user || !banner.id) return;

    setBanner((prev) => ({
      ...prev,
      acknowledgedBy: prev.acknowledgedBy.includes(user.id)
        ? prev.acknowledgedBy
        : [...prev.acknowledgedBy, user.id],
    }));

    if (!isDemoMode && supabase) {
      try {
        await acknowledgeUrgentBanner(supabase, banner.id, user.id);
      } catch (err) {
        console.warn('Banner ack failed', err instanceof Error ? err.message : err);
      }
    }
  }, [banner.id, user]);

  const composeUrgentBanner = useCallback(
    async (message: string): Promise<OkOrError> => {
      if (!user || !team) return { ok: false, error: t('urgent.sendError') };
      const body = message.trim();
      if (!body) return { ok: false, error: t('urgent.messageRequired') };

      if (isDemoMode || !supabase) {
        const next = {
          id: `banner-demo-${Date.now()}`,
          teamId: team.id,
          message: body,
          requiresAck: true,
          acknowledgedBy: [] as string[],
        };
        setBanner(next);
        return { ok: true };
      }

      try {
        const next = await createUrgentBannerLive(supabase, {
          teamId: team.id,
          authorId: user.id,
          message: body,
        });
        setBanner(next);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : t('urgent.sendError'),
        };
      }
    },
    [team, user],
  );

  const upsertWeeklySlot = useCallback(
    async (input: WeeklySlotInput & { id?: string }): Promise<OkOrError> => {
      if (!user || !team) return { ok: false, error: t('weeklySchedule.saveError') };
      if (!isAttendanceCoach(user.role)) {
        return { ok: false, error: t('weeklySchedule.saveError') };
      }

      const payload: WeeklySlotInput = {
        dayOfWeek: input.dayOfWeek as WeekDayIndex,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
      };

      if (isDemoMode || !supabase) {
        setWeeklySlots((prev) => {
          if (input.id) {
            return prev.map((s) =>
              s.id === input.id
                ? {
                    ...s,
                    dayOfWeek: payload.dayOfWeek,
                    startTime: payload.startTime,
                    endTime: payload.endTime,
                    location: payload.location,
                  }
                : s,
            );
          }
          const next: WeeklyScheduleSlot = {
            id: `weekly-local-${Date.now()}`,
            teamId: team.id,
            dayOfWeek: payload.dayOfWeek,
            startTime: payload.startTime,
            endTime: payload.endTime,
            location: payload.location,
          };
          return [...prev, next];
        });
        return { ok: true };
      }

      try {
        const saved = input.id
          ? await updateWeeklySlot(supabase, input.id, payload)
          : await insertWeeklySlot(supabase, team.id, user.id, payload);
        setWeeklySlots((prev) => {
          const without = prev.filter((s) => s.id !== saved.id);
          return [...without, saved].sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            return a.startTime.localeCompare(b.startTime);
          });
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : t('weeklySchedule.saveError'),
        };
      }
    },
    [team, user],
  );

  const deleteWeeklySlot = useCallback(
    async (slotId: string): Promise<OkOrError> => {
      if (!user || !isAttendanceCoach(user.role)) {
        return { ok: false, error: t('weeklySchedule.deleteError') };
      }

      if (isDemoMode || !supabase) {
        setWeeklySlots((prev) => prev.filter((s) => s.id !== slotId));
        return { ok: true };
      }

      try {
        await deleteWeeklySlotLive(supabase, slotId);
        setWeeklySlots((prev) => prev.filter((s) => s.id !== slotId));
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : t('weeklySchedule.deleteError'),
        };
      }
    },
    [user],
  );


  const switchDemoRole = useCallback(
    (role: UserProfile['role']) => {
      if (!isDemoMode) return;
      const match = demoUsers.find((u) => u.role === role) ?? {
        ...demoUsers[0],
        role,
        id: `user-demo-${role}`,
        fullName: t('demo.demoRoleName', { role: translateRole(role) }),
      };
      // Simulate specialist on roster when switching into fitness/physio.
      // Use health-screen demo toggles to test head-coach read-only inheritance.
      const nextTeam: Team = {
        ...demoTeam,
        hasFitnessStaff: role === 'fitness_coach',
        hasPhysioStaff: role === 'physio',
      };
      setInviteOk(true);
      setTeam(nextTeam);
      setUser(match);
      setEvents(demoEvents);
      setAcks(demoAcks);
      setAttendance(demoAttendance);
      setWeeklySlots(demoWeeklySlots);
      setCarpools(demoCarpools);
      setContacts(demoContacts);
      setBanner(demoBanner);
      // Parent demo: Parent Cohen → Roi only (never Dan / other players).
      if (role === 'parent') {
        const linkedIds = new Set(['user-player-roi']);
        setReadiness(demoReadiness.filter((r) => linkedIds.has(r.playerId)));
        setPain(demoPain.filter((p) => linkedIds.has(p.playerId)));
        setHealthPlayers(
          demoUsers
            .filter((u) => linkedIds.has(u.id))
            .map((u) => ({ id: u.id, fullName: u.fullName })),
        );
      } else if (role === 'player') {
        setReadiness(demoReadiness.filter((r) => r.playerId === match.id));
        setPain(demoPain.filter((p) => p.playerId === match.id));
        setHealthPlayers([{ id: match.id, fullName: match.fullName }]);
      } else {
        setReadiness(demoReadiness);
        setPain(demoPain);
        setHealthPlayers(
          demoUsers
            .filter((u) => u.role === 'player')
            .map((u) => ({ id: u.id, fullName: u.fullName })),
        );
      }
      setPlays(demoPlays);
      setAssignments(demoAssignments);
      setSuggestions(demoSuggestions);
      setTacticalPlayers(
        demoUsers.filter((u) => u.role === 'player').map((u) => ({ id: u.id, fullName: u.fullName })),
      );
      setBrand(resolveInvite(DEMO_INVITE_CODE)!);
    },
    [setBrand],
  );

  const toggleDemoMedicalStaff = useCallback((kind: 'fitness' | 'physio') => {
    if (!isDemoMode) return;
    setTeam((prev) => {
      if (!prev) return prev;
      if (kind === 'fitness') {
        return { ...prev, hasFitnessStaff: !prev.hasFitnessStaff };
      }
      return { ...prev, hasPhysioStaff: !prev.hasPhysioStaff };
    });
  }, []);

  const signOut = useCallback(() => {
    const prevAuthId = authUserId;
    setUser(null);
    setTeam(null);
    setInviteOk(false);
    setAuthUserId(null);
    if (prevAuthId) {
      void clearPendingInvite(prevAuthId);
    }
    if (!isDemoMode) {
      setEvents([]);
      setAcks([]);
      setAttendance([]);
      setWeeklySlots([]);
      setCarpools([]);
      setContacts([]);
      setBanner(EMPTY_BANNER);
      setReadiness([]);
      setPain([]);
      setHealthPlayers([]);
      setPlays([]);
      setAssignments([]);
      setSuggestions([]);
      setTacticalPlayers([]);
    }
    clearBrand();
    if (!isDemoMode && supabase) {
      void supabase.auth.signOut();
    }
  }, [authUserId, clearBrand]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      team,
      events,
      acks,
      attendance,
      weeklySlots,
      readiness,
      pain,
      healthPlayers,
      plays,
      assignments,
      suggestions,
      tacticalPlayers,
      carpools,
      contacts,
      banner,
      absenceReasons: ABSENCE_REASON_KEYS,
      onboarded: Boolean(user),
      authReady,
      authUserId,
      inviteOk,
      redeemInvite,
      completeOnboarding,
      signIn,
      signUp,
      setRsvp,
      cycleAttendance,
      lockAttendance,
      submitReadiness,
      submitPain,
      refreshHealth,
      refreshTactical,
      createPlay,
      updatePlayMedia,
      updatePlayVoiceover,
      updatePlayBoard,
      cachePlayGameIq,
      cachePlayDrillOverlay,
      createAssignment,
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      createCarpoolOffer,
      upsertTeamContact,
      deleteTeamContact,
      sendInAppContactMessage,
      upsertWeeklySlot,
      deleteWeeklySlot,
      acknowledgeBanner,
      composeUrgentBanner,
      refreshTeamSchedule,
      switchDemoRole,
      toggleDemoMedicalStaff,
      refreshPendingConsent,
      markPlayerConsented,
      resendParentalConsentSms,
      createSessionEvent,
      updateSessionEvent,
      signOut,
    }),
    [
      user,
      team,
      events,
      acks,
      attendance,
      weeklySlots,
      readiness,
      pain,
      healthPlayers,
      plays,
      assignments,
      suggestions,
      tacticalPlayers,
      carpools,
      contacts,
      banner,
      authReady,
      authUserId,
      inviteOk,
      redeemInvite,
      completeOnboarding,
      signIn,
      signUp,
      setRsvp,
      cycleAttendance,
      lockAttendance,
      submitReadiness,
      submitPain,
      refreshHealth,
      refreshTactical,
      createPlay,
      updatePlayMedia,
      updatePlayVoiceover,
      updatePlayBoard,
      cachePlayGameIq,
      cachePlayDrillOverlay,
      createAssignment,
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      createCarpoolOffer,
      upsertTeamContact,
      deleteTeamContact,
      sendInAppContactMessage,
      upsertWeeklySlot,
      deleteWeeklySlot,
      acknowledgeBanner,
      composeUrgentBanner,
      refreshTeamSchedule,
      switchDemoRole,
      toggleDemoMedicalStaff,
      refreshPendingConsent,
      markPlayerConsented,
      resendParentalConsentSms,
      createSessionEvent,
      updateSessionEvent,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error(t('errors.useSessionOutsideProvider'));
  return ctx;
}
