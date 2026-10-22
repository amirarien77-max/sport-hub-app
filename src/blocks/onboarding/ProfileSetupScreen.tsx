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
import type { Role } from '@/types';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

const ROLES: { value: Role; label: string }[] = [
  { value: 'player', label: 'Player' },
  { value: 'parent', label: 'Parent' },
  { value: 'head_coach', label: 'Head coach' },
  { value: 'assistant_coach', label: 'Assistant' },
];

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
      <Text style={[layout.title, { color: colors.primary }]}>Join {brand.name}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Under-13 players need a parent phone and stay off the team feed until SMS consent.
      </Text>

      <Text style={styles.label}>Full name</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={styles.label}>Role</Text>
      <View style={styles.row}>
        {ROLES.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => setRole(r.value)}
            style={[
              styles.chip,
              {
                backgroundColor: role === r.value ? colors.primary : '#fff',
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={{ color: role === r.value ? '#fff' : colors.primary, fontWeight: '700' }}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {role === 'player' ? (
        <>
          <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
          <TextInput
            value={dob}
            onChangeText={setDob}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
          <Text style={styles.label}>Parent phone (required if under 13)</Text>
          <TextInput
            keyboardType="phone-pad"
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder="+972..."
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
          />
        </>
      ) : null}

      {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <Pressable
          onPress={onSubmit}
          style={[layout.button, { backgroundColor: colors.secondary, marginTop: 20 }]}
        >
          <Text style={[layout.buttonText, { color: colors.primary }]}>Enter hub</Text>
        </Pressable>
      )}

      {isDemoMode ? (
        <>
          <Text style={[styles.label, { marginTop: 28 }]}>Quick demo personas</Text>
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
                <Text style={{ color: colors.accent, fontWeight: '700' }}>{r}</Text>
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
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
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
