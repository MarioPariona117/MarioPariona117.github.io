import { Outlet } from 'react-router-dom';
import Header from './Header';
import React from 'react';
import Box from '@mui/material/Box';
import { contentColumn } from '../styles/theme';
import '../styles/App1.css';

// The ThemeProvider lives in index.js and wraps the whole tree, so this file
// no longer re-provides it. The two 10%-width grey Boxes that used to sit here
// as "side spacing" were siblings of a non-flex div, so they rendered as full
// width grey strips above and below the content rather than gutters — removed;
// centring is done by .card's max-width + auto margins.

const Layout = () => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <Header />
      <Box component="main" sx={{ ...contentColumn, flexGrow: 1, pb: 6 }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
