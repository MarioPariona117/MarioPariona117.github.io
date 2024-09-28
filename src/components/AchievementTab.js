import React from 'react';
import { Typography, Box } from '@mui/material';
import { Link } from 'react-router-dom';
const AchievementTab = ({ achievement , index, enumerate=false}) => {
  return (
    <Box 
      key={index} 
      sx={{ 
        padding: 2,
        border: '1px solid #ddd',
        borderRadius: 2,
        backgroundColor: '#f9f9f9',
        boxShadow: '0px 2px 5px rgba(0,0,0,0.1)',
        transition: 'transform 0.3s',
        '&:hover': {
          transform: 'scale(1.02)',
        },
      }}
    >
        {achievement.url ? (
          <Typography 
            variant="body1" 
            component={Link} 
            to={achievement.url}
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
                color: 'secondary.main',
              },
            }}
          >
            {enumerate? `${index + 1}. ` : ''}{achievement.name}
          </Typography>
        ) : (
          <Typography 
            variant="body1" // Changed to body1 for a less title-like appearance
            sx={{
              fontWeight: 500,
              color: 'primary.main',
            }}
          >
            {enumerate? `${index + 1}. ` : ''}{achievement.name}
        </Typography>
        )}
      <Typography 
        variant="caption" 
        color="text.secondary"
        sx={{ display: 'block', marginTop: '4px' }} // New line for the date
      >
        {achievement.date}
      </Typography>
    </Box>
  );
}

export default AchievementTab;