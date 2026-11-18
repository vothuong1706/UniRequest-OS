import { createContext, useContext } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  isDark: boolean;
  setTheme: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'unirequest-theme';

export const ThemeContext = createContext<ThemeContextValue>({
  preference: 'light',
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
