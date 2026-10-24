/**
 * Pluggable SMS provider for under-13 parental consent.
 * Twilio when TWILIO_* secrets exist on Edge Function; otherwise simulated send
 * (payload logged, Hebrew UX shows «מצב סימולציה»).
 */

export type SmsProviderMode = 'twilio' | 'simulated';

export type ParentalSmsPayload = {
  to: string;
  playerName: string;
  clubName: string;
  token: string;
  bodyHe: string;
};

export type SmsSendResult =
  | { ok: true; mode: SmsProviderMode; sid?: string; loggedPayload: ParentalSmsPayload }
  | { ok: false; error: string; loggedPayload?: ParentalSmsPayload };

export function buildParentalConsentSmsBody(input: {
  playerName: string;
  clubName: string;
  token: string;
}): string {
  return (
    `הפועל ירושלים / ${input.clubName}: נדרש אישור הורה לשחקן/ית ${input.playerName}. ` +
    `קוד אישור: ${input.token}. השיבו «מאשר» או פנו למאמן. ` +
    `(הודעה אוטומטית מ־Basketball Hub)`
  );
}

/** Client-side simulate when Edge Function / Twilio unavailable. */
export function simulateParentalConsentSms(
  input: Omit<ParentalSmsPayload, 'bodyHe'> & { bodyHe?: string },
): SmsSendResult {
  const bodyHe =
    input.bodyHe ??
    buildParentalConsentSmsBody({
      playerName: input.playerName,
      clubName: input.clubName,
      token: input.token,
    });
  const loggedPayload: ParentalSmsPayload = {
    to: input.to,
    playerName: input.playerName,
    clubName: input.clubName,
    token: input.token,
    bodyHe,
  };
  console.info('[sms-provider] simulated parental consent SMS', loggedPayload);
  return { ok: true, mode: 'simulated', loggedPayload };
}

export function makeConsentToken(): string {
  const part = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  return `HAP-${part()}-${part()}`;
}
