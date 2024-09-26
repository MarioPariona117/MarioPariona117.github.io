import { Typography, Container, Box } from '@mui/material';
import React from 'react';
import { Link } from 'react-router-dom';

const Portfolio = () => {
    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>
                Portfolio
            </Typography>
            <Box display="flex" flexDirection="column" gap={2}>
                <Box 
                    sx={{ 
                        padding: 2,
                        border: '1px solid #ddd',
                        borderRadius: 2,
                        backgroundColor: '#f9f9f9',
                        boxShadow: '0px 2px 5px rgba(0,0,0,0.1)',
                        transition: 'transform 0.3s',
                        '&:hover': {
                            transform: 'scale(1.02)',
                        },
                    }}
                >
                    <Typography 
                        variant="body1" 
                        component={Link} 
                        to="/p/achievements"
                        sx={{
                            color: 'primary.main',
                            textDecoration: 'none',
                            '&:hover': {
                                textDecoration: 'underline',
                                color: 'secondary.main',
                            },
                        }}
                    >
                        Achievements
                    </Typography>
                </Box>
                <Box 
                    sx={{ 
                        padding: 2,
                        border: '1px solid #ddd',
                        borderRadius: 2,
                        backgroundColor: '#f9f9f9',
                        boxShadow: '0px 2px 5px rgba(0,0,0,0.1)',
                        transition: 'transform 0.3s',
                        '&:hover': {
                            transform: 'scale(1.02)',
                        },
                    }}
                >
                    <Typography 
                        variant="body1" 
                        component={Link} 
                        to="/p/projects"
                        sx={{
                            color: 'primary.main',
                            textDecoration: 'none',
                            '&:hover': {
                                textDecoration: 'underline',
                                color: 'secondary.main',
                            },
                        }}
                    >
                        Projects
                    </Typography>
                </Box>
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