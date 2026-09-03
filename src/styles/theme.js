import { createTheme } from '@mui/material/styles';

// The portfolio is Recollection's *Candlelight* palette in daylight.
//
// Candlelight (faith/journal-app, styles.css `:root[data-palette="candlelight"]`)
// is a warm near-black room with a pool of amber light in it: ground #0a0705,
// gold #e0a94a, ivory #f6e8cd. This theme is that same room at midday — the
// value axis inverted, the hue kept. Not Recollection's own "Parchment"
// palette, which is a cooler olive-gold; this stays on candlelight's amber.
//
// The one thing that cannot invert directly is the gold. #e0a94a on a cream
// ground is 1.85:1 — invisible as text. So it splits in two, which is also
// what the metaphor wants:
//
//   * `flame` (#e0a94a, untouched) is used only where gold is a *light source*
//     — button fills, rules, the page glow, ornament. Dark ink on it is 9:1.
//   * `gold` (#8f5d0c) is the same hue burnt down to ink, for anything that is
//     *read* — links, eyebrows, small labels. 4.9:1 on the ground.
//
// Keep in sync by hand if Candlelight ever changes: there is no shared build
// step between the repos, and this file is the only copy.

export const palette = {
  // Grounds — candlelight's #0a0705 → #16100a ladder, inverted.
  ground: '#f7efe0',
  groundDeep: '#efe3cd',   // the foot of the page, and the header band
  groundLift: '#fbf5ea',
  card: '#fffaf0',
  cardHover: '#fff5e3',

  // The flame itself, unchanged from candlelight. Fills and ornament only.
  flame: '#e0a94a',
  flameRgb: '224, 169, 74',
  onFlame: '#170e04',      // --on-accent, verbatim

  // The same amber burnt down to a legible ink.
  gold: '#8f5d0c',
  goldBright: '#a8720f',

  // Ink — candlelight's #fff6e4 / #cbb897 / #93805f ladder, inverted.
  heading: '#171008',
  body: '#453a2b',
  muted: '#76664e',
  faint: '#b5a68c',

  // Edges
  rule: 'rgba(224, 169, 74, 0.42)',        // --rule, opened up for a light ground
  hairline: 'rgba(60, 40, 10, 0.10)',
  accentSoft: 'rgba(224, 169, 74, 0.14)',  // --accent-soft
  accentMid: 'rgba(224, 169, 74, 0.34)',   // --accent-mid

  // Candlelight's signature: a pool of warm light that belongs to the room
  // rather than to the document. Same two radials as --page-bg, warmed rather
  // than darkened. Used with background-attachment: fixed, as there.
  pageGlow: `
    radial-gradient(62% 40% at 50% 106%, #f6e0ba 0%, transparent 72%),
    radial-gradient(80% 44% at 50% -8%, #fff3da 0%, transparent 72%),
    linear-gradient(180deg, #f7efe0 0%, #efe3cd 100%)
  `,
};

// The centred content column, shared by the header, main, and footer. Kept in
// JS rather than as a CSS class so it composes with `sx` predictably — mixing
// the two meant per-page overrides (e.g. the header's zero bottom padding)
// depended on stylesheet ordering.
export const contentColumn = {
  width: '100%',
  maxWidth: 900,
  mx: 'auto',
  px: { xs: 2, sm: 3 },
};

// Recollection's own two stacks, in the same roles: serif for anything that is
// a title or is meant to be read slowly, sans for everything *about* it.
const serif = 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif';
const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const theme = createTheme({
  palette: {
    mode: 'light',
    // Gold is the action colour here, as it is in Recollection, where `.btn` is
    // a flame-coloured fill with dark text. Ink is carried by text.primary
    // rather than by a palette slot, so `color="primary"` never yields a
    // black button.
    primary: {
      main: palette.flame,
      dark: '#f5c672',          // --gold-bright, verbatim
      light: palette.accentMid,
      contrastText: palette.onFlame,
    },
    secondary: {
      main: palette.gold,
      dark: palette.goldBright,
      contrastText: palette.card,
    },
    background: {
      default: palette.ground,
      paper: palette.card,
    },
    text: {
      primary: palette.heading,
      secondary: palette.muted,
    },
    divider: palette.rule,
  },
  typography: {
    fontFamily: sans,
    h1: {
      fontFamily: serif,
      fontWeight: 700,
      fontSize: 'clamp(2.1rem, 6vw, 3rem)',
      color: palette.heading,
      letterSpacing: '-0.015em',
      lineHeight: 1.15,
      marginBottom: '16px',
    },
    h2: {
      fontFamily: serif,
      fontWeight: 600,
      fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
      color: palette.heading,
      letterSpacing: '-0.015em',
      marginBottom: '12px',
    },
    h3: {
      fontFamily: serif,
      fontWeight: 600,
      fontSize: '1.6rem',
      color: palette.heading,
    },
    h6: {
      fontFamily: serif,
      fontWeight: 600,
      color: palette.heading,
    },
    // Recollection's .gate-eyebrow / .todays-saint-label, to the letter.
    overline: {
      fontSize: '0.62rem',
      fontWeight: 700,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: palette.gold,
      lineHeight: 2,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.65,
      color: palette.body,
    },
    body2: {
      color: palette.muted,
    },
    button: {
      textTransform: 'none',
      fontWeight: 700,
      letterSpacing: '0.01em',
    },
  },
  shape: {
    // Recollection rounds cards to 4px and buttons to 6px — nearly square.
    // The old 10/999 pairing was the most "generic SaaS" thing in the file.
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: palette.pageGlow,
          backgroundAttachment: 'fixed',
          color: palette.body,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          paddingInline: '1.2rem',
        },
        contained: {
          boxShadow: `0 2px 12px ${palette.accentMid}`,
          '&:hover': {
            backgroundColor: '#f5c672',
            boxShadow: `0 4px 18px rgba(${palette.flameRgb}, 0.45)`,
          },
        },
        outlined: {
          borderColor: palette.accentMid,
          color: palette.heading,
          letterSpacing: '0.04em',
          '&:hover': {
            borderColor: palette.flame,
            backgroundColor: palette.accentSoft,
          },
        },
        text: {
          color: palette.body,
          '&:hover': {
            color: palette.gold,
            backgroundColor: palette.accentSoft,
          },
        },
      },
    },
    // "Leaves, not tiles" (Recollection's own comment): a hairline sheet that
    // grows a gold spine and steps aside on hover, not a floating tile.
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: `1px solid ${palette.hairline}`,
          borderLeft: '2px solid transparent',
          backgroundColor: palette.card,
          boxShadow: '0 1px 3px rgba(60, 40, 10, 0.06)',
          transition: 'border-color .2s, background .2s, transform .2s',
          '&:hover': {
            borderLeftColor: palette.flame,
            backgroundColor: palette.cardHover,
            transform: 'translateX(2px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.gold,
          textDecorationColor: palette.accentMid,
          '&:hover': { color: palette.goldBright },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        body1: { marginBottom: '8px' },
      },
    },
    MuiChip: {
      styleOverrides: {
        outlined: {
          borderColor: palette.accentMid,
          color: palette.body,
        },
      },
    },
  },
});

export default theme;
