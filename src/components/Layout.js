import { Outlet } from 'react-router-dom';
import Header from './Header';
import React from 'react';
import theme from "../styles/theme";
import { ThemeProvider } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
const Layout = () => {
  return (
    <ThemeProvider theme={theme}>
    <div>
      {/* Left side space */}
      <Box sx={{ width: '10%', backgroundColor: '#ecf0f1' }}> {/* Left space box */}</Box>
  
      <div>
        <Header />
        <Box
          sx={{ 
            mt: 10, 
            mb: 10,
            pr: "20%",
            pl: "20%",
            backgroundColor: theme.palette.background.default,
            display: 'flex',         // Flex layout
            // justifyContent: 'center', // Center the content horizontally
            lexGrow: 1,
          }} 
        >
          <Outlet />
        </Box>
      </div>
  
      {/* Right side space */}
      <Box sx={{ width: '10%', backgroundColor: '#ecf0f1' }}> {/* Right space box */}</Box>
    </div>
    </ThemeProvider>
  );
};

export default Layout;