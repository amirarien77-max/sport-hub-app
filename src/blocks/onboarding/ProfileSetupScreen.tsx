/**
 * השלמת פרופיל אחרי הזמנה: שם + תפקיד (+ תאריך לידה / טלפון הורה לשחקן).
 * מתחת ל־13 → consent_status=pending + ניסיון SMS; הערה בעברית לפני מעבר ללו״ז.
 * אם דילגו על מסך ההזמנה / hydrate מחק inviteOk — שדה קוד הזמנה מוצג כאן.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RtlSelect } from '@/blocks/ui/RtlSelect';
import { router } from 'expo-router';
import { t, translateRole } from '@/i18n';
import type { Role } from '@/types';
import { DEMO_INVITE_CODE } from '@/lib/demo-data';
import { loadPendingInvite } from '@/lib/pending-invite';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import {
  layout,
  rtlContainerProps,
  rtlInput,
  rtlLayout,
  rtlText,
  rtlTextAlign,
  useTheme,
} from '@/theme/ThemeContext';

/** Coach roles first so live testers don't miss מאמן when picking a persona. */
const ROLE_VALUES: Role[] = ['head_coach', 'assistant_coach', 'player', 'parent'];
const ROLE_OPTIONS = ROLE_VALUES.map((value) => ({
  value,
  label: translateRole(value),
}));

export function ProfileSetupScreen() {
  const { colors, brand } = useTheme();
  const { completeOnboarding, switchDemoRole, inviteOk, team, authUserId } = useSession();
  const [fullName, setFullName] = useState('');
  /** Default to head coach so live QA / first-time club setup lands with create-play UI. */
  const [role, setRole] = useState<Role>('head_coach');
  const [dob, setDob] = useState('2012-04-12');
  const [parentPhone, setParentPhone] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsInviteField = !inviteOk || !team;

  useEffect(() => {
    if (!needsInviteField || !authUserId) return;
    let cancelled = false;
    void loadPendingInvite(authUserId).then((pending) => {
      if (cancelled || !pending?.inviteCode) return;
      setInviteCode((prev) => prev || pending.inviteCode);
    });
    return () => {
      cancelled = true;
    };
  }, [needsInviteField, authUserId]);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await completeOnboarding({
      fullName,
      role,
      dateOfBirth: role === 'player' ? dob : undefined,
      parentPhone: role === 'player' ? parentPhone : undefined,
      inviteCode: needsInviteField || inviteCode.trim() ? inviteCode : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.note) {
      setNote(result.note);
      // Brief pause so Hebrew SMS status is readable before navigation.
      setTimeout(() => router.replace('/(tabs)/schedule'), 1200);
      return;
    }
    router.replace('/(tabs)/schedule');
  };

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[layout.title, { color: colors.primary }]}>
        {t('profileSetup.title', { name: brand.name })}
      </Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('profileSetup.subtitle')}</Text>

      {needsInviteField ? (
        <>
          <Text style={layout.label}>{t('profileSetup.inviteCode')}</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            textAlign="center"
            placeholder={DEMO_INVITE_CODE}
            placeholderTextColor={colors.muted}
            value={inviteCode}
            onChangeText={setInviteCode}
            style={[styles.inviteInput, { borderColor: colors.primary, color: colors.text }]}
          />
          <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
            {t('profileSetup.inviteCodeHint', { code: DEMO_INVITE_CODE })}
          </Text>
        </>
      ) : (
        <Text style={[{ color: colors.success, marginBottom: 12 }, rtlText]}>
          {t('profileSetup.inviteReady')}
        </Text>
      )}

      <Text style={layout.label}>{t('profileSetup.fullName')}</Text>
      <TextInput
        textAlign={rtlTextAlign}
        value={fullName}
        onChangeText={setFullName}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={layout.label}>{t('profileSetup.role')}</Text>
      <RtlSelect
        testID="profile-role-select"
        options={ROLE_OPTIONS}
        value={role}
        onChange={setRole}
        placeholder={t('ui.selectPlaceholder')}
        menuTitle={t('profileSetup.role')}
      />

      {role === 'player' ? (
        <>
          <Text style={layout.label}>{t('profileSetup.dob')}</Text>
          <TextInput
            textAlign={rtlTextAlign}
            value={dob}
            onChangeText={setDob}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
          <Text style={layout.label}>{t('profileSetup.parentPhone')}</Text>
          <TextInput
            keyboardType="phone-pad"
            textAlign={rtlTextAlign}
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder={t('profileSetup.parentPhonePlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
        </>
      ) : null}

      {error ? (
        <Text style={[{ color: colors.danger, marginTop: 8 }, rtlText]}>{error}</Text>
      ) : null}
      {note ? (
        <Text style={[{ color: colors.success, marginTop: 8 }, rtlText]}>{note}</Text>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <Pressable
          onPress={onSubmit}
          style={[layout.button, { backgroundColor: colors.secondary, marginTop: 20 }]}
        >
          <Text style={[layout.buttonText, { color: colors.primary }]}>
            {t('profileSetup.enterHub')}
          </Text>
        </Pressable>
      )}

      {needsInviteField ? (
        <Pressable
          onPress={() => router.push('/onboarding/invite')}
          style={{ marginTop: 16 }}
        >
          <Text style={[{ color: colors.muted, textDecorationLine: 'underline' }, rtlText]}>
            {t('profileSetup.backToInvite')}
          </Text>
        </Pressable>
      ) : null}

      {isDemoMode ? (
        <>
          <Text style={[layout.label, { marginTop: 28 }]}>{t('profileSetup.quickPersonas')}</Text>
          <View style={rtlLayout.row}>
            {(['player', 'parent', 'head_coach'] as Role[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  switchDemoRole(r);
                  router.replace('/(tabs)/schedule');
                }}
                style={[styles.chip, { borderColor: colors.accent }]}
              >
                <Text style={[{ color: colors.accent, fontWeight: '700' }, rtlText]}>
                  {translateRole(r)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    ...rtlInput,
  },
  inviteInput: {
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: '#fff',
    marginBottom: 4,
    ...rtlInput,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
