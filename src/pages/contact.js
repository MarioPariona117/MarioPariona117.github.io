import React from "react";
import { Typography } from "@mui/material";
const Contact = () => {
    return (
        
        <div>
            <Typography>
                Don't hesitate to contact me at {' '}
                <Typography 
                variant="body1" 
                component={"a"} 
                href="mailto:mariopariona117@gmail.com"
                sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': {
                    textDecoration: 'underline',
                    color: 'secondary.main', // Change color on hover
                    },
                }}
                >
                mariopariona117@gmail.com
                </Typography>.
            </Typography>
        </div>
    )
};

export default Contact;