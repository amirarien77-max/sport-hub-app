import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';
import type { Role } from '@/types';

export default function ProfileRoute() {
  const { colors, brand } = useTheme();
  const { user, team, switchDemoRole, signOut } = useSession();

  return (
    <View style={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>Profile</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        {user?.fullName} · {user?.role}
      </Text>
      <Text style={{ marginTop: 8, color: colors.text }}>
        Club: {brand.name} · Team: {team?.name ?? '—'}
      </Text>
      <Text style={{ marginTop: 4, color: colors.muted }}>
        Consent: {user?.consentStatus} · Mode: {isDemoMode ? 'demo' : 'supabase'}
      </Text>

      <Text style={styles.label}>Switch demo role</Text>
      <View style={styles.row}>
        {(['player', 'parent', 'head_coach'] as Role[]).map((role) => (
          <Pressable
            key={role}
            onPress={() => switchDemoRole(role)}
            style={[styles.chip, { borderColor: colors.primary }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{role}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => {
          signOut();
          router.replace('/onboarding/invite');
        }}
        style={[layout.button, { backgroundColor: colors.danger, marginTop: 24 }]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 24, marginBottom: 8, fontWeight: '800', color: '#334155' },
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
