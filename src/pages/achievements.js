import React, {useState} from 'react';
import { achievementItems } from './achievementItems';
import "../styles/App.css"

function Achievements() {
  const [count, SetCount] = useState(0);
  return (
    <div>
      <h2>High School Achievements</h2>
      <ol class = "alternating-colors">
        {
          achievementItems.map(
            (achievement, index) => {
              return (
                <li className = 'Achievement-name'>
                  <strong> {achievement.name} </strong>
                  <p className='Achievement-desc'>{achievement.description}</p>
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
}

export default Achievements;
