import React, { useState } from 'react';
import { Box, Button, Dialog, DialogContent, Typography, Link as MuiLink } from '@mui/material';
import copy from '../content/recollectionDoor';
import { palette } from '../styles/theme';

// The door from the portfolio into Recollection (/recollection), the Catholic
// library + saints app.
//
// All of the wording lives in src/content/recollectionDoor.js so it can be
// rewritten without touching this file.
//
// The dialog is styled in Recollection's own palette rather than the
// portfolio's, so the modal *is* the transition — you see the room you're
// about to walk into before you commit.

const REC_URL = '/recollection/';

// Recollection shows its own "this is explicitly Catholic content" gate on
// first visit, remembered under this key. Both sites are served from the same
// origin (mariopariona117.github.io), so we can set it here and spare anyone
// who came through this dialog from being asked the identical question twice.
const REC_GATE_KEY = 'recollection.gateAccepted.v1';

// Recollection's Candlelight palette, verbatim (styles.css,
// `:root[data-palette="candlelight"]`) — this is the room the door opens onto,
// and it is the palette the app boots with before anyone picks another. The
// portfolio around it is the same palette in daylight, so opening this dialog
// reads as dusk falling rather than as a jump to another site.
const rec = {
  ground: '#0a0705',
  card: '#16100a',
  gold: '#e0a94a',
  goldBright: '#f5c672',
  onGold: '#170e04',
  heading: '#fff6e4',
  body: '#cbb897',
  faint: '#4c3d2b',
};

const markGateAccepted = () => {
  try {
    localStorage.setItem(REC_GATE_KEY, 'true');
  } catch {
    // Private browsing or storage blocked — harmless, they just see the gate.
  }
};

/**
 * @param {'header'|'button'|'text'} variant  How the trigger renders.
 *   'header' is the filled gold pill in the top bar, 'button' an outlined pill,
 *   'text' an inline link for prose.
 */
const RecollectionDoor = ({ variant = 'button', label }) => {
  const [open, setOpen] = useState(false);
  const triggerLabel =
    label ?? (variant === 'text' ? copy.triggerLabelInline : copy.triggerLabel);

  let trigger;
  if (variant === 'text') {
    trigger = (
      <MuiLink
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        sx={{ font: 'inherit', color: palette.gold, textDecorationColor: 'currentColor' }}
      >
        {triggerLabel}
      </MuiLink>
    );
  } else if (variant === 'header') {
    trigger = (
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{
          // Outlined, matching the drawer's copy of this trigger and the hero's
          // buttons. It was a solid gold pill, which made the single loudest
          // element on the page the one thing AUDIT.md says should be "openly
          // available, never pushed" — and it competed with the hero's own
          // calls to action for the same gold.
          ml: { xs: 0.5, sm: 1.25 },
          px: { xs: 1.3, sm: 1.75 },
          py: 0.5,
          flexShrink: 0,
          // Outlined but not faint: a resting flame wash plus a heavier border,
          // so it reads as a real control at a glance without going back to the
          // solid fill that dominated the page.
          borderColor: `rgba(${palette.flameRgb}, 0.6)`,
          borderWidth: '1.5px',
          backgroundColor: palette.accentSoft,
          // A shade deeper than palette.gold: the resting wash darkens the
          // ground under the label, and #8f5d0c fell to 4.13:1 against it —
          // under the 4.5:1 AA floor. This holds 5.03:1 at rest and 4.52:1 on
          // hover, where the wash is stronger still.
          color: '#805008',
          fontWeight: 700,
          letterSpacing: '0.04em',
          fontSize: { xs: '0.72rem', sm: '0.78rem' },
          whiteSpace: 'nowrap',
          '&:hover': {
            borderWidth: '1.5px',
            borderColor: palette.flame,
            backgroundColor: `rgba(${palette.flameRgb}, 0.24)`,
          },
        }}
      >
        <Box component="span" aria-hidden sx={{ mr: 0.6 }}>✝</Box>
        {triggerLabel}
      </Button>
    );
  } else {
    trigger = (
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{
          // Matches the header trigger: resting flame wash, heavier border, and
          // the deeper gold so the label clears AA over that wash. On the
          // drawer's lighter card ground this reads 6.01:1 at rest and 5.62:1
          // on hover, comfortably above the 4.5:1 floor.
          borderColor: `rgba(${palette.flameRgb}, 0.6)`,
          borderWidth: '1.5px',
          backgroundColor: palette.accentSoft,
          color: '#805008',
          fontWeight: 700,
          letterSpacing: '0.04em',
          '&:hover': {
            borderWidth: '1.5px',
            borderColor: palette.flame,
            backgroundColor: `rgba(${palette.flameRgb}, 0.24)`,
          },
        }}
      >
        <Box component="span" aria-hidden sx={{ mr: 0.9 }}>✝</Box>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <>
      {trigger}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="recollection-door-title"
        // PaperProps, not slotProps — Dialog only gained slotProps in MUI v6
        // and this project is on 5.16.
        PaperProps={{
          sx: {
            backgroundColor: rec.ground,
            // The app's own --page-bg: a pool of warm light at the head of the
            // room, falling away to near-black at its foot.
            backgroundImage:
              'radial-gradient(80% 44% at 50% -8%, #2a1a0b 0%, transparent 72%),' +
              'radial-gradient(62% 40% at 50% 106%, #4d2f12 0%, transparent 72%)',
            border: `1px solid ${rec.faint}`,
            borderRadius: 1,
          },
        }}
      >
        <DialogContent sx={{ p: { xs: 3, sm: 4.5 }, textAlign: 'center' }}>
          <Box aria-hidden sx={{ fontSize: '2.2rem', color: rec.gold, lineHeight: 1, mb: 1.5 }}>
            ✝
          </Box>

          {copy.eyebrow && (
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: rec.gold,
                mb: 1,
              }}
            >
              {copy.eyebrow}
            </Typography>
          )}

          <Typography
            id="recollection-door-title"
            component="h2"
            sx={{
              fontFamily: '"Palatino Linotype", Palatino, Georgia, serif',
              fontSize: 'clamp(1.7rem, 5vw, 2.2rem)',
              color: rec.heading,
              mb: 2.5,
            }}
          >
            {copy.title}
          </Typography>

          {copy.paragraphs.map((text, i) => (
            <Typography
              key={i}
              sx={{ fontSize: '0.92rem', lineHeight: 1.7, color: rec.body, mb: 1.6 }}
            >
              {text}
            </Typography>
          ))}

          <Box
            sx={{ display: 'flex', gap: 1.2, justifyContent: 'center', flexWrap: 'wrap', mt: 3.5 }}
          >
            <Button
              component="a"
              href={REC_URL}
              onClick={markGateAccepted}
              sx={{
                backgroundColor: rec.gold,
                color: rec.onGold,
                fontWeight: 700,
                '&:hover': { backgroundColor: rec.goldBright },
              }}
            >
              {copy.enterLabel}
            </Button>
            <Button
              onClick={() => setOpen(false)}
              sx={{
                color: rec.body,
                border: `1px solid ${rec.faint}`,
                '&:hover': { borderColor: rec.body, backgroundColor: 'transparent' },
              }}
            >
              {copy.declineLabel}
            </Button>
          </Box>

          {copy.fineprint && (
            <Typography sx={{ fontSize: '0.68rem', color: rec.faint, mt: 2.5 }}>
              {copy.fineprint}
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecollectionDoor;
