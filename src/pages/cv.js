import React from "react";
import { Link } from 'react-router-dom';
import { Typography } from "@mui/material";

const CV = () => {
  return (
    <div>
      <Typography>
        I'll upload my CV soon; but for now feel free to contact me in {' '}
        <Typography 
          variant="body1" 
          component={Link} 
          to={`/contact`}
          sx={{
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
              color: 'secondary.main', // Change color on hover
            },
          }}
        >
          Contact
        </Typography>.
      </Typography>
      
      {/* <a href="CV.pdf" download="Mario_Pariona_CV.pdf">Download CV</a> */}
    </div>
  )
};

export default CV;