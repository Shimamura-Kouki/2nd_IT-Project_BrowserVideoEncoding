import { writable } from 'svelte/store';

export interface Theme {
  name: string;
  label: string;
  colors: {
    background: string;
    surface: string;
    primary: string;
    primaryHover: string;
    text: string;
    textSecondary: string;
    border: string;
    progressBg: string;
    error: string;
    success: string;
  };
}

export const themes: Record<string, Theme> = {
  light: {
    name: 'light',
    label: 'ライト',
    colors: {
      background: '#f5f5f5',
      surface: '#ffffff',
      primary: '#2979ff',
      primaryHover: '#1565c0',
      text: '#212121',
      textSecondary: '#757575',
      border: '#e0e0e0',
      progressBg: '#e3f2fd',
      error: '#d32f2f',
      success: '#388e3c',
    },
  },
  dark: {
    name: 'dark',
    label: 'ダーク',
    colors: {
      background: '#121212',
      surface: '#1e1e1e',
      primary: '#90caf9',
      primaryHover: '#64b5f6',
      text: '#ffffff',
      textSecondary: '#e0e0e0',
      border: '#424242',
      progressBg: '#263238',
      error: '#ef5350',
      success: '#66bb6a',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'オーシャン',
    colors: {
      background: '#0a1929',
      surface: '#132f4c',
      primary: '#3399ff',
      primaryHover: '#0072e5',
      text: '#e3f2fd',
      textSecondary: '#e3f2fd',
      border: '#1e4976',
      progressBg: '#1a2332',
      error: '#ff6b6b',
      success: '#51cf66',
    },
  },
  purple: {
    name: 'purple',
    label: 'パープル',
    colors: {
      background: '#1a0033',
      surface: '#2d1b4e',
      primary: '#9c27b0',
      primaryHover: '#7b1fa2',
      text: '#f3e5f5',
      textSecondary: '#f3e5f5',
      border: '#4a148c',
      progressBg: '#311b92',
      error: '#f44336',
      success: '#4caf50',
    },
  },
};

const THEME_STORAGE_KEY = 'video-encoder-theme';

function getInitialTheme(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && themes[stored]) {
      return stored;
    }
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
}

export const currentTheme = writable<string>(getInitialTheme());

// Apply theme to document
export function applyTheme(themeName: string) {
  const theme = themes[themeName];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });

  // Save to localStorage
  localStorage.setItem(THEME_STORAGE_KEY, themeName);
  currentTheme.set(themeName);
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}
