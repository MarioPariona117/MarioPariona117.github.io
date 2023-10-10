import React, {useState} from 'react';
import { achievementItems } from './achievementItems';
import "../styles/App.css"

function Achievements() {
  const [count, SetCount] = useState(0);
  return (
    <div>
      <h2>High School Achievements</h2>
      <dl>
        {
          achievementItems.map(
            (achievement, index) => {
              return (
                <dt className = 'Achievement-name'>
                  {achievement.name}
                  <dd className='Achievement-desc'>{achievement.description}</dd>
                </dt>
              );
            }
          )
        }
      </dl>
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
