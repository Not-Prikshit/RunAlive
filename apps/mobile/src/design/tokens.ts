// apps/mobile/src/design/tokens.ts
// Design system tokens — dark, high-contrast, outdoor-readable

export const COLORS = {
  // Backgrounds
  bg: '#0A0A0A',
  surface: '#161616',
  surfaceRaised: '#1E1E1E',
  border: '#2A2A2A',

  // Text
  text: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',

  // Brand
  accent: '#FFDD00',       // Yellow — primary action
  accentDark: '#C8AC00',

  // Roles
  runner: '#22D3EE',       // Cyan — runner
  seeker: '#F97316',       // Orange — seeker
  host: '#A78BFA',         // Purple — host

  // Danger scale
  dangerUnknown: '#666666',
  dangerSafe: '#22C55E',
  dangerLow: '#84CC16',
  dangerMedium: '#EAB308',
  dangerHigh: '#F97316',
  dangerCritical: '#EF4444',

  // Status
  success: '#22C55E',
  warning: '#EAB308',
  danger: '#EF4444',
  info: '#3B82F6',

  // Map overlay
  perimeterActive: 'rgba(255, 221, 0, 0.15)',
  perimeterBorder: '#FFDD00',
  perimeterAnnounce: 'rgba(34, 211, 238, 0.1)',
  perimeterAnnounceBorder: '#22D3EE',
  perimeterPrev: 'rgba(255, 255, 255, 0.05)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const FONTS = {
  mono: 'Courier New',
  sans: undefined, // System default
} as const;

export const TOUCH_TARGET = 48; // Minimum touch target size in dp
