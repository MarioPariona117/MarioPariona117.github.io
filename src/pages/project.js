import { Typography } from '@mui/material';
import React from 'react';
import '../styles/App1.css';

const Project = ({ project }) => {
    return (
        <div className="project">
            <Typography variant="h3" >
                {project.title}
            </Typography>
            {project.description}
            {/* <a href={project.url} target="_blank" rel="noopener noreferrer">
                View Project
            </a> */}
            {project.log || <></>}
            {project.render || <></>}
        </div>
    );
};

export default Project;