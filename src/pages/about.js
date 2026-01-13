import React from 'react';
import { Container, Typography, Box, /*Avatar,*/ Grid } from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
// import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import CodeIcon from '@mui/icons-material/Code';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied'; // Laugh Icon
// import ChurchIcon from '@mui/icons-material/Church'; // Faith Icon
import RosaryIcon from '../assets/RosaryIcon';

const quickFacts = [
  {
    title: 'Catholic Faith',
    description: "Through my faith, I draw strength and motivation, striving to embody the principles of love, humility, compassion and a commitment to serve others.",
    // icon: <ChurchIcon sx={{ fontSize: 50, color: 'primary.main' }} />,
    icon: <RosaryIcon sx={{ fontSize: 50, color: 'primary.main' }} />
  },
  {
    title: 'Tech Enthusiast',
    description: 'Passionate about discovering how Machine Learning can be harnessed to create a more equitable world for all.',
    icon: <CodeIcon sx={{ fontSize: 50, color: 'primary.main' }} />
  },
  {
    title: 'Active Lifestyle',
    description: "The joy of movement in running, football, and ultimate frisbee keeps me fit and healthy, bringing balance and energy to my life while keeping me physically and mentally active.",
    icon: <SportsSoccerIcon sx={{ fontSize: 50, color: 'primary.main' }} />
  },
  {
    title: 'Laughter Lover',
    description: "I believe that laughter is contagious; there’s nothing quite like the warmth of making others smile and creating moments of genuine connection through humor.",
    icon: <SentimentVerySatisfiedIcon sx={{ fontSize: 50, color: 'primary.main' }} />
  },
];

function About() {
  return (
    <Container 
      maxWidth="lg" 
      sx={{mb: 4, p:4,  borderRadius:2, boxShadow:3}}
    >
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        {/* <Avatar
          alt="Mario Pariona"
          src="/path_to_image" // If you have an image of yourself, you can place the path here
          sx={{ width: 120, height: 120, mx: 'auto', mb: 2 }}
        /> */}
        <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          It's-a me, Mario!
        </Typography>
        <Typography variant="h6" component="p" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
          Computer Science Graduate • ML Learner • Committed to Global Impact
        </Typography>
      </Box>
        
      <Typography variant="body1" paragraph>
        Hi there! I'm Mario Pariona, a Computer Science graduate from the University of Cambridge with a passion for harnessing the power of Machine Learning to make a positive impact in the world. 
        My journey in computer science began in 2020 after high school when I discovered my love for programming through competitive programming. 
        This passion has evolved into a keen interest in Neural Networks, Convolutional Networks (CNNs), and reinforcement learning (RL), as I seek to leverage these technologies to solve real-world problems.
      </Typography>

      <Typography variant="body1" paragraph>
        My academic journey has been profoundly shaped by a deep appreciation for mathematics, which blossomed during high school when I represented my country in numerous international Olympiads.
        The rigorous environment pushed me to excel, fostering a competitive spirit and a passion for problem-solving that continues to drive my pursuits in Computer Science and Machine Learning.
      </Typography>

      <Typography variant="body1" paragraph>
        Beyond academics, I cherish the joy of movement and the friendship of sports.
        Whether it's playing football, engaging in ultimate frisbee, or going for a run, I discover balance and joy through physical activity.
        These experiences highlight the value of physical activity, friendship, and mental well-being in people's lives, which align with my core values. 
        I strive to embody principles of love, humility, and compassion in everything I do, drawing strength and motivation from my Catholic faith.
      </Typography>

      <Typography variant="body1" paragraph>
        As I continue to explore the intersections of technology and humanity, I'm committed to creating innovative solutions that enhance lives and empower communities.
        I invite you to join me on this journey, as I learn, grow, and strive to make a difference in the world.
      </Typography>
      <Box sx={{ mt: 4 }}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ textAlign: 'center', fontWeight: 'bold', color: 'primary.main' }}>
          Quick Facts About Me
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {quickFacts.map((fact, index) => (
            <Grid item key={index} xs={12} md={4} sx={{ textAlign: 'center' }}>
              {fact.icon}
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{fact.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {fact.description}
              </Typography>
            </Grid>
        ))}
        </Grid>
      </Box>
    </Container>
  );
}

export default About;