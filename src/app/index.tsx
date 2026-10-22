import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { useTheme } from '@/theme/ThemeContext';

export default function Index() {
  const { colors } = useTheme();
  const { authReady, authUserId, onboarded, inviteOk } = useSession();

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (onboarded) {
    return <Redirect href="/(tabs)/schedule" />;
  }

  if (!isDemoMode && !authUserId) {
    return <Redirect href="/onboarding/auth" />;
  }

  if (!inviteOk) {
    return <Redirect href="/onboarding/invite" />;
  }

  return <Redirect href="/onboarding/profile" />;
}
