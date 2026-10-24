import '@/i18n';

import { LocaleProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { APP_DIRECTION } from '@/i18n';
import { SessionProvider } from '@/session/SessionContext';
import { ThemeProvider } from '@/theme/ThemeContext';

export default function RootLayout() {
  // Native Yoga: `direction`. Web: `dir` prop (RNW maps it; StyleSheet `direction` is rejected).
  const rootStyle =
    Platform.OS === 'web'
      ? { flex: 1 as const }
      : { flex: 1 as const, direction: APP_DIRECTION };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={rootStyle} {...(Platform.OS === 'web' ? { dir: APP_DIRECTION } : null)}>
        <SafeAreaProvider>
          <ThemeProvider>
            <SessionProvider>
              <LocaleProvider direction={APP_DIRECTION}>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }} />
              </LocaleProvider>
            </SessionProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
