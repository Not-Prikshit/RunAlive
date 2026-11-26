/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bright Google-inspired Comic Palette
        comic: {
          blue: '#4285F4',
          blueHover: '#3367D6',
          blueLight: '#E8F0FE',
          red: '#EA4335',
          redHover: '#D93025',
          redLight: '#FCE8E6',
          yellow: '#FBBC04',
          yellowHover: '#F29900',
          yellowLight: '#FEF7E0',
          green: '#34A853',
          greenHover: '#1E8E3E',
          greenLight: '#E6F4EA',
          orange: '#FA7B17',
          orangeLight: '#FEEFE3',
          purple: '#A142F4',
          purpleLight: '#F3E8FD',
          pink: '#F439A0',
          pinkLight: '#FDE8F3',
          cyan: '#24C1E0',
          ink: '#18181B',         // Deep comic outline ink
          inkMuted: '#64748B',    // Subdued sketch pencil
          paper: '#FAF8F5',       // Warm sketchbook paper
          paperWarm: '#FFFDF9',   // Highlight paper
          paperDark: '#F1ECE4',   // Shaded paper
          card: '#FFFFFF',
          border: '#18181B',
        },
        // Backward-compatible mappings
        runalive: {
          bg: '#FAF8F5',
          indigo: '#FFFFFF',
          electric: '#4285F4',
          blue: '#4285F4',
          lavender: '#A142F4',
          coral: '#EA4335',
          lemon: '#FBBC04',
          white: '#18181B',
          border: '#18181B',
          borderHover: '#4285F4',
          muted: '#64748B',
        },
        surv: {
          bg: '#FAF8F5',
          surface: '#FFFFFF',
          surface2: '#F8FAFC',
          surface3: '#F1F5F9',
          border: '#18181B',
          borderLight: '#CBD5E1',
          text: '#18181B',
          muted: '#64748B',
          faint: '#94A3B8',
          accent: '#4285F4',
          accentGlow: '#4285F4',
          lavender: '#A142F4',
          danger: '#EA4335',
          warning: '#FBBC04',
          seeker: '#EA4335',
          hider: '#4285F4',
          safe: '#34A853',
        },
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        display: ['"Fredoka"', '"Space Grotesk"', 'sans-serif'],
        hand: ['"Caveat"', 'cursive'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'comic': '3px 3px 0px 0px #18181B',
        'comic-md': '4px 4px 0px 0px #18181B',
        'comic-lg': '6px 6px 0px 0px #18181B',
        'comic-xl': '8px 8px 0px 0px #18181B',
        'comic-blue': '4px 4px 0px 0px #4285F4',
        'comic-red': '4px 4px 0px 0px #EA4335',
        'comic-yellow': '4px 4px 0px 0px #FBBC04',
        'comic-green': '4px 4px 0px 0px #34A853',
        'comic-purple': '4px 4px 0px 0px #A142F4',
        // Legacy shadows remapped cleanly
        'sketch': '3px 3px 0px 0px #18181B',
        'sketch-coral': '3px 3px 0px 0px #EA4335',
        'sketch-lemon': '3px 3px 0px 0px #FBBC04',
        'sketch-blue': '3px 3px 0px 0px #4285F4',
        'sketch-hover': '5px 5px 0px 0px #18181B',
        'card-subtle': '4px 4px 0px 0px #18181B',
      },
      borderRadius: {
        'comic': '18px',
        'comic-lg': '24px',
      },
      animation: {
        'wobble': 'wobble 0.6s ease-in-out',
        'pop': 'pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'float': 'float 3s ease-in-out infinite',
        'marker-draw': 'draw 0.5s ease-out forwards',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        wobble: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-2deg)' },
          '75%': { transform: 'rotate(2deg)' },
        },
        pop: {
          '0%': { transform: 'scale(0.95)' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
