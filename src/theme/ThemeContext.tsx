/**
 * מיתוג מועדון (צבעים מ־clubs) + סגנונות layout משותפים עם RTL.
 * אחרי redeemInvite / hydrate — setBrand מעדכן primary וכו׳ ל־הפועל ירושלים.
 * ייצוא מחדש של rtl* לנוחות ייבוא ממסכים.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { he, t } from '@/i18n';
import { rtlText } from '@/theme/rtl';
import type { ClubBrand } from '@/types';

export {
  rtlText,
  rtlInput,
  rtlLayout,
  rtlTextAlign,
  rtlRowDirection,
  rtlContainerProps,
  rtlAlignStart,
  isAppRtl,
} from '@/theme/rtl';

const defaultBrand: ClubBrand = {
  id: 'default',
  name: he.demo.brandDefault,
  primaryColor: '#C8102E',
  secondaryColor: '#1A1A1A',
  accentColor: '#F5F5F5',
};

type ThemeContextValue = {
  brand: ClubBrand;
  setBrand: (brand: ClubBrand) => void;
  clearBrand: () => void;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    danger: string;
    warning: string;
    success: string;
  };
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrandState] = useState<ClubBrand>(defaultBrand);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = {
      primary: brand.primaryColor,
      secondary: brand.secondaryColor,
      accent: brand.accentColor,
      background: '#F3F6FA',
      surface: '#FFFFFF',
      text: '#0F172A',
      muted: '#64748B',
      danger: '#DC2626',
      warning: '#F59E0B',
      success: '#16A34A',
    };
    return {
      brand,
      setBrand: setBrandState,
      clearBrand: () => setBrandState(defaultBrand),
      colors,
    };
  }, [brand]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error(t('errors.useThemeOutsideProvider'));
  return ctx;
}

export const layout = StyleSheet.create({
  /** Full-screen View wrappers (fills the tab). */
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    writingDirection: 'rtl',
    alignItems: 'stretch',
  },
  /**
   * ScrollView contentContainerStyle — no flex:1 (that prevents scrolling
   * when content is taller than the viewport).
   */
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    flexGrow: 1,
    writingDirection: 'rtl',
    alignItems: 'stretch',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    ...rtlText,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    ...rtlText,
  },
  /** Form labels / section headers. */
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '700',
    color: '#334155',
    ...rtlText,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  /** Default body copy under Hebrew RTL. */
  body: {
    ...rtlText,
  },
});
