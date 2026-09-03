import React, { useState } from "react";
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, Link } from 'react-router-dom';
import { palette, contentColumn } from '../styles/theme';
import RecollectionDoor from './RecollectionDoor';

import { menuItems } from './items/menuItems';

// Six flat nav items plus the Recollection pill do not fit on a phone — they
// wrapped onto a second row and left the pill stranded. Below `md` the items
// collapse into a drawer behind a menu button, which is the pattern people
// already expect (Jakob's Law) and which gives each destination a full-width
// row well above the 44pt touch-target minimum. Breakpoints are done in `sx`
// rather than with useMediaQuery so the correct nav is in the first paint
// instead of appearing after a measurement.

// A nav item is "current" when the path equals its url, or is a descendant of
// it. The old check was `pathname.includes(item.url)`, which matched the Home
// item ('/') on literally every page.
const isCurrent = (pathname, url) =>
  url === '/' ? pathname === '/' : pathname === url || pathname.startsWith(url + '/');

const Header = () => {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        // Recollection's .topbar: the ground, one shade deeper, made
        // translucent and blurred so the page's glow shows through it.
        backgroundColor: 'rgba(239, 227, 205, 0.82)',
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid rgba(${palette.flameRgb}, 0.24)`,
        color: 'text.primary',
      }}
    >
      <Box sx={contentColumn}>
        <Toolbar
          disableGutters
          sx={{
            gap: { xs: 0.5, md: 0.3 },
            flexWrap: 'nowrap',
            minHeight: { xs: 56, sm: 64, md: 72 },
          }}
        >
          <Typography
            component={Link}
            to="/"
            variant="h6"
            sx={{
              mr: 'auto',
              color: palette.heading,
              textDecoration: 'none',
              fontSize: { xs: '1rem', sm: '1.15rem' },
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            Mario Pariona
          </Typography>

          {/* Wide screens: the full nav. */}
          <Box sx={{ display: { xs: 'none', md: 'inline-flex' }, alignItems: 'center' }}>
            {menuItems.map((item) => {
              const current = isCurrent(location.pathname, item.url);
              return (
                <Button
                  key={item.url}
                  component={Link}
                  to={item.url}
                  aria-current={current ? 'page' : undefined}
                  sx={{
                    // Recollection's .tab — small tracked caps, no pill, a
                    // flame underline on the current one.
                    px: 1,
                    minWidth: 0,
                    fontSize: '0.7rem',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: current ? palette.heading : 'text.secondary',
                    fontWeight: current ? 700 : 600,
                    borderRadius: 0,
                    borderBottom: `2px solid ${current ? palette.flame : 'transparent'}`,
                    '&:hover': { backgroundColor: 'transparent', color: palette.heading },
                  }}
                >
                  {item.title}
                </Button>
              );
            })}
            <RecollectionDoor variant="header" />
          </Box>

          {/* Phones and small tablets: one button, everything behind it. */}
          <IconButton
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              color: palette.heading,
              width: 44,
              height: 44,
            }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // PaperProps, not slotProps — Drawer only gained slotProps in MUI v6
        // and this project is on 5.16, where the prop is silently ignored
        // rather than erroring. Same trap documented in RecollectionDoor.js.
        PaperProps={{
          sx: {
            width: 'min(80vw, 300px)',
            backgroundColor: palette.card,
            backgroundImage: 'none',
            borderLeft: `1px solid ${palette.hairline}`,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
          <IconButton
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            sx={{ color: palette.heading, width: 44, height: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <List sx={{ px: 1 }}>
          {menuItems.map((item) => {
            const current = isCurrent(location.pathname, item.url);
            return (
              <ListItemButton
                key={item.url}
                component={Link}
                to={item.url}
                onClick={() => setDrawerOpen(false)}
                aria-current={current ? 'page' : undefined}
                sx={{
                  minHeight: 48,
                  borderRadius: '4px',
                  borderLeft: `2px solid ${current ? palette.flame : 'transparent'}`,
                  backgroundColor: current ? palette.accentSoft : 'transparent',
                }}
              >
                <ListItemText
                  primary={item.title}
                  primaryTypographyProps={{
                    fontSize: '0.78rem',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    fontWeight: current ? 700 : 600,
                    color: current ? palette.heading : palette.body,
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ px: 2, pt: 1 }}>
          <RecollectionDoor variant="button" />
        </Box>
      </Drawer>
    </AppBar>
  );
};

export default Header;
