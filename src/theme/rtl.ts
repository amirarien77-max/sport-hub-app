import { I18nManager, Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
/**
 * Hebrew-only RTL tokens.
 *
 * Expo docs note that under native `I18nManager` RTL, RN's `textAlign: 'left'`
 * maps to *start*. On react-native-web, `left`/`right` stay **physical**, so a
 * Hebrew-only app must use physical `right` (+ `writingDirection: 'rtl'`) for
 * consistent right-edge alignment on web and native.
 *
 * Layout rows: use plain `flexDirection: 'row'`. Native Yoga (I18nManager RTL)
 * and RNW with root/`dir="rtl"` both map flex-start to the **right**. Using
 * `row-reverse` under `dir="rtl"` **double-flips** and puts the first column on
 * the left — wrong for Hebrew tables/calendars.
 *
 * Court / coordinate surfaces must opt out (see CourtBoard) and force LTR.
 *
 * Do not reverse Hebrew string content — only layout/alignment.
 * Do not force-align intentionally centered UI (logos, empty CTAs, calendar
 * weekday letters, button labels) to the right.
 */

export const isAppRtl = (): boolean =>
  Platform.OS === 'web' ? true : I18nManager.isRTL;

/**
 * Horizontal rows (chips, split CTAs, attendance grid, table columns).
 * Plain `row` — flex-start is already the reading start (right) under app RTL.
 */
export const rtlRowDirection: 'row' | 'row-reverse' = 'row';

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

/**
 * Compact badges / chips that should sit on the reading-start edge (right in RTL).
 * With root/`dir="rtl"` (web) or I18nManager RTL (native), flex-start is already right.
 * Do NOT use flex-end on web — that packs to the physical left under dir=rtl.
 */
export const rtlAlignStart: ViewStyle = { alignSelf: 'flex-start' };

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
  /**
   * Data tables / schedule grids — outer shell.
   * Pair with `tableRow` so the first column sits on the right.
   */
  table: {
    writingDirection: 'rtl',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  /** Header or body row: columns pack from the right (first DOM child = rightmost). */
  tableRow: {
    flexDirection: rtlRowDirection,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  /** Header cell — bold, right-aligned. */
  th: {
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  /** Body cell — right-aligned. */
  td: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  /**
   * Wrapping grids (month calendar days, attendance tiles).
   * Same direction as `row` so chrome headers and cells stay in sync.
   */
  wrapRow: {
    flexDirection: rtlRowDirection,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
});

/** TextInput / Text `textAlign` prop — physical right for Hebrew. */
export const rtlTextAlign = 'right' as const;
