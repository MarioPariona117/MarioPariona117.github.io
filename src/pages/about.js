import React from 'react';
import { Container, Typography, Box } from '@mui/material';

function About() {
  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        mt: 4, mb: 4,
        backgroundColor: '#ecf2fa', // Set the desired background color here
        padding: 4, // Add padding for inner spacing
        borderRadius: 2, // Optional: rounded corners
      }}
      >
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h2" component="h1" gutterBottom>
          Hi there! I'm Mario Pariona.
        </Typography>
      </Box>
      <Typography variant="body1" paragraph>
        I'm a Computer Science student at the University of Cambridge with a growing passion for Machine Learning (ML). 
        While I’m still in the early stages of my ML journey, I’ve been diving into the theory behind neural networks, 
        convolutional networks, and reinforcement learning. Every step I take in this field excites me, and I’m eager to 
        continue exploring how these technologies can solve real-world problems.
      </Typography>
      <Typography variant="body1" paragraph>
        Outside of my studies, I’m always on the move! I recently started running, and it’s quickly become one of my 
        favorite ways to stay active and clear my mind. I’m also a big fan of football and ultimate frisbee, which keep 
        me grounded in teamwork and friendly competition.
      </Typography>
      <Typography variant="body1" paragraph>
        Whether it’s in my studies or in my hobbies, I’m all about pushing myself to grow and improve every day.
      </Typography>
    </Container>
    // <section id = "about">
    //   <div>
    //     <h2>Hey, there! It's Mario :D</h2>
    //     <p>
    //       I don't really know what to write about here yet, so I'll just leave it empty for now 😅
    //     </p>
    //   </div>
    // </section>
  );
}

export default About;
