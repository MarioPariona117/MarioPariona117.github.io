import React from "react";
import { projectItems } from "../components/items/projectItems";
import Box from "@mui/material/Box";
import ProjectTab from "../components/ProjectTab";
import PageSurface from "../components/PageSurface";

// projectItems is already ordered by the tier/date rule defined where it is
// exported. This page used to .reverse() it — correct back when the raw array
// happened to sit oldest-first, but it inverted the ordering the moment that
// export became sorted, which is why Home and this page disagreed.

const Projects = () => (
  <PageSurface eyebrow="Things I've built" title="Projects">
    <Box display="flex" flexDirection="column" gap={2}>
      {projectItems.map((project, index) => (
        <ProjectTab key={project.url || index} project={project} index={index} />
      ))}
    </Box>
  </PageSurface>
);

export default Projects;
