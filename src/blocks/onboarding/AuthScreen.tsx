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
import { t } from '@/i18n';
import { useSession } from '@/session/SessionContext';
import { layout, rtlInput, rtlText, rtlTextAlign, useTheme } from '@/theme/ThemeContext';

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
      <Text style={[layout.title, { color: colors.primary }]}>{t('auth.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('auth.subtitle')}</Text>

      <Text style={layout.label}>{t('auth.email')}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textAlign={rtlTextAlign}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.emailPlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={layout.label}>{t('auth.password')}</Text>
      <TextInput
        secureTextEntry
        textAlign={rtlTextAlign}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      {error ? (
        <Text style={[{ color: colors.danger, marginTop: 8 }, rtlText]}>{error}</Text>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <>
          <Pressable
            onPress={() => run('in')}
            style={[layout.button, { backgroundColor: colors.secondary, marginTop: 20 }]}
          >
            <Text style={[layout.buttonText, { color: colors.primary }]}>{t('auth.signIn')}</Text>
          </Pressable>
          <Pressable
            onPress={() => run('up')}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 12 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('auth.createAccount')}</Text>
          </Pressable>
        </>
      )}
    </View>
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
});
