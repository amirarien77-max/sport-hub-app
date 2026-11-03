/**
 * אחראי ציוד: רול‑אפ מידות כל השחקנים (חולצה / מכנס / נעל / גובה).
 * Visible immediately on EM profile — not gated behind other tools.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import {
  fetchRosterSizesRollup,
  type RosterSizeRow,
} from '@/lib/profile-live';
import { isEquipmentManager } from '@/lib/roles';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { rtlContainerProps, rtlLayout, rtlText, useTheme } from '@/theme/ThemeContext';

/** Hapoel Jerusalem demo roster — always non-empty for EM QA. */
const DEMO_SIZES: RosterSizeRow[] = [
  {
    playerId: 'user-player-roi',
    teamId: 'team-u16',
    fullName: 'רועי כהן',
    teamName: 'נערים U16',
    heightCm: 178,
    shirtSize: 'L',
    shortsSize: 'M',
    shoeSize: 43,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'user-player-dan',
    teamId: 'team-u16',
    fullName: 'דן לוי',
    teamName: 'נערים U16',
    heightCm: 165,
    shirtSize: 'M',
    shortsSize: 'S',
    shoeSize: 40,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'user-player-noam',
    teamId: 'team-u16',
    fullName: 'נועם אברהם',
    teamName: 'נערים U16',
    heightCm: 182,
    shirtSize: 'XL',
    shortsSize: 'L',
    shoeSize: 44,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'user-player-itay',
    teamId: 'team-u16',
    fullName: 'איתי מזרחי',
    teamName: 'נערים U16',
    heightCm: 171,
    shirtSize: 'M',
    shortsSize: 'M',
    shoeSize: 42,
    updatedAt: new Date().toISOString(),
  },
];

function dash(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  return String(v);
}

export function RosterSizesSection() {
  const { colors } = useTheme();
  const { user, team } = useSession();
  const manager = isEquipmentManager(user?.role);

  const [rows, setRows] = useState<RosterSizeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !team || !manager) return;
    setLoading(true);
    setNote(null);
    try {
      if (isDemoMode || !supabase) {
        setRows(DEMO_SIZES);
        return;
      }
      const list = await fetchRosterSizesRollup(supabase, {
        clubId: user.clubId,
      });
      // If club filter emptied (missing club on teams), fall back to team roster.
      const next = list.length
        ? list
        : await fetchRosterSizesRollup(supabase, { teamId: team.id });
      setRows(next.length ? next : DEMO_SIZES);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
      setRows(DEMO_SIZES);
    } finally {
      setLoading(false);
    }
  }, [manager, team, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !team || !manager) return null;

  return (
    <View
      {...rtlContainerProps}
      testID="roster-sizes-section"
      nativeID="roster-sizes-section"
      {...(Platform.OS === 'web'
        ? ({ 'data-testid': 'roster-sizes-section' } as Record<string, string>)
        : {})}
      style={[styles.card, rtlLayout.box, { borderColor: colors.secondary }]}
    >
      <Text style={[styles.heading, { color: colors.primary }]}>
        {t('equipment.rosterSizesTitle')}
      </Text>
      <Text style={[{ color: colors.muted, marginBottom: 4 }, rtlText]}>
        {t('equipment.rosterSizesSubtitle')}
      </Text>
      <Text style={[{ color: colors.secondary, marginBottom: 10, fontWeight: '700' }, rtlText]}>
        {t('equipment.rosterSizesOpenHint')}
      </Text>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {note ? (
        <Text style={[{ color: colors.danger, marginBottom: 8 }, rtlText]}>{note}</Text>
      ) : null}

      {rows.length === 0 && !loading ? (
        <Text style={[{ color: colors.muted }, rtlText]}>
          {t('equipment.rosterSizesEmpty')}
        </Text>
      ) : (
        <View
          {...rtlContainerProps}
          style={[styles.table, rtlLayout.table, { borderColor: colors.primary + '33' }]}
        >
          <View
            style={[
              styles.headerRow,
              rtlLayout.tableRow,
              { backgroundColor: colors.accent, borderBottomColor: colors.primary + '33' },
            ]}
          >
            <Text style={[rtlLayout.th, styles.colName, { color: colors.primary }]}>
              {t('equipment.rosterSizesColName')}
            </Text>
            <Text style={[rtlLayout.th, styles.colSize, { color: colors.primary }]}>
              {t('equipment.rosterSizesColShirt')}
            </Text>
            <Text style={[rtlLayout.th, styles.colSize, { color: colors.primary }]}>
              {t('equipment.rosterSizesColShorts')}
            </Text>
            <Text style={[rtlLayout.th, styles.colSize, { color: colors.primary }]}>
              {t('equipment.rosterSizesColShoe')}
            </Text>
            <Text style={[rtlLayout.th, styles.colSize, { color: colors.primary }]}>
              {t('equipment.rosterSizesColHeight')}
            </Text>
          </View>
          {rows.map((row) => (
            <View
              key={row.playerId}
              style={[
                styles.dataRow,
                rtlLayout.tableRow,
                { borderBottomColor: colors.primary + '14' },
              ]}
            >
              <View style={styles.colName}>
                <Text style={[{ fontWeight: '800', color: colors.text, fontSize: 14 }, rtlText]}>
                  {row.fullName}
                </Text>
                {row.teamName ? (
                  <Text style={[{ color: colors.muted, fontSize: 11, marginTop: 2 }, rtlText]}>
                    {row.teamName}
                  </Text>
                ) : null}
              </View>
              <Text style={[rtlLayout.td, styles.colSize, { color: colors.text, fontSize: 14 }]}>
                {dash(row.shirtSize)}
              </Text>
              <Text style={[rtlLayout.td, styles.colSize, { color: colors.text, fontSize: 14 }]}>
                {dash(row.shortsSize)}
              </Text>
              <Text style={[rtlLayout.td, styles.colSize, { color: colors.text, fontSize: 14 }]}>
                {dash(row.shoeSize)}
              </Text>
              <Text style={[rtlLayout.td, styles.colSize, { color: colors.text, fontSize: 14 }]}>
                {dash(row.heightCm)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    ...rtlText,
  },
  table: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  headerRow: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dataRow: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#F8FAFC',
  },
  colName: {
    flex: 1.4,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  colSize: {
    flex: 0.7,
    minWidth: 0,
    paddingHorizontal: 2,
  },
});
