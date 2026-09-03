import React from "react";
import { Typography, Card, CardContent, Button, Box } from "@mui/material";
import { Link } from "react-router-dom";
import { palette } from "../styles/theme";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';

const STATUS = {
  "Finished":       { icon: <CheckCircleIcon fontSize="small" />, color: 'success.main' },
  "Evolving":       { icon: <PendingIcon fontSize="small" />,     color: 'secondary.dark' },
  "Ongoing":        { icon: <PendingIcon fontSize="small" />,     color: 'secondary.main' },
  "Starting stage": { icon: <PendingIcon fontSize="small" />,     color: 'text.secondary' },
  "Crawling Baby":  { icon: <PendingIcon fontSize="small" />,     color: 'text.secondary' },
  "Stopped":        { icon: <PauseCircleOutlineIcon fontSize="small" />, color: 'text.secondary' },
};

const ProjectTab = ({ project }) => {
  const status = STATUS[project.status?.short];

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography
          variant="h6"
          component={Link}
          to={`/projects/${project.url}`}
          sx={{
            color: 'text.primary',
            textDecoration: 'none',
            display: 'inline-block',
            '&:hover': { textDecoration: 'underline', textDecorationColor: palette.flame },
          }}
        >
          {project.title}
        </Typography>

        {status && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mt: 0.75,
              mb: 1.5,
              color: status.color,
            }}
          >
            {status.icon}
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
              {project.status.short}
              {project.status.long ? ` · ${project.status.long}` : ''}
            </Typography>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary" component="div">
          {project.description}
        </Typography>

        {Boolean(project.render) && (
          <Button
            component={Link}
            to={`/projects/${project.url}`}
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
          >
            Check now
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectTab;
