import React from "react";
import { projectItems } from "../components/items/projectItems";
import { Typography, Container } from "@mui/material";
import Box from "@mui/material/Box";

import ProjectTab from "../components/ProjectTab";

const projectItemsReversed = [...projectItems].reverse();

const Projects = () => {
  return (
    <Container maxWidth="lg" sx={{ mb: 4, p: 4, borderRadius: 2, boxShadow:3}}>
      <Typography variant="h2" component="h1" gutterBottom sx={{ textAlign: 'center', color: 'primary.main', mb:2}}>
          Projects
        </Typography>
      <Box display="flex" flexDirection="column" gap={2} style={{ listStyleType: 'none' }}>
        {projectItemsReversed.map((project, index) => (
          <ProjectTab key={index} project={project} index={index}/>
        ))}
      </Box>
    </Container>
  );
};

export default Projects;