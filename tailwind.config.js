/** @type {import('tailwindcss').Config} */

// The Atelier design tokens.
//
// The palette is warm rather than neutral-grey, but deliberately pulled toward
// stone rather than cream: this is a tool people open to make decisions about
// pay and about people, so it should read as a document, not a brochure.
//
// The accent is used once per page at most — on the single figure that matters.
// Terracotta on every button would date the app; terracotta on one number makes
// it look chosen.

module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
    // globals.css defines the component layer itself. Without this it is never
    // scanned, so classes like .panel and .pill-good get purged as unused.
    './app/globals.css',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces. Warm white page, white cards lifted off it.
        page: '#FBFAF8',
        surface: '#FFFFFF',
        // Ink. Near-black carrying a trace of warmth so headings do not read cold.
        ink: {
          DEFAULT: '#1C1917',
          soft: '#57534E',
          muted: '#78716C',
        },
        // Structure comes from hairlines rather than boxes.
        rule: '#E7E5E4',
        'rule-soft': '#F0EFED',
        // The one accent. Deep terracotta, deliberately restrained.
        accent: {
          DEFAULT: '#9A3412',
          soft: '#B45309',
          wash: '#FEF3E7',
        },
        // Status. Muted enough to sit beside the accent without competing.
        good: { DEFAULT: '#15803D', wash: '#F0FDF4', rule: '#BBF7D0' },
        warn: { DEFAULT: '#B45309', wash: '#FFFBEB', rule: '#FDE68A' },
        bad: { DEFAULT: '#B91C1C', wash: '#FEF2F2', rule: '#FECACA' },
      },
      fontFamily: {
        // Serif for headings only. Newsreader has warmth without the trendy
        // high-contrast look, and stays sturdy at small sizes.
        serif: ['Newsreader', 'Georgia', 'serif'],
        // Inter is unremarkable on purpose — it stays invisible so the figures
        // carry the visual weight.
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Slightly tighter than Tailwind's default scale for the small sizes
        // this app lives at.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        // Deliberately small. The 12–16px everything-default is what makes an
        // app read as generic SaaS.
        card: '6px',
        control: '5px',
      },
      boxShadow: {
        // Almost nothing. Structure comes from hairlines, so the only shadow in
        // the system is for elements that genuinely float.
        float: '0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.04)',
      },
      maxWidth: {
        // Line length stays under ~80 characters.
        prose: '68ch',
        shell: '1080px',
      },
      keyframes: {
        // Reserved for motion that answers a user action. No decorative
        // entrance animations.
        settle: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        settle: 'settle 160ms ease-out',
      },
    },
  },
  plugins: [],
};