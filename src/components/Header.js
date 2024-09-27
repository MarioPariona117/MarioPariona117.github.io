import React, { useState } from "react";
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import { useLocation } from 'react-router-dom';


import { menuItems } from './items/menuItems';
import { Link } from 'react-router-dom';

const Header = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [open, setOpen] = React.useState(Array(menuItems.length).fill(false));
  const location = useLocation();

  const handleOpen = (event, idx) => {
    handleClose1(event);
    setAnchorEl(event.currentTarget);
    setOpen(prevOpen => {
      const newOpen = [...prevOpen];
      newOpen[idx] = true;
      return newOpen;
    });
  };
  const handleClose = (e, idx) => {
    if (e.currentTarget.localName !== "ul") {
      const menu2 = document.getElementById("menu-appbar" + idx);
      console.log(menu2);
      if (menu2) {
      const menu1=menu2.children;
      const menu = menu1[2];
      const menuBoundary = {
        left: menu.offsetLeft,
        top: menu.offsetTop,
        right: menu.offsetLeft + menu.offsetWidth,
        bottom: menu.offsetTop + menu.offsetHeight,
      };
      console.log(menuBoundary);
      console.log(e.clientX, e.clientY);
      if (
        e.clientX >= menuBoundary.left &&
        e.clientX <= menuBoundary.right &&
        e.clientY <= menuBoundary.bottom &&
        e.clientY >= menuBoundary.top
      ) {
        return;
      }
    }
    }
    setAnchorEl(null);
    setOpen(Array(menuItems.length).fill(false));
  };

  const handleClose1 = (env) => {
    setAnchorEl(null);
    setOpen(Array(menuItems.length).fill(false));
  }
  return (
    //just change with <div> if these three don't work!
    <AppBar 
      position="static" 
      sx={{
        backgroundColor:'transparent',
        boxShadow: 'none',
        display: 'flex',         // Flex layout
        // justifyContent: 'center',
        pr: '20%',
        pl: '20%',
      }}
    >
      <Container 
        maxWidth="xl"
        sx={{ backgroundColor: 'transparent', display: 'flex',  }}
      >
        <Toolbar disableGutters
          display="flex"
          // flexDirection="row"
          // justifyContent="space-between"
          // flexWrap="wrap" 
        >
          {
            menuItems.map((item, index) => {
              const thingy = location.pathname.includes(item.url) ? {color:'brown', weight:'bold'} : {color:'transparent', weight:'normal'};
              return (
                <div id={index}>
                  <Button
                    id={`button-${index}`}
                    aria-owns={open[index]? "menu-appbar" + index : null}
                    aria-haspopup="true"
                    onMouseOver={(event)=>handleOpen(event, index)}
                    onMouseLeave={(event)=>handleClose(event, index)}
                    style={{ zIndex: 1301 }}
                    sx={{
                      display: { xs: 'flex', md: 'flex' },
                      letterSpacing: '.1rem',
                      // color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <Typography
                      variant="body"
                      noWrap
                      sx={{
                        display: { xs: 'flex', md: 'flex' },
                        // letterSpacing: '.1rem',
                        color: 'inherit',
                        textDecoration: 'none',
                        borderBottom:`2px solid ${thingy.color}`,
                        paddingBottom: '2px',
                        cornerRadius: '0.5px',
                      }}
                      component={Link}
                      to={item.url}
                      fontWeight={thingy.weight}
                    >
                      {item.title}
                    </Typography>
                  </Button>
                  <Menu
                    id={"menu-appbar" + index}
                    anchorEl={anchorEl}
                    open={Boolean(Boolean(item.submenu) && open[index])}
                    anchorOrigin={{
                      vertical: "bottom",
                      horizontal: "center",
                    }}
                    transformOrigin={{
                      vertical: "top",
                      horizontal: "center",
                    }}
                  >
                    <Box onMouseLeave= {handleClose1}> 
                      {(item.submenu? item.submenu: []).map((i, key) => ( // NEVER onMouseLeave around the Menu
                          <MenuItem key={key} component={Link} to={i.url} onClick={() => {}}>
                          <Typography sx={{ textAlign: 'center' }}>{i.title}</Typography>
                        </MenuItem>
                        ))}
                    </Box>
                    
                  </Menu>
                </div>
              );
            })
          }
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Header;
