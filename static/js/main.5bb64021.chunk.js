(this.webpackJsonpportfolio=this.webpackJsonpportfolio||[]).push([[0],{114:function(e,t,a){e.exports=a(132)},122:function(e,t,a){},129:function(e,t,a){e.exports=a.p+"static/media/PressStart2P-Regular.f98cd910.ttf"},130:function(e,t,a){e.exports=a.p+"static/media/RobotoSlab-Regular.e7789f22.ttf"},131:function(e,t,a){e.exports=a.p+"static/media/background.8a7f6c65.png"},132:function(e,t,a){"use strict";a.r(t);var n=a(0),r=a.n(n),o=a(88),i=a.n(o),l=a(16),c=(a(122),a(5)),s=a(193),m=a(196),d=a(200),p=a(195);const u=a(24).c`
  0%, 100% {
    font-size: 24px;
  }
  50% {
    font-size: 30px
  }
`;var h=()=>{const[e,t]=Object(n.useState)(!0),[a,o]=Object(n.useState)(null),[i,l]=Object(n.useState)(!0),[c,h]=Object(n.useState)({wins:0,losses:0,draws:0}),[f,g]=Object(n.useState)([]),[{board:b,winner:y},x]=Object(n.useState)({board:Array(9).fill(null),winner:null});Object(n.useEffect)(()=>{(async()=>{let e=await window.loadPyodide();l(!1),o(e),await e.runPython("\n                import random\n\n                class TicTacToeAgent:\n                    def __init__(self):\n                        self.q_table = {}\n\n                    def get_action(self, board):\n                        available_moves = [i for i, x in enumerate(board) if x is None]\n                        if not available_moves:  # No available moves means it's a draw\n                            return None\n                        return random.choice(available_moves)\n                agent = TicTacToeAgent()\n            ")})()},[]);const E=async e=>{const n=await a.runPython(`\n            import json\n            board = json.loads('${JSON.stringify(e)}')\n            agent_action = agent.get_action(board)\n            agent_action\n        `);if(null!==n&&void 0!==n){e[n]="O";const a=v(e);a?(k(a),x({board:e,winner:a})):t(!0)}},v=e=>{const t=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];console.log("on calculateWinner:",e),console.log(t);for(let a=0;a<t.length;a++){const[n,r,o]=t[a];if(console.log("a, b, c:",n,r,o),console.log("squares[a], squares[b], squares[c]:",e[n],e[r],e[o]),e[n]&&e[n]===e[r]&&e[n]===e[o])return console.log("winner line:",t[a]),g(t[a]),e[n]}return e.every(e=>null!==e)?"draw":null},w=y?"draw"===y?"It's a draw!":"Winner: "+y:"Next player: "+(e?"X":"O"),k=e=>{console.log(e,c.wins,c.losses,c.draws),"X"===e?h(e=>({...e,wins:e.wins+1})):"O"===e?h(e=>({...e,losses:e.losses+1})):"draw"===e&&h(e=>({...e,draws:e.draws+1}))},S=e=>{const n=f.includes(e);return r.a.createElement(p.a,{variant:"contained",color:"primary",sx:{width:"60px",height:"60px",fontSize:"24px",fontWeight:n?"bold":"normal",margin:"5px",animation:n?u+" 0.85s infinite":"none",color:n?"brown":"black"},onClick:()=>(e=>{if(console.log(e,y),!a||b[e]||y)return;const n=b.slice();n[e]="X";const r=v(n);if(r)return k(r),void x({board:n,winner:r});x({board:n,winner:r}),t(!1),console.log("winner:",y),E(n)})(e)},b[e])};return r.a.createElement(s.a,{sx:{width:"100%",maxWidth:600,height:400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",margin:"0 auto",mt:4,padding:2,borderRadius:2,boxShadow:3,backgroundColor:"background.default",position:"relative"}},i?r.a.createElement(d.a,{variant:"h6"},"Loading Pyodide..."):r.a.createElement(r.a.Fragment,null,r.a.createElement(d.a,{variant:"h6",sx:{marginBottom:2}},w),r.a.createElement(d.a,{variant:"body1",sx:{marginBottom:2}},"Wins: ",c.wins," | Losses: ",c.losses," | Draws: ",c.draws),r.a.createElement(m.a,{display:"flex",flexDirection:"column",alignItems:"center"},r.a.createElement(m.a,{display:"flex"},S(0),S(1),S(2)),r.a.createElement(m.a,{display:"flex"},S(3),S(4),S(5)),r.a.createElement(m.a,{display:"flex"},S(6),S(7),S(8))),r.a.createElement(p.a,{variant:"contained",sx:{backgroundColor:"brown",marginTop:2},onClick:()=>{x({board:Array(9).fill(null),winner:null}),t(!0),g([])}},"Play Again")))};const f=[{title:"Stargazing Weather App",status:{short:"Finished",long:"Finished on June 2023"},description:r.a.createElement(r.a.Fragment,null,"In May 2023, as part of my Cambridge Interaction Design course, I collaborated with a team of five to develop a user-friendly Weather App tailored for stargazers. The app provides real-time weather data, pollution and cloudiness maps, and curated space news articles, enhancing the stargazing experience.",r.a.createElement("ul",null,r.a.createElement("li",null,"\\Contributed to the development of the News Tab in a team project, honing teamwork skills. "),r.a.createElement("li",null," Collaborated on creating a user-friendly app for stargazers, offering real-time weather data, pollution and cloudiness maps, and curated space news articles."),r.a.createElement("li",null," Used Flutter for front-end development, Git for version control.")),"The project codebase is available on ",r.a.createElement("a",{href:"https://github.com/Layomiiety/Stargazing-Weather-App-Hi-fi",target:"_blank"},"Github"),"."),url:"stargazing-weather-app"},{title:"Portfolio",status:{short:"Evolving",long:"Last updated on September 2024"},description:r.a.createElement(r.a.Fragment,null,"In summer 2023, I began in the journey of building my own online portfolio using React. Every now and then, I'll be including new features; the idea of this project is for it to be an incrementally enhanced open-ended project."),url:"portfolio"},{title:"Word-reader Android App",status:{short:"Stopped",long:"Stopped on September 2023"},description:r.a.createElement(r.a.Fragment,null,"In summer 2023, I delved into Neural Networks for the first time, captivated by their potential. This led me to attempt to create an app focused on word recognition. Initially, I found that a basic Neural Network model struggled with accuracy, prompting me to explore Convolutional Neural Networks (CNNs), known for their effectiveness in capturing image features. However, my progress was hindered by a lack of high-quality datasets essential for training the model. Back then, I had a large labeled dataset, but it contained noise, with some images being incorrectly labeled, which further complicated the development. If resumed at some point, updates on outcomes will follow."),url:"word-reader-android-app"},{title:"Minirobot",status:{short:"Stopped",long:"Stopped on December 2023"},description:r.a.createElement(r.a.Fragment,null,"In October 2023, I engaged in a minirobot maze-solving project (see ",r.a.createElement("a",{href:"https://youtu.be/ZMQbHMgK2rw?si=E_4znZjEPXq0ef5Q",target:"_blank"},"reference"),") in the Cambridge University Robotics, aimed for completion by November 2023. Despite time constraints due to academic commitments, our team made initial progress exploring algorithms and designs. I learned Arduino and made initial attempts to map the maze using three sensors. While unfinished, this experience enhanced my robotics and problem-solving skills within a team environment. If resumed at some point, updates on outcomes will follow."),url:"minirobot"},{title:"DoS D-Stress",status:{short:"Finished",long:"Finished on March 2024"},description:r.a.createElement(r.a.Fragment,null,"I successfully completed a project aimed at helping young students manage their stress effectively. As part of our coursework, we collaborated with a client, working in a dedicated team of five to develop an intuitive application using the Flutter framework and Dart. Key contributions include:",r.a.createElement("ul",null,r.a.createElement("li",null,"Developed a robust routing system and a user-friendly side panel to enhance navigation."),r.a.createElement("li",null,"Integrated settings and preferences on both the frontend and backend to ensure a synchronized user experience."),r.a.createElement("li",null,"Established seamless connections between settings and backend services, implementing a mechanism to trigger local storage updates effortlessly."))),url:"dos-d-stress"},{title:"Tic-tac-toe",status:{short:"Finished",long:"Finished on September 2024"},description:r.a.createElement(r.a.Fragment,null,r.a.createElement("p",null,"I trained a Q-learning agent to play tic-tac-toe. The agent was trained using a Q-learning algorithm, and it was able to play against a human player. The agent was able to learn the optimal strategy for playing tic-tac-toe, and it was able to win against the human player in most games.")),log:r.a.createElement(d.a,{variant:"body1",sx:{fontStyle:"italic",fontSize:"0.9em"}},r.a.createElement("span",{style:{fontWeight:"bold"}},"Note:")," The current Tic-Tac-Toe agent is operating with a random policy. The trained agent has not been uploaded yet, but I plan to upload it soon."),url:"tic-tac-toe",render:r.a.createElement(h,null)}];var g=a(90),b=a.n(g),y=a(202),x=a(203),E=a(91),v=a.n(E),w=a(74),k=a.n(w),S=a(64),I=a.n(S);var C=e=>{let{project:t,index:a}=e;return r.a.createElement(y.a,{sx:{transition:"0.3s",backgroundColor:"#f9f9f9","&:hover":{boxShadow:20,transform:"scale(1.02)",backgroundColor:"#ecf2fa"}}},r.a.createElement(x.a,null,r.a.createElement(d.a,{variant:"h6",component:l.b,to:"/p/projects/"+t.url,sx:{color:"primary.main",textDecoration:"none","&:hover":{textDecoration:"underline",color:"secondary.main"}}},t.title),r.a.createElement(d.a,{variant:"body2",color:"text.secondary",sx:{mt:.5,fontWeight:"bold",display:"flex",alignItems:"center"}},(e=>{switch(e){case"Finished":return r.a.createElement(v.a,{color:"success"});case"Evolving":return r.a.createElement(k.a,{color:"warning"});case"Stopped":return r.a.createElement(I.a,{color:"action"});case"Ongoing":return r.a.createElement(k.a,{color:"primary"});case"Starting stage":case"Crawling Baby":return r.a.createElement(I.a,{color:"action"});default:return null}})(t.status.short)," ",r.a.createElement("span",{style:{marginLeft:"8px"}},"Status: ",t.status.short)),t.status.long&&r.a.createElement(d.a,{variant:"caption",color:"text.secondary",sx:{mt:1,pl:2,fontStyle:"italic"}},t.status.long),r.a.createElement(d.a,{variant:"body2",color:"text.secondary",sx:{p:0,m:0}},t.description),Boolean(t.render)?r.a.createElement(p.a,{component:l.b,to:"tic-tac-toe",variant:"contained",color:"primary",sx:{mt:2}},"Check Now"):null))};const M=[5,4,0,1];var j=()=>r.a.createElement(s.a,{maxWidth:"lg",sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(m.a,{sx:{backgroundImage:`url(${b.a})`,backgroundSize:"cover",backgroundPosition:"center",height:"300px",display:"flex",justifyContent:"center",alignItems:"center",color:"white",textAlign:"center",borderRadius:2,mb:4}},r.a.createElement(d.a,{variant:"h2",sx:{fontWeight:"bold",color:"white",textShadow:"2px 2px 4px rgba(0, 0, 0, 0.7)",zIndex:2,padding:"20px"}},"Welcome to My Portfolio!")),r.a.createElement(d.a,{variant:"h2",component:"h1",align:"center",gutterBottom:!0,sx:{fontWeight:"bold",color:"#1976d2"}},"Featured Projects"),r.a.createElement(m.a,{display:"flex",flexDirection:"column",gap:2},M.map(e=>f[e]).map((e,t)=>r.a.createElement(C,{key:t,project:e}))),r.a.createElement(m.a,{textAlign:"center",sx:{mt:4}},r.a.createElement(p.a,{variant:"contained",color:"primary",component:l.b,to:"/p/projects",sx:{px:4}},"View All Projects"))),A=a(198),T=a(93),O=a.n(T),z=a(92),W=a.n(z),B=a(94),D=a.n(B),R=a(201);var F=e=>r.a.createElement(R.a,Object.assign({},e,{viewBox:"0 0 100 100"}),r.a.createElement("circle",{cx:"50",cy:"10",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"60",cy:"12",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"70",cy:"20",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"76",cy:"32",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"80",cy:"46",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"76",cy:"60",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"70",cy:"70",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"60",cy:"78",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"50",cy:"80",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"40",cy:"78",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"30",cy:"70",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"24",cy:"60",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"20",cy:"46",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"24",cy:"32",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"30",cy:"20",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"40",cy:"12",r:3.5,fill:"#1976d2"}),"  ",r.a.createElement("circle",{cx:"50",cy:"20",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"55",cy:"26",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"60",cy:"34",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"62",cy:"42",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"60",cy:"50",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"55",cy:"58",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"50",cy:"64",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"45",cy:"58",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"40",cy:"50",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"38",cy:"42",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"40",cy:"34",r:3,fill:"#5cafe2"}),r.a.createElement("circle",{cx:"45",cy:"26",r:3,fill:"#5cafe2"}),r.a.createElement("rect",{x:47.75,y:83.5,width:4.5,height:18,fill:"#1976d2"})," ",r.a.createElement("rect",{x:43.25,y:88,width:13.5,height:4.5,fill:"#1976d2"})," ",r.a.createElement("line",{x1:"50",y1:"64",x2:"50",y2:"80",stroke:"#1976d2",strokeWidth:"1.5",strokeLinecap:"round"}));const N=[{title:"Catholic Faith",description:"Through my faith, I draw strength and motivation, striving to embody the principles of love, humility, compassion and a commitment to serve others.",icon:r.a.createElement(F,{sx:{fontSize:50,color:"primary.main"}})},{title:"Tech Enthusiast",description:"Passionate about discovering how Machine Learning can be harnessed to create a more equitable world for all.",icon:r.a.createElement(W.a,{sx:{fontSize:50,color:"primary.main"}})},{title:"Active Lifestyle",description:"The joy of movement in running, football, and ultimate frisbee keeps me fit and healthy, bringing balance and energy to my life while keeping me physically and mentally active.",icon:r.a.createElement(O.a,{sx:{fontSize:50,color:"primary.main"}})},{title:"Laughter Lover",description:"I believe that laughter is contagious; there\u2019s nothing quite like the warmth of making others smile and creating moments of genuine connection through humor.",icon:r.a.createElement(D.a,{sx:{fontSize:50,color:"primary.main"}})}];var P=function(){return r.a.createElement(s.a,{maxWidth:"lg",sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(m.a,{sx:{textAlign:"center",mb:4}},r.a.createElement(d.a,{variant:"h2",component:"h1",gutterBottom:!0,sx:{fontWeight:"bold",color:"primary.main"}},"It's-a me, Mario!"),r.a.createElement(d.a,{variant:"h6",component:"p",sx:{fontStyle:"italic",color:"text.secondary"}},"Computer Science Student \u2022 ML Learner \u2022 Committed to Global Impact")),r.a.createElement(d.a,{variant:"body1",paragraph:!0},"Hi there! I\u2019m Mario Pariona, a third-year Computer Science student at the University of Cambridge with a passion for harnessing the power of Machine Learning to make a positive impact in the world. My journey in computer science began in 2020 after high school when I discovered my love for programming through competitive programming. This passion has evolved into a keen interest in Neural Networks, Convolutional Networks (CNNs), and reinforcement learning (RL), as I seek to leverage these technologies to solve real-world problems."),r.a.createElement(d.a,{variant:"body1",paragraph:!0},"My academic journey has been profoundly shaped by a deep appreciation for mathematics, which blossomed during high school when I represented my country in numerous international Olympiads. The rigorous environment pushed me to excel, fostering a competitive spirit and a passion for problem-solving that continues to drive my pursuits in Computer Science and Machine Learning."),r.a.createElement(d.a,{variant:"body1",paragraph:!0},"Beyond academics, I cherish the joy of movement and the friendship of sports. Whether it\u2019s playing football, engaging in ultimate frisbee, or going for a run, I discover balance and joy through physical activity. These experiences highlight the value of physical activity, friendship, and mental well-being in people\u2019s lives, which align with my core values. I strive to embody principles of love, humility, and compassion in everything I do, drawing strength and motivation from my Catholic faith."),r.a.createElement(d.a,{variant:"body1",paragraph:!0},"As I continue to explore the intersections of technology and humanity, I\u2019m committed to creating innovative solutions that enhance lives and empower communities. I invite you to join me on this journey, as I learn, grow, and strive to make a difference in the world."),r.a.createElement(m.a,{sx:{mt:4}},r.a.createElement(d.a,{variant:"h2",component:"h1",gutterBottom:!0,sx:{textAlign:"center",fontWeight:"bold",color:"primary.main"}},"Quick Facts About Me"),r.a.createElement(A.a,{container:!0,spacing:3,justifyContent:"center"},N.map((e,t)=>r.a.createElement(A.a,{item:!0,key:t,xs:12,md:4,sx:{textAlign:"center"}},e.icon,r.a.createElement(d.a,{variant:"h6",sx:{fontWeight:"bold"}},e.title),r.a.createElement(d.a,{variant:"body2",color:"text.secondary"},e.description))))))};const L=[{name:"Gold Medal in Iranian Geometry Olympiad 2016"},{name:"Bronze Medal in Olimpiada de Mayo 2015"},{name:"Silver Medal in Olimpiada de Mayo 2016"},{name:"Gold Medal in Olimpiada de Mayo 2018"},{name:"Gold medal in the Peruvian Olympiad of Mathematics in 2018 and 2019"},{name:"Silver Medal Olimpiada Matematica Rioplatense 2018, 2019"},{name:"Honorable Mention in Geometrical Olympiad in Honour of I.F. Sharygin 2019"},{name:"Silver Medal in Olimpiada de Matem\xe1tica del Cono Sur 2019"},{name:"Honorable Mention in Romanian Master of Mathematics 2020"},{name:"Bronze Medal in Asian Pacific Mathematical Olympiad 2020"},{name:"Gold Medal in Cyberspace Mathematical Competition 2020"},{name:"Bronze Medal in Competencia Iberoamericana de Inform\xe1tica y Computaci\xf3n (CIIC) 2020"},{name:"Bronze Medal International Olympiad of Metropolises en la modalidad de Informatica 2020"},{name:"1017th, Google Code Jam Round 2, 2021"},{name:"Bronze Medal in Competencia Iberoamericana de Inform\xe1tica y Computaci\xf3n (CIIC) 2021"},{name:"Gold Medal in IberoAmerican Olympiad of Mathematics 2021"},{name:"538th, Meta Hacker Cup Round 2, 2022"},{name:"Bronze Medal in the Northwestern Europe Regional Contest 2022"}];var _=e=>{let{achievement:t,index:a,enumerate:n=!1}=e;return r.a.createElement(m.a,{key:a,sx:{padding:2,border:"1px solid #ddd",borderRadius:2,backgroundColor:"#f9f9f9",boxShadow:"0px 2px 5px rgba(0,0,0,0.1)",transition:"transform 0.3s","&:hover":{transform:"scale(1.02)"}}},t.url?r.a.createElement(d.a,{variant:"body1",component:l.b,to:t.url,sx:{color:"primary.main",textDecoration:"none","&:hover":{textDecoration:"underline",color:"secondary.main"}}},n?a+1+". ":"",t.name):r.a.createElement(d.a,{variant:"body1",sx:{fontWeight:500,color:"primary.main"}},n?a+1+". ":"",t.name),r.a.createElement(d.a,{variant:"caption",color:"text.secondary",sx:{display:"block",marginTop:"4px"}},t.date))};var G=function(){return r.a.createElement(s.a,{maxWidth:"lg",sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(d.a,{variant:"h2",component:"h1",gutterBottom:!0,sx:{textAlign:"center",color:"primary.main",mb:2}},"Achievemic Achievements"),r.a.createElement(m.a,{display:"flex",flexDirection:"column",gap:2},L.map((e,t)=>r.a.createElement(_,{key:t,index:t,achievement:e,enumerate:!0}))))};const H=[...f].reverse();var q=()=>r.a.createElement(s.a,{maxWidth:"lg",sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(d.a,{variant:"h2",component:"h1",gutterBottom:!0,sx:{textAlign:"center",color:"primary.main",mb:2}},"Projects"),r.a.createElement(m.a,{display:"flex",flexDirection:"column",gap:2,style:{listStyleType:"none"}},H.map((e,t)=>r.a.createElement(C,{key:t,project:e,index:t}))));var X=()=>r.a.createElement(s.a,{sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(d.a,null,"I'll upload my CV soon; but for now feel free to contact me in "," ",r.a.createElement(d.a,{variant:"body1",component:l.b,to:"/contact",sx:{color:"primary.main",textDecoration:"none","&:hover":{textDecoration:"underline",color:"secondary.main"}}},"Contact"),"."));var J=()=>r.a.createElement(s.a,{sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(d.a,null,"Don't hesitate to contact me at "," ",r.a.createElement(d.a,{variant:"body1",component:"a",href:"mailto:mariopariona117@gmail.com",sx:{color:"primary.main",textDecoration:"none","&:hover":{textDecoration:"underline",color:"secondary.main"}}},"mariopariona117@gmail.com"),"."));const Q=[{name:"Achievements",url:"/p/achievements"},{name:"Projects",url:"/p/projects"}];var U=()=>r.a.createElement(s.a,{maxWidth:"lg",sx:{mb:4,p:4,borderRadius:2,boxShadow:3}},r.a.createElement(d.a,{variant:"h2",component:"h1",gutterBottom:!0,sx:{textAlign:"center",color:"primary.main",mb:2}},"Portfolio"),r.a.createElement(m.a,{display:"flex",flexDirection:"column",gap:2},Q.map((e,t)=>r.a.createElement(_,{key:t,index:t,achievement:e}))),r.a.createElement(d.a,{variant:"body1",align:"center",sx:{mt:4}},"Don't hesitate to contact me at "," ",r.a.createElement(d.a,{variant:"body1",component:"a",href:"mailto:mariopariona117@gmail.com",sx:{color:"primary.main",textDecoration:"none","&:hover":{textDecoration:"underline",color:"secondary.main"}}},"mariopariona117@gmail.com"),".")),V=a(204),Y=a(205),K=a(190),Z=a(194);function $(e){return r.a.createElement(R.a,e,r.a.createElement("path",{d:"M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"}))}const ee=[{title:r.a.createElement($,{sx:{fontSize:30}}),url:"/"},{title:"About Me",url:"/about"},{title:"Portfolio",url:"/p",submenu:[{title:"Achievements",url:"p/achievements"},{title:"Projects",url:"p/projects"}]},{title:"CV",url:"/cv"},{title:"Contact",url:"/contact"}];var te=()=>{const[e,t]=Object(n.useState)(null),[a,o]=r.a.useState(Array(ee.length).fill(!1)),i=Object(c.m)(),u=e=>{t(null),o(Array(ee.length).fill(!1))};return r.a.createElement(V.a,{position:"static",sx:{backgroundColor:"transparent",boxShadow:"none",display:"flex",pr:"20%",pl:"20%"}},r.a.createElement(s.a,{maxWidth:"xl",sx:{backgroundColor:"transparent",display:"flex"}},r.a.createElement(Y.a,{disableGutters:!0,display:"flex"},ee.map((n,c)=>{const s=i.pathname.includes(n.url)?{color:"brown",weight:"bold"}:{color:"transparent",weight:"normal"};return r.a.createElement("div",{key:c},r.a.createElement(p.a,{id:"button-"+c,"aria-owns":a[c]?"menu-appbar"+c:null,"aria-haspopup":"true",onMouseOver:e=>((e,a)=>{u(e),t(e.currentTarget),o(e=>{const t=[...e];return t[a]=!0,t})})(e,c),onMouseLeave:e=>((e,a)=>{if("ul"!==e.currentTarget.localName){const t=document.getElementById("menu-appbar"+a);if(console.log(t),t){const a=t.children[2],n={left:a.offsetLeft,top:a.offsetTop,right:a.offsetLeft+a.offsetWidth,bottom:a.offsetTop+a.offsetHeight};if(console.log(n),console.log(e.clientX,e.clientY),e.clientX>=n.left&&e.clientX<=n.right&&e.clientY<=n.bottom&&e.clientY>=n.top)return}}t(null),o(Array(ee.length).fill(!1))})(e,c),style:{zIndex:1301},sx:{display:{xs:"flex",md:"flex"},letterSpacing:".1rem",textDecoration:"none"}},r.a.createElement(d.a,{variant:"body",noWrap:!0,sx:{display:{xs:"flex",md:"flex"},color:"inherit",textDecoration:"none",borderBottom:"2px solid "+s.color,paddingBottom:"2px",cornerRadius:"0.5px"},component:l.b,to:n.url,fontWeight:s.weight},n.title)),r.a.createElement(K.a,{id:"menu-appbar"+c,anchorEl:e,open:Boolean(Boolean(n.submenu)&&a[c]),anchorOrigin:{vertical:"bottom",horizontal:"center"},transformOrigin:{vertical:"top",horizontal:"center"}},r.a.createElement(m.a,{onMouseLeave:u},(n.submenu?n.submenu:[]).map((e,t)=>r.a.createElement(Z.a,{key:t,component:l.b,to:e.url,onClick:()=>{}},r.a.createElement(d.a,{sx:{textAlign:"center"}},e.title))))))}))))},ae=a(95);var ne=Object(ae.a)({palette:{primary:{main:"#1976d2",contrastText:"#ffffff"},secondary:{main:"#ff4081",contrastText:"#ffffff"},background:{default:"#f4f6f8",paper:"#ffffff"},text:{primary:"#333333",secondary:"#555555"}},typography:{fontFamily:'"Roboto", "Helvetica", "Arial", sans-serif',h1:{fontWeight:700,fontSize:"2.5rem",color:"#1976d2",marginBottom:"16px"},h2:{fontWeight:600,fontSize:"2rem",color:"#333333",marginBottom:"12px"},h3:{fontWeight:500,fontSize:"1.75rem",color:"#333333"},body1:{fontSize:"1rem",lineHeight:1.5,color:"#555555"},button:{textTransform:"none",fontWeight:600}},shape:{borderRadius:8},components:{MuiAppBar:{styleOverrides:{root:{boxShadow:"none"}}},MuiButton:{styleOverrides:{root:{borderRadius:20}}},MuiCard:{styleOverrides:{root:{borderRadius:12,transition:"0.3s","&:hover":{boxShadow:"0 4px 20px rgba(0, 0, 0, 0.2)"},backgroundColor:"#ecf2fa"}}},MuiContainer:{styleOverrides:{root:{mt:4,mb:4,backgroundColor:"#ecf2fa",borderRadius:2}}},MuiTypography:{styleOverrides:{h1:{marginBottom:"16px"},h2:{marginBottom:"12px"},body1:{marginBottom:"8px"}}}}}),re=a(192);var oe=()=>r.a.createElement(re.a,{theme:ne},r.a.createElement("div",null,r.a.createElement(m.a,{sx:{width:"10%",backgroundColor:"#ecf0f1"}}," "),r.a.createElement("div",null,r.a.createElement(te,null),r.a.createElement(m.a,{sx:{mt:10,mb:10,pr:"20%",pl:"20%",backgroundColor:ne.palette.background.default,display:"flex",lexGrow:1}},r.a.createElement(c.a,null))),r.a.createElement(m.a,{sx:{width:"10%",backgroundColor:"#ecf0f1"}}," ")));var ie=e=>{let{project:t}=e;return r.a.createElement("div",{className:"project"},r.a.createElement(d.a,{variant:"h3"},t.title),t.description,t.log||r.a.createElement(r.a.Fragment,null),t.render||r.a.createElement(r.a.Fragment,null))};var le=function(){return r.a.createElement(m.a,{display:"flex",flexDirection:"column",minHeight:"100vh"},r.a.createElement(c.d,null,r.a.createElement(c.b,{path:"/",element:r.a.createElement(oe,null)},r.a.createElement(c.b,{index:!0,element:r.a.createElement(j,null)}),r.a.createElement(c.b,{path:"/about",element:r.a.createElement(P,null)}),r.a.createElement(c.b,{path:"/p/achievements",element:r.a.createElement(G,null)}),r.a.createElement(c.b,{path:"/p",element:r.a.createElement(U,null)}),r.a.createElement(c.b,{path:"/p/projects",element:r.a.createElement(q,null)}),f.map((e,t)=>r.a.createElement(c.b,{key:t,path:"/p/projects/"+e.url,element:r.a.createElement(ie,{project:e})})),r.a.createElement(c.b,{path:"/cv",element:r.a.createElement(X,null)}),r.a.createElement(c.b,{path:"/contact",element:r.a.createElement(J,null)}))),r.a.createElement("footer",{style:{marginTop:"auto",padding:"20px 0",backgroundColor:"#f1f1f1",textAlign:"center"}},r.a.createElement(d.a,{variant:"body2",color:"text.secondary"},"\xa9 2024 Mario Pariona Molocho")))};var ce=e=>{e&&e instanceof Function&&a.e(3).then(a.bind(null,206)).then(t=>{let{getCLS:a,getFID:n,getFCP:r,getLCP:o,getTTFB:i}=t;a(e),n(e),r(e),o(e),i(e)})},se=(a(129),a(130),a(131),a(199));i.a.createRoot(document.getElementById("root")).render(r.a.createElement(r.a.StrictMode,null,r.a.createElement(l.a,null,r.a.createElement(re.a,{theme:ne},r.a.createElement(se.a,null),r.a.createElement(le,null))))),ce()},90:function(e,t,a){e.exports=a.p+"static/media/background.942cc83b.avif"}},[[114,1,2]]]);
//# sourceMappingURL=main.5bb64021.chunk.js.map