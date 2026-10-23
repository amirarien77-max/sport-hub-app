import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  DEMO_INVITE_CODE,
  demoAcks,
  demoAssignments,
  demoAttendance,
  demoBanner,
  demoCarpools,
  demoEvents,
  demoPain,
  demoPlays,
  demoReadiness,
  demoSuggestions,
  demoTeam,
  demoUsers,
  isUnder13,
  resolveInvite,
} from '@/lib/demo-data';
import {
  fetchHealthBundle,
  insertPainLive,
  upsertReadinessLive,
} from '@/lib/health-live';
import { isHealthStaff } from '@/lib/roles';
import {
  acknowledgeUrgentBanner,
  claimCarpoolSeatLive,
  ensureParentPlayerLink,
  fetchScheduleBundle,
  lockAttendanceRecords,
  upsertAttendanceMark,
  upsertRsvp,
} from '@/lib/schedule-live';
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
  UrgentBanner,
  UserProfile,
  Role,
  ConsentStatus,
  ClubBrand,
} from '@/types';
import { useTheme } from '@/theme/ThemeContext';

type OkOrError = { ok: true } | { ok: false; error: string };
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
  readiness: ReadinessReport[];
  pain: PainReport[];
  plays: TacticalPlay[];
  assignments: PlayAssignment[];
  suggestions: PlaySuggestion[];
  carpools: CarpoolOffer[];
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
  updatePlayBoard: (playId: string, boardJson: string) => Promise<OkOrError>;
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
  acknowledgeBanner: () => void | Promise<void>;
  switchDemoRole: (role: UserProfile['role']) => void;
  /** Demo-only: flip team fitness/physio flags to test head-coach inheritance. */
  toggleDemoMedicalStaff: (kind: 'fitness' | 'physio') => void;
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
  const { setBrand, clearBrand } = useTheme();
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
  const [banner, setBanner] = useState<UrgentBanner>(isDemoMode ? demoBanner : EMPTY_BANNER);

  const refreshSchedule = useCallback(async (teamId: string) => {
    if (isDemoMode || !supabase) return;
    try {
      const bundle = await fetchScheduleBundle(supabase, teamId);
      setEvents(bundle.events);
      setAcks(bundle.acks);
      setAttendance(bundle.attendance);
      setCarpools(bundle.carpools);
      setBanner(bundle.banner ?? EMPTY_BANNER);
    } catch (err) {
      console.warn('Failed to load schedule', err instanceof Error ? err.message : err);
    }
  }, []);

  const refreshTacticalFor = useCallback(async (teamId: string) => {
    if (isDemoMode || !supabase) return;
    try {
      const bundle = await fetchTacticalBundle(supabase, teamId);
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

    // Parents must not load other players' medical data (Checkpoint 3).
    if (profile.role === 'parent') {
      setReadiness([]);
      setPain([]);
      setHealthPlayers([]);
      return;
    }

    try {
      const asStaff = isHealthStaff(profile.role);
      const bundle = await fetchHealthBundle(supabase, { teamId, asStaff });
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

  const hydrateFromAuth = useCallback(
    async (session: Session | null) => {
      if (!supabase || isDemoMode) {
        setAuthUserId(null);
        setAuthReady(true);
        return;
      }

      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
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

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', uid)
        .maybeSingle();

      if (error) {
        console.warn('Failed to load profile', error.message);
      }

      if (!profile) {
        setUser(null);
        setTeam(null);
        setInviteOk(false);
        setAuthReady(true);
        return;
      }

      const mapped = mapUserRow(profile);
      setUser(mapped);

      const { data: teamRow } = await supabase
        .from('teams')
        .select('*')
        .eq('id', mapped.teamId)
        .maybeSingle();

      if (teamRow) {
        const mappedTeam = mapTeamRow(teamRow);
        setTeam(mappedTeam);
        setInviteOk(true);
        await refreshSchedule(mappedTeam.id);
        await refreshHealthFor(mapped, mappedTeam.id);
        await refreshTacticalFor(mappedTeam.id);
      }

      const { data: clubRow } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', mapped.clubId)
        .maybeSingle();

      if (clubRow) {
        setBrand(mapClubRow(clubRow));
      }

      setAuthReady(true);
    },
    [clearBrand, refreshHealthFor, refreshSchedule, refreshTacticalFor, setBrand],
  );

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) void hydrateFromAuth(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateFromAuth(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateFromAuth]);

  const signIn = useCallback(async (email: string, password: string): Promise<OkOrError> => {
    if (isDemoMode || !supabase) {
      return { ok: false, error: t('errors.demoAuthDisabled') };
    }
    if (!email.trim() || !password) {
      return { ok: false, error: t('errors.emailPasswordRequired') };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<OkOrError> => {
    if (isDemoMode || !supabase) {
      return { ok: false, error: t('errors.demoAuthDisabled') };
    }
    if (!email.trim() || password.length < 6) {
      return { ok: false, error: t('errors.weakPassword') };
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const redeemInvite = useCallback(
    async (code: string): Promise<OkOrError> => {
      const normalized = code.trim().toUpperCase();

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
    }): Promise<OkOrError> => {
      if (!inviteOk || !team) {
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
          teamId: team.id,
          clubId: team.clubId,
          dateOfBirth: input.dateOfBirth,
          parentPhone: input.parentPhone,
          consentStatus: under13 ? 'pending_parental_consent' : 'active',
        };
        setUser(profile);
        return { ok: true };
      }

      if (!authUserId) {
        return { ok: false, error: t('errors.signInBeforeProfile') };
      }

      const payload = {
        auth_id: authUserId,
        club_id: team.clubId,
        team_id: team.id,
        full_name: input.fullName.trim(),
        role: input.role,
        date_of_birth: input.dateOfBirth || null,
        parent_phone: input.parentPhone?.trim() || null,
        consent_status: (under13 ? 'pending_parental_consent' : 'active') as ConsentStatus,
      };

      const { data, error } = await supabase.from('users').insert(payload).select('*').single();
      if (error) return { ok: false, error: error.message };

      const mappedUser = mapUserRow(data);
      setUser(mappedUser);
      await refreshSchedule(team.id);
      await refreshHealthFor(mappedUser, team.id);
      await refreshTacticalFor(team.id);

      // Refresh team flags after role insert (fitness/physio trigger).
      const { data: freshTeam } = await supabase
        .from('teams')
        .select('*')
        .eq('id', team.id)
        .maybeSingle();
      if (freshTeam) setTeam(mapTeamRow(freshTeam));

      return { ok: true };
    },
    [authUserId, inviteOk, refreshHealthFor, refreshSchedule, refreshTacticalFor, team],
  );

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

    setAttendance((prev) =>
      prev.map((row) =>
        row.playerId === playerId && row.eventId === eventId ? { ...row, mark } : row,
      ),
    );

    if (!isDemoMode && supabase) {
      try {
        await upsertAttendanceMark(supabase, eventId, playerId, mark);
      } catch (err) {
        console.warn('Attendance save failed', err instanceof Error ? err.message : err);
      }
    }
  }, [attendance]);

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

  const createPlay = useCallback(
    async (title: string): Promise<CreatePlayResult> => {
      if (!user || !team) {
        return { ok: false, error: t('errors.redeemInviteFirst') };
      }
      if (!title.trim()) {
        return { ok: false, error: t('errors.nameRequired') };
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
        setPlays((prev) => [play, ...prev]);
        return { ok: true, playId: play.id };
      }

      try {
        const play = await createPlayLive(supabase, {
          teamId: team.id,
          title,
          boardJson: '{"markers":[]}',
        });
        setPlays((prev) => [play, ...prev]);
        return { ok: true, playId: play.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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

  const updatePlayBoard = useCallback(
    async (playId: string, boardJson: string): Promise<OkOrError> => {
      if (isDemoMode || !supabase) {
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, boardJson } : p)));
        return { ok: true };
      }
      try {
        await updatePlayLive(supabase, playId, { boardJson });
        setPlays((prev) => prev.map((p) => (p.id === playId ? { ...p, boardJson } : p)));
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
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
      setAssignments((prev) =>
        prev.map((a) => (a.id === assignmentId ? { ...a, playerAnswer: answer } : a)),
      );

      if (isDemoMode || !supabase) return { ok: true };

      try {
        await answerAssignmentLive(supabase, assignmentId, answer);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [],
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
      setCarpools(demoCarpools);
      setBanner(demoBanner);
      setReadiness(demoReadiness);
      setPain(demoPain);
      setHealthPlayers(
        demoUsers.filter((u) => u.role === 'player').map((u) => ({ id: u.id, fullName: u.fullName })),
      );
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
    setUser(null);
    setTeam(null);
    setInviteOk(false);
    setAuthUserId(null);
    if (!isDemoMode) {
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
    }
    clearBrand();
    if (!isDemoMode && supabase) {
      void supabase.auth.signOut();
    }
  }, [clearBrand]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      team,
      events,
      acks,
      attendance,
      readiness,
      pain,
      healthPlayers,
      plays,
      assignments,
      suggestions,
      tacticalPlayers,
      carpools,
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
      updatePlayBoard,
      createAssignment,
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      acknowledgeBanner,
      switchDemoRole,
      toggleDemoMedicalStaff,
      signOut,
    }),
    [
      user,
      team,
      events,
      acks,
      attendance,
      readiness,
      pain,
      healthPlayers,
      plays,
      assignments,
      suggestions,
      tacticalPlayers,
      carpools,
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
      updatePlayBoard,
      createAssignment,
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      acknowledgeBanner,
      switchDemoRole,
      toggleDemoMedicalStaff,
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
