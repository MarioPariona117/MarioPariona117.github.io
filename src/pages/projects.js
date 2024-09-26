import React from "react";
import { projectItems } from "../components/Projects/projectItems";
import { Typography, Container, Card, CardContent } from "@mui/material";
import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import WarningIcon from '@mui/icons-material/Warning';

const getStatusIcon = (status) => {
  switch (status) {
    case "Finished!":
      return <CheckCircleIcon color="success" />;
    case "Evolving!":
      return <PendingIcon color="warning" />;
    case "Ongoing!":
      return <PendingIcon color="primary" />;
    case "Starting stage!":
      return <WarningIcon color="action" />;
    case "Crawling Baby":
      return <WarningIcon color="action" />;
    default:
      return null;
  }
};

const Projects = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 2, borderRadius: 2 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Projects
      </Typography>
      <Box display="flex" flexDirection="column" gap={2} style={{ listStyleType: 'none' }}>
        {projectItems.map((project, index) => (
          <li key={index} style={{ marginBottom: 0 }}>
            <Card
              sx={{
                transition: '0.3s',
                backgroundColor: '#f9f9f9',
                '&:hover': {
                  boxShadow: 20,
                  transform: 'scale(1.02)',
                  backgroundColor: '#ecf2fa',
                },
              }}
            >
              <CardContent>
                <Typography 
                  variant="h6" 
                  component={Link} 
                  to={`/p/projects/${project.url}`}
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                      color: 'secondary.main',
                    },
                  }}
                >
                  {project.title} 
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  {getStatusIcon(project.status.short)} {/* Display the appropriate icon */}
                  <span style={{ marginLeft: '8px' }}>Status: {project.status.short}</span>
                </Typography>

                {project.status.long && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, pl: 2, fontStyle: 'italic' }}>
                    {project.status.long}
                  </Typography>
                )}

                <Typography variant="body2" color="text.secondary" sx={{ p: 0, m: 0 }}>
                  {project.description}
                </Typography>
                
                
              </CardContent>
            </Card>
          </li>
        ))}
      </Box>
    </Container>
  );
};

export default Projects;