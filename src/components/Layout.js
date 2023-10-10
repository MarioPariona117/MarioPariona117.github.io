import { Outlet } from 'react-router-dom';
import Header from './MenuBar/Parts/Header';
import React from 'react';
// import Dropdown from 'react-bootstrap/Dropdown';

const Layout = () => {
    return (
        <div>
            <Header />
            <div className = "content">
                <Outlet />
            </div>
        </div>
    ) ;
};

export default Layout;