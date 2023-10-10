import React from "react";
import MenuItems from "./MenuItems";

const Dropdown = ({ submenu, dropdown, depth }) => {
    depth += 1;
    const dropdownClass = depth > 1 ? " dropdown-submenu" : " ";
    return (
        <ul className = {`dropdown${dropdownClass}${dropdown? " show" : ""}`}>
            {
                submenu.map(
                    (submenu, index) => (
                        <MenuItems item={submenu} key={index} depth={depth}/>
                    )
                )
            }
        </ul>
    );
};

export default Dropdown;