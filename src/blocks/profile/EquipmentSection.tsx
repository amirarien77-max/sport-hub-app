/**
 * Equipment reports (PRD v1.1 §2.3).
 * Coach: quick "דווח על חוסר בציוד". Equipment manager: list + status updates.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '@/i18n';
import {
  createEquipmentReport,
  EQUIPMENT_STATUSES,
  fetchEquipmentReports,
  updateEquipmentStatus,
  type EquipmentReport,
  type EquipmentStatus,
} from '@/lib/equipment-live';
import { isAttendanceCoach, isEquipmentManager } from '@/lib/roles';
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

const DEMO_REPORTS: EquipmentReport[] = [
  {
    id: 'demo-eq-1',
    teamId: 'team-u16',
    teamName: 'נערים U16',
    reportedBy: 'user-coach',
    itemDescription: 'חסרים 2 כדורי מידה 6',
    quantity: 2,
    status: 'reported',
    handledBy: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function statusLabel(status: EquipmentStatus): string {
  return t(`equipment.status.${status}`);
}

export function EquipmentSection() {
  const { colors } = useTheme();
  const { user, team } = useSession();
  const coach = isAttendanceCoach(user?.role);
  const manager = isEquipmentManager(user?.role);

  const [reports, setReports] = useState<EquipmentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');

  const load = useCallback(async () => {
    if (!user || !team || (!coach && !manager)) return;
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        setReports(DEMO_REPORTS);
        return;
      }
      const rows = await fetchEquipmentReports(
        supabase,
        manager ? undefined : { teamId: team.id },
      );
      setReports(rows);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [coach, manager, team, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !team || (!coach && !manager)) return null;

  const submitReport = async () => {
    const desc = description.trim();
    if (!desc) {
      setNote(t('equipment.descRequired'));
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    setSaving(true);
    setNote(null);
    try {
      if (isDemoMode || !supabase) {
        const row: EquipmentReport = {
          id: `demo-eq-${Date.now()}`,
          teamId: team.id,
          teamName: team.name,
          reportedBy: user.id,
          itemDescription: desc,
          quantity: qty,
          status: 'reported',
          handledBy: null,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setReports((prev) => [row, ...prev]);
        setDescription('');
        setQuantity('1');
        setSheetOpen(false);
        setNote(t('equipment.reportedOk'));
        return;
      }
      await createEquipmentReport(supabase, {
        teamId: team.id,
        reportedBy: user.id,
        itemDescription: desc,
        quantity: qty,
      });
      setDescription('');
      setQuantity('1');
      setSheetOpen(false);
      setNote(t('equipment.reportedOk'));
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (report: EquipmentReport, status: EquipmentStatus) => {
    if (!manager) return;
    setSaving(true);
    try {
      if (isDemoMode || !supabase) {
        setReports((prev) =>
          prev.map((r) =>
            r.id === report.id
              ? {
                  ...r,
                  status,
                  handledBy: user.id,
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        );
        return;
      }
      await updateEquipmentStatus(supabase, {
        id: report.id,
        status,
        handledBy: user.id,
      });
      await load();
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
      <Text style={[styles.heading, { color: colors.primary }]}>
        {manager ? t('equipment.managerTitle') : t('equipment.coachTitle')}
      </Text>
      <Text style={[{ color: colors.muted, marginBottom: 8 }, rtlText]}>
        {manager ? t('equipment.managerSubtitle') : t('equipment.coachSubtitle')}
      </Text>

      {coach ? (
        <Pressable
          onPress={() => {
            setSheetOpen(true);
            setNote(null);
          }}
          style={[layout.button, { backgroundColor: colors.secondary, marginTop: 4 }]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('equipment.reportCta')}</Text>
        </Pressable>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null}

      {note ? (
        <Text
          style={[
            {
              marginTop: 10,
              color: note === t('equipment.reportedOk') ? colors.success : colors.danger,
            },
            rtlText,
          ]}
        >
          {note}
        </Text>
      ) : null}

      {(manager || coach) && reports.length === 0 && !loading ? (
        <Text style={[{ color: colors.muted, marginTop: 10 }, rtlText]}>
          {t('equipment.empty')}
        </Text>
      ) : null}

      {reports.map((r) => (
        <View
          key={r.id}
          style={[styles.row, rtlLayout.box, { borderColor: colors.secondary }]}
        >
          <Text style={[{ fontWeight: '800' }, rtlText]}>{r.itemDescription}</Text>
          <Text style={[{ color: colors.muted, marginTop: 4 }, rtlText]}>
            {t('equipment.meta', {
              qty: r.quantity,
              team: r.teamName ?? team.name,
              status: statusLabel(r.status),
            })}
          </Text>
          {manager ? (
            <View style={[rtlLayout.row, { marginTop: 8 }]}>
              {EQUIPMENT_STATUSES.map((status) => (
                <Pressable
                  key={status}
                  disabled={saving || r.status === status}
                  onPress={() => void setStatus(r, status)}
                  style={[
                    styles.statusChip,
                    {
                      borderColor: colors.primary,
                      backgroundColor: r.status === status ? colors.primary : '#fff',
                      opacity: saving ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      {
                        color: r.status === status ? '#fff' : colors.primary,
                        fontWeight: '700',
                        fontSize: 12,
                      },
                      rtlText,
                    ]}
                  >
                    {statusLabel(status)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[{ marginTop: 6, color: colors.primary, fontWeight: '700' }, rtlText]}>
              {statusLabel(r.status)}
            </Text>
          )}
        </View>
      ))}

      <Modal visible={sheetOpen} animationType="slide" transparent>
        <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setSheetOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, rtlLayout.box, { backgroundColor: colors.surface }]}
          >
            <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
              {t('equipment.reportCta')}
            </Text>
            <Text style={layout.label}>{t('equipment.description')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder={t('equipment.descriptionPlaceholder')}
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.multiline,
                rtlInput,
                { borderColor: colors.primary, color: colors.text },
              ]}
            />
            <Text style={layout.label}>{t('equipment.quantity')}</Text>
            <TextInput
              textAlign={rtlTextAlign}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
              style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
            />
            <Pressable
              disabled={saving}
              onPress={() => void submitReport()}
              style={[
                layout.button,
                { backgroundColor: colors.primary, marginTop: 16, opacity: saving ? 0.7 : 1 },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {saving ? t('equipment.saving') : t('equipment.submit')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
  statusChip: {
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
});
