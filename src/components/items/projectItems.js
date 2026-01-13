import React from "react";
import TicTacToe from "../Projects/TicTacToe/TicTacToe"
import { Typography } from "@mui/material";

export const projectItems = [
	// These were just demos!! :))
	{
		title: "Stargazing Weather App",
		status: {
			short: "Finished",
			long: "Finished in June 2023",
		},
		description: (
			<>
			In May 2023, as part of my Cambridge Interaction Design course, I collaborated with a team of five to develop a user-friendly Weather App tailored for stargazers. The app provides real-time weather data, pollution and cloudiness maps, and curated space news articles, enhancing the stargazing experience.
			<ul>
				<li>Contributed to the development of the News Tab in a team project, honing teamwork skills. </li>
				<li> Collaborated on creating a user-friendly app for stargazers, offering real-time weather data, pollution and cloudiness maps, and curated space news articles.</li>
				<li> Used Flutter for front-end development, Git for version control.</li>
			</ul>
			{/* The project codebase is available on{" "}
			<a href="..." target="_blank" rel="noopener noreferrer">Github</a>. */}
			<p>
				The project codebase is available on <a href="https://github.com/Layomiiety/Stargazing-Weather-App-Hi-fi" target="_blank" rel="noopener noreferrer">Github</a>.
			</p>
			</>
		),
		url: "stargazing-weather-app",
		// render: <TicTacToe />,
	},
	{
		title: "Portfolio",
		status: {
			short: "Evolving",
			long: "Last updated on July 2025",
		},
		description: <>In summer 2023, I began in the journey of building my own online portfolio using React. Every now and then, I'll be including new features; the idea of this project is for it to be an incrementally enhanced open-ended project.</>,
		url: "portfolio",
	},
	{
		title: "Word-reader Android App",
		status: {
			short: "Stopped",
			long: "Stopped in September 2023",
		},
		description : <>In summer 2023, I delved into Neural Networks for the first time, captivated by their potential. This led me to attempt to create an app focused on word recognition. Initially, I found that a basic Neural Network model struggled with accuracy, prompting me to explore Convolutional Neural Networks (CNNs), known for their effectiveness in capturing image features. However, my progress was hindered by a lack of high-quality datasets essential for training the model. Back then, I had a large labeled dataset, but it contained noise, with some images being incorrectly labeled, which further complicated the development. If resumed at some point, updates on outcomes will follow.</>,
		url: "word-reader-android-app"
	},
	{
		title: "Minirobot",
		status: {
			short: "Stopped",
			long: "Stopped in December 2023",
		},
		description : <>In October 2023, I engaged in a minirobot maze-solving project (see <a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank">reference</a>) in the Cambridge University Robotics, aimed for completion by November 2023. Despite time constraints due to academic commitments, our team made initial progress exploring algorithms and designs. I learned Arduino and made initial attempts to map the maze using three sensors. While unfinished, this experience enhanced my robotics and problem-solving skills within a team environment. If resumed at some point, updates on outcomes will follow.</>,		
		url: "minirobot"
	},
	{
		title: "DoS D-Stress",
		status: {
			short: "Finished",
			long: "Finished in March 2024",
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
			long: "Finished in September 2024",
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
	},
	{
	title: "Cambridge Dissertation: Blokus AI Agents",
	status: {
		short: "Finished",
		long: "Finished in May 2025",
	},
	description: (
		<>
		<p>
			For my final-year dissertation at Cambridge, I conducted independent research on game-solving and deep reinforcement learning, focusing on <a href="https://en.wikipedia.org/wiki/Blokus" target="_blank">Blokus</a>. I developed a Gymnasium-compatible environment that is <strong>6&nbsp;&times;&nbsp;faster</strong> than existing implementations and supports full rule logic and state evaluation.
		</p>
		<p>
			I implemented agents using <strong>Minimax</strong>, <strong>Alpha-Beta Pruning</strong>, <strong>Q-Learning</strong>, and <strong>Deep Q-Networks (DQN)</strong>. My DQN agent achieved a <strong>90% win rate</strong> on the 10&nbsp;&times;&nbsp;10 board against strong heuristics, and I mathematically proved a <strong>forced win</strong> for the first player on the 7&nbsp;&times;&nbsp;7 board (game-tree size ≈ 8&nbsp;&times;&nbsp;10<sup>14</sup>).
		</p>
		<p>
			I also proposed a novel dual Q-value estimation method to evaluate moves under optimal opponent play. The project required advanced RL experimentation: custom pipelines, model/version tracking, 15+ hyperparameters, and exploration of techniques such as <em>symmetry induction</em>, <em>prioritized replay</em>, and <em>transfer learning</em>.
		</p>
		<p>
			The dissertation is available for download <a href="/documents/2327D.pdf" target="_blank" rel="noopener noreferrer">here</a>.
		</p>
		</>
	),
	log: <iframe
		src="/documents/2327D.pdf"
		type="application/pdf"
		width="100%"
		height="500px"
	/>,
	url: "blokus-ai-agents",
	// files: [
	// 	{
	// 	name: "Dissertation.pdf",
	// 	url: "/files/blokus-dissertation.pdf"
	// 	}
	// ]
	}
];
