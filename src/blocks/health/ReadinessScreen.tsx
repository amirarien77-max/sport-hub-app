/**
 * מסך בריאות (מודול 3):
 * - שחקן: רמת קושי (1–10) + שינה/מים (תקרה 24) + מפת כאב
 * - צוות: לוח סיכון (buildPlayerRiskRows) לפי coachHealthAccess
 * - הורה: ללא נתונים רפואיים (מסך הסבר בלבד)
 */
import { useMemo, useState } from 'react';
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
import { buildPlayerRiskRows, type PlayerRiskLevel } from '@/lib/health-live';
import { canLogReadiness, coachHealthAccess, isHealthStaff } from '@/lib/roles';
import { isDemoMode } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import {
  layout,
  rtlContainerProps,
  rtlInput,
  rtlLayout,
  rtlText,
  rtlTextAlign,
  useTheme,
} from '@/theme/ThemeContext';
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

function riskLabel(level: PlayerRiskLevel): string {
  if (level === 'high') return t('health.riskHigh');
  if (level === 'watch') return t('health.riskWatch');
  return t('health.riskOk');
}

function reasonLabel(key: string): string {
  return t(`health.riskReasons.${key}`);
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
  const {
    submitReadiness,
    submitPain,
    readiness,
    pain,
    healthPlayers,
    user,
    team,
    toggleDemoMedicalStaff,
  } = useSession();
  const [rpe, setRpe] = useState<number | null>(null);
  const [sleep, setSleep] = useState('8');
  const [water, setWater] = useState('2');
  const [sleepError, setSleepError] = useState<string | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [subRegion, setSubRegion] = useState<string | null>(null);
  const [severity, setSeverity] = useState<PainSeverity>('soreness');
  const [saving, setSaving] = useState(false);

  const access = user && team ? coachHealthAccess(team, user.role) : 'none';
  const isPlayer = canLogReadiness(user?.role);
  const isCoach = isHealthStaff(user?.role);
  const isParent = user?.role === 'parent';

  const riskRows = useMemo(
    () => buildPlayerRiskRows(healthPlayers, readiness, pain),
    [healthPlayers, readiness, pain],
  );

  const subtitle = isCoach
    ? t('health.subtitleCoach')
    : isParent
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

  const onSaveReadiness = async () => {
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
    setSaving(true);
    try {
      const result = await Promise.resolve(
        submitReadiness(rpe, sleepParsed.value, waterParsed.value),
      );
      if (!result.ok) {
        Alert.alert(t('health.title'), result.error);
        return;
      }
      Alert.alert(
        t('health.readinessSavedTitle'),
        t('health.lastReady', {
          rpe,
          sleep: sleepParsed.value,
          water: waterParsed.value,
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const onLogPain = async () => {
    if (!region || !subRegion) {
      Alert.alert(t('health.painMap'), t('health.logPainNeedSubregion'));
      return;
    }
    setSaving(true);
    try {
      const result = await Promise.resolve(submitPain(region, subRegion, severity));
      if (!result.ok) {
        Alert.alert(t('health.painMap'), result.error);
        return;
      }
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
    } finally {
      setSaving(false);
    }
  };

  const riskColor = (level: PlayerRiskLevel) => {
    if (level === 'high') return colors.danger;
    if (level === 'watch') return colors.warning;
    return colors.muted;
  };

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('health.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{subtitle}</Text>

      {isParent ? (
        <View
          {...rtlContainerProps}
          style={[
            styles.panel,
            rtlLayout.box,
            { borderColor: colors.muted, backgroundColor: '#F8FAFC' },
          ]}
        >
          <Text style={[{color: colors.muted, lineHeight: 22}, rtlText]}>
            {t('health.parentBlocked')}
          </Text>
        </View>
      ) : null}

      {isCoach && access !== 'none' ? (
        <View
          {...rtlContainerProps}
          style={[styles.panel, rtlLayout.box, { borderColor: colors.warning }]}
        >
          <Text style={[{fontWeight: '800', color: colors.primary}, rtlText]}>
            {t('health.coachBoard')}
          </Text>
          <Text style={[{color: colors.muted, marginTop: 4}, rtlText]}>
            {t('health.access', { access: accessLabel(access) })}
            {user?.role === 'head_coach' && !team?.hasFitnessStaff && !team?.hasPhysioStaff
              ? t('health.inheritedWrite')
              : ''}
            {user?.role === 'head_coach' && (team?.hasFitnessStaff || team?.hasPhysioStaff)
              ? t('health.specialistReadOnly')
              : ''}
          </Text>

          {isDemoMode ? (
            <View style={[rtlLayout.row, { marginTop: 10 }]}>
              <Pressable
                onPress={() => toggleDemoMedicalStaff('fitness')}
                style={[
                  styles.demoChip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: team?.hasFitnessStaff ? colors.secondary : '#fff',
                  },
                ]}
              >
                <Text style={{ fontWeight: '700', color: colors.primary, fontSize: 12 }}>
                  {t('health.demoToggleFitness')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleDemoMedicalStaff('physio')}
                style={[
                  styles.demoChip,
                  {
                    borderColor: colors.primary,
                    backgroundColor: team?.hasPhysioStaff ? colors.secondary : '#fff',
                  },
                ]}
              >
                <Text style={{ fontWeight: '700', color: colors.primary, fontSize: 12 }}>
                  {t('health.demoTogglePhysio')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {riskRows.length === 0 ? (
            <Text style={[{marginTop: 8, color: colors.muted}, rtlText]}>
              {t('health.emptyPainCoach')}
            </Text>
          ) : (
            riskRows.map((row) => (
              <View
                key={row.playerId}
                {...rtlContainerProps}
                style={[
                  styles.riskCard,
                  rtlLayout.box,
                  {
                    borderColor: riskColor(row.level),
                    backgroundColor:
                      row.level === 'high'
                        ? '#FEF2F2'
                        : row.level === 'watch'
                          ? '#FFFBEB'
                          : '#F8FAFC',
                  },
                ]}
              >
                <View style={[rtlLayout.row, { alignItems: 'center', flexWrap: 'nowrap' }]}>
                  <Text style={[{fontWeight: '800', color: colors.primary, flex: 1}, rtlText]}>
                    {row.playerName}
                  </Text>
                  <Text style={{ fontWeight: '800', color: riskColor(row.level) }}>
                    {riskLabel(row.level)}
                  </Text>
                </View>
                <Text style={[{marginTop: 4, color: colors.muted, fontSize: 13}, rtlText]}>
                  {row.latestRpe != null
                    ? t('health.coachRpeLine', {
                        rpe: row.latestRpe,
                        sleep: row.latestSleep ?? '—',
                        water: row.latestWater ?? '—',
                      })
                    : t('health.noReadinessYet')}
                </Text>
                {row.reasons.length > 0 ? (
                  <Text style={[{marginTop: 4, color: riskColor(row.level), fontSize: 13}, rtlText]}>
                    {row.reasons.map(reasonLabel).join(' · ')}
                  </Text>
                ) : null}
                {row.openPain.map((p) => (
                  <Text
                    key={p.id}
                    style={[{marginTop: 6,
                      color: p.severity === 'disabling' ? colors.danger : colors.warning,
                      fontWeight: '600'}, rtlText]}
                  >
                    {translateBodyRegion(p.region)} / {translateBodySubRegion(p.subRegion)} —{' '}
                    {translatePainSeverity(p.severity)}
                  </Text>
                ))}
              </View>
            ))
          )}
        </View>
      ) : null}

      {isPlayer ? (
        <>
          <Text style={styles.section}>{t('health.todaysRpe')}</Text>
          <View style={rtlLayout.row}>
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
            textAlign={rtlTextAlign}
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
            textAlign={rtlTextAlign}
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
            onPress={() => void onSaveReadiness()}
            disabled={saving}
            style={[
              layout.button,
              {
                backgroundColor: colors.primary,
                marginTop: 14,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[layout.buttonText, { color: '#fff' }]}>{t('health.saveReadiness')}</Text>
          </Pressable>

          <Text style={[styles.section, { marginTop: 24 }]}>{t('health.painMap')}</Text>
          <Text style={styles.hint}>{t('health.painMapHint')}</Text>
          {!region ? (
            <View style={[rtlLayout.row, { marginTop: 8 }]}>
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
                <Text style={[{color: colors.accent, fontWeight: '700'}, rtlText]}>
                  {t('health.backToBody')}
                </Text>
              </Pressable>
              <Text style={[styles.hint, { marginTop: 8 }]}>
                {t('health.zoomedRegion', { region: translateBodyRegion(region) })}
              </Text>
              <View style={[rtlLayout.row, { marginTop: 8 }]}>
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
              <View style={[rtlLayout.splitRow, { marginTop: 12 }]}>
                {(['soreness', 'disabling'] as PainSeverity[]).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSeverity(s)}
                    style={[
                      layout.button,
                      rtlLayout.half,
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
                onPress={() => void onLogPain()}
                disabled={saving}
                style={[
                  layout.button,
                  {
                    backgroundColor: subRegion ? colors.secondary : colors.muted,
                    marginTop: 12,
                    opacity: saving ? 0.7 : 1,
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
        <Text style={[{marginTop: 16, color: colors.muted}, rtlText]}>
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
    writingDirection: 'rtl',
  },
  riskCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    writingDirection: 'rtl',
  },


  demoChip: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '800',
    color: '#334155',
    ...rtlText,
  },
  hint: {
    marginBottom: 6,
    fontSize: 13,
    color: '#64748B',
    ...rtlText,
  },
  error: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    ...rtlText,
  },

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
    ...rtlInput,
  },

  region: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

});
