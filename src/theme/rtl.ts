import { I18nManager, Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
/**
 * Hebrew-only RTL tokens.
 *
 * Expo docs note that under native `I18nManager` RTL, RN's `textAlign: 'left'`
 * maps to *start*. On react-native-web, `left`/`right` stay **physical**, so a
 * Hebrew-only app must use physical `right` (+ `writingDirection: 'rtl'`) for
 * consistent right-edge alignment on web and native.
 *
 * Layout boxes: native Yoga flips flex-start when `I18nManager` is RTL, so plain
 * `row` is correct. On web, `dir="rtl"` alone often does **not** reverse flex
 * rows in RNW — use `row-reverse` so chips/headers/actions pack from the right.
 *
 * Court / coordinate surfaces must opt out (see CourtBoard) and force LTR.
 *
 * Do not reverse Hebrew string content — only layout/alignment.
 */

export const isAppRtl = (): boolean =>
  Platform.OS === 'web' ? true : I18nManager.isRTL;

/**
 * Horizontal rows (chips, split CTAs, attendance grid).
 * Native + I18nManager RTL → `row` (start already on the right).
 * Web / when isRTL is false → `row-reverse` (physical right-first).
 */
export const rtlRowDirection: 'row' | 'row-reverse' =
  Platform.OS !== 'web' && I18nManager.isRTL ? 'row' : 'row-reverse';

/** Body / labels / titles — physical right + Hebrew writing direction. */
export const rtlText: TextStyle = {
  textAlign: 'right',
  writingDirection: 'rtl',
};

/** Multiline / form fields (pair with TextInput `textAlign={rtlTextAlign}`). */
export const rtlInput: TextStyle = {
  textAlign: 'right',
  writingDirection: 'rtl',
};

/**
 * Web: pass `dir="rtl"` on screen / card roots so RNW inherits direction.
 * Native: Yoga already follows I18nManager; avoid redundant style.direction here.
 */
export const rtlContainerProps: { dir?: 'rtl' } =
  Platform.OS === 'web' ? { dir: 'rtl' } : {};

/** Physical right edge for badges / compact headers inside stretch parents. */
export const rtlAlignStart: ViewStyle =
  Platform.OS !== 'web' && I18nManager.isRTL
    ? { alignSelf: 'flex-start' }
    : { alignSelf: 'flex-end' };

export const rtlLayout = StyleSheet.create({
  /** Apply on screen roots / scroll content wrappers. */
  screen: {
    writingDirection: 'rtl',
    alignItems: 'stretch',
  },
  row: {
    flexDirection: rtlRowDirection,
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  splitRow: {
    flexDirection: rtlRowDirection,
    gap: 10,
    justifyContent: 'flex-start',
  },
  half: {
    flex: 1,
  },
  /** Cards, panels, notices, assignment rows — containers read as RTL blocks. */
  box: {
    writingDirection: 'rtl',
    alignItems: 'stretch',
  },
  /** Chip / pill that should hug content and sit correctly in rtl rows. */
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** TextInput / Text `textAlign` prop — physical right for Hebrew. */
export const rtlTextAlign = 'right' as const;
