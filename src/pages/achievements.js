import React from 'react';
import { achievementItems } from '../components/items/achievementItems';
import { Typography, Container, Box } from '@mui/material';
import AchievementTab from '../components/AchievementTab';

function Achievements() {
  return (
    <Container maxWidth="lg" sx={{mb: 4, p:4, borderRadius:2, boxShadow:3}}>
      <Typography variant="h2" component="h1" gutterBottom sx={{ textAlign: 'center', color: 'primary.main', mb:2}}>
          Achievemic Achievements
        </Typography>
      <Box display="flex" flexDirection="column" gap={2}>
        {achievementItems.map((achievement, index) => (
          <AchievementTab key={index} index ={index} achievement={achievement} enumerate={true}/>
        ))}
      </Box>
    </Container>
  );
}

export default Achievements;