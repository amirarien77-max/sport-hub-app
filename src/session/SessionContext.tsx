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
  acknowledgeUrgentBanner,
  claimCarpoolSeatLive,
  ensureParentPlayerLink,
  fetchScheduleBundle,
  lockAttendanceRecords,
  upsertAttendanceMark,
  upsertRsvp,
} from '@/lib/schedule-live';
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
  submitReadiness: (rpe: number, sleepHours: number, waterLiters: number) => void;
  submitPain: (region: string, subRegion: string, severity: PainSeverity) => void;
  togglePlaySuggestions: (playId: string) => void;
  answerAssignment: (assignmentId: string, answer: string) => void;
  submitSuggestion: (playId: string, text: string) => void;
  reviewSuggestion: (id: string, status: SuggestionStatus) => void;
  claimCarpoolSeat: (offerId: string) => void | Promise<void>;
  acknowledgeBanner: () => void | Promise<void>;
  switchDemoRole: (role: UserProfile['role']) => void;
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
  const [readiness, setReadiness] = useState<ReadinessReport[]>(demoReadiness);
  const [pain, setPain] = useState<PainReport[]>(demoPain);
  const [plays, setPlays] = useState<TacticalPlay[]>(demoPlays);
  const [assignments, setAssignments] = useState<PlayAssignment[]>(demoAssignments);
  const [suggestions, setSuggestions] = useState<PlaySuggestion[]>(demoSuggestions);
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
    [clearBrand, refreshSchedule, setBrand],
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

      setUser(mapUserRow(data));
      await refreshSchedule(team.id);
      return { ok: true };
    },
    [authUserId, inviteOk, refreshSchedule, team],
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
    (rpe: number, sleepHours: number, waterLiters: number) => {
      if (!user) return;
      setReadiness((prev) => [
        {
          id: `ready-${Date.now()}`,
          playerId: user.id,
          date: new Date().toISOString().slice(0, 10),
          rpe,
          sleepHours,
          waterLiters,
        },
        ...prev,
      ]);
    },
    [user],
  );

  const submitPain = useCallback(
    (region: string, subRegion: string, severity: PainSeverity) => {
      if (!user) return;
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
    },
    [user],
  );

  const togglePlaySuggestions = useCallback((playId: string) => {
    setPlays((prev) =>
      prev.map((p) => (p.id === playId ? { ...p, allowSuggestions: !p.allowSuggestions } : p)),
    );
  }, []);

  const answerAssignment = useCallback((assignmentId: string, answer: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, playerAnswer: answer } : a)),
    );
  }, []);

  const submitSuggestion = useCallback(
    (playId: string, text: string) => {
      if (!user || !text.trim()) return;
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
    },
    [user],
  );

  const reviewSuggestion = useCallback((id: string, status: SuggestionStatus) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }, []);

  const claimCarpoolSeat = useCallback(
    async (offerId: string) => {
      const offer = carpools.find((c) => c.id === offerId);
      if (!offer || offer.seatsTaken >= offer.seatsAvailable) return;

      if (!isDemoMode && supabase) {
        try {
          const ok = await claimCarpoolSeatLive(
            supabase,
            offerId,
            offer.seatsTaken,
            offer.seatsAvailable,
          );
          if (!ok) return;
        } catch (err) {
          console.warn('Carpool claim failed', err instanceof Error ? err.message : err);
          return;
        }
      }

      setCarpools((prev) =>
        prev.map((c) => {
          if (c.id !== offerId) return c;
          if (c.seatsTaken >= c.seatsAvailable) return c;
          return { ...c, seatsTaken: c.seatsTaken + 1 };
        }),
      );
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
      setInviteOk(true);
      setTeam(demoTeam);
      setUser(match);
      setEvents(demoEvents);
      setAcks(demoAcks);
      setAttendance(demoAttendance);
      setCarpools(demoCarpools);
      setBanner(demoBanner);
      setBrand(resolveInvite(DEMO_INVITE_CODE)!);
    },
    [setBrand],
  );

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
      plays,
      assignments,
      suggestions,
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
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      acknowledgeBanner,
      switchDemoRole,
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
      plays,
      assignments,
      suggestions,
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
      togglePlaySuggestions,
      answerAssignment,
      submitSuggestion,
      reviewSuggestion,
      claimCarpoolSeat,
      acknowledgeBanner,
      switchDemoRole,
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
