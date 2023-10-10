import React, {useState} from "react";
import { Routes, Route, HashRouter } from 'react-router-dom';
// import TextField from "@mui/material/TextField";
// import List from "./Components/List";
import "./styles/App.css";
import Home from './pages/home';
import About from './pages/about_me';
import Achievements from './pages/achievements';
import Skills from './pages/skills';
import Projects from './pages/projects';
import CV from './pages/projects';
import Contact from './pages/contact';

import Layout from "./components/Layout";

import MenuBar from "./components/MenuBar/MenuBar";

function App() {
    const [activeTab, setActiveTab] = useState('achievements');

    return (
      <div className="App">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path = "/about" element={<About />} />
            <Route path = "/achievements" element = {<Achievements />} />
            {/* <Route path = "/skills" element = {<Skills />} /> */}
            <Route path = "/projects" element = {<Projects />} />
            <Route path = "/cv" element = {<CV />} />
            <Route path = "/contact" element = {<Contact />} />
          </Route>
        </Routes>
    
    <script src="script.js"></script>
      <footer className="App-footer">
        <p>&copy; 2023 Mario Pariona Molocho</p>
      </footer>
    </div>
  );
}

export default App;