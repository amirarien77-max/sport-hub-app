/**
 * טאבים ראשיים. כותרת = שם המועדון (מיתוג).
 * טאב נוכחות מוסתר לשחקן/הורה (`href: null`) — רק צוות אימון.
 * טאב תרגילים מוסתר להורה.
 * טאב דף קשר — הורים, שחקנים ומאמנים (CRUD למאמן).
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { isAttendanceCoach, normalizeRole } from '@/lib/roles';
import { useSession } from '@/session/SessionContext';
import { useTheme } from '@/theme/ThemeContext';

export default function TabsLayout() {
  const { colors, brand } = useTheme();
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const showAttendance = isAttendanceCoach(user?.role);
  const showPlays = role !== 'parent';
  const showContacts =
    role === 'parent' ||
    role === 'player' ||
    isAttendanceCoach(user?.role) ||
    role === 'equipment_manager' ||
    role === 'fitness_coach' ||
    role === 'physio';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitle: brand.name,
        headerTitleAlign: 'center',
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: '#fff' },
        tabBarLabelStyle: { writingDirection: 'rtl', textAlign: 'center' },
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: t('tabs.attendance'),
          href: showAttendance ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="readiness"
        options={{
          title: t('tabs.health'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="plays"
        options={{
          title: t('tabs.plays'),
          href: showPlays ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="basketball-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t('tabs.contacts'),
          href: showContacts ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color as string} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
