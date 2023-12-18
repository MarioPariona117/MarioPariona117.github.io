import React from "react";
import { Link } from 'react-router-dom';
import Contact from './contact'; // Import the Contact component

const CV = () => {
  return (
    <div>
      I'll upload my CV soon; but for now feel free to contact me in <Link to = "/contact"> Contact!</Link>
      {/* <a href="CV.pdf" download="Mario_Pariona_CV.pdf">Download CV</a> */}
    </div>
  )
};

export default CV;