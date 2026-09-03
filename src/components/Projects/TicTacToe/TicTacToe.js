import React, { useState, useEffect, useCallback } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Button, Typography, Container } from '@mui/material';
import { palette } from '../../../styles/theme';

// The agent is the tabular Q-learning policy from the tic-tac-toe-rl project,
// trained by self-play and exported to JSON (see that repo's train_export.py).
//
// Two things changed here. This demo used to download Pyodide — a multi-megabyte
// CPython/WASM runtime — from a CDN in order to call `random.choice()`, and the
// page carried a note admitting the trained agent had never been uploaded. The
// original QLearningAgent only ever held its Q-table in memory ("Optionally:
// save the Q-table to disk", which it never did), so no artefact existed.
//
// The exported policy covers all 4,520 reachable non-terminal positions, and
// verify_unbeatable.py walks the entire game tree to confirm it cannot be beaten
// from either side. So there is no fallback path here: every position the board
// can reach has an entry.

const pump = keyframes`
  0%, 100% { font-size: 24px; }
  50% { font-size: 30px; }
`;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const winnerOf = (squares) => {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { mark: squares[a], line };
    }
  }
  return squares.every(Boolean) ? { mark: 'draw', line: [] } : null;
};

// Policy keys are the board from the mover's point of view: 0 empty, 1 mine,
// 2 theirs. The agent plays O.
const keyFor = (squares) =>
  squares.map((c) => (c === 'O' ? '1' : c === 'X' ? '2' : '0')).join('');

const TicTacToe = () => {
  const [policy, setPolicy] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });
  const [board, setBoard] = useState(Array(9).fill(null));
  const [result, setResult] = useState(null);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.PUBLIC_URL}/models/tictactoe-policy.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setPolicy(data.policy); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  const settle = useCallback((outcome) => {
    setResult(outcome);
    setScores((s) => ({
      wins: s.wins + (outcome.mark === 'X' ? 1 : 0),
      losses: s.losses + (outcome.mark === 'O' ? 1 : 0),
      draws: s.draws + (outcome.mark === 'draw' ? 1 : 0),
    }));
  }, []);

  const handleClick = (index) => {
    if (!policy || board[index] || result || thinking) return;

    const afterHuman = board.slice();
    afterHuman[index] = 'X';
    const humanOutcome = winnerOf(afterHuman);
    setBoard(afterHuman);
    if (humanOutcome) { settle(humanOutcome); return; }

    // A beat before replying, so the move is legible rather than instant.
    setThinking(true);
    setTimeout(() => {
      const move = policy[keyFor(afterHuman)];
      const afterAgent = afterHuman.slice();
      afterAgent[move] = 'O';
      setBoard(afterAgent);
      const agentOutcome = winnerOf(afterAgent);
      if (agentOutcome) settle(agentOutcome);
      setThinking(false);
    }, 260);
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setResult(null);
    setThinking(false);
  };

  const status = result
    ? result.mark === 'draw'
      ? "A draw — the best anyone can do."
      : result.mark === 'X'
        ? 'You won. That should not be possible — please tell me how.'
        : 'The agent wins.'
    : thinking
      ? 'Thinking…'
      : 'Your move — you play X.';

  const renderSquare = (index) => {
    const isWinning = result?.line.includes(index);
    return (
      <Button
        key={index}
        variant="contained"
        color="primary"
        aria-label={`Square ${index + 1}${board[index] ? `, ${board[index]}` : ', empty'}`}
        sx={{
          width: '60px',
          height: '60px',
          fontSize: '24px',
          fontWeight: isWinning ? 'bold' : 'normal',
          margin: '5px',
          minWidth: 0,
          borderRadius: '4px',
          animation: isWinning ? `${pump} 0.85s infinite` : 'none',
          // The squares are a flame-coloured fill, so their marks are dark ink —
          // white on #e0a94a is 2:1 and unreadable.
          color: isWinning ? '#3d2506' : '#170e04',
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
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
        mt: 4,
        p: 2,
        borderRadius: '4px',
        border: `1px solid ${palette.hairline}`,
        backgroundColor: palette.card,
      }}
    >
      {loadError ? (
        <Typography variant="body1" sx={{ textAlign: 'center', mb: 0 }}>
          The trained policy couldn't be loaded just now. Reload to try again.
        </Typography>
      ) : !policy ? (
        <Typography variant="body1">Loading the trained policy…</Typography>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>{status}</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You: {scores.wins} · Agent: {scores.losses} · Drawn: {scores.draws}
          </Typography>
          <Box display="flex" flexDirection="column" alignItems="center">
            {[0, 3, 6].map((row) => (
              <Box display="flex" key={row}>
                {[0, 1, 2].map((col) => renderSquare(row + col))}
              </Box>
            ))}
          </Box>
          <Button variant="outlined" sx={{ mt: 2 }} onClick={resetGame}>
            Play again
          </Button>
          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center', mb: 0 }}>
            Tabular Q-learning, trained by self-play over 400,000 episodes.
            Exhaustive search of the game tree confirms it cannot be beaten from
            either side — a draw is the best available against it.
          </Typography>
        </>
      )}
    </Container>
  );
};

export default TicTacToe;
