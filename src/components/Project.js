import { Typography } from '@mui/material';
import React from 'react';

const Project = ({ project }) => {
    return (
        <div className="project">
            <Typography variant="h3" >
                {project.title}
            </Typography>
            <p>{project.description}</p>
            {/* <a href={project.url} target="_blank" rel="noopener noreferrer">
                View Project
            </a> */}
            {project.render || <></>}
        </div>
    );
};

export default Project;