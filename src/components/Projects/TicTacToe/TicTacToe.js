import React, { useState, useEffect } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Button, Typography } from '@mui/material';
import { Container } from '@mui/material';

const pump = keyframes`
  0%, 100% {
    font-size: 24px;
  }
  50% {
    font-size: 30px
  }
`;

const TicTacToe = () => {
    // const [board, setBoard] = useState(Array(9).fill(null));
    const [isXNext, setIsXNext] = useState(true);
    const [pyodide, setPyodide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });
    const [winnerLine, setWinnerLine] = useState([]);
    // const [winner, setWinner] = useState(null);
    const [{ board, winner }, setBoardAndWinner] = useState({ board: Array(9).fill(null), winner: null });

    useEffect(() => {
        const loadPyodide = async () => {
            let pyodideInstance = await window.loadPyodide();
            setLoading(false); 
            setPyodide(pyodideInstance);
            await pyodideInstance.runPython(`
                import random

                class TicTacToeAgent:
                    def __init__(self):
                        self.q_table = {}

                    def get_action(self, board):
                        available_moves = [i for i, x in enumerate(board) if x is None]
                        if not available_moves:  # No available moves means it's a draw
                            return None
                        return random.choice(available_moves)
                agent = TicTacToeAgent()
            `);
        };
        loadPyodide();
    }, []);

    const handleClick = (index) => {
        console.log(index, winner);
        if (!pyodide || board[index] || winner) return; // Prevent clicking after game over
    
        const newBoard = board.slice();
        newBoard[index] = 'X';  
        const currentWinner = calculateWinner(newBoard);
        if(currentWinner) {
            updateScores(currentWinner);
            setBoardAndWinner({ board: newBoard, winner: currentWinner });
            return;
        }
        setBoardAndWinner({ board: newBoard, winner: currentWinner });
        setIsXNext(false); // It's the agent's turn
        console.log("winner:", winner)
        handleAgentMove(newBoard); // Call a new function to handle the agent's move
    };
    
    const handleAgentMove = async (newBoard) => {
        const agentMove = await pyodide.runPython(`
            import json
            board = json.loads('${JSON.stringify(newBoard)}')
            agent_action = agent.get_action(board)
            agent_action
        `);
    
        if (agentMove !== null && agentMove !== undefined) {
            newBoard[agentMove] = 'O'; 
            
            const newWinner = calculateWinner(newBoard);
            if (newWinner) {
                updateScores(newWinner);
                setBoardAndWinner({ board: newBoard, winner: newWinner });
            } else {
                setIsXNext(true); // Back to your turn
            }
        }
    };

    const calculateWinner = (squares) => {
        const lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];
        console.log("on calculateWinner:", squares);
        console.log(lines);
        for (let i = 0; i < lines.length; i++) {
            const [a, b, c] = lines[i];
            console.log("a, b, c:", a, b, c);
            console.log("squares[a], squares[b], squares[c]:", squares[a], squares[b], squares[c]);
            if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
                console.log("winner line:", lines[i]);
                setWinnerLine(lines[i]);
                return squares[a];
            }
        }
        if (squares.every(square => square !== null)) {
            return 'draw';
        }
        return null;
    };

    const status = winner ? 
        (winner === 'draw' ? "It's a draw!" : `Winner: ${winner}`) : 
        `Next player: ${isXNext ? 'X' : 'O'}`;

    const updateScores = (result) => {
        console.log(result, scores.wins, scores.losses, scores.draws);
        if (result === 'X') {
            setScores(prevScores => ({ ...prevScores, wins: prevScores.wins + 1 }));
        } else if (result === 'O') {
            setScores(prevScores => ({ ...prevScores, losses: prevScores.losses + 1 }));
        } else if (result === 'draw') {
            setScores(prevScores => ({ ...prevScores, draws: prevScores.draws + 1 }));
        }
    };

    const resetGame = () => {
        setBoardAndWinner({ board: Array(9).fill(null), winner: null });
        setIsXNext(true);
        setWinnerLine([]); // Reset the winner line
    };

    const renderSquare = (index) => {
        const isWinningSquare = winnerLine.includes(index);
        return (
            <Button 
                variant="contained" 
                color="primary" 
                sx={{
                    width: '60px', 
                    height: '60px', 
                    fontSize: '24px', 
                    fontWeight: isWinningSquare ? 'bold' : 'normal', // Bold the winning squares
                    margin: '5px', 
                    animation: isWinningSquare ? `${pump} 0.85s infinite` : 'none',
                    color: isWinningSquare ? 'brown' : 'black' // Optional: change color for winning squares
                }} 
                onClick={() => handleClick(index)}
            >
                {board[index]}
            </Button>
        );
    };
    return (
        <Container 
            sx={{
                width: '100%',          
                maxWidth: 600,          
                height: 400,         
                display: 'flex',        
                flexDirection: 'column', 
                alignItems: 'center',   
                justifyContent: 'center', 
                margin: '0 auto',       
                mt: 4,
                padding: 2,             
                borderRadius: 2,        
                boxShadow: 3,           
                backgroundColor: 'background.default',
                position: 'relative', // Set to relative for absolute positioning of the line
            }}
        >
            {loading ? (
                <Typography variant="h6">Loading Pyodide...</Typography>
            ) : (
                <>
                    <Typography variant="h6" sx={{ marginBottom: 2 }}>
                        {status}
                    </Typography>
                    <Typography variant="body1" sx={{ marginBottom: 2 }}>
                        Wins: {scores.wins} | Losses: {scores.losses} | Draws: {scores.draws}
                    </Typography>
                    <Box display="flex" flexDirection="column" alignItems="center">
                        <Box display="flex">
                            {renderSquare(0)}
                            {renderSquare(1)}
                            {renderSquare(2)}
                        </Box>
                        <Box display="flex">
                            {renderSquare(3)}
                            {renderSquare(4)}
                            {renderSquare(5)}
                        </Box>
                        <Box display="flex">
                            {renderSquare(6)}
                            {renderSquare(7)}
                            {renderSquare(8)}
                        </Box>
                    </Box>
                    <Button 
                        variant="contained" 
                        sx={{backgroundColor: "brown", marginTop: 2 }}
                        onClick={resetGame} 
                    >
                        Play Again
                    </Button>
                </>
            )}
        </Container>
    );
};

export default TicTacToe;