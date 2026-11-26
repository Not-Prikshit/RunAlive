import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'runalive_theme';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  
  return 'light';
}

function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  
  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme = getInitialTheme();
  applyThemeToDocument(initialTheme);

  return {
    theme: initialTheme,

    setTheme: (theme: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, theme);
      applyThemeToDocument(theme);
      set({ theme });
    },

    toggleTheme: () => {
      const nextTheme: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyThemeToDocument(nextTheme);
      set({ theme: nextTheme });
    },
  };
});
