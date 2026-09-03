import React from "react";
import { Typography, Link as MuiLink, Box } from "@mui/material";
import PageSurface from "../components/PageSurface";
import { palette } from "../styles/theme";

// Phone number deliberately omitted: it is in the CV knowledge base and belongs
// on a CV sent to a named employer, not on a public page that gets scraped.
const EMAIL = "mariopariona117@gmail.com";
const LINKS = [
  { label: "GitHub", handle: "MarioPariona117", href: "https://github.com/MarioPariona117" },
  {
    label: "LinkedIn",
    handle: "Mario Pariona Molocho",
    href: "https://www.linkedin.com/in/mario-pariona-molocho-67574b207/",
  },
];

const Contact = () => (
  <PageSurface eyebrow="Get in touch" title="Contact">
    <Typography variant="body1">
      The quickest way to reach me is email — I read everything and reply to
      anything that isn't a mass mailshot.
    </Typography>
    <Typography variant="body1" sx={{ fontSize: '1.15rem', mt: 2, mb: 4 }}>
      <MuiLink href={`mailto:${EMAIL}`} underline="hover">{EMAIL}</MuiLink>
    </Typography>

    <Typography variant="overline" component="p">Elsewhere</Typography>
    <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mt: 1, mb: 2.5 }} />
    <Box display="flex" flexDirection="column" gap={1.5}>
      {LINKS.map((l) => (
        <Typography key={l.label} variant="body1" sx={{ mb: 0 }}>
          <strong>{l.label}</strong>{' — '}
          <MuiLink href={l.href} target="_blank" rel="noopener noreferrer" underline="hover">
            {l.handle}
          </MuiLink>
        </Typography>
      ))}
    </Box>
  </PageSurface>
);

export default Contact;
