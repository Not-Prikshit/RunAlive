import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      className={`group relative p-2 rounded-xl border-2 border-[#18181B] dark:border-[#475569] bg-white dark:bg-[#1E293B] shadow-[2.5px_2.5px_0px_#18181B] dark:shadow-[2.5px_2.5px_0px_#020617] hover:shadow-[3.5px_3.5px_0px_#FBBC04] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-2 ${className}`}
    >
      <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
        {isDark ? (
          <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-[#FBBC04] transform transition-transform group-hover:-rotate-12" />
        ) : (
          <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-[#FBBC04] transform transition-transform group-hover:rotate-45" />
        )}
      </div>

      {showLabel && (
        <span className="text-xs font-heading font-black tracking-wide text-[#18181B] dark:text-[#F8FAFC]">
          {isDark ? 'DARK MODE' : 'LIGHT MODE'}
        </span>
      )}
    </button>
  );
};
