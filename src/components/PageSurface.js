import React from 'react';
import { Box, Typography } from '@mui/material';
import { palette } from '../styles/theme';

// One themed page surface, replacing the `sx={{mb:4, p:4, borderRadius:2,
// boxShadow:3}}` that was copy-pasted onto a Container in every page file.
// Optional gold eyebrow + serif heading match Recollection's section headers.

const PageSurface = ({ eyebrow, title, children, sx }) => (
  <Box
    component="section"
    sx={{
      backgroundColor: 'background.paper',
      border: (t) => `1px solid ${t.palette.divider}`,
      borderRadius: 4 + 'px',
      p: { xs: 2.5, sm: 4 },
      my: 4,
      ...sx,
    }}
  >
    {(eyebrow || title) && (
      <Box sx={{ mb: 3 }}>
        {eyebrow && (
          <Typography variant="overline" component="p" sx={{ mb: 0.5 }}>
            {eyebrow}
          </Typography>
        )}
        {title && (
          <Typography variant="h2" component="h1" sx={{ mb: 0 }}>
            {title}
          </Typography>
        )}
        <Box
          aria-hidden
          sx={{ width: 48, height: 2, backgroundColor: palette.flame, mt: 2 }}
        />
      </Box>
    )}
    {children}
  </Box>
);

export default PageSurface;
