import React, {useState} from "react";
import { projectItems } from "./projectItems";
import "../styles/App.css"

const Projects = () => {
  const [count, SetCount] = useState(0);
  return (
    <div>
      <h2>Projects</h2>
      <ol class = "alternating-colors">
        {
          projectItems.map(
            (project, index) => {
              return (
                <li className = 'Achievement-name'>
                  <strong> {project.name} </strong>
                  <p className='Achievement-desc'>{project.description}</p>
                </li>
              );
            }
          )
        }
      </ol>
      <button onClick={() => SetCount(count + 1)}>
        "Click on me!!"
      </button>
      <p>
        You clicked {count}, muahahhaahahha
      </p>
      <p>Your achievements go here.</p>
    </div>
  );
};

export default Projects;