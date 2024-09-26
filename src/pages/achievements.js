import React, { useState } from 'react';
import { achievementItems } from '../components/items/achievementItems';
import { Typography, Container, Box } from '@mui/material';

function Achievements() {

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 2, borderRadius:2}}>
      <Typography variant="h4" align="center" gutterBottom>
        Academic Achievements
      </Typography>
      <Box display="flex" flexDirection="column" gap={2}>
        {achievementItems.map((achievement, index) => (
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
        ))}
      </Box>
    </Container>
  );
}

export default Achievements;