import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';

export function AuthScreen() {
  const { colors } = useTheme();
  const { signIn, signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode: 'in' | 'up') => {
    setBusy(true);
    setError(null);
    const result = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/');
  };

  return (
    <View style={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>Sign in</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        Use your club email to connect to the live Supabase project. After auth, redeem your invite
        code.
      </Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@club.com"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <>
          <Pressable
            onPress={() => run('in')}
            style={[layout.button, { backgroundColor: colors.secondary, marginTop: 20 }]}
          >
            <Text style={[layout.buttonText, { color: colors.primary }]}>Sign in</Text>
          </Pressable>
          <Pressable
            onPress={() => run('up')}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 12 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>Create account</Text>
          </Pressable>
        </>
      )}
    </View>
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
});
