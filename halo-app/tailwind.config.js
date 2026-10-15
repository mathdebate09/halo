/** @type {import('tailwindcss').Config} */

// Colors resolve from CSS variables (space-separated RGB channels) so the theme can be swapped
// at runtime per hero image (src/theme). Defaults in src/global.css come from scripts/build-themes.mjs.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        glass: token('glass'),
        hairline: token('hairline'),
        text: token('text'),
        muted: token('muted'),
        accent: token('accent'),
        'on-accent': token('on-accent'),
        arc: token('arc'),
        dock: token('dock'),
        veil: token('veil'),
        // State words (Oura-style): never plain red/green.
        strength: token('strength'),
        steady: token('steady'),
        opportunity: token('opportunity'),
      },
      // One family per weight: Android can't synthesize weights for custom fonts,
      // so never pair these with font-medium / font-bold.
      // Keys match the TTF base names, which are also the Android family names once embedded.
      fontFamily: {
        wordmark: ['InclusiveSans_400Regular'],
        sans: ['InclusiveSans_400Regular'],
        'sans-medium': ['InclusiveSans_500Medium'],
        serif: ['InstrumentSerif_400Regular'],
        'serif-italic': ['InstrumentSerif_400Regular_Italic'],
        // Share stickers only (chunk 15).
        anton: ['Anton_400Regular'],
        mono: ['SpaceMono_400Regular'],
        'mono-bold': ['SpaceMono_700Bold'],
        hand: ['Caveat_600SemiBold'],
        led: ['VT323_400Regular'],
      },
      borderRadius: {
        card: '28px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
