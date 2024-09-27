import React from 'react';
import { Typography, Container, Box } from '@mui/material';

const AchievementTab = ({ achievement , index}) => {
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
      <Typography 
        variant="body1" // Changed to body1 for a less title-like appearance
        sx={{
          fontWeight: 500,
          color: 'primary.main',
        }}
      >
        {index + 1}. {achievement.name} 
      </Typography>
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