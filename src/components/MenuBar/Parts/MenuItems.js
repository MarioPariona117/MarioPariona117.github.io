import React, {useState, useEffect, useRef } from 'react';
import Dropdown from './Dropdown';
import { Link } from 'react-router-dom';

const MenuItems = ({item, depth}) => {
  const [dropDown, setDropDown] = useState(false);
  let ref = useRef();
  // useEffect(
  //     () => {
  //         const handler = (event) => {
  //             if (dropDown && ref.current && !ref.current.contains(event.target)) {
  //                 setDropDown(false);
  //             }
  //         };
  //         document.addEventListener("mousedown", handler);
  //         document.addEventListener("touchstart", handler);
  //         return () => {
  //             // Cleanup the event listener
  //             document.removeEventListener("mousedown", handler);
  //             document.removeEventListener("touchstart", handler);
  //         };
  //     }, 
  //     [dropDown]
  // );
  return(
    <
      li 
      className = 'menu-items' 
      ref = {ref} 
      onMouseEnter = {
        () => {
          return window.innerWidth > 960 && setDropDown(true);
        }
      } 
      onMouseLeave = {
        () => {
          return window.innerWidth > 960 && setDropDown(false);
        }
      }
    >
      {
        item.submenu? (
          <>
            <
              button 
              type = "button" 
              aria-haspopup = "menu"
              aria-expanded = {dropDown? "true" : "false"}
              onClick = {() => setDropDown((cur) => !cur)}
            >
              {item.title}{' '}
              {depth > 0 ? <span>&raquo;</span> : <span className="arrow" />}
            </button>   
            <
              Dropdown 
              submenu = {item.submenu}
              dropdown = {dropDown}
              depth = {depth}
            />
          </>
        ) : (
          <Link to = {item.url}>
            {item.title}
          </Link>
        )
      }
    </li>
  )
};

export default MenuItems;