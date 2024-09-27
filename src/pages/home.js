import React from "react";
import { Typography, Container, Box, Button } from "@mui/material";
import { Link } from "react-router-dom";
import { projectItems } from "../components/Projects/projectItems"; // Assuming you have projectItems already
import backgroundImage from "../assets/background.avif"; // Add your background image path
import ProjectTab from "../components/ProjectTab";

const featuredIndices = [0, 1, 4, 5]; // Assuming you want to show the first 3 projects as featured

const Home = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p:2}}>
      {/* /* Hero Section */}
      <Box
        sx={{
          backgroundImage: `url(${backgroundImage})`, // Add your background image path
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          height: '300px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          mb: 4,
        }}
      >
        <Typography 
          variant="h2"
          sx={{
            fontWeight: 'bold',
            color: 'white',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.7)', // Subtle shadow for better visibility
            zIndex: 2, // Ensure the text is above the overlay
            padding: '20px', // Adds some breathing space
          }}
        >
          Welcome to My Portfolio!
        </Typography>
      </Box>

      {/* Featured Projects Section */}
      <Typography variant="h4" align="center" gutterBottom>
        Featured Projects
      </Typography>
      <Box display="flex" flexDirection="column" gap={2}>
        {featuredIndices.map(index => projectItems[index]).map((project, index) => (
          <ProjectTab key={index} project={project} />
        ))}
      </Box>

      {/* Call to Action */}
      <Box textAlign="center" sx={{ mt: 4 }}>
        <Button variant="contained" color="primary" component={Link} to="/p/projects" sx={{ px: 4 }}>
          View All Projects
        </Button>
      </Box>

      {/* Skills Overview Section */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Skills Overview
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Here are some of my skills:
        </Typography>
        <Box sx={{ mt: 2 }}>
          {/* You can replace this with an actual skills representation (e.g., skill bars or icons) */}
          <Typography variant="body2">• JavaScript</Typography>
          <Typography variant="body2">• React</Typography>
          <Typography variant="body2">• Machine Learning</Typography>
          <Typography variant="body2">• Flutter</Typography>
        </Box>
      </Box>

      {/* Testimonials Section */}
      {/* <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          What Others Say
        </Typography>
        <Typography variant="body1" color="text.secondary">
          "Mario is an exceptional talent with a passion for technology and problem-solving."
        </Typography>
      </Box> */}
    </Container>
  );
};

export default Home;