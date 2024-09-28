import { Typography, Container, Box } from '@mui/material';
import React from 'react';
// import { Link } from 'react-router-dom';
import AchievementTab from '../components/AchievementTab';

const portfolioItems = [
    {
        name: "Achievements",
        url: "/p/achievements",
    },
    {
        name: "Projects",
        url: "/p/projects",
    }
];

const Portfolio = () => {
    return (
        <Container maxWidth="lg" sx={{mb: 4, p:4,  borderRadius:2, boxShadow:3}}>
            {/* <Typography variant="h4" align="center" gutterBottom>
                Portfolio
            </Typography> */}
            <Typography variant="h2" component="h1" gutterBottom sx={{ textAlign: 'center', color: 'primary.main', mb:2}}>
                Portfolio
            </Typography>
            <Box display="flex" flexDirection="column" gap={2}>
                {
                    portfolioItems.map((portfolioItem, index) => (
                        <AchievementTab key={index} index ={index} achievement={portfolioItem} />
                    ))
                }
            </Box>
            <Typography 
                variant="body1" 
                align="center" 
                sx={{ mt: 4 }}
            >
                Don't hesitate to contact me at {' '}
                <Typography 
                    variant="body1" 
                    component="a" 
                    href="mailto:mariopariona117@gmail.com"
                    sx={{
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': {
                            textDecoration: 'underline',
                            color: 'secondary.main',
                        },
                    }}
                >
                    mariopariona117@gmail.com
                </Typography>.
            </Typography>
        </Container>
    );
};

export default Portfolio;