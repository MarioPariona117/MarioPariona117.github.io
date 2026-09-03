import React from 'react';
import { Typography, Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { palette } from '../styles/theme';

// Colours come from the theme now (they were hard-coded #f9f9f9/#ddd before).
const AchievementTab = ({ achievement, index, enumerate = false, description }) => {
  const label = `${enumerate ? `${index + 1}. ` : ''}${achievement.name}`;

  return (
    <Box
      sx={{
        p: 2,
        border: (t) => `1px solid ${t.palette.divider}`,
        borderRadius: '4px',
        backgroundColor: 'background.paper',
        borderLeft: '3px solid transparent',
        transition: 'border-color 0.25s, transform 0.25s, box-shadow 0.25s',
        '&:hover': {
          borderLeftColor: palette.flame,
          transform: 'translateX(3px)',
          boxShadow: '0 6px 18px rgba(60, 40, 10, 0.08)',
        },
      }}
    >
      {achievement.url ? (
        <Typography
          variant="body1"
          component={Link}
          to={achievement.url}
          sx={{
            color: 'text.primary',
            fontWeight: 600,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline', textDecorationColor: palette.flame },
          }}
        >
          {label}
        </Typography>
      ) : (
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary', mb: 0 }}>
          {label}
        </Typography>
      )}

      {achievement.date && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {achievement.date}
        </Typography>
      )}

      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {description}
        </Typography>
      )}
    </Box>
  );
};

export default AchievementTab;
