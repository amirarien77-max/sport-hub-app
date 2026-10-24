import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { t, translateConsent, translateRole } from '@/i18n';
import type { PendingConsentPlayer } from '@/lib/consent-live';
import { isAttendanceCoach } from '@/lib/roles';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';
import type { Role } from '@/types';

export default function ProfileRoute() {
  const { colors, brand } = useTheme();
  const {
    user,
    team,
    switchDemoRole,
    signOut,
    refreshPendingConsent,
    markPlayerConsented,
    resendParentalConsentSms,
  } = useSession();

  const [pending, setPending] = useState<PendingConsentPlayer[]>([]);
  const [consentBusyId, setConsentBusyId] = useState<string | null>(null);
  const [consentNote, setConsentNote] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    if (!isAttendanceCoach(user?.role)) {
      setPending([]);
      return;
    }
    const rows = await refreshPendingConsent();
    setPending(rows);
  }, [refreshPendingConsent, user?.role]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const roleHint = isAttendanceCoach(user?.role)
    ? t('profile.coachToolsHint')
    : user?.role === 'parent'
      ? t('profile.parentToolsHint')
      : t('profile.playerToolsHint');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('profile.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{user?.fullName}</Text>
      <View style={[styles.badge, { borderColor: colors.secondary, backgroundColor: '#fff' }]}>
        <Text style={{ fontWeight: '800', color: colors.primary, textAlign: 'right' }}>
          {t('profile.roleBadge', {
            role: user?.role ? translateRole(user.role) : '—',
          })}
        </Text>
      </View>
      <Text style={{ marginTop: 10, color: colors.text, textAlign: 'right' }}>
        {t('profile.clubTeam', { club: brand.name, team: team?.name ?? '—' })}
      </Text>
      <Text style={{ marginTop: 4, color: colors.muted, textAlign: 'right' }}>
        {t('profile.consentMode', {
          consent: user?.consentStatus ? translateConsent(user.consentStatus) : '—',
          mode: isDemoMode ? t('mode.demo') : t('mode.supabase'),
        })}
      </Text>
      <Text style={{ marginTop: 12, color: colors.muted, textAlign: 'right', lineHeight: 22 }}>
        {roleHint}
      </Text>

      {isAttendanceCoach(user?.role) ? (
        <View style={[styles.consentCard, { borderColor: colors.primary }]}>
          <Text style={[styles.label, { marginTop: 0 }]}>{t('profile.pendingConsentTitle')}</Text>
          {consentNote ? (
            <Text style={{ color: colors.success, textAlign: 'right', marginBottom: 8 }}>
              {consentNote}
            </Text>
          ) : null}
          {pending.length === 0 ? (
            <Text style={{ color: colors.muted, textAlign: 'right' }}>
              {t('profile.pendingConsentEmpty')}
            </Text>
          ) : (
            pending.map((p) => (
              <View key={p.id} style={styles.pendingRow}>
                <Text style={{ fontWeight: '700', textAlign: 'right', color: colors.text }}>
                  {p.fullName}
                </Text>
                <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 2 }}>
                  {t('profile.pendingConsentPhone', { phone: p.parentPhone ?? '—' })}
                </Text>
                {consentBusyId === p.id ? (
                  <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />
                ) : (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={async () => {
                        setConsentBusyId(p.id);
                        setConsentNote(null);
                        const result = await markPlayerConsented(p.id);
                        setConsentBusyId(null);
                        if (result.ok) {
                          setConsentNote(result.note ?? t('profile.markConsentedDone'));
                          await loadPending();
                        } else {
                          setConsentNote(t('profile.markConsentedFailed', { error: result.error }));
                        }
                      }}
                      style={[layout.button, { backgroundColor: colors.primary, minHeight: 44 }]}
                    >
                      <Text style={[layout.buttonText, { color: '#fff' }]}>
                        {t('profile.markConsented')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        setConsentBusyId(p.id);
                        setConsentNote(null);
                        const result = await resendParentalConsentSms(p);
                        setConsentBusyId(null);
                        if (result.ok) {
                          setConsentNote(result.note ?? t('profile.smsModeSimulated'));
                        } else {
                          setConsentNote(t('profile.markConsentedFailed', { error: result.error }));
                        }
                      }}
                      style={[
                        layout.button,
                        { backgroundColor: colors.secondary, minHeight: 44 },
                      ]}
                    >
                      <Text style={[layout.buttonText, { color: '#fff' }]}>
                        {t('profile.resendSms')}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      ) : null}

      {isDemoMode ? (
        <>
          <Text style={styles.label}>{t('profile.switchDemoRole')}</Text>
          <View style={styles.row}>
            {(['player', 'parent', 'head_coach', 'fitness_coach', 'physio'] as Role[]).map((role) => (
              <Pressable
                key={role}
                onPress={() => switchDemoRole(role)}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: user?.role === role ? colors.secondary : '#fff',
                  },
                ]}
              >
                <Text
                  style={{
                    color: user?.role === role ? '#fff' : colors.primary,
                    fontWeight: '700',
                  }}
                >
                  {translateRole(role)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={() => {
          signOut();
          router.replace(isDemoMode ? '/onboarding/invite' : '/onboarding/auth');
        }}
        style={[layout.button, { backgroundColor: colors.danger, marginTop: 24 }]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>{t('profile.signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  consentCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  pendingRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  label: {
    marginTop: 24,
    marginBottom: 8,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
