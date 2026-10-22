import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
} from '@/types';
import { useTheme } from '@/theme/ThemeContext';

const ABSENCE_REASONS = [
  'Sick',
  'School exam',
  'Injury',
  'Family event',
  'Travel',
  'Other',
] as const;

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
  redeemInvite: (code: string) => { ok: true } | { ok: false; error: string };
  completeOnboarding: (input: {
    fullName: string;
    role: UserProfile['role'];
    dateOfBirth?: string;
    parentPhone?: string;
  }) => { ok: true } | { ok: false; error: string };
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setBrand, clearBrand } = useTheme();
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

  const redeemInvite = useCallback(
    (code: string) => {
      const brand = resolveInvite(code);
      if (!brand) {
        return { ok: false as const, error: 'Invalid invite code. Try MAC-U16-2026 in demo mode.' };
      }
      setBrand(brand);
      setTeam(demoTeam);
      setInviteOk(true);
      return { ok: true as const };
    },
    [setBrand],
  );

  const completeOnboarding = useCallback(
    (input: {
      fullName: string;
      role: UserProfile['role'];
      dateOfBirth?: string;
      parentPhone?: string;
    }) => {
      if (!inviteOk || !team) {
        return { ok: false as const, error: 'Redeem an invite code first.' };
      }
      if (!input.fullName.trim()) {
        return { ok: false as const, error: 'Name is required.' };
      }
      const under13 = input.role === 'player' && isUnder13(input.dateOfBirth);
      if (under13 && !input.parentPhone?.trim()) {
        return { ok: false as const, error: 'Players under 13 must provide a parent phone.' };
      }
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
      return { ok: true as const };
    },
    [inviteOk, team],
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

  const switchDemoRole = useCallback((role: UserProfile['role']) => {
    const match = demoUsers.find((u) => u.role === role) ?? {
      ...demoUsers[0],
      role,
      id: `user-demo-${role}`,
      fullName: `Demo ${role}`,
    };
    setInviteOk(true);
    setTeam(demoTeam);
    setUser(match);
    setBrand(resolveInvite(DEMO_INVITE_CODE)!);
  }, [setBrand]);

  const signOut = useCallback(() => {
    setUser(null);
    setTeam(null);
    setInviteOk(false);
    clearBrand();
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
      absenceReasons: ABSENCE_REASONS,
      onboarded: Boolean(user),
      redeemInvite,
      completeOnboarding,
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
      redeemInvite,
      completeOnboarding,
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
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
