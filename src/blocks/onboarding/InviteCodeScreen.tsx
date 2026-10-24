/**
 * הזנת קוד הזמנה — מפעיל מיתוג מועדון (setBrand) ומאפשר מסך פרופיל.
 * בדמו מציגים רמז ל־HAP-U16-2026; ב־live מחפשים teams.invite_code.
 */
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
import { DEMO_INVITE_CODE } from '@/lib/demo-data';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { layout, rtlContainerProps, rtlInput, rtlText, useTheme } from '@/theme/ThemeContext';

export function InviteCodeScreen() {
  const { colors, brand } = useTheme();
  const { redeemInvite } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const result = await redeemInvite(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/onboarding/profile');
  };

  return (
    <View
      {...rtlContainerProps}
      style={[layout.screen, { backgroundColor: colors.background }]}
    >
      <Text style={[layout.title, { color: colors.primary }]}>{brand.name}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('invite.subtitle')}</Text>

      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        textAlign="center"
        placeholder="HAP-U16-2026"
        placeholderTextColor={colors.muted}
        value={code}
        onChangeText={setCode}
        style={[styles.input, { borderColor: colors.primary, color: colors.text }]}
      />

      {error ? (
        <Text style={[{ color: colors.danger, marginTop: 8 }, rtlText]}>{error}</Text>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={[layout.button, styles.cta, { backgroundColor: colors.secondary }]}
        >
          <Text style={[layout.buttonText, { color: colors.primary }]}>{t('invite.continue')}</Text>
        </Pressable>
      )}

      {isDemoMode ? (
        <Pressable onPress={() => setCode(DEMO_INVITE_CODE)} style={styles.hint}>
          <Text style={[{ color: colors.muted }, rtlText]}>
            {t('invite.demoCode', { code: DEMO_INVITE_CODE })}
          </Text>
          <Text style={{ color: colors.muted, textAlign: 'right', marginTop: 4 }}>
            {t('invite.legacyAliasHint')}
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.hint, { color: colors.muted }, rtlText]}>
          {t('invite.afterSeed', { code: DEMO_INVITE_CODE })}
        </Text>
      )}
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
    ...rtlInput,
  },
  cta: { marginTop: 16 },
  hint: { marginTop: 20 },
});
