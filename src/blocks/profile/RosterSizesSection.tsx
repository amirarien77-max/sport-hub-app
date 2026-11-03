/**
 * אחראי ציוד: רול‑אפ מידות כל השחקנים (חולצה / מכנס / נעל / גובה).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { demoUsers } from '@/lib/demo-data';
import {
  fetchRosterSizesRollup,
  type RosterSizeRow,
} from '@/lib/profile-live';
import { isEquipmentManager } from '@/lib/roles';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useSession } from '@/session/SessionContext';
import { rtlContainerProps, rtlLayout, rtlText, useTheme } from '@/theme/ThemeContext';

const DEMO_SIZES: RosterSizeRow[] = [
  {
    playerId: 'user-player-roi',
    teamId: 'team-u16',
    fullName: 'Roi Cohen',
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
    fullName: 'Dan Levi',
    teamName: 'נערים U16',
    heightCm: 165,
    shirtSize: 'M',
    shortsSize: 'S',
    shoeSize: 40,
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
      setRows(
        list.length
          ? list
          : await fetchRosterSizesRollup(supabase, { teamId: team.id }),
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
      // Demo-ish fallback names if live players query works but sizes fail mid-way
      if (demoUsers.length) {
        /* keep empty; show note */
      }
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
      style={[styles.card, rtlLayout.box, { borderColor: colors.secondary }]}
    >
      <Text style={[styles.heading, { color: colors.primary }]}>
        {t('equipment.rosterSizesTitle')}
      </Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {t('equipment.rosterSizesSubtitle')}
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
        rows.map((row) => (
          <View
            key={row.playerId}
            style={[styles.row, rtlLayout.box, { borderColor: colors.primary }]}
          >
            <Text style={[{ fontWeight: '800', color: colors.primary }, rtlText]}>
              {row.fullName}
            </Text>
            {row.teamName ? (
              <Text style={[{ color: colors.muted, fontSize: 12, marginTop: 2 }, rtlText]}>
                {row.teamName}
              </Text>
            ) : null}
            <Text style={[{ marginTop: 8, color: colors.text }, rtlText]}>
              {t('equipment.rosterSizesLine', {
                shirt: dash(row.shirtSize),
                shorts: dash(row.shortsSize),
                shoe: dash(row.shoeSize),
                height: dash(row.heightCm),
              })}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    ...rtlText,
  },
  row: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
});
