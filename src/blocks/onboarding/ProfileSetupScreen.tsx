import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { t, translateRole } from '@/i18n';
import type { Role } from '@/types';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

const ROLE_VALUES: Role[] = ['player', 'parent', 'head_coach', 'assistant_coach'];

export function ProfileSetupScreen() {
  const { colors, brand } = useTheme();
  const { completeOnboarding, switchDemoRole } = useSession();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [dob, setDob] = useState('2012-04-12');
  const [parentPhone, setParentPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const result = await completeOnboarding({
      fullName,
      role,
      dateOfBirth: role === 'player' ? dob : undefined,
      parentPhone: role === 'player' ? parentPhone : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/(tabs)/schedule');
  };

  return (
    <ScrollView contentContainerStyle={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>
        {t('profileSetup.title', { name: brand.name })}
      </Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('profileSetup.subtitle')}</Text>

      <Text style={styles.label}>{t('profileSetup.fullName')}</Text>
      <TextInput
        textAlign="right"
        value={fullName}
        onChangeText={setFullName}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={styles.label}>{t('profileSetup.role')}</Text>
      <View style={styles.row}>
        {ROLE_VALUES.map((value) => (
          <Pressable
            key={value}
            onPress={() => setRole(value)}
            style={[
              styles.chip,
              {
                backgroundColor: role === value ? colors.primary : '#fff',
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={{ color: role === value ? '#fff' : colors.primary, fontWeight: '700' }}>
              {translateRole(value)}
            </Text>
          </Pressable>
        ))}
      </View>

      {role === 'player' ? (
        <>
          <Text style={styles.label}>{t('profileSetup.dob')}</Text>
          <TextInput
            textAlign="right"
            value={dob}
            onChangeText={setDob}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
          <Text style={styles.label}>{t('profileSetup.parentPhone')}</Text>
          <TextInput
            keyboardType="phone-pad"
            textAlign="right"
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder={t('profileSetup.parentPhonePlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
        </>
      ) : null}

      {error ? (
        <Text style={{ color: colors.danger, marginTop: 8, textAlign: 'right' }}>{error}</Text>
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

      {isDemoMode ? (
        <>
          <Text style={[styles.label, { marginTop: 28 }]}>{t('profileSetup.quickPersonas')}</Text>
          <View style={styles.row}>
            {(['player', 'parent', 'head_coach'] as Role[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  switchDemoRole(r);
                  router.replace('/(tabs)/schedule');
                }}
                style={[styles.chip, { borderColor: colors.accent }]}
              >
                <Text style={{ color: colors.accent, fontWeight: '700' }}>{translateRole(r)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
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
  },
});
