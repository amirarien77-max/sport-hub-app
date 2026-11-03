/**
 * Hebrew RTL combo / select (ynet-style).
 * Trigger: label on the right, chevron on the left.
 * Menu: right-aligned options in a modal list.
 */
import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { t } from '@/i18n';
import {
  rtlContainerProps,
  rtlLayout,
  rtlText,
  useTheme,
} from '@/theme/ThemeContext';

export type RtlSelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  options: ReadonlyArray<RtlSelectOption<T>>;
  value: T | null | undefined;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Optional title shown above the option list in the sheet. */
  menuTitle?: string;
};

export function RtlSelect<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  testID,
  style,
  menuTitle,
}: Props<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  const triggerLabel = selected?.label ?? placeholder ?? t('ui.selectPlaceholder');
  const isPlaceholder = !selected;

  return (
    <View {...rtlContainerProps} style={style}>
      <Pressable
        testID={testID}
        nativeID={testID}
        accessibilityLabel={testID ?? 'rtl-select'}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          rtlLayout.comboTrigger,
          {
            borderColor: colors.primary,
            opacity: disabled ? 0.55 : 1,
            backgroundColor: '#fff',
          },
        ]}
        // Web: helps QA / CSS hooks find the trigger.
        {...(Platform.OS === 'web'
          ? ({ 'data-rtl-select': 'trigger', 'data-testid': testID } as Record<string, string | undefined>)
          : {})}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            rtlText,
            { color: isPlaceholder ? colors.muted : colors.text },
          ]}
        >
          {triggerLabel}
        </Text>
        <Text style={[styles.chevron, { color: colors.muted }]} accessible={false}>
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            {...rtlContainerProps}
            style={[
              styles.menu,
              rtlLayout.modal,
              rtlLayout.comboMenu,
              { backgroundColor: colors.surface, borderColor: colors.primary },
            ]}
          >
            {menuTitle ? (
              <Text style={[styles.menuTitle, { color: colors.primary }, rtlText]}>
                {menuTitle}
              </Text>
            ) : null}
            <ScrollView
              {...rtlContainerProps}
              keyboardShouldPersistTaps="handled"
              style={styles.menuScroll}
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    disabled={opt.disabled}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={[
                      styles.option,
                      rtlLayout.comboOption,
                      {
                        backgroundColor: active ? colors.accent : 'transparent',
                        opacity: opt.disabled ? 0.45 : 1,
                        borderBottomColor: colors.primary + '18',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        rtlText,
                        {
                          color: active ? colors.primary : colors.text,
                          fontWeight: active ? '800' : '600',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {active ? (
                      <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
                    ) : (
                      <View style={styles.checkSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setOpen(false)}
              style={[styles.cancelBtn, { borderColor: colors.secondary }]}
            >
              <Text style={[{ color: colors.secondary, fontWeight: '700' }, rtlText]}>
                {t('ui.selectClose')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  triggerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    marginHorizontal: 4,
    lineHeight: 20,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  menu: {
    maxHeight: '70%',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  menuScroll: {
    maxHeight: 360,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  check: {
    fontSize: 16,
    fontWeight: '800',
    marginHorizontal: 6,
  },
  checkSpacer: {
    width: 16,
    marginHorizontal: 6,
  },
  cancelBtn: {
    marginTop: 8,
    marginHorizontal: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
