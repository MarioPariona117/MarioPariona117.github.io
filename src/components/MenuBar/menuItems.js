import React from "react";
// import { AccessAlarm } from '@mui/icons-material';
import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';

function HomeIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </SvgIcon>
  );
}

export const menuItems = [
  {
    title: <HomeIcon sx={{ fontSize: 30}}/>,
    url: '/',
  },
  {
    title: 'About Me',
    url: '/about'
  },
  {
    title: 'Portfolio',
    url: '/p',
    submenu: [
      {
        title: 'Achievements',
        url: 'achievements',
      },
      {
        title: 'Projects',
        url: 'projects',
      },
    ]
  },
  {
    title: 'CV',
    url: '/cv',
  },
  {
    title: 'Contact',
    url: '/contact'
  }
];        