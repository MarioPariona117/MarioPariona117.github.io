import React from "react";
import { Typography, Container } from "@mui/material";
const Contact = () => {
	return (
		<Container sx={{mb: 4, p:4,  borderRadius:2, boxShadow:3}}>
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
		</Container>
	)
};

export default Contact;