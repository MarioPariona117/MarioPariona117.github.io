import React from 'react';
import extracurricularItems from '../components/items/extracurricularItems';


const Extracurricular = () => {
    return (
        <div>
            <h1>Extracurricular Activities</h1>
            <ul>
                {extracurricularItems.map((item, id) => (
                    <li key={id}>
                        <h2>{item.name}</h2>
                        {item.description}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Extracurricular;