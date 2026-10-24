import { I18nManager, StyleSheet, type TextStyle } from 'react-native';
/**
 * Hebrew-only RTL tokens.
 *
 * Expo docs note that under native `I18nManager` RTL, RN's `textAlign: 'left'`
 * maps to *start*. On react-native-web, `left`/`right` stay **physical**, so a
 * Hebrew-only app must use physical `right` (+ `writingDirection: 'rtl'`) for
 * consistent right-edge alignment on web and native.
 *
 * Do not reverse Hebrew string content — only layout/alignment.
 */
export const isAppRtl = (): boolean => I18nManager.isRTL;

/** Body / labels / titles — physical right + Hebrew writing direction. */
export const rtlText: TextStyle = {
  textAlign: 'right',
  writingDirection: 'rtl',
};

/** Multiline / form fields (pair with TextInput `textAlign={rtlTextAlign}`). */
export const rtlInput: TextStyle = {
  writingDirection: 'rtl',
};

/**
 * Horizontal rows. Prefer plain `row`: with root/`<html dir="rtl">` (and native
 * `I18nManager` RTL), flex-start is already on the right. `row-reverse` double-flips.
 */
export const rtlRowDirection = 'row' as const;

export const rtlLayout = StyleSheet.create({
  row: {
    flexDirection: rtlRowDirection,
    flexWrap: 'wrap',
    gap: 8,
  },
  splitRow: {
    flexDirection: rtlRowDirection,
    gap: 10,
  },
  half: {
    flex: 1,
  },
});

/** TextInput / Text `textAlign` prop — physical right for Hebrew. */
export const rtlTextAlign = 'right' as const;
