import React from "react";
import { Typography, Box, Button, Stack } from "@mui/material";
import { Link } from "react-router-dom";
import { projectItems } from "../components/items/projectItems";
import backgroundImage from "../assets/background.avif";
import ProjectTab from "../components/ProjectTab";
import { palette } from "../styles/theme";
import "../styles/App1.css";

// Featured work is now flagged on the items themselves (`featured: true`)
// rather than by positional index — the old `[6, 4, 0, 1]` silently changed
// the front page whenever projectItems was reordered.
const featured = projectItems.filter((p) => p.featured);

const Home = () => {
  return (
    <>
      {/* Hero. Kept deliberately plain. An earlier version led with a slogan
          headline and a row of statistics, which is the convention for a
          landing page trying to convert a stranger — the wrong genre here. The
          readers who matter for this site are engineers and researchers who
          will judge the work themselves, and for them the expected pattern is
          the academic homepage: name, what you do, then the work. The numbers
          still exist, in context and checkable, on the pages that earn them. */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 1,
          mt: 4,
          px: { xs: 3, sm: 6 },
          py: { xs: 5, sm: 7 },
          border: `1px solid ${palette.hairline}`,
          backgroundImage: `linear-gradient(180deg, rgba(255,250,240,0.90), rgba(239,227,205,0.94)), url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          textAlign: 'center',
        }}
      >
        <Typography variant="overline" component="p" sx={{ mb: 1 }}>
          Research Software Engineer · Cambridge
        </Typography>
        <Typography
          variant="h1"
          component="h1"
          sx={{
            mb: 0,
            '&::after': {
              content: '""',
              display: 'block',
              width: '3rem',
              height: '1px',
              backgroundColor: palette.flame,
              margin: '1.1rem auto 0',
            },
          }}
        >
          Mario Pariona
        </Typography>
        <Typography
          sx={{
            maxWidth: 620,
            mx: 'auto',
            mt: 2.5,
            color: palette.body,
            fontSize: '1.05rem',
            lineHeight: 1.7,
            mb: 3.5,
          }}
        >
          I work on machine-learning systems. At the moment that means a computer vision
          system and the data pipeline behind it, at a company in Cambridge. Before that
          I read Computer Science at Cambridge, where my dissertation on reinforcement
          learning for Blokus was supervised by Dr Petar Veličković and awarded a First.
        </Typography>

        <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
          <Button variant="outlined" component={Link} to="/experience">
            Experience
          </Button>
          <Button variant="outlined" component={Link} to="/projects">
            Projects
          </Button>
        </Stack>
      </Box>

      {/* Featured projects */}
      <Box sx={{ mt: 7 }}>
        <Typography variant="overline" component="p">
          Selected work
        </Typography>
        <Typography variant="h2" component="h2">
          Featured projects
        </Typography>
        <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mb: 3 }} />

        <Box display="flex" flexDirection="column" gap={2}>
          {featured.map((project, index) => (
            <ProjectTab key={project.url || index} project={project} />
          ))}
        </Box>

        <Box textAlign="center" sx={{ mt: 4 }}>
          <Button variant="contained" color="primary" component={Link} to="/projects">
            View all projects
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default Home;
