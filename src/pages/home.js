import React from "react";

const Home = () => {
  return (
    <div>
      <section id="home" className="hero" >
        <div>
          <h1>Hey! I'm <span id="name">Mario</span> :D</h1>
          {/* <p className="about"> */}
          <p>
            I'm Mario Pariona, a Computer Science student at the University of Cambridge. My journey into the world of problem-solving began with a passion for Mathematical Olympiads, which took me to international competitions for nearly three years during high school. 
          </p>
          <p>
            After high school, I discovered the fascinating world of competitive programming, where I explored how machines can be harnessed to tackle real-world challenges. I've even written essays on the subject.
          </p>
          <p>
            In 2022, I proudly represented Cambridge and secured a bronze medal at NEWRC, a testament to my problem-solving prowess. My insatiable curiosity and drive to learn as much as possible have led me to a unique aspiration: to create solutions that can make a meaningful impact on the lives of the underprivileged.
          </p>
          <p>
            What sets my journey apart is that I ventured into the world of Computer Science without prior knowledge, unlike many of my peers. I'm excited about the endless possibilities that lie ahead in this field.
          </p>
          <p>
            As I navigate this incredible journey, I'm constantly inspired by the idea of leveraging technology to uplift the poorest in society. If you'd like to be a part of this journey or explore my work, I welcome you to join me.
          </p>
            {/* I'm Mario Pariona, and I'm passionate about learning, solving complex problems. 
            As a past Mathe Olympiad participant and current Competitive Programmer, I've gained so much experience in problem-solving, that I now use to make the world a better place?
            I'm currently studying Computer Science at Trinity College, the Universtiy of Cambridge. 
            I have done Math Olympiads and a little of Informatics Olympiads in high school.
            I am kind of new to the CS world since I got into it kind of late (17 years without touching a computer) compared to my others peers who were born coding. So far, I am mostly interested in Machine Learning. 
            I love to play football and recently, I become really excited about Ultimate Frisbe. 
            My journey revolves around technology, sports, and innovation.
          </p> */}
          <button id="exploreButton">Explore My Work</button>
        </div>
        
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