import React from "react";
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/home';
import About from './pages/about';
import Experience from './pages/experience';
import Achievements from './pages/achievements';
import Projects from './pages/projects';
import CV from './pages/cv';
import Contact from './pages/contact';
import NotFound from './pages/notFound';
import Layout from "./components/Layout";
import { projectItems } from "./components/items/projectItems";
import Project from "./pages/project";
import { contentColumn } from "./styles/theme";
import { Typography, Box, Link as MuiLink } from "@mui/material";

function App() {
    return (
        <Box display="flex" flexDirection="column" minHeight="100vh">
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/experience" element={<Experience />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/achievements" element={<Achievements />} />
                    {
                        projectItems.map((project, index) => (
                            <Route key={index} path={`/projects/${project.url}`} element={<Project project={project} />} />
                        ))
                    }
                    {/* The old /p/* paths, kept so links shared before the nav
                        was flattened still land somewhere correct. */}
                    <Route path="/p" element={<Navigate to="/projects" replace />} />
                    <Route path="/p/projects" element={<Navigate to="/projects" replace />} />
                    <Route path="/p/achievements" element={<Navigate to="/achievements" replace />} />
                    {
                        projectItems.map((project, index) => (
                            <Route
                                key={`legacy-${index}`}
                                path={`/p/projects/${project.url}`}
                                element={<Navigate to={`/projects/${project.url}`} replace />}
                            />
                        ))
                    }
                    <Route path="/cv" element={<CV />} />
                    <Route path="/contact" element={<Contact />} />
                    {/* Anything else lands somewhere useful instead of a blank page. */}
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>

            <Box
                component="footer"
                sx={{
                    mt: 'auto',
                    borderTop: (t) => `1px solid ${t.palette.divider}`,
                    py: 4,
                }}
            >
                <Box sx={{ ...contentColumn, textAlign: 'center' }}>
                    {/* The Recollection door now lives in the header, where it's
                        visible on every page — no second copy needed here. */}
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        <MuiLink href="https://github.com/MarioPariona117" target="_blank" rel="noopener noreferrer" underline="hover">GitHub</MuiLink>
                        {' · '}
                        <MuiLink href="https://www.linkedin.com/in/mario-pariona-molocho-67574b207/" target="_blank" rel="noopener noreferrer" underline="hover">LinkedIn</MuiLink>
                        {' · '}
                        <MuiLink href="mailto:mariopariona117@gmail.com" underline="hover">Email</MuiLink>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0 }}>
                        © 2024–{new Date().getFullYear()} Mario Pariona
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}

export default App;
