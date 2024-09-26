import React from "react";
import { Routes, Route } from 'react-router-dom';
// import "./styles/App.css";
import Home from './pages/home';
import About from './pages/about';
import Achievements from './pages/achievements';
import Projects from './pages/projects';
import CV from './pages/cv';
import Contact from './pages/contact';
import Portfolio from './pages/portfolio';
import Layout from "./components/Layout";
import { projectItems } from "./components/Projects/projectItems";
import Project from "./components/Project";
import { Typography, Box } from "@mui/material";

function App() {
    return (
        <Box 
            display="flex" 
            flexDirection="column" 
            minHeight="100vh" // Ensure it takes the full viewport height
        >
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/p/achievements" element={<Achievements />} />
                    <Route path="/p" element={<Portfolio />} />
                    <Route path="/p/projects" element={<Projects />} />
                    { 
                        projectItems.map((project, index) => (
                            <Route key={index} path={`/p/projects/${project.url}`} element={<Project project={project}/>} />
                        ))
                    }
                    <Route path="/cv" element={<CV />} />
                    <Route path="/contact" element={<Contact />} />
                </Route>
            </Routes>
            
            <footer 
                style={{
                    marginTop: 'auto', // Pushes the footer to the bottom
                    padding: '20px 0', // Adds vertical padding
                    backgroundColor: '#f1f1f1', // Optional background color
                    textAlign: 'center',
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    &copy; 2024 Mario Pariona Molocho
                </Typography>
            </footer>
        </Box>
    );
}

export default App;