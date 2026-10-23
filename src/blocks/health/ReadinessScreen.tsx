import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  t,
  translateBodyRegion,
  translateBodySubRegion,
  translatePainSeverity,
} from '@/i18n';
import { coachHealthAccess } from '@/lib/demo-data';
import { canLogReadiness, isHealthStaff } from '@/lib/roles';
import { useSession } from '@/session/SessionContext';
import { layout, useTheme } from '@/theme/ThemeContext';
import type { PainSeverity } from '@/types';

const BODY_REGIONS: Record<string, string[]> = {
  foot: ['Heel', 'Arch', 'Toes'],
  lower_leg: ['Achilles', 'Shin (anterior)', 'Calf'],
  knee: ['Patella', 'Medial', 'Lateral'],
  thigh: ['Quad', 'Hamstring', 'Adductor'],
  hip: ['Flexor', 'Glute'],
  back: ['Lower back', 'Upper back'],
  shoulder: ['Anterior', 'Posterior'],
  arm: ['Elbow', 'Wrist'],
};

const MAX_SLEEP_WATER = 24;

function accessLabel(access: 'write' | 'read' | 'none'): string {
  if (access === 'write') return t('health.accessWrite');
  if (access === 'read') return t('health.accessRead');
  return t('health.accessNone');
}

/** Parse a 0–24 value; returns error key or the number. */
function parseBounded(raw: string): { ok: true; value: number } | { ok: false; errorKey: string } {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return { ok: false, errorKey: 'health.invalidNumber' };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, errorKey: 'health.invalidNumber' };
  if (n < 0) return { ok: false, errorKey: 'health.invalidNumber' };
  if (n > MAX_SLEEP_WATER) return { ok: false, errorKey: 'over' };
  return { ok: true, value: n };
}

