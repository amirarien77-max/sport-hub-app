import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
      <Text style={[layout.title, { color: colors.primary }]}>Readiness & pain</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        RPE uses large 1–10 buttons (no sliders). Tap a body region to zoom into sub-areas.
      </Text>

      {access !== 'none' ? (
        <View style={[styles.panel, { borderColor: colors.warning }]}>
          <Text style={{ fontWeight: '800', color: colors.primary }}>Coach risk board</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            Access: {access}
            {!team?.hasFitnessStaff && !team?.hasPhysioStaff
              ? ' · Head coach inherited write (no fitness/physio on staff)'
              : ''}
          </Text>
          {pain.map((p) => (
            <Text key={p.id} style={{ marginTop: 8, color: p.severity === 'disabling' ? colors.danger : colors.warning }}>
              {p.subRegion} — {p.severity}
            </Text>
          ))}
        </View>
      ) : null}

      {isPlayer ? (
        <>
          <Text style={styles.section}>Today&apos;s RPE</Text>
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

          <Text style={styles.section}>Sleep (hours)</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={sleep}
            onChangeText={setSleep}
            style={[styles.input, { borderColor: colors.primary }]}
          />
          <Text style={styles.section}>Water (liters)</Text>
          <TextInput
            keyboardType="decimal-pad"
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
            <Text style={[layout.buttonText, { color: '#fff' }]}>Save readiness</Text>
          </Pressable>

          <Text style={[styles.section, { marginTop: 24 }]}>Pain map</Text>
          {!region ? (
            <View style={styles.regionGrid}>
              {Object.keys(BODY_REGIONS).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setRegion(key)}
                  style={[styles.region, { borderColor: colors.primary }]}
                >
                  <Text style={{ fontWeight: '700', color: colors.primary }}>{key.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View>
              <Pressable onPress={() => { setRegion(null); setSubRegion(null); }}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to body</Text>
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
                    <Text style={{ fontWeight: '700', color: colors.primary }}>{sub}</Text>
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
                      {s === 'soreness' ? 'Soreness / tight' : 'Disabling pain'}
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
                <Text style={[layout.buttonText, { color: colors.primary }]}>Log pain</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      {readiness[0] ? (
        <Text style={{ marginTop: 16, color: colors.muted }}>
          Last RPE {readiness[0].rpe} · sleep {readiness[0].sleepHours}h · water {readiness[0].waterLiters}L
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
  section: { marginTop: 18, marginBottom: 8, fontWeight: '800', color: '#334155' },
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
