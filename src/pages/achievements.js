import React, { useState } from 'react';
import { achievementItems } from '../components/items/achievementItems';
import { Typography, Container, Box } from '@mui/material';
import AchievementTab from '../components/AchievementTab';

function Achievements() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 2, borderRadius:2}}>
      <Typography variant="h4" align="center" gutterBottom>
        Academic Achievements
      </Typography>
      <Box display="flex" flexDirection="column" gap={2}>
        {achievementItems.map((achievement, index) => (
          <AchievementTab key={index} index ={index} achievement={achievement} />
        ))}
      </Box>
    </Container>
  );
}

export default Achievements;