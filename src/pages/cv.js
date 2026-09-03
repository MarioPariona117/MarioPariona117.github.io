import React from "react";
import { Link } from 'react-router-dom';
import { Typography, Button, Stack, Link as MuiLink } from "@mui/material";
import PageSurface from "../components/PageSurface";

// This page used to say "a downloadable CV is on its way" and call the
// dissertation "the fullest account of my work". Both stopped being true once
// the Experience page went up: there is thirteen months of professional work
// the dissertation says nothing about, and a promise that has not moved in
// weeks reads worse than no promise at all.

const CV = () => (
  <PageSurface eyebrow="Curriculum vitae" title="CV">
    <Typography variant="body1">
      The most current version of my CV is this site. The{' '}
      <MuiLink component={Link} to="/experience" underline="hover">experience</MuiLink>{' '}
      page has my work, education, teaching, volunteering and technical skills, and the{' '}
      <MuiLink component={Link} to="/projects" underline="hover">projects</MuiLink> and{' '}
      <MuiLink component={Link} to="/achievements" underline="hover">achievements</MuiLink>{' '}
      pages cover the rest.
    </Typography>
    <Typography variant="body1">
      I don't keep a generic PDF here, because I write each CV for the role it is going
      to. If you would like one as a document,{' '}
      <MuiLink component={Link} to="/contact" underline="hover">email me</MuiLink> and
      I'll send a copy.
    </Typography>
    <Typography variant="body1" sx={{ mt: 2 }}>
      My main piece of research is my Cambridge dissertation on reinforcement learning
      for Blokus: a Gymnasium-compatible environment 6–10× faster than existing
      implementations depending on board size, a Deep Q-Network reaching an 80%+ win
      rate against a fixed heuristic opponent on the 10×10 board (game tree
      &gt; 10<sup>32</sup>), and a proved forced first-player win on 7×7.
    </Typography>

    <Stack direction="row" spacing={1.5} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
      <Button variant="contained" color="primary" component={Link} to="/experience">
        See my experience
      </Button>
      <Button
        component="a"
        href={`${process.env.PUBLIC_URL}/documents/2327D.pdf`}
        target="_blank"
        rel="noopener noreferrer"
        variant="outlined"
      >
        Read the dissertation
      </Button>
    </Stack>
  </PageSurface>
);

export default CV;
