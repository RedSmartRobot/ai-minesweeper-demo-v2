import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bomb, 
  Flag, 
  RefreshCw, 
  Play, 
  Brain, 
  Eye, 
  Settings, 
  History, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Terminal,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Declare Puter for TypeScript
declare global {
  interface Window {
    puter: any;
  }
}

// --- Types ---
type CellState = 'unrevealed' | 'revealed' | 'flagged';
type CellValue = number | 'mine';

interface Cell {
  r: number;
  c: number;
  value: CellValue;
  state: CellState;
}

interface GameState {
  board: Cell[][];
  status: 'playing' | 'won' | 'lost';
  minesCount: number;
  revealedCount: number;
}

interface AgentAction {
  type: 'OPEN' | 'FLAG';
  coord: string; // e.g., "A3"
  reasoning: string;
  isGuess: boolean;
}

// --- Constants ---
const ROWS = 8;
const COLS = 8;
const MINES = 10;

// --- Helpers ---
const getCoord = (r: number, c: number) => `${String.fromCharCode(65 + c)}${r + 1}`;
const parseCoord = (coord: string) => {
  const c = coord.charCodeAt(0) - 65;
  const r = parseInt(coord.substring(1)) - 1;
  return { r, c };
};

const createBoard = (): Cell[][] => {
  const board: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push({ r, c, value: 0, state: 'unrevealed' });
    }
    board.push(row);
  }
  return board;
};

const placeMines = (board: Cell[][], firstR: number, firstC: number): Cell[][] => {
  let placed = 0;
  const newBoard = JSON.parse(JSON.stringify(board));
  while (placed < MINES) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    // Don't place mine on first click or already placed mine
    if ((r !== firstR || c !== firstC) && newBoard[r][c].value !== 'mine') {
      newBoard[r][c].value = 'mine';
      placed++;
    }
  }

  // Calculate numbers
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (newBoard[r][c].value === 'mine') continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && newBoard[nr][nc].value === 'mine') {
            count++;
          }
        }
      }
      newBoard[r][c].value = count;
    }
  }
  return newBoard;
};

const revealCell = (board: Cell[][], r: number, c: number): { board: Cell[][], revealed: number } => {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c].state !== 'unrevealed') {
    return { board, revealed: 0 };
  }

  const newBoard = [...board.map(row => [...row])];
  let revealedCount = 0;

  const floodFill = (currR: number, currC: number) => {
    if (currR < 0 || currR >= ROWS || currC < 0 || currC >= COLS || newBoard[currR][currC].state !== 'unrevealed') return;
    
    newBoard[currR][currC].state = 'revealed';
    revealedCount++;

    if (newBoard[currR][currC].value === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          floodFill(currR + dr, currC + dc);
        }
      }
    }
  };

  floodFill(r, c);
  return { board: newBoard, revealed: revealedCount };
};

