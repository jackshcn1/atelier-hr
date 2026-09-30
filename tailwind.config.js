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
        // Surfaces. A warm paper tone rather than near-white — the previous
        // #FBFAF8 was so close to white it read as a generic light dashboard
        // rather than the warm, considered ground the reference image has.
        page: '#F7F4EF',
        surface: '#FFFDFA',
        // Ink. Warm near-black, a shade deeper so headings hold the page.
        ink: {
          DEFAULT: '#1A1613',
          soft: '#57504A',
          muted: '#7A7168',
        },
        // Structure comes from hairlines rather than boxes.
        rule: '#E2DCD2',
        'rule-soft': '#EFE9E0',
        // The accent. Used sparingly but deliberately — one figure or rule per
        // page, never decoration.
        accent: {
          DEFAULT: '#A8410F',
          soft: '#C2611F',
          wash: '#FBEEE3',
        },
        // Status. Muted enough to sit beside the accent without competing.
        good: { DEFAULT: '#15803D', wash: '#F1F6EF', rule: '#C9E0C4' },
        warn: { DEFAULT: '#B45309', wash: '#FBF4E8', rule: '#EBD9B6' },
        bad: { DEFAULT: '#A41B1B', wash: '#FBEFEC', rule: '#EBC9C2' },
      },
      fontFamily: {
        // Newsreader carries the whole display layer — headings AND figures. It
        // has warmth without the trendy high-contrast look, and stays sturdy
        // at the large sizes where it does most of the work here.
        serif: ['Newsreader', 'Georgia', 'serif'],
        // Inter is unremarkable on purpose — it stays invisible so the figures
        // carry the visual weight.
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Slightly tighter than Tailwind's default scale for the small sizes
        // this app lives at.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // Display scale, used for the single moment on a page. Newsreader has a
        // small x-height, so these run larger than a grotesque would.
        display: ['3.5rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-sm': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        // Deliberately small. The 12–16px everything-default is what makes an
        // app read as generic SaaS. Taking it to near-square is the single
        // biggest shift away from the generic look — 6px still read as a
        // conventional rounded card.
        card: '2px',
        control: '3px',
      },
      boxShadow: {
        // Almost nothing. Structure comes from hairlines, so the only shadow in
        // the system is for elements that genuinely float.
        float: '0 1px 2px rgba(26, 22, 19, 0.04), 0 6px 16px rgba(26, 22, 19, 0.05)',
      },
      maxWidth: {
        // Line length stays under ~80 characters.
        prose: '68ch',
        shell: '1120px',
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