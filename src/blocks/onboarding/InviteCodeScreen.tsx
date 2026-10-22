import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { DEMO_INVITE_CODE } from '@/lib/demo-data';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

export function InviteCodeScreen() {
  const { colors, brand } = useTheme();
  const { redeemInvite } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    const result = redeemInvite(code);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push('/onboarding/profile');
  };

  return (
    <View style={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>{brand.name}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Enter your club invite code to join. Colors apply as soon as the code is valid.
      </Text>

      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="MAC-U16-2026"
        placeholderTextColor={colors.muted}
        value={code}
        onChangeText={setCode}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={[layout.button, styles.cta, { backgroundColor: colors.secondary }]}
      >
        <Text style={[layout.buttonText, { color: colors.primary }]}>Continue</Text>
      </Pressable>

      <Pressable onPress={() => setCode(DEMO_INVITE_CODE)} style={styles.hint}>
        <Text style={{ color: colors.muted }}>Demo code: {DEMO_INVITE_CODE}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: 28,
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: '#fff',
  },
  cta: { marginTop: 16 },
  hint: { marginTop: 20 },
});