// --- Main Component ---
export default function App() {
  const [game, setGame] = useState<GameState>({
    board: createBoard(),
    status: 'playing',
    minesCount: MINES,
    revealedCount: 0
  });
  const [firstClick, setFirstClick] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [memory, setMemory] = useState(localStorage.getItem('minesweeper_memory') || "Initial strategy: Start with corners or edges. Look for 1s near corners.");
  const [isThinking, setIsThinking] = useState(false);
  const [agentReasoning, setAgentReasoning] = useState("");
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);
  const [perception, setPerception] = useState("");

  // Update perception whenever board changes
  useEffect(() => {
    let ascii = "   A B C D E F G H\n";
    for (let r = 0; r < ROWS; r++) {
      ascii += `${r + 1}  `;
      for (let c = 0; c < COLS; c++) {
        const cell = game.board[r][c];
        if (cell.state === 'unrevealed') ascii += "? ";
        else if (cell.state === 'flagged') ascii += "F ";
        else if (cell.value === 'mine') ascii += "* ";
        else if (cell.value === 0) ascii += ". ";
        else ascii += `${cell.value} `;
      }
      ascii += "\n";
    }
    setPerception(ascii);
  }, [game.board]);

  const resetGame = () => {
    setGame({
      board: createBoard(),
      status: 'playing',
      minesCount: MINES,
      revealedCount: 0
    });
    setFirstClick(true);
    setAgentReasoning("");
    setAgentActions([]);
    setCurrentActionIndex(-1);
  };

  const handleCellClick = (r: number, c: number) => {
    if (game.status !== 'playing' || game.board[r][c].state === 'flagged') return;

    let currentBoard = game.board;
    if (firstClick) {
      currentBoard = placeMines(game.board, r, c);
      setFirstClick(false);
    }

    if (currentBoard[r][c].value === 'mine') {
      const revealedBoard = currentBoard.map(row => row.map(cell => ({
        ...cell,
        state: cell.value === 'mine' ? 'revealed' : cell.state
      })));
      setGame(prev => ({ ...prev, board: revealedBoard, status: 'lost' }));
      return;
    }

    const { board: newBoard, revealed } = revealCell(currentBoard, r, c);
    const newRevealedCount = game.revealedCount + revealed;
    const hasWon = newRevealedCount === (ROWS * COLS - MINES);

    setGame(prev => ({
      ...prev,
      board: newBoard,
      revealedCount: newRevealedCount,
      status: hasWon ? 'won' : 'playing'
    }));
  };

  const handleRightClick = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (game.status !== 'playing' || game.board[r][c].state === 'revealed') return;

    const newBoard = [...game.board.map(row => [...row])];
    newBoard[r][c].state = newBoard[r][c].state === 'flagged' ? 'unrevealed' : 'flagged';
    setGame(prev => ({ ...prev, board: newBoard }));
  };

  const runAgent = async () => {
    if (game.status !== 'playing' || isThinking) return;

    setIsThinking(true);
    setAgentReasoning("Analyzing board state via Puter.js...");
    setAgentActions([]);
    setCurrentActionIndex(-1);

    try {
      const prompt = `You are an AI agent playing Minesweeper on an 8×8 board with chess notation 
(columns A–H, rows 1–8, so squares are A1–H8). There are 10 mines hidden on 
the board.

RULES:
- Opening a square reveals either a mine (you lose) or a number (0–8) showing 
  how many of the 8 neighboring squares contain mines.
- A revealed "0" means all neighbors are safe and they open automatically.
- You may place flags on squares you believe contain mines.
- You win by opening all non-mine squares.

BOARD STATE FORMAT:
You will receive the current board as ASCII art, where:
  ?  = unrevealed, unflagged square
  F  = flagged square
  .  = revealed safe square with 0 mine neighbors
  1–8 = revealed square with that many mine neighbors
  *  = mine (only shown on game over)

RESPONSE FORMAT:
Respond with a short reasoning paragraph, then a clearly separated action list.
Each action must be on its own line in exactly this format:
  OPEN A3
  FLAG B5
  OPEN C4
You may issue multiple actions per turn. Mark uncertain moves with "(guess)".

MEMORY FROM PREVIOUS GAMES:
${memory}

CURRENT BOARD:
${perception}

Your goal is to play logically, explain your reasoning clearly so a human 
observer can follow, and flag uncertainty honestly.`;

      const response = await window.puter.ai.chat(prompt);
      const text = response || "";
      const lines = text.split('\n');
      const actions: AgentAction[] = [];
      let reasoning = "";
      let foundActions = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('OPEN ') || trimmed.startsWith('FLAG ')) {
          foundActions = true;
          const parts = trimmed.split(' ');
          if (parts.length >= 2) {
            actions.push({
              type: parts[0] as 'OPEN' | 'FLAG',
              coord: parts[1],
              reasoning: "",
              isGuess: trimmed.toLowerCase().includes('(guess)')
            });
          }
        } else if (!foundActions && trimmed.length > 0) {
          reasoning += trimmed + " ";
        }
      }

      setAgentReasoning(reasoning);
      setAgentActions(actions);
      
      if (actions.length > 0) {
        executeActionsSequentially(actions);
      } else {
        setAgentReasoning(prev => prev + " (No actions identified)");
      }

    } catch (error) {
      console.error(error);
      setAgentReasoning("Error communicating with Puter.js. Please refresh.");
    } finally {
      setIsThinking(false);
    }
  };

  const executeActionsSequentially = async (actions: AgentAction[]) => {
    for (let i = 0; i < actions.length; i++) {
      setCurrentActionIndex(i);
      const action = actions[i];
      try {
        const { r, c } = parseCoord(action.coord);
        await new Promise(resolve => setTimeout(resolve, 800));
        if (action.type === 'OPEN') {
          handleCellClick(r, c);
        } else {
          setGame(prev => {
            if (prev.board[r][c].state === 'revealed') return prev;
            const newBoard = [...prev.board.map(row => [...row])];
            newBoard[r][c].state = 'flagged';
            return { ...prev, board: newBoard };
          });
        }
      } catch (e) {
        console.warn("Invalid coordinate from agent:", action.coord);
      }
    }
    setCurrentActionIndex(-1);
  };

  const saveMemory = () => {
    localStorage.setItem('minesweeper_memory', memory);
  };

  // Auto-reflect after game ends
  useEffect(() => {
    if ((game.status === 'won' || game.status === 'lost')) {
      const reflect = async () => {
        try {
          const prompt = `The game of Minesweeper just ended. Result: ${game.status.toUpperCase()}.
Here was the final board:
${perception}

Based on this game, write a one-sentence "lesson learned" for your long-term memory to improve future play. 
Focus on a specific logical pattern or strategic mistake. Keep it under 30 words.`;
          
          const response = await window.puter.ai.chat(prompt);
          const newLesson = response?.trim() || "";
          setMemory(prev => `Game ${Date.now().toString().slice(-4)}: ${game.status.toUpperCase()}. ${newLesson}\n${prev}`.slice(0, 500));
        } catch (e) {
          console.error("Reflection failed", e);
        }
      };
      reflect();
    }
  }, [game.status]);

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-200 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#15171c]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Bomb className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">Minesweeper Agent</h1>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Technical AI Demo (Puter.js)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6 px-4 py-2 bg-black/20 rounded-full border border-white/5">
              <div className="flex items-center gap-2">
                <Bomb className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-mono font-bold">{MINES}</span>
              </div>
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-mono font-bold">
                  {game.board.flat().filter(c => c.state === 'flagged').length}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Pane: The World (Game Board) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#15171c] border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Environment</h2>
              </div>
              <button 
                onClick={resetGame}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium transition-all"
              >
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
            </div>

            <div className="aspect-square bg-black/40 rounded-xl p-4 border border-white/5 flex items-center justify-center">
              <div className="grid grid-cols-8 gap-1.5 w-full h-full">
                {game.board.flat().map((cell, i) => (
                  <motion.button
                    key={`${cell.r}-${cell.c}`}
                    whileHover={{ scale: game.status === 'playing' ? 1.05 : 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleCellClick(cell.r, cell.c)}
                    onContextMenu={(e) => handleRightClick(e, cell.r, cell.c)}
                    className={`
                      relative rounded-md flex items-center justify-center text-sm font-bold transition-all
                      ${cell.state === 'unrevealed' ? 'bg-[#2a2d35] shadow-inner hover:bg-[#343842]' : 'bg-transparent'}
                      ${cell.state === 'revealed' ? 'border border-white/5' : ''}
                      ${game.status === 'lost' && cell.value === 'mine' ? 'bg-red-500/20 border-red-500/40' : ''}
                    `}
                  >
                    {cell.state === 'flagged' && <Flag className="w-4 h-4 text-blue-400 fill-blue-400/20" />}
                    {cell.state === 'revealed' && cell.value !== 'mine' && cell.value !== 0 && (
                      <span className={`
                        ${cell.value === 1 ? 'text-blue-400' : ''}
                        ${cell.value === 2 ? 'text-green-400' : ''}
                        ${cell.value === 3 ? 'text-red-400' : ''}
                        ${cell.value === 4 ? 'text-purple-400' : ''}
                        ${cell.value >= 5 ? 'text-orange-400' : ''}
                      `}>
                        {cell.value}
                      </span>
                    )}
                    {cell.state === 'revealed' && cell.value === 'mine' && <Bomb className="w-4 h-4 text-red-500" />}
                    
                    {/* Coordinate Label (Optional/Subtle) */}
                    {cell.state === 'unrevealed' && (
                      <span className="absolute bottom-0.5 right-0.5 text-[6px] text-gray-600 font-mono uppercase">
                        {getCoord(cell.r, cell.c)}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={runAgent}
                disabled={game.status !== 'playing' || isThinking}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all
                  ${game.status !== 'playing' || isThinking 
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                    : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20'}
                `}
              >
                {isThinking ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Request Agent Move
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Banner */}
          <AnimatePresence>
            {game.status !== 'playing' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border flex items-center gap-3 ${
                  game.status === 'won' 
                    ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
              >
                {game.status === 'won' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                <div>
                  <p className="font-bold">Game Over: {game.status.toUpperCase()}</p>
                  <p className="text-xs opacity-70">
                    {game.status === 'won' ? 'The agent successfully cleared the field.' : 'A mine was triggered.'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Middle Pane: Perception (ASCII) */}
        <section className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-[#15171c] border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Perception</h2>
            </div>
            <div className="flex-1 p-6 font-mono text-sm leading-relaxed bg-black/20 text-blue-100/80 whitespace-pre">
              {perception}
            </div>
            <div className="p-4 bg-black/40 text-[10px] text-gray-500 font-mono border-t border-white/5">
              RAW_INPUT_STREAM: UTF-8 ASCII_GRID
            </div>
          </div>
        </section>

        {/* Right Pane: Brain (Reasoning & Memory) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          {/* Reasoning */}
          <div className="bg-[#15171c] border border-white/10 rounded-2xl flex-[2] flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Agent Brain</h2>
            </div>
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Reasoning Process</p>
                <div className="text-sm text-gray-300 leading-relaxed italic bg-white/5 p-3 rounded-lg border border-white/5">
                  {agentReasoning || "Waiting for agent to perceive environment..."}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Planned Actions</p>
                <div className="space-y-2">
                  {agentActions.length > 0 ? (
                    agentActions.map((action, idx) => (
                      <div 
                        key={idx}
                        className={`
                          flex items-center justify-between p-2 rounded-lg border text-xs font-mono
                          ${currentActionIndex === idx 
                            ? 'bg-green-500/20 border-green-500/40 text-green-300' 
                            : 'bg-white/5 border-white/5 text-gray-400'}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`w-3 h-3 ${currentActionIndex === idx ? 'animate-pulse' : ''}`} />
                          <span className="font-bold">{action.type}</span>
                          <span>{action.coord}</span>
                        </div>
                        {action.isGuess && <span className="text-[8px] bg-orange-500/20 text-orange-400 px-1 rounded">GUESS</span>}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-600 italic">No actions in queue.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Memory */}
          <div className="bg-[#15171c] border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-yellow-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Long-term Memory</h2>
              </div>
              <button 
                onClick={saveMemory}
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-gray-500 hover:text-white"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
            <textarea 
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              className="flex-1 p-4 bg-black/20 text-xs text-yellow-100/60 font-mono resize-none focus:outline-none focus:bg-black/30 transition-all"
              placeholder="Agent experiences will be recorded here..."
            />
          </div>
        </section>
      </main>

      {/* Settings Modal (Simplified) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-[#1c1f26] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                  <Settings className="text-blue-400 w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">About the Agent</h3>
                  <p className="text-sm text-gray-400">Powered by Puter.js AI Service.</p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-gray-400 leading-relaxed">
                <p>
                  This demo uses **Puter.js** to provide free access to AI models. No API keys are required for this demonstration.
                </p>
                <p>
                  The agent perceives the board as ASCII text, reasons about the numbers, and issues commands. It also "reflects" on its performance to build long-term memory.
                </p>

                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs text-gray-600 font-mono">
          SYSTEM_STATUS: <span className="text-green-500/80">OPERATIONAL</span> | AI_PROVIDER: PUTER_JS
        </div>
        <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-gray-500">
          <span>Explainability Demo</span>
          <span>Logic-Based Reasoning</span>
          <span>Zero-Setup Demo</span>
        </div>
      </footer>
    </div>
  );
}
