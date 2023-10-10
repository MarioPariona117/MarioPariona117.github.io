import React from "react";
import { menuItems } from "../menuItems";
import MenuItems from "./MenuItems";

const NavBar = () => {
    return(
        <nav>
            <ul className="menus">
                {
                    menuItems.map(
                        (menu, index) => {
                            const depth = 0;
                            return <MenuItems item = {menu} key = {index} depth = {depth}/>;
                        }
                    )
                }
            </ul>
        </nav>
    );
}

export default NavBar;