export function ReadinessScreen() {
  const { colors } = useTheme();
  const { submitReadiness, submitPain, readiness, pain, user, team } = useSession();
  const [rpe, setRpe] = useState<number | null>(null);
  const [sleep, setSleep] = useState('8');
  const [water, setWater] = useState('2');
  const [sleepError, setSleepError] = useState<string | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [subRegion, setSubRegion] = useState<string | null>(null);
  const [severity, setSeverity] = useState<PainSeverity>('soreness');

  const access = user && team ? coachHealthAccess(team, user.role) : 'none';
  const isPlayer = canLogReadiness(user?.role);
  const isCoach = isHealthStaff(user?.role);

  const subtitle = isCoach
    ? t('health.subtitleCoach')
    : user?.role === 'parent'
      ? t('health.subtitleParent')
      : t('health.subtitle');

  const onSleepChange = (text: string) => {
    setSleep(text);
    const parsed = parseBounded(text);
    if (!parsed.ok) {
      setSleepError(
        parsed.errorKey === 'over' ? t('health.sleepOverLimit') : t(parsed.errorKey),
      );
    } else {
      setSleepError(null);
    }
  };

  const onWaterChange = (text: string) => {
    setWater(text);
    const parsed = parseBounded(text);
    if (!parsed.ok) {
      setWaterError(
        parsed.errorKey === 'over' ? t('health.waterOverLimit') : t(parsed.errorKey),
      );
    } else {
      setWaterError(null);
    }
  };

  const onSaveReadiness = () => {
    if (rpe == null) {
      Alert.alert(t('health.title'), t('health.readinessNeedRpe'));
      return;
    }
    const sleepParsed = parseBounded(sleep);
    const waterParsed = parseBounded(water);
    if (!sleepParsed.ok) {
      const msg =
        sleepParsed.errorKey === 'over' ? t('health.sleepOverLimit') : t(sleepParsed.errorKey);
      setSleepError(msg);
      Alert.alert(t('health.title'), msg);
      return;
    }
    if (!waterParsed.ok) {
      const msg =
        waterParsed.errorKey === 'over' ? t('health.waterOverLimit') : t(waterParsed.errorKey);
      setWaterError(msg);
      Alert.alert(t('health.title'), msg);
      return;
    }
    submitReadiness(rpe, sleepParsed.value, waterParsed.value);
    Alert.alert(t('health.readinessSavedTitle'), t('health.lastReady', {
      rpe,
      sleep: sleepParsed.value,
      water: waterParsed.value,
    }));
  };

  const onLogPain = () => {
    if (!region || !subRegion) {
      Alert.alert(t('health.painMap'), t('health.logPainNeedSubregion'));
      return;
    }
    submitPain(region, subRegion, severity);
    Alert.alert(
      t('health.logPainSuccessTitle'),
      t('health.logPainSuccessBody', {
        region: translateBodyRegion(region),
        sub: translateBodySubRegion(subRegion),
        severity: translatePainSeverity(severity),
      }),
    );
    setRegion(null);
    setSubRegion(null);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('health.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{subtitle}</Text>

      {isCoach && access !== 'none' ? (
        <View style={[styles.panel, { borderColor: colors.warning }]}>
          <Text style={{ fontWeight: '800', color: colors.primary, textAlign: 'right' }}>
            {t('health.coachBoard')}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
            {t('health.access', { access: accessLabel(access) })}
            {!team?.hasFitnessStaff && !team?.hasPhysioStaff ? t('health.inheritedWrite') : ''}
          </Text>
          {pain.length === 0 ? (
            <Text style={{ marginTop: 8, color: colors.muted, textAlign: 'right' }}>
              {t('health.emptyPainCoach')}
            </Text>
          ) : (
            pain.map((p) => (
              <Text
                key={p.id}
                style={{
                  marginTop: 8,
                  color: p.severity === 'disabling' ? colors.danger : colors.warning,
                  textAlign: 'right',
                }}
              >
                {translateBodySubRegion(p.subRegion)} — {translatePainSeverity(p.severity)}
              </Text>
            ))
          )}
        </View>
      ) : null}

      {isPlayer ? (
        <>
          <Text style={styles.section}>{t('health.todaysRpe')}</Text>
          <View style={styles.rpeGrid}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                onPress={() => setRpe(n)}
                style={[
                  styles.rpeBtn,
                  {
                    backgroundColor: rpe === n ? colors.secondary : '#fff',
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text style={{ fontWeight: '800', fontSize: 18, color: colors.primary }}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>{t('health.sleep')}</Text>
          <Text style={styles.hint}>{t('health.sleepWaterHint')}</Text>
          <TextInput
            keyboardType="decimal-pad"
            textAlign="right"
            value={sleep}
            onChangeText={onSleepChange}
            style={[
              styles.input,
              { borderColor: sleepError ? colors.danger : colors.primary },
            ]}
          />
          {sleepError ? (
            <Text style={[styles.error, { color: colors.danger }]}>{sleepError}</Text>
          ) : null}

          <Text style={styles.section}>{t('health.water')}</Text>
          <Text style={styles.hint}>{t('health.sleepWaterHint')}</Text>
          <TextInput
            keyboardType="decimal-pad"
            textAlign="right"
            value={water}
            onChangeText={onWaterChange}
            style={[
              styles.input,
              { borderColor: waterError ? colors.danger : colors.primary },
            ]}
          />
          {waterError ? (
            <Text style={[styles.error, { color: colors.danger }]}>{waterError}</Text>
          ) : null}

          <Pressable
            onPress={onSaveReadiness}
            style={[layout.button, { backgroundColor: colors.primary, marginTop: 14 }]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('health.saveReadiness')}</Text>
          </Pressable>

          <Text style={[styles.section, { marginTop: 24 }]}>{t('health.painMap')}</Text>
          {!region ? (
            <View style={styles.regionGrid}>
              {Object.keys(BODY_REGIONS).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setRegion(key)}
                  style={[styles.region, { borderColor: colors.primary }]}
                >
                  <Text style={{ fontWeight: '700', color: colors.primary }}>
                    {translateBodyRegion(key)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View>
              <Pressable
                onPress={() => {
                  setRegion(null);
                  setSubRegion(null);
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: '700', textAlign: 'right' }}>
                  {t('health.backToBody')}
                </Text>
              </Pressable>
              <View style={styles.regionGrid}>
                {BODY_REGIONS[region].map((sub) => (
                  <Pressable
                    key={sub}
                    onPress={() => setSubRegion(sub)}
                    style={[
                      styles.region,
                      {
                        borderColor: colors.primary,
                        backgroundColor: subRegion === sub ? colors.secondary : '#fff',
                      },
                    ]}
                  >
                    <Text style={{ fontWeight: '700', color: colors.primary }}>
                      {translateBodySubRegion(sub)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                {(['soreness', 'disabling'] as PainSeverity[]).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSeverity(s)}
                    style={[
                      layout.button,
                      styles.half,
                      {
                        backgroundColor: severity === s ? colors.danger : '#fff',
                        borderWidth: 1,
                        borderColor: colors.danger,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        layout.buttonText,
                        { color: severity === s ? '#fff' : colors.danger, fontSize: 14 },
                      ]}
                    >
                      {translatePainSeverity(s)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={onLogPain}
                style={[
                  layout.button,
                  {
                    backgroundColor: subRegion ? colors.secondary : colors.muted,
                    marginTop: 12,
                  },
                ]}
              >
                <Text style={[layout.buttonText, { color: colors.primary }]}>
                  {t('health.logPain')}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      {isPlayer && readiness[0] ? (
        <Text style={{ marginTop: 16, color: colors.muted, textAlign: 'right' }}>
          {t('health.lastReady', {
            rpe: readiness[0].rpe,
            sleep: readiness[0].sleepHours,
            water: readiness[0].waterLiters,
          })}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  hint: {
    marginBottom: 6,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'right',
  },
  error: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rpeBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    fontSize: 16,
    writingDirection: 'rtl',
  },
  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  region: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  half: { flex: 1 },
});
