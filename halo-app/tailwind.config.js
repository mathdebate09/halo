/** @type {import('tailwindcss').Config} */

// Colors resolve from CSS variables (space-separated RGB channels) so the theme can be swapped
// at runtime per hero image. Values live in src/global.css until the theme pipeline generates them.
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
      },
      borderRadius: {
        card: '28px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
