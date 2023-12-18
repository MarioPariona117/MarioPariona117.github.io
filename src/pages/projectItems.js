import React from "react";
import { Link } from "react-router-dom";
export const projectItems = [
	// These are just demos!!
	{
			name: "Stargazing Weather App",
			status: {
					short: "Finished!",
					long: "Finished on June 2023",
			},
			description: "As part of my Interaction Design course, we built a Weather App in a group of five. We used the Flutter framework, with Dart.",
	},
	{
			name: "Portfolio",
			status: {
					short: "Evolving!",
					long: "",
			},
			description: "This website is my portofolio, and every now and then, I'll be including new features. The idea of this project is for it to be an incrementally enhanced open-ended project."
	},
	{
			name: "Minirobot",
			status: {
					short: "Starting stage!",
					long: "Will be finished by end of November 2023",
			},
			// description : <p>"I'm currently involved in a minirobot project in the Cambridge University Robotics. We are building a minirobot that is able to solve a maze. See <a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank">reference</a>. We are currently in the first stages, but we should be done by the end of November, and I'll write about the results here when done ;D"</p>,
			description : <p>Engaged in a minirobot maze-solving project (see <a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank">reference</a>) in the Cambridge University Robotics, aimed for completion by November. Despite time constraints due to academic commitments, our team made initial progress exploring algorithms and designs. While unfinished, this experience enhanced my robotics and problem-solving skills within a team environment. Updates on outcomes to follow. </p> 
	},
	{
			name: "Word-reader Android App ",
			status: {
					short: "Crawling Baby",
					long: "I thought this would be easier; currently, I have a big labeled data with noise (so there are some images that are wrongly labeled and can't work with that",
			},
			description: "Last summer, I delved into Neural Networks, fascinated by their potential. Intrigued, I embarked on creating an app aimed at word recognition. However, I discovered that a basic NN model lacked accuracy. This led me to explore Convolutional Neural Networks (CNNs), renowned for their ability to capture image features effectively. Unfortunately, progress was limited due to insufficient high-quality datasets required to train the model effectively."
	},
];