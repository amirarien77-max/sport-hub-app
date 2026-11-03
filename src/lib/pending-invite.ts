/**
 * Persist redeemed invite across hydrate / reload while public.users is still missing.
 * Without this, auth TOKEN_REFRESHED / remount clears in-memory inviteOk and the join
 * screen shows «הזינו קוד הזמנה קודם» with no code field.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PendingInvite = {
  inviteCode: string;
  teamId: string;
};

function storageKey(authId: string): string {
  return `sport-hub:pending-invite:${authId}`;
}

export async function savePendingInvite(
  authId: string,
  pending: PendingInvite,
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(authId), JSON.stringify(pending));
  } catch (err) {
    console.warn('savePendingInvite', err instanceof Error ? err.message : err);
  }
}

export async function loadPendingInvite(authId: string): Promise<PendingInvite | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(authId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingInvite>;
    if (
      typeof parsed.inviteCode === 'string' &&
      parsed.inviteCode.trim() &&
      typeof parsed.teamId === 'string' &&
      parsed.teamId.trim()
    ) {
      return { inviteCode: parsed.inviteCode.trim(), teamId: parsed.teamId.trim() };
    }
    return null;
  } catch (err) {
    console.warn('loadPendingInvite', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function clearPendingInvite(authId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(authId));
  } catch (err) {
    console.warn('clearPendingInvite', err instanceof Error ? err.message : err);
  }
}
