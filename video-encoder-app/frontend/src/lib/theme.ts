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
    warningBg: string;
    warningText: string;
    warningBorder: string;
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
      warningBg: '#fff3cd',
      warningText: '#856404',
      warningBorder: '#ffc107',
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
      warningBg: '#3e2723',
      warningText: '#ffecb3',
      warningBorder: '#ff6f00',
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
      warningBg: '#1a3a52',
      warningText: '#ffe082',
      warningBorder: '#ffa726',
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
      warningBg: '#3d1f4e',
      warningText: '#ffe57f',
      warningBorder: '#ff9800',
    },
  },
};

const THEME_STORAGE_KEY = 'video-encoder-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function getInitialTheme(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      // If 'auto' is stored, return it (will be resolved to system theme when applied)
      if (stored === 'auto') {
        return 'auto';
      }
      // If a specific theme is stored and exists, use it
      if (themes[stored]) {
        return stored;
      }
    }
  }
  // Default to auto mode
  return 'auto';
}

export const currentTheme = writable<string>(getInitialTheme());

// Apply theme to document
export function applyTheme(themeName: string) {
  // Resolve 'auto' to actual system theme
  let actualTheme = themeName;
  if (themeName === 'auto') {
    actualTheme = getSystemTheme();
  }
  
  const theme = themes[actualTheme];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });

  // Save user preference to localStorage (keep 'auto' if that's what was selected)
  localStorage.setItem(THEME_STORAGE_KEY, themeName);
  currentTheme.set(themeName);
}

// Listen for system theme changes
if (typeof window !== 'undefined' && window.matchMedia) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', () => {
    // Only auto-update if user has selected 'auto' mode
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored || stored === 'auto') {
      applyTheme('auto');
    }
  });
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}
