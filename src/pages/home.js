import React from "react";

const Home = () => {
  return (
    <div>
      <section id="home" className="hero" >
        {/* <div className="hero"> */}
          <div>
            Element1
          </div>
          <div>
            <h1>Hey! I'm <span id="name">Mario</span> :D</h1>
            <p className="about">
              I'm currently studying Computer Science at Trinity College, the Universtiy of Cambridge. 
              I am kind of new to the CS world since I got into it kind of late (17 years without touching a computer) compared to my others peers who were born coding. So far, I am mostly interested in Machine Learning. 
              I love to play football and recently, I become really excited about Ultimate Frisbe. 
              My journey revolves around technology, sports, and innovation.
            </p>
            <button id="exploreButton">Explore My Work</button>
          </div>
        {/* </div> */}
      </section>
      <section id="about">
      // About Me content goes here
      </section>
      <section id="portfolio">
      // Portfolio content goes here
      </section>
      <section id="resume">
      // Resume content goes here
      </section>
      <section id="contact">
      // Contact information and form goes here
      </section>
      <footer>
      // Footer content, including social media links, testimonials, and newsletter signup, goes here
      </footer>
    </div>
  )
};

export default Home;