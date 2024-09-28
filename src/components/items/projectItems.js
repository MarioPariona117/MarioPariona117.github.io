import React from "react";
import TicTacToe from "../Projects/TicTacToe/TicTacToe"
import { Typography, Button } from "@mui/material";
// import Button from "@mui/material";
import { Link } from 'react-router-dom'
export const projectItems = [
	// These were just demos!! :))
	{
		title: "Stargazing Weather App",
		status: {
			short: "Finished",
			long: "Finished on June 2023",
		},
		description: (
			<>
			In May 2023, as part of my Cambridge Interaction Design course, I collaborated with a team of five to develop a user-friendly Weather App tailored for stargazers. The app provides real-time weather data, pollution and cloudiness maps, and curated space news articles, enhancing the stargazing experience.
			<ul>
				<li>\Contributed to the development of the News Tab in a team project, honing teamwork skills. </li>
				<li> Collaborated on creating a user-friendly app for stargazers, offering real-time weather data, pollution and cloudiness maps, and curated space news articles.</li>
				<li> Used Flutter for front-end development, Git for version control.</li>
			</ul>
			The project codebase is available on <a href="https://github.com/Layomiiety/Stargazing-Weather-App-Hi-fi" target="_blank">Github</a>.
			</>
		),
		url: "stargazing-weather-app",
		// render: <TicTacToe />,
	},
	{
		title: "Portfolio",
		status: {
			short: "Evolving",
			long: "Last updated on September 2024",
		},
		description: <>In summer 2023, I began in the journey of building my own online portfolio using React. Every now and then, I'll be including new features; the idea of this project is for it to be an incrementally enhanced open-ended project.</>,
		url: "portfolio",
	},
	{
		title: "Word-reader Android App",
		status: {
			short: "Stopped",
			long: "Stopped on September 2023",
		},
		description : <>In summer 2023, I delved into Neural Networks for the first time, captivated by their potential. This led me to attempt to create an app focused on word recognition. Initially, I found that a basic Neural Network model struggled with accuracy, prompting me to explore Convolutional Neural Networks (CNNs), known for their effectiveness in capturing image features. However, my progress was hindered by a lack of high-quality datasets essential for training the model. Back then, I had a large labeled dataset, but it contained noise, with some images being incorrectly labeled, which further complicated the development. If resumed at some point, updates on outcomes will follow.</>,
		url: "word-reader-android-app"
	},
	{
		title: "Minirobot",
		status: {
			short: "Stopped",
			long: "Stopped on December 2023",
		},
		// description : <p>"I'm currently involved in a minirobot project in the Cambridge University Robotics. We are building a minirobot that is able to solve a maze. See <a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank">reference</a>. We are currently in the first stages, but we should be done by the end of November, and I'll write about the results here when done ;D"</p>,
		description : <>In October 2023, I engaged in a minirobot maze-solving project (see <a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank">reference</a>) in the Cambridge University Robotics, aimed for completion by November 2023. Despite time constraints due to academic commitments, our team made initial progress exploring algorithms and designs. I learned Arduino and made initial attempts to map the maze using three sensors. While unfinished, this experience enhanced my robotics and problem-solving skills within a team environment. If resumed at some point, updates on outcomes will follow.</>,		
		url: "minirobot"
	},
	{
		title: "DoS D-Stress",
		status: {
			short: "Finished",
			long: "Finished on March 2024",
		},
		description: (
			<>
			I successfully completed a project aimed at helping young students manage their stress effectively. As part of our coursework, we collaborated with a client, working in a dedicated team of five to develop an intuitive application using the Flutter framework and Dart. Key contributions include:
			<ul>
				<li>Developed a robust routing system and a user-friendly side panel to enhance navigation.</li>
				<li>Integrated settings and preferences on both the frontend and backend to ensure a synchronized user experience.</li>
				<li>Established seamless connections between settings and backend services, implementing a mechanism to trigger local storage updates effortlessly.</li>
			</ul>
			</>
		),
		url: "dos-d-stress"
	},
	{
		title: "Tic-tac-toe",
		status: {
			short: "Finished",
			long: "Finished on September 2024",
		},
		description: (
			<>
				<p>
					I trained a Q-learning agent to play tic-tac-toe. The agent was trained using a Q-learning algorithm, and it was able to play against a human player. The agent was able to learn the optimal strategy for playing tic-tac-toe, and it was able to win against the human player in most games.
				</p>
			</>
		),
		log: (
			<Typography variant="body1" sx={{ fontStyle: 'italic', fontSize: '0.9em' }}>
				<span style={{ fontWeight: 'bold' }}>Note:</span> The current Tic-Tac-Toe agent is operating with a random policy. 
				The trained agent has not been uploaded yet, but I plan to upload it soon.
			</Typography>
		),
		url: "tic-tac-toe",
		render: <TicTacToe />,
	}
];