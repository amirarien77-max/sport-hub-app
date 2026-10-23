import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { he, t } from '@/i18n';
import type { ClubBrand } from '@/types';

const defaultBrand: ClubBrand = {
  id: 'default',
  name: he.demo.brandDefault,
  primaryColor: '#0B1F3A',
  secondaryColor: '#F5B700',
  accentColor: '#2A9D8F',
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
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
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
});
