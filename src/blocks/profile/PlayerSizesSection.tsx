/**
 * Player clothing sizes + optional height (PRD v1.1 §2.1).
 * Player / linked parent can edit; wired to profile-live.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '@/i18n';
import { fetchTeamPlayerProfile, updatePlayerSizes } from '@/lib/profile-live';
import { ensureParentPlayerLink } from '@/lib/schedule-live';
import { isDemoMode, supabase } from '@/lib/supabase';
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

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

async function resolvePlayerId(
  role: string,
  userId: string,
  teamId: string,
): Promise<string | null> {
  if (role === 'player') return userId;
  if (role !== 'parent') return null;
  if (isDemoMode || !supabase) return 'user-player-roi';
  return ensureParentPlayerLink(supabase, userId, teamId);
}

export function PlayerSizesSection() {
  const { colors } = useTheme();
  const { user, team } = useSession();
  const canEdit = user?.role === 'player' || user?.role === 'parent';

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [shirtSize, setShirtSize] = useState<string | null>(null);
  const [shortsSize, setShortsSize] = useState<string | null>(null);
  const [shoeSize, setShoeSize] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !team || !canEdit) return;
    setLoading(true);
    setNote(null);
    try {
      const pid = await resolvePlayerId(user.role, user.id, team.id);
      setPlayerId(pid);
      if (!pid || isDemoMode || !supabase) return;
      const row = await fetchTeamPlayerProfile(supabase, pid);
      if (row) {
        setShirtSize(row.shirtSize);
        setShortsSize(row.shortsSize);
        setShoeSize(row.shoeSize != null ? String(row.shoeSize) : '');
        setHeightCm(row.heightCm != null ? String(row.heightCm) : '');
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [canEdit, team, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canEdit || !user || !team) return null;

  const save = async () => {
    setSaving(true);
    setNote(null);
    const pid = playerId ?? (await resolvePlayerId(user.role, user.id, team.id));
    if (!pid) {
      setNote(t('profile.sizesParentNeedPlayer'));
      setSaving(false);
      return;
    }
    const shoe = shoeSize.trim() ? Number(shoeSize.replace(',', '.')) : null;
    const height = heightCm.trim() ? Number(heightCm) : null;
    if (height != null && (Number.isNaN(height) || height < 100 || height > 250)) {
      setNote(t('profile.heightInvalid'));
      setSaving(false);
      return;
    }
    if (shoe != null && Number.isNaN(shoe)) {
      setNote(t('profile.shoeInvalid'));
      setSaving(false);
      return;
    }

    try {
      if (isDemoMode || !supabase) {
        setPlayerId(pid);
        setNote(t('profile.sizesSavedDemo'));
        return;
      }
      await updatePlayerSizes(supabase, {
        playerId: pid,
        teamId: team.id,
        shirtSize,
        shortsSize,
        shoeSize: shoe,
        heightCm: height,
      });
      setNote(t('profile.sizesSaved'));
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      {...rtlContainerProps}
      style={[styles.card, rtlLayout.box, { borderColor: colors.primary }]}
    >
      <Text style={[styles.heading, { color: colors.primary }]}>{t('profile.sizesTitle')}</Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {t('profile.sizesSubtitle')}
      </Text>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <Text style={layout.label}>{t('profile.shirtSize')}</Text>
      <View style={rtlLayout.row}>
        {CLOTHING_SIZES.map((size) => (
          <Pressable
            key={`shirt-${size}`}
            onPress={() => setShirtSize(size)}
            style={[
              styles.chip,
              {
                borderColor: colors.primary,
                backgroundColor: shirtSize === size ? colors.secondary : '#fff',
              },
            ]}
          >
            <Text
              style={[
                {
                  color: shirtSize === size ? '#fff' : colors.primary,
                  fontWeight: '700',
                },
                rtlText,
              ]}
            >
              {size}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={layout.label}>{t('profile.shortsSize')}</Text>
      <View style={rtlLayout.row}>
        {CLOTHING_SIZES.map((size) => (
          <Pressable
            key={`shorts-${size}`}
            onPress={() => setShortsSize(size)}
            style={[
              styles.chip,
              {
                borderColor: colors.primary,
                backgroundColor: shortsSize === size ? colors.secondary : '#fff',
              },
            ]}
          >
            <Text
              style={[
                {
                  color: shortsSize === size ? '#fff' : colors.primary,
                  fontWeight: '700',
                },
                rtlText,
              ]}
            >
              {size}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={layout.label}>{t('profile.shoeSize')}</Text>
      <TextInput
        textAlign={rtlTextAlign}
        keyboardType="decimal-pad"
        value={shoeSize}
        onChangeText={setShoeSize}
        placeholder={t('profile.shoeSizePlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
      />

      <Text style={layout.label}>{t('profile.heightCm')}</Text>
      <TextInput
        textAlign={rtlTextAlign}
        keyboardType="number-pad"
        value={heightCm}
        onChangeText={setHeightCm}
        placeholder={t('profile.heightPlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
      />

      {note ? (
        <Text
          style={[
            {
              marginTop: 8,
              color:
                note === t('profile.sizesSaved') || note === t('profile.sizesSavedDemo')
                  ? colors.success
                  : colors.danger,
            },
            rtlText,
          ]}
        >
          {note}
        </Text>
      ) : null}

      <Pressable
        disabled={saving}
        onPress={() => void save()}
        style={[
          layout.button,
          { backgroundColor: colors.primary, marginTop: 14, opacity: saving ? 0.7 : 1 },
        ]}
      >
        <Text style={[layout.buttonText, { color: '#fff' }]}>
          {saving ? t('profile.sizesSaving') : t('profile.sizesSave')}
        </Text>
      </Pressable>
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
  chip: {
    minHeight: 40,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
});
