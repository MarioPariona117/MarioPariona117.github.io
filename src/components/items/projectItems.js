import React from "react";
import TicTacToe from "../Projects/TicTacToe/TicTacToe"

const projects = [
	{
		title: "LLM Inference Performance Benchmark",
		tier: 0,
		date: "2026-07",
		status: {
			short: "Finished",
			long: "Finished in July 2026",
		},
		description: (
			<>
			<p>
				A reproducible harness (Python, PyTorch) for measuring how large language model
				inference actually behaves — latency, decode throughput, and peak memory as a
				function of batch size, generation length, hardware, and numerical precision.
				Trustworthy timing comes from untimed warmup runs, repeated timed trials
				(mean&nbsp;±&nbsp;std), device synchronisation, and fixed decode work so
				configurations are comparable.
			</p>
			<p>
				The most useful result was a counterintuitive one. The textbook claim is that
				half precision is <em>half the memory and faster</em>. On Apple's MPS backend
				with TinyLlama-1.1B, fp16 <strong>halved peak memory exactly as promised</strong>{' '}
				(2,098&nbsp;MB vs 4,196&nbsp;MB) — but was <strong>not faster</strong>: fp32 won
				on throughput (125.9 vs 83.8&nbsp;tok/s). "fp16 is faster" holds on NVIDIA parts
				with 16-bit tensor cores; it is not a universal law.
			</p>
			<p>
				Operator-level profiling with <code>torch.profiler</code> showed that{' '}
				<strong>~74% of inference time is matrix multiplication</strong>{' '}
				(<code>addmm</code> 50%, <code>mm</code> 24%) — which is precisely why tensor
				cores, NPUs, and quantization are the levers that matter. The project also ships
				a from-scratch guide to the underlying concepts: prefill vs decode, latency vs
				throughput, batching, and the KV cache.
			</p>
			</>
		),
		url: "llm-inference-benchmark",
		featured: true,
	},
	{
		title: "3D Gaussian Splatting: Avoiding Local Minima",
		tier: 1,
		date: "2024-12",
		status: {
			short: "Finished",
			long: "Finished in December 2024",
		},
		description: (
			<>
			<p>
				A Machine Visual Perception course project at Cambridge, with Leo Takashige
				and Kee Yun Shao. <a href="https://en.wikipedia.org/wiki/Gaussian_splatting" target="_blank" rel="noopener noreferrer">3D Gaussian Splatting</a>{' '}
				represents a scene as a cloud of 3D Gaussians, but the operations that
				manage them &mdash; cloning, splitting and pruning &mdash; are
				<strong>non-differentiable heuristics</strong>, so gradient-based
				optimisation can settle into poor local minima.
			</p>
			<p>
				We replaced them with <strong>Evolutive Primitive Organization</strong>:
				learnable growing and splitting operations, so how the primitives
				reorganise is itself trained rather than hand-tuned.
			</p>
			<p>
				Evaluated against the original 3D-GS on the MipNeRF360 Indoor, Tanks
				&amp; Temples and LLFF datasets. The result was a genuine improvement
				but not a clean sweep, and the report says so: <strong>PSNR improved on
				5 of 7 scenes and LPIPS on 4 of 7, while SSIM regressed on 2</strong>,
				and memory use rose substantially &mdash; recorded as the method's main
				limitation. The gains were largest on the Trex scene.
			</p>
			<p>
				Code on <a href="https://github.com/MarioPariona117/3D-GS" target="_blank" rel="noopener noreferrer">GitHub</a>.
			</p>
			</>
		),
		url: "3d-gaussian-splatting",
	},
	{
		title: "Neural Fields with Hard Constraints",
		tier: 1,
		date: "2025-06",
		status: {
			short: "Stopped",
			long: "Exploratory work, 2024–2025",
		},
		description: (
			<>
			<p>
				Exploratory research at Cambridge with Dr.&nbsp;Fangcheng Zhong on point-cloud-based
				implicit surfaces subject to arbitrary differential-order constraints.
			</p>
			<p>
				I conducted a literature review on interpolation and sharp-feature preservation
				using point clouds with normals, and explored edge-sampling strategies for
				preserving curvature and smoothness.
			</p>
			</>
		),
		url: "neural-fields-hard-constraints",
	},
	// These were just demos!! :))
	{
		title: "Stargazing Weather App",
		tier: 1,
		date: "2023-06",
		status: {
			short: "Finished",
			long: "Finished in June 2023",
		},
		description: (
			<>
			A weather app for stargazers, built with a team of five for the Cambridge
			Interaction Design course in May 2023. It combines real-time weather with
			pollution and cloud-cover maps and a feed of space news, so you can tell
			at a glance whether tonight is worth going out for.
			<ul>
				<li>Built the News tab.</li>
				<li>Flutter for the front end, Git for version control.</li>
			</ul>
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
		tier: 2,
		date: "2025-07",
		status: {
			short: "Evolving",
			long: "Ongoing since summer 2023",
		},
		description: <>This site. I started building it in React in summer 2023 and have added to it in bursts ever since — most recently a rebuild of the theme, the interactive tic-tac-toe agent, and this projects page. It is deliberately open-ended: somewhere to try things out and leave them running.</>,
		url: "portfolio",
	},
	{
		title: "Word-reader Android App",
		tier: 2,
		date: "2023-09",
		status: {
			short: "Stopped",
			long: "Stopped in September 2023",
		},
		description : <>My first attempt at neural networks, in summer 2023: an Android app that reads handwritten words. A plain fully-connected network was not accurate enough, so I moved to a convolutional network to pick up image structure. What stopped me was label noise — the dataset I had was large, but a meaningful share of its images were labelled wrong, and I had no way to tell how much of the error was the model and how much was the data. Knowing what I know now, I would measure the label noise first and clean or re-label a subset before touching the architecture.</>,
		url: "word-reader-android-app"
	},
	{
		title: "Minirobot",
		tier: 2,
		date: "2023-12",
		status: {
			short: "Stopped",
			long: "Stopped in December 2023",
		},
		description : <>A maze-solving micromouse robot with the Cambridge University Robotics Society, started in October 2023 and aimed at a November deadline (<a href="https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q" target="_blank" rel="noopener noreferrer">this video</a> shows the kind of contest it was built for — it is not our robot). I picked up Arduino and got as far as mapping the maze with three distance sensors. We ran out of term before we ran out of ideas, and it stopped in December. The honest lesson was one of scope: a hardware project on a six-week deadline needed a much smaller first milestone than the one we set.</>,		
		url: "minirobot"
	},
	{
		title: "DoS D-Stress",
		tier: 1,
		date: "2024-03",
		status: {
			short: "Finished",
			long: "Finished in March 2024",
		},
		description: (
			<>
			A stress-management app for students, built in Flutter and Dart with a team
			of five for a real client as part of coursework. <em>DoS</em> here is
			Cambridge's <strong>Director of Studies</strong> — not denial of service.
			<ul>
				<li>Built the routing system and the side-panel navigation.</li>
				<li>Wired settings and preferences across the front end and backend so a change in one place held everywhere.</li>
				<li>Added the mechanism that pushes a settings change into local storage, so preferences survived a restart without a round trip.</li>
			</ul>
			</>
		),
		url: "dos-d-stress",
		featured: true,
	},
	{
		title: "Tic-tac-toe",
		tier: 0,
		date: "2024-09",
		status: {
			short: "Finished",
			long: "Finished in September 2024",
		},
		description: (
			<>
				<p>
					A tabular <strong>Q-learning</strong> agent trained by self-play over 400,000 episodes,
					in a custom Gymnasium environment. Play it below — it moves instantly, because
					the learned policy ships as a 63&nbsp;KB lookup table rather than a runtime.
				</p>
				<p>
					Measured over 20,000 games against a random opponent, alternating who starts:{' '}
					<strong>92.6% wins, 7.4% draws, zero losses</strong> — a 100% non-losing rate.
					Against a perfect minimax opponent it draws every game, which is optimal:
					tic-tac-toe is a drawn game under perfect play.
				</p>
				<p>
					Rather than rely on sampling, an exhaustive search of the whole game tree —
					every legal opponent reply, from both sides — confirms the policy{' '}
					<strong>cannot be beaten</strong>. A draw is the best available against it.
					The exported table covers all 4,520 reachable non-terminal positions, so the
					demo never falls back to a guess.
				</p>
			</>
		),
		url: "tic-tac-toe",
		featured: true,
		render: <TicTacToe />,
	},
	{
	title: "Cambridge Dissertation: Blokus AI Agents",
	tier: 0,
	date: "2025-05",
	status: {
		short: "Finished",
		long: "Finished in May 2025",
	},
	description: (
		<>
		<p>
			For my final-year dissertation at Cambridge, I conducted independent research on game-solving and deep reinforcement learning, focusing on <a href="https://en.wikipedia.org/wiki/Blokus" target="_blank" rel="noopener noreferrer">Blokus</a>. I developed a Gymnasium-compatible environment that is <strong>6&ndash;10&nbsp;&times;&nbsp;faster</strong> than existing implementations (board-size dependent: ~10&times; on 4&times;4&ndash;10&times;10, ~6&times; on 20&times;20), supporting full rule logic and state evaluation.
		</p>
		<p>
			I implemented agents using <strong>Minimax</strong>, <strong>Alpha-Beta Pruning</strong>, <strong>Q-Learning</strong>, and <strong>Deep Q-Networks (DQN)</strong>. My DQN agent achieved an <strong>80%+ win rate</strong> on the 10&nbsp;&times;&nbsp;10 board (game tree &gt; 10<sup>32</sup>) against a fixed heuristic opponent, and I mathematically proved a <strong>forced win</strong> for the first player on the 7&nbsp;&times;&nbsp;7 board (game-tree size ≈ 8&nbsp;&times;&nbsp;10<sup>14</sup>).
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
		title="Blokus AI Agents — Cambridge dissertation (PDF)"
		type="application/pdf"
		width="100%"
		height="500px"
	/>,
	url: "blokus-ai-agents",
		featured: true,
	// files: [
	// 	{
	// 	name: "Dissertation.pdf",
	// 	url: "/files/blokus-dissertation.pdf"
	// 	}
	// ]
	}
];

// Ordering is data, not array position: tier first (substantive work, then
// course/exploratory, then earlier experiments), newest first within a tier.
export const projectItems = [...projects].sort(
	(a, b) => a.tier - b.tier || b.date.localeCompare(a.date)
);
