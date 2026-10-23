import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  t,
  translateBodyRegion,
  translateBodySubRegion,
  translatePainSeverity,
} from '@/i18n';
import { coachHealthAccess } from '@/lib/demo-data';
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

function accessLabel(access: 'write' | 'read' | 'none'): string {
  if (access === 'write') return t('health.accessWrite');
  if (access === 'read') return t('health.accessRead');
  return t('health.accessNone');
}

export function ReadinessScreen() {
  const { colors } = useTheme();
  const { submitReadiness, submitPain, readiness, pain, user, team } = useSession();
  const [rpe, setRpe] = useState<number | null>(null);
  const [sleep, setSleep] = useState('8');
  const [water, setWater] = useState('2');
  const [region, setRegion] = useState<string | null>(null);
  const [subRegion, setSubRegion] = useState<string | null>(null);
  const [severity, setSeverity] = useState<PainSeverity>('soreness');

  const access = user && team ? coachHealthAccess(team, user.role) : 'none';
  const isPlayer = user?.role === 'player';

  return (
    <ScrollView contentContainerStyle={[layout.screen, { backgroundColor: colors.background }]}>
      <Text style={[layout.title, { color: colors.primary }]}>{t('health.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>{t('health.subtitle')}</Text>

      {access !== 'none' ? (
        <View style={[styles.panel, { borderColor: colors.warning }]}>
          <Text style={{ fontWeight: '800', color: colors.primary, textAlign: 'right' }}>
            {t('health.coachBoard')}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'right' }}>
            {t('health.access', { access: accessLabel(access) })}
            {!team?.hasFitnessStaff && !team?.hasPhysioStaff ? t('health.inheritedWrite') : ''}
          </Text>
          {pain.map((p) => (
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
          ))}
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
          <TextInput
            keyboardType="decimal-pad"
            textAlign="right"
            value={sleep}
            onChangeText={setSleep}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <Text style={styles.section}>{t('health.water')}</Text>
          <TextInput
            keyboardType="decimal-pad"
            textAlign="right"
            value={water}
            onChangeText={setWater}
            style={[styles.input, { borderColor: colors.primary }]}
          />

          <Pressable
            onPress={() => {
              if (rpe == null) return;
              submitReadiness(rpe, Number(sleep) || 0, Number(water) || 0);
            }}
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
                onPress={() => {
                  if (!region || !subRegion) return;
                  submitPain(region, subRegion, severity);
                  setRegion(null);
                  setSubRegion(null);
                }}
                style={[layout.button, { backgroundColor: colors.secondary, marginTop: 12 }]}
              >
                <Text style={[layout.buttonText, { color: colors.primary }]}>
                  {t('health.logPain')}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      {readiness[0] ? (
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
