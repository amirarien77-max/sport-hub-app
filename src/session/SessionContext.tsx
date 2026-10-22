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

type SessionContextValue = {
  user: UserProfile | null;
  team: Team | null;
  events: typeof demoEvents;
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
  setRsvp: (eventId: string, choice: RsvpChoice, reason?: string, asParent?: boolean) => void;
  cycleAttendance: (playerId: string, eventId: string) => void;
  lockAttendance: (eventId: string) => string[];
  submitReadiness: (rpe: number, sleepHours: number, waterLiters: number) => void;
  submitPain: (region: string, subRegion: string, severity: PainSeverity) => void;
  togglePlaySuggestions: (playId: string) => void;
  answerAssignment: (assignmentId: string, answer: string) => void;
  submitSuggestion: (playId: string, text: string) => void;
  reviewSuggestion: (id: string, status: SuggestionStatus) => void;
  claimCarpoolSeat: (offerId: string) => void;
  acknowledgeBanner: () => void;
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setBrand, clearBrand } = useTheme();
  const [authReady, setAuthReady] = useState(isDemoMode);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [acks, setAcks] = useState<DualAck[]>(demoAcks);
  const [attendance, setAttendance] = useState<AttendanceRow[]>(demoAttendance);
  const [readiness, setReadiness] = useState<ReadinessReport[]>(demoReadiness);
  const [pain, setPain] = useState<PainReport[]>(demoPain);
  const [plays, setPlays] = useState<TacticalPlay[]>(demoPlays);
  const [assignments, setAssignments] = useState<PlayAssignment[]>(demoAssignments);
  const [suggestions, setSuggestions] = useState<PlaySuggestion[]>(demoSuggestions);
  const [carpools, setCarpools] = useState<CarpoolOffer[]>(demoCarpools);
  const [banner, setBanner] = useState<UrgentBanner>(demoBanner);

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
        setTeam(mapTeamRow(teamRow));
        setInviteOk(true);
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
    [clearBrand, setBrand],
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
      return { ok: true };
    },
    [authUserId, inviteOk, team],
  );

  const setRsvp = useCallback(
    (eventId: string, choice: RsvpChoice, reason?: string, asParent = false) => {
      if (!user) return;
      const playerId =
        user.role === 'parent' ? 'user-player-roi' : user.id.startsWith('user-local') ? 'user-player-roi' : user.id;

      setAcks((prev) => {
        const existing = prev.find((a) => a.eventId === eventId && a.playerId === playerId);
        if (!existing) {
          const next: DualAck = {
            eventId,
            playerId,
            playerChoice: asParent ? null : choice,
            parentChoice: asParent ? choice : null,
            playerReason: asParent ? undefined : reason,
            parentReason: asParent ? reason : undefined,
          };
          return [...prev, next];
        }
        return prev.map((a) => {
          if (a.eventId !== eventId || a.playerId !== playerId) return a;
          if (asParent || user.role === 'parent') {
            return { ...a, parentChoice: choice, parentReason: reason };
          }
          return { ...a, playerChoice: choice, playerReason: reason };
        });
      });
    },
    [user],
  );

  const cycleAttendance = useCallback((playerId: string, eventId: string) => {
    setAttendance((prev) =>
      prev.map((row) => {
        if (row.playerId !== playerId || row.eventId !== eventId) return row;
        const order: AttendanceMark[] = [null, 'present', 'excused', 'no_show'];
        const idx = order.indexOf(row.mark);
        return { ...row, mark: order[(idx + 1) % order.length] };
      }),
    );
  }, []);

  const lockAttendance = useCallback(
    (eventId: string) => {
      const noShows = attendance
        .filter((r) => r.eventId === eventId && r.mark === 'no_show')
        .map((r) => r.playerName);
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

  const claimCarpoolSeat = useCallback((offerId: string) => {
    setCarpools((prev) =>
      prev.map((c) => {
        if (c.id !== offerId) return c;
        if (c.seatsTaken >= c.seatsAvailable) return c;
        return { ...c, seatsTaken: c.seatsTaken + 1 };
      }),
    );
  }, []);

  const acknowledgeBanner = useCallback(() => {
    if (!user) return;
    setBanner((prev) => ({
      ...prev,
      acknowledgedBy: prev.acknowledgedBy.includes(user.id)
        ? prev.acknowledgedBy
        : [...prev.acknowledgedBy, user.id],
    }));
  }, [user]);

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
      setBrand(resolveInvite(DEMO_INVITE_CODE)!);
    },
    [setBrand],
  );

  const signOut = useCallback(() => {
    setUser(null);
    setTeam(null);
    setInviteOk(false);
    setAuthUserId(null);
    clearBrand();
    if (!isDemoMode && supabase) {
      void supabase.auth.signOut();
    }
  }, [clearBrand]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      team,
      events: demoEvents,
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
