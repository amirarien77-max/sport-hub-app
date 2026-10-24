/**
 * אישור הורי לילדים מתחת ל־13 (מודול מיתוג + SMS).
 * שולח דרך Edge `parental-consent-sms` או סימולציה; רושם ל־parental_consent_requests.
 * סימון הסכמה בפועל: RPC `mark_parental_consent` (צוות בלבד).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildParentalConsentSmsBody,
  makeConsentToken,
  simulateParentalConsentSms,
  type SmsProviderMode,
  type SmsSendResult,
} from '@/lib/sms-provider';

export type PendingConsentPlayer = {
  id: string;
  fullName: string;
  parentPhone: string | null;
  consentStatus: string;
};

export async function listPendingConsentPlayers(
  client: SupabaseClient,
  teamId: string,
): Promise<PendingConsentPlayer[]> {
  const { data, error } = await client
    .from('users')
    .select('id, full_name, parent_phone, consent_status')
    .eq('team_id', teamId)
    .eq('role', 'player')
    .eq('consent_status', 'pending_parental_consent')
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    parentPhone: (row.parent_phone as string | null) ?? null,
    consentStatus: row.consent_status as string,
  }));
}

export async function markParentalConsentLive(
  client: SupabaseClient,
  playerId: string,
): Promise<void> {
  const { error } = await client.rpc('mark_parental_consent', { p_player_id: playerId });
  if (error) throw new Error(error.message);
}

/**
 * Create/refresh a consent request row and send SMS (Twilio edge or simulated).
 */
export async function requestParentalConsentSms(input: {
  client: SupabaseClient | null;
  playerId: string;
  teamId: string;
  parentPhone: string;
  playerName: string;
  clubName: string;
}): Promise<SmsSendResult & { token: string }> {
  const token = makeConsentToken();
  const bodyHe = buildParentalConsentSmsBody({
    playerName: input.playerName,
    clubName: input.clubName,
    token,
  });

  let sendResult: SmsSendResult;

  if (input.client) {
    try {
      const { data, error } = await input.client.functions.invoke('parental-consent-sms', {
        body: {
          to: input.parentPhone,
          playerName: input.playerName,
          clubName: input.clubName,
          token,
          bodyHe,
        },
      });
      if (error) {
        console.warn('parental-consent-sms invoke', error.message);
        sendResult = simulateParentalConsentSms({
          to: input.parentPhone,
          playerName: input.playerName,
          clubName: input.clubName,
          token,
          bodyHe,
        });
      } else {
        const mode = (data as { mode?: SmsProviderMode } | null)?.mode;
        const sid = (data as { sid?: string } | null)?.sid;
        if (mode === 'twilio') {
          sendResult = {
            ok: true,
            mode: 'twilio',
            sid,
            loggedPayload: {
              to: input.parentPhone,
              playerName: input.playerName,
              clubName: input.clubName,
              token,
              bodyHe,
            },
          };
        } else {
          sendResult = simulateParentalConsentSms({
            to: input.parentPhone,
            playerName: input.playerName,
            clubName: input.clubName,
            token,
            bodyHe,
          });
        }
      }
    } catch (err) {
      console.warn('parental-consent-sms failed', err);
      sendResult = simulateParentalConsentSms({
        to: input.parentPhone,
        playerName: input.playerName,
        clubName: input.clubName,
        token,
        bodyHe,
      });
    }
  } else {
    sendResult = simulateParentalConsentSms({
      to: input.parentPhone,
      playerName: input.playerName,
      clubName: input.clubName,
      token,
      bodyHe,
    });
  }

  if (input.client && sendResult.ok) {
    const status = sendResult.mode === 'twilio' ? 'sent' : 'simulated';
    const { error: insertErr } = await input.client.from('parental_consent_requests').insert({
      player_id: input.playerId,
      team_id: input.teamId,
      parent_phone: input.parentPhone,
      token,
      status,
      provider: sendResult.mode,
      sms_payload_log: JSON.stringify(sendResult.loggedPayload),
      sent_at: new Date().toISOString(),
    });
    if (insertErr) {
      // Table may be missing until migration 013 — still return send result.
      console.warn('parental_consent_requests insert', insertErr.message);
    }
  }

  return { ...sendResult, token };
}
