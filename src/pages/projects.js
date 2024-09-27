import React from "react";
import { projectItems } from "../components/Projects/projectItems";
import { Typography, Container, Card, CardContent } from "@mui/material";
import Box from "@mui/material/Box";

import ProjectTab from "../components/ProjectTab";

const Projects = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 2, borderRadius: 2 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Projects
      </Typography>
      <Box display="flex" flexDirection="column" gap={2} style={{ listStyleType: 'none' }}>
        {projectItems.map((project, index) => (
          <ProjectTab key={index} project={project} index={index}/>
        ))}
      </Box>
    </Container>
  );
};

export default Projects;