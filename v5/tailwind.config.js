/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050808',
        bg2: '#0a1014',
        cyan: { DEFAULT: '#00F0FF', soft: 'rgba(0,240,255,0.15)' },
        purple: { DEFAULT: '#6B2FFF', soft: 'rgba(107,47,255,0.18)' },
        gold: { DEFAULT: '#F7B731', soft: 'rgba(247,183,49,0.15)' },
        ink: '#7c98a8',
      },
      fontFamily: {
        display: ['Orbitron', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-cyan': '0 0 0 1px rgba(0,240,255,0.4), 0 0 24px rgba(0,240,255,0.25)',
        'neon-purple': '0 0 0 1px rgba(107,47,255,0.4), 0 0 32px rgba(107,47,255,0.3)',
        'neon-gold': '0 0 0 1px rgba(247,183,49,0.4), 0 0 28px rgba(247,183,49,0.25)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'scan-line': 'scanLine 6s linear infinite',
        'glitch': 'glitch 4s steps(3,end) infinite',
      },
      keyframes: {
        pulseSoft: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        scanLine: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        glitch: {
          '0%,90%,100%': { transform: 'translate(0,0)', filter: 'none' },
          '92%': { transform: 'translate(-1px,0)', filter: 'hue-rotate(15deg)' },
          '94%': { transform: 'translate(1px,0)' },
          '96%': { transform: 'translate(0,1px)' },
        },
      },
    },
  },
  plugins: [],
};
