import React from 'react';
import { Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import PageSurface from '../components/PageSurface';

const NotFound = () => (
  <PageSurface eyebrow="404" title="That page isn't here" sx={{ textAlign: 'center' }}>
    <Typography variant="body1">
      The link may be out of date, or I may have moved something.
    </Typography>
    <Button component={Link} to="/" variant="contained" color="primary" sx={{ mt: 2 }}>
      Back home
    </Button>
  </PageSurface>
);

export default NotFound;
