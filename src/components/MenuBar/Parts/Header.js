import React from "react";
import NavBar from "./NavBar";
import { Link } from 'react-router-dom';

const Header = () => {
    return(
        <header className="App-header">
            <div className="nav-area">
                <NavBar />
            </div>
        </header>
    );
}

export default Header;