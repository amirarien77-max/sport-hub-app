/**
 * דף קשר — Role / Name / Phone + «שלח הודעה באפליקציה» ליד מאמן ראשי.
 * מאמן: CRUD. הורה/שחקן: צפייה + הודעה.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '@/i18n';
import { isAttendanceCoach, normalizeRole } from '@/lib/roles';
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
import type { TeamContact } from '@/types';

type EditorState = {
  id?: string;
  roleLabel: string;
  fullName: string;
  phone: string;
  isHeadCoach: boolean;
};

const emptyEditor = (): EditorState => ({
  roleLabel: '',
  fullName: '',
  phone: '',
  isHeadCoach: false,
});

export function ContactsScreen() {
  const { colors } = useTheme();
  const {
    user,
    contacts,
    upsertTeamContact,
    deleteTeamContact,
    sendInAppContactMessage,
  } = useSession();

  const role = normalizeRole(user?.role);
  const canView =
    role === 'parent' ||
    role === 'player' ||
    isAttendanceCoach(user?.role) ||
    role === 'equipment_manager' ||
    role === 'fitness_coach' ||
    role === 'physio';
  const canEdit = isAttendanceCoach(user?.role);

  const sorted = useMemo(
    () =>
      [...contacts].sort(
        (a, b) =>
          Number(b.isHeadCoach) - Number(a.isHeadCoach) ||
          a.sortOrder - b.sortOrder ||
          a.fullName.localeCompare(b.fullName, 'he'),
      ),
    [contacts],
  );

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageTo, setMessageTo] = useState<TeamContact | null>(null);
  const [messageBody, setMessageBody] = useState('');

  if (!canView) {
    return (
      <View
        {...rtlContainerProps}
        style={[layout.screen, { backgroundColor: colors.background }]}
      >
        <Text style={[layout.title, { color: colors.primary }]}>{t('contacts.title')}</Text>
        <Text style={[layout.subtitle, { color: colors.muted }]}>
          {t('contacts.playersParentsOnly')}
        </Text>
      </View>
    );
  }

  const openCreate = () => setEditor(emptyEditor());
  const openEdit = (c: TeamContact) =>
    setEditor({
      id: c.id,
      roleLabel: c.roleLabel,
      fullName: c.fullName,
      phone: c.phone ?? '',
      isHeadCoach: c.isHeadCoach,
    });

  const onSave = async () => {
    if (!editor) return;
    if (!editor.fullName.trim()) {
      Alert.alert(t('contacts.title'), t('contacts.nameRequired'));
      return;
    }
    if (!editor.roleLabel.trim()) {
      Alert.alert(t('contacts.title'), t('contacts.roleRequired'));
      return;
    }
    setBusy(true);
    try {
      const result = await Promise.resolve(
        upsertTeamContact({
          id: editor.id,
          roleLabel: editor.roleLabel,
          fullName: editor.fullName,
          phone: editor.phone,
          isHeadCoach: editor.isHeadCoach,
        }),
      );
      if (!result.ok) {
        Alert.alert(t('contacts.title'), result.error || t('contacts.saveError'));
        return;
      }
      setEditor(null);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (c: TeamContact) => {
    Alert.alert(t('contacts.deleteConfirmTitle'), t('contacts.deleteConfirmBody', { name: c.fullName }), [
      { text: t('contacts.cancel'), style: 'cancel' },
      {
        text: t('contacts.delete'),
        style: 'destructive',
        onPress: () => {
          void Promise.resolve(deleteTeamContact(c.id));
        },
      },
    ]);
  };

  const onSendMessage = async () => {
    if (!messageTo) return;
    if (!messageBody.trim()) {
      Alert.alert(t('contacts.title'), t('contacts.messageRequired'));
      return;
    }
    setBusy(true);
    try {
      const result = await Promise.resolve(
        sendInAppContactMessage(messageTo.id, messageBody.trim()),
      );
      if (result.ok) {
        Alert.alert(t('contacts.messageSentTitle'), t('contacts.messageSentBody'));
        setMessageTo(null);
        setMessageBody('');
      } else {
        Alert.alert(t('contacts.title'), result.error || t('contacts.saveError'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      {...rtlContainerProps}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={layout.scrollContent}
    >
      <Text style={[layout.title, { color: colors.primary }]}>{t('contacts.title')}</Text>
      <Text style={[layout.subtitle, { color: colors.muted }]}>
        {canEdit ? t('contacts.subtitleCoach') : t('contacts.subtitle')}
      </Text>

      {canEdit ? (
        <Pressable
          onPress={openCreate}
          style={[layout.button, { backgroundColor: colors.primary, marginTop: 14 }]}
        >
          <Text style={[layout.buttonText, { color: '#fff' }]}>{t('contacts.add')}</Text>
        </Pressable>
      ) : null}

      {sorted.length === 0 ? (
        <Text style={[{ marginTop: 16, color: colors.muted }, rtlText]}>{t('contacts.empty')}</Text>
      ) : null}

      {sorted.map((c) => (
        <View
          key={c.id}
          {...rtlContainerProps}
          style={[styles.card, rtlLayout.box, { borderColor: colors.primary }]}
        >
          <Text style={[{ fontWeight: '800', color: colors.primary, fontSize: 16 }, rtlText]}>
            {c.roleLabel}
          </Text>
          <Text style={[{ fontWeight: '700', fontSize: 18, marginTop: 4 }, rtlText]}>
            {c.fullName}
          </Text>
          {c.phone ? (
            <Text style={[{ color: colors.muted, marginTop: 4 }, rtlText]}>{c.phone}</Text>
          ) : null}

          {c.isHeadCoach ? (
            <Pressable
              onPress={() => {
                setMessageBody('');
                setMessageTo(c);
              }}
              style={[layout.button, { backgroundColor: colors.secondary, marginTop: 10 }]}
              accessibilityLabel={t('contacts.sendMessage')}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {t('contacts.sendMessage')}
              </Text>
            </Pressable>
          ) : null}

          {canEdit ? (
            <View style={[rtlLayout.splitRow, { marginTop: 10 }]}>
              <Pressable
                onPress={() => openEdit(c)}
                style={[styles.smallBtn, { borderColor: colors.primary }, rtlLayout.half]}
              >
                <Text style={[{ color: colors.primary, fontWeight: '700' }, rtlText]}>
                  {t('contacts.edit')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onDelete(c)}
                style={[styles.smallBtn, { borderColor: colors.danger }, rtlLayout.half]}
              >
                <Text style={[{ color: colors.danger, fontWeight: '700' }, rtlText]}>
                  {t('contacts.delete')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}

      <Modal
        visible={Boolean(editor)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!busy) setEditor(null);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!busy) setEditor(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            {...rtlContainerProps}
            style={[styles.sheet, rtlLayout.modal, { backgroundColor: colors.surface }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" {...rtlContainerProps}>
              <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
                {editor?.id ? t('contacts.edit') : t('contacts.add')}
              </Text>
              <Text style={layout.label}>{t('contacts.role')}</Text>
              <TextInput
                value={editor?.roleLabel ?? ''}
                onChangeText={(roleLabel) =>
                  setEditor((e) => (e ? { ...e, roleLabel } : e))
                }
                placeholder={t('contacts.rolePlaceholder')}
                placeholderTextColor={colors.muted}
                textAlign={rtlTextAlign}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />
              <Text style={layout.label}>{t('contacts.name')}</Text>
              <TextInput
                value={editor?.fullName ?? ''}
                onChangeText={(fullName) =>
                  setEditor((e) => (e ? { ...e, fullName } : e))
                }
                placeholder={t('contacts.namePlaceholder')}
                placeholderTextColor={colors.muted}
                textAlign={rtlTextAlign}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />
              <Text style={layout.label}>{t('contacts.phone')}</Text>
              <TextInput
                value={editor?.phone ?? ''}
                onChangeText={(phone) => setEditor((e) => (e ? { ...e, phone } : e))}
                placeholder={t('contacts.phonePlaceholder')}
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                textAlign={rtlTextAlign}
                style={[styles.input, rtlInput, { borderColor: colors.primary, color: colors.text }]}
              />
              <View style={[rtlLayout.row, { marginTop: 16, alignItems: 'center' }]}>
                <Text style={[{ flex: 1, fontWeight: '600' }, rtlText]}>
                  {t('contacts.markHeadCoach')}
                </Text>
                <Switch
                  value={Boolean(editor?.isHeadCoach)}
                  onValueChange={(isHeadCoach) =>
                    setEditor((e) => (e ? { ...e, isHeadCoach } : e))
                  }
                />
              </View>
              <Pressable
                disabled={busy}
                onPress={() => void onSave()}
                style={[
                  layout.button,
                  { backgroundColor: colors.primary, marginTop: 18, opacity: busy ? 0.7 : 1 },
                ]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>
                  {busy ? t('contacts.saving') : t('contacts.save')}
                </Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => setEditor(null)}
                style={[layout.button, { backgroundColor: colors.muted, marginTop: 8 }]}
              >
                <Text style={[layout.buttonText, { color: '#fff' }]}>{t('contacts.cancel')}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(messageTo)}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!busy) setMessageTo(null);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!busy) setMessageTo(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            {...rtlContainerProps}
            style={[styles.sheet, rtlLayout.modal, { backgroundColor: colors.surface }]}
          >
            <Text style={[layout.title, { fontSize: 20, color: colors.primary }]}>
              {t('contacts.messageTitle', { name: messageTo?.fullName ?? '' })}
            </Text>
            <TextInput
              value={messageBody}
              onChangeText={setMessageBody}
              placeholder={t('contacts.messagePlaceholder')}
              placeholderTextColor={colors.muted}
              multiline
              textAlign={rtlTextAlign}
              style={[
                styles.input,
                rtlInput,
                { borderColor: colors.primary, color: colors.text, minHeight: 100 },
              ]}
            />
            <Pressable
              disabled={busy}
              onPress={() => void onSendMessage()}
              style={[
                layout.button,
                { backgroundColor: colors.secondary, marginTop: 14, opacity: busy ? 0.7 : 1 },
              ]}
            >
              <Text style={[layout.buttonText, { color: '#fff' }]}>
                {t('contacts.messageSend')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },
  smallBtn: {
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
  },
  input: {
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 16,
    backgroundColor: '#fff',
  },
});
