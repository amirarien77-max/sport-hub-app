import { Redirect } from 'expo-router';
import { useSession } from '@/session/SessionContext';

export default function Index() {
  const { onboarded } = useSession();
  if (onboarded) {
    return <Redirect href="/(tabs)/schedule" />;
  }
  return <Redirect href="/onboarding/invite" />;
}
