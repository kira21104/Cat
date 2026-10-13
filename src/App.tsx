import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Sparkles, Pencil, Lightbulb, ArrowLeft, RotateCcw, Calendar, Trophy, Flame, Check, X, AlertCircle, Keyboard, HelpCircle, Wand2, Trash2, Music, SlidersHorizontal } from 'lucide-react';
import { sound } from './audio';
import {
  CATS,
  Difficulty,
  DIFFICULTY_CELLS_TO_REMOVE,
  DIFFICULTY_XP,
  ACHIEVEMENT_DEFS,
  AchievementDef,
  getLevelInfo,
  createPuzzle,
  dateSeed,
  createSeededRng,
  GameStats
} from './sudokuLogic';
import { ConfettiOverlay } from './ConfettiOverlay';

// Image assets generated for rewards, hint, and mistake learning feedback
const CONFETTI_PAWS_IMG = '/src/assets/images/confetti_paws_1791728742178.jpg';
const SPARKLE_STARS_IMG = '/src/assets/images/sparkle_stars_1791728753766.jpg';
const OOPS_KITTEN_IMG = '/src/assets/images/oops_kitten_sticker_1791730133812.jpg';

type Screen = 'main' | 'difficulty' | 'game' | 'dailyCalendar' | 'win' | 'lose';

interface ActiveCellAnim {
  row: number;
  col: number;
  type: 'correct' | 'wrong' | 'hint';
}

interface MistakeExplanation {
  row: number;
  col: number;
  val: number;
  type: 'row' | 'col' | 'box' | 'solution';
  title: string;
  detail: string;
  conflictingCells: { row: number; col: number }[];
}

export default function App() {
  // Screen state
  const [screen, setScreen] = useState<Screen>('main');
  const [catMode, setCatMode] = useState<boolean>(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('Лёгкий');
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getMuted());
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(() => sound.getMusicMuted());
  const [musicVolume, setMusicVolume] = useState<number>(() => sound.getMusicVolume());
  const [showMusicSlider, setShowMusicSlider] = useState<boolean>(false);
  const musicPopoverRef = useRef<HTMLDivElement>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Game board state
  const [board, setBoard] = useState<number[][]>(() => Array(9).fill(null).map(() => Array(9).fill(0)));
  const [initialBoard, setInitialBoard] = useState<number[][]>(() => Array(9).fill(null).map(() => Array(9).fill(0)));
  const [solution, setSolution] = useState<number[][]>(() => Array(9).fill(null).map(() => Array(9).fill(0)));
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [notes, setNotes] = useState<Set<number>[][]>(() => Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set<number>())));
  const [mistakes, setMistakes] = useState<number>(0);
  const [hints, setHints] = useState<number>(3);
  const [usedHints, setUsedHints] = useState<number>(0);
  const [timer, setTimer] = useState<number>(0);
  const [pencilMode, setPencilMode] = useState<boolean>(false);
  const [autoNoteMode, setAutoNoteMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kotoku_auto_note_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [correctCells, setCorrectCells] = useState<Set<string>>(new Set());
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());

  // Cell animations tracking
  const [activeCellAnim, setActiveCellAnim] = useState<ActiveCellAnim | null>(null);
  const [hintSparklePos, setHintSparklePos] = useState<{ row: number; col: number } | null>(null);
  const [activeMistakePopup, setActiveMistakePopup] = useState<MistakeExplanation | null>(null);

  // Daily Mode & Progress State
  const [isDailyMode, setIsDailyMode] = useState<boolean>(false);
  const [dailyHistory, setDailyHistory] = useState<Record<string, 'won' | 'lost'>>({});
  const [dailyStreak, setDailyStreak] = useState<number>(0);
  const [dailyBestStreak, setDailyBestStreak] = useState<number>(0);
  const [dailyLastCompletedDate, setDailyLastCompletedDate] = useState<string | null>(null);
  const [calYear, setCalYear] = useState<number>(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(() => new Date().getMonth());
  const [claimedMilestones, setClaimedMilestones] = useState<number[]>([]);
  const [activeMilestoneCelebration, setActiveMilestoneCelebration] = useState<number | null>(null);

  // Achievement toast notifications queue
  const [toastQueue, setToastQueue] = useState<AchievementDef[]>([]);
  const [activeToast, setActiveToast] = useState<AchievementDef | null>(null);

  // Overall player stats
  const [stats, setStats] = useState<GameStats>({
    played: 0,
    wins: 0,
    cleanWins: 0,
    bestTime: null,
    xp: 0,
    winStreak: 0,
    noHintWins: 0,
    fastWin: false,
    mediumFastWin: false,
    easyWins: 0,
    mediumWins: 0,
    hardWins: 0,
    expertWins: 0
  });

  const [unlockedAchievements, setUnlockedAchievements] = useState<Record<string, boolean>>({});

  // Level Up Moment
  const [isLevelingUp, setIsLevelingUp] = useState<boolean>(false);
  const prevTotalLevelRef = useRef<number>(getLevelInfo(stats.xp).totalLevel);

  // CAT MODE Ripple Transition
  const [modeTransitioning, setModeTransitioning] = useState<boolean>(false);

  // Timer interval reference
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper date functions
  const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getYesterdayStr = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kotoku_progress');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.stats) setStats(data.stats);
        if (data.unlockedAchievements) setUnlockedAchievements(data.unlockedAchievements);
        if (data.dailyHistory) setDailyHistory(data.dailyHistory);
        if (data.dailyStreak !== undefined) setDailyStreak(data.dailyStreak);
        if (data.dailyBestStreak !== undefined) setDailyBestStreak(data.dailyBestStreak);
        if (data.dailyLastCompletedDate) setDailyLastCompletedDate(data.dailyLastCompletedDate);
        if (data.catMode !== undefined) setCatMode(data.catMode);
        if (data.claimedMilestones) setClaimedMilestones(data.claimedMilestones);
      }
    } catch (e) {
      console.warn('Failed to load local progress', e);
    }
  }, []);

  // Save progress helper
  const saveAllProgress = useCallback((newStats: GameStats, newAchievements: Record<string, boolean>, newHistory: Record<string, 'won' | 'lost'>, streak: number, bestStreak: number, lastDate: string | null, milestones?: number[]) => {
    try {
      localStorage.setItem('kotoku_progress', JSON.stringify({
        stats: newStats,
        unlockedAchievements: newAchievements,
        dailyHistory: newHistory,
        dailyStreak: streak,
        dailyBestStreak: bestStreak,
        dailyLastCompletedDate: lastDate,
        catMode,
        claimedMilestones: milestones ?? claimedMilestones
      }));
    } catch (e) {
      console.warn('Failed to save progress', e);
    }
  }, [catMode, claimedMilestones]);

  // Achievement Toast Queue Worker
  useEffect(() => {
    if (!activeToast && toastQueue.length > 0) {
      const next = toastQueue[0];
      setActiveToast(next);
      setToastQueue(q => q.slice(1));
      sound.playAchievement();

      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 3400);

      return () => clearTimeout(timer);
    }
  }, [activeToast, toastQueue]);

  // Level Up Moment Trigger
  useEffect(() => {
    const currentTotalLevel = getLevelInfo(stats.xp).totalLevel;
    if (currentTotalLevel > prevTotalLevelRef.current) {
      prevTotalLevelRef.current = currentTotalLevel;
      setIsLevelingUp(true);
      sound.playLevelUp();

      const timer = setTimeout(() => {
        setIsLevelingUp(false);
      }, 2200);

      return () => clearTimeout(timer);
    }
  }, [stats.xp]);

  // CAT MODE animated toggle handler
  const handleToggleCatMode = (targetMode?: boolean) => {
    sound.playClick();
    setCatMode(prev => (targetMode !== undefined ? targetMode : !prev));
    setModeTransitioning(true);
    setTimeout(() => {
      setModeTransitioning(false);
    }, 380);
  };

  // Timer ticking
  useEffect(() => {
    if (screen === 'game') {
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [screen]);

  // Sound toggle handler
  const handleToggleMute = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  // Background Music toggle handler
  const handleToggleMusicMute = () => {
    sound.playClick();
    const next = sound.toggleMusicMute();
    setIsMusicMuted(next);
  };

  // Background Music volume slider handler
  const handleMusicVolumeChange = (newVol: number) => {
    sound.setMusicVolume(newVol);
    setMusicVolume(newVol);
    if (isMusicMuted && newVol > 0) {
      sound.setMusicMuted(false);
      setIsMusicMuted(false);
    }
  };

  // Close music volume popover on click outside
  useEffect(() => {
    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (musicPopoverRef.current && !musicPopoverRef.current.contains(e.target as Node)) {
        setShowMusicSlider(false);
      }
    };
    if (showMusicSlider) {
      document.addEventListener('mousedown', handlePointerDownOutside);
      document.addEventListener('touchstart', handlePointerDownOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, [showMusicSlider]);

  // Autoplay background music upon first user interaction on the page (respects browser autoplay policies)
  useEffect(() => {
    const handleFirstGesture = () => {
      sound.ensureMusicStarted();
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true });
    window.addEventListener('click', handleFirstGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
    };
  }, []);

  // Deduce why a mistake was made for educational learning
  const getMistakeExplanation = (
    currentBoard: number[][],
    r: number,
    c: number,
    val: number,
    isCatMode: boolean
  ): MistakeExplanation => {
    const cat = CATS.find(ct => ct.num === val);
    const token = isCatMode && cat ? `${cat.glyph} ${cat.name}` : `number ${val}`;
    const conflicting: { row: number; col: number }[] = [];

    // 1. Check Row conflict
    for (let colIdx = 0; colIdx < 9; colIdx++) {
      if (colIdx !== c && currentBoard[r][colIdx] === val) {
        conflicting.push({ row: r, col: colIdx });
        return {
          row: r,
          col: c,
          val,
          type: 'row',
          title: 'Row Conflict! 🐾',
          detail: `There is already another ${token} in row ${r + 1}. In Sudoku, each horizontal row must contain all 9 unique kittens without repeats!`,
          conflictingCells: conflicting
        };
      }
    }

    // 2. Check Column conflict
    for (let rowIdx = 0; rowIdx < 9; rowIdx++) {
      if (rowIdx !== r && currentBoard[rowIdx][c] === val) {
        conflicting.push({ row: rowIdx, col: c });
        return {
          row: r,
          col: c,
          val,
          type: 'col',
          title: 'Column Conflict! 🐾',
          detail: `There is already another ${token} in column ${c + 1}. Every vertical column must have all 9 distinct kittens without duplicates!`,
          conflictingCells: conflicting
        };
      }
    }

    // 3. Check 3x3 Box conflict
    const startRow = Math.floor(r / 3) * 3;
    const startCol = Math.floor(c / 3) * 3;
    for (let rowIdx = startRow; rowIdx < startRow + 3; rowIdx++) {
      for (let colIdx = startCol; colIdx < startCol + 3; colIdx++) {
        if ((rowIdx !== r || colIdx !== c) && currentBoard[rowIdx][colIdx] === val) {
          conflicting.push({ row: rowIdx, col: colIdx });
          return {
            row: r,
            col: c,
            val,
            type: 'box',
            title: '3×3 Square Conflict! 🐾',
            detail: `This 3×3 square already has ${token}. Every 3×3 area only allows each kitten once!`,
            conflictingCells: conflicting
          };
        }
      }
    }

    // 4. Logical deduction conflict
    return {
      row: r,
      col: c,
      val,
      type: 'solution',
      title: 'Position Conflict! 🐾',
      detail: `Placing ${token} here doesn't fit the Sudoku rules for this cell. Try using pencil notes ✏️ or check other rows and columns!`,
      conflictingCells: []
    };
  };

  // ── Auto-Note Mode Helpers ───────────────────────────────────────────────
  // Compute possible candidates (1..9) for an empty cell
  const computeCellCandidates = useCallback((currentBoard: number[][], r: number, c: number): Set<number> => {
    if (currentBoard[r][c] !== 0) return new Set();
    const used = new Set<number>();
    for (let i = 0; i < 9; i++) {
      if (currentBoard[r][i] !== 0) used.add(currentBoard[r][i]);
      if (currentBoard[i][c] !== 0) used.add(currentBoard[i][c]);
    }
    const startRow = Math.floor(r / 3) * 3;
    const startCol = Math.floor(c / 3) * 3;
    for (let i = startRow; i < startRow + 3; i++) {
      for (let j = startCol; j < startCol + 3; j++) {
        if (currentBoard[i][j] !== 0) used.add(currentBoard[i][j]);
      }
    }
    const candidates = new Set<number>();
    for (let num = 1; num <= 9; num++) {
      if (!used.has(num)) candidates.add(num);
    }
    return candidates;
  }, []);

  // Compute candidate notes for all cells across the board
  const computeAllBoardNotes = useCallback((currentBoard: number[][]): Set<number>[][] => {
    return Array(9).fill(null).map((_, r) =>
      Array(9).fill(null).map((_, c) => computeCellCandidates(currentBoard, r, c))
    );
  }, [computeCellCandidates]);

  // Toggle Auto-Note mode
  const toggleAutoNoteMode = useCallback((targetState?: boolean) => {
    const next = targetState !== undefined ? targetState : !autoNoteMode;
    setAutoNoteMode(next);
    try {
      localStorage.setItem('kotoku_auto_note_mode', String(next));
    } catch {}

    if (next) {
      sound.playHint();
      // Instantly generate and populate all valid candidates for current empty cells
      setNotes(computeAllBoardNotes(board));
    } else {
      sound.playPencil();
    }
  }, [autoNoteMode, board, computeAllBoardNotes]);

  // Manual trigger to auto-fill all notes
  const autoFillAllNotes = useCallback(() => {
    sound.playHint();
    setNotes(computeAllBoardNotes(board));
  }, [board, computeAllBoardNotes]);

  // Clear all candidate notes
  const clearAllNotes = useCallback(() => {
    sound.playClick();
    setNotes(Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set<number>())));
  }, []);

  // Launch a regular game
  const startGame = (diff: Difficulty) => {
    sound.playClick();
    setDifficulty(diff);
    setIsDailyMode(false);

    const cellsToRemove = DIFFICULTY_CELLS_TO_REMOVE[diff] || 40;
    const { solution: sol, initialBoard: init } = createPuzzle(cellsToRemove);

    setSolution(sol);
    setInitialBoard(init.map(r => r.slice()));
    setBoard(init.map(r => r.slice()));
    setSelectedCell(null);
    setNotes(autoNoteMode ? computeAllBoardNotes(init) : Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set<number>())));
    setMistakes(0);
    setHints(3);
    setUsedHints(0);
    setTimer(0);
    setPencilMode(false);
    setErrorCells(new Set());
    setActiveCellAnim(null);
    setHintSparklePos(null);
    setActiveMistakePopup(null);

    const correctSet = new Set<string>();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (init[r][c] !== 0) {
          correctSet.add(`${r},${c}`);
        }
      }
    }
    setCorrectCells(correctSet);
    setScreen('game');
  };

  // Launch or continue daily challenge
  const startDailyChallenge = () => {
    sound.playClick();
    const today = getTodayStr();
    setIsDailyMode(true);
    setDifficulty('Средний');

    const rng = createSeededRng(dateSeed(today));
    const { solution: sol, initialBoard: init } = createPuzzle(DIFFICULTY_CELLS_TO_REMOVE['Средний'], rng);

    setSolution(sol);
    setInitialBoard(init.map(r => r.slice()));
    setBoard(init.map(r => r.slice()));
    setSelectedCell(null);
    setNotes(autoNoteMode ? computeAllBoardNotes(init) : Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set<number>())));
    setMistakes(0);
    setHints(3);
    setUsedHints(0);
    setTimer(0);
    setPencilMode(false);
    setErrorCells(new Set());
    setActiveCellAnim(null);
    setHintSparklePos(null);
    setActiveMistakePopup(null);

    const correctSet = new Set<string>();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (init[r][c] !== 0) {
          correctSet.add(`${r},${c}`);
        }
      }
    }
    setCorrectCells(correctSet);
    setScreen('game');
  };

  // Handle Win
  const handleWin = useCallback(() => {
    sound.playWin();

    if (isDailyMode) {
      const today = getTodayStr();
      const newHistory = { ...dailyHistory, [today]: 'won' as const };
      const yesterday = getYesterdayStr(today);
      const newStreak = dailyLastCompletedDate === yesterday ? dailyStreak + 1 : 1;
      const newBestStreak = Math.max(newStreak, dailyBestStreak);

      setDailyHistory(newHistory);
      setDailyStreak(newStreak);
      setDailyBestStreak(newBestStreak);
      setDailyLastCompletedDate(today);

      let milestoneBonus = 0;
      let nextMilestones = claimedMilestones;

      // Milestone trigger: exactly once when crossing 7 or 30 days
      if ((newStreak === 7 || newStreak === 30) && !claimedMilestones.includes(newStreak)) {
        milestoneBonus = newStreak === 7 ? 150 : 500;
        nextMilestones = [...claimedMilestones, newStreak];
        setClaimedMilestones(nextMilestones);
        setActiveMilestoneCelebration(newStreak);
        sound.playStreakMilestone();

        setTimeout(() => {
          setActiveMilestoneCelebration(null);
        }, 4500);
      }

      const addedXp = 50 + milestoneBonus;
      const updatedStats = {
        ...stats,
        played: stats.played + 1,
        wins: stats.wins + 1,
        xp: stats.xp + addedXp
      };

      // Check achievements on daily win too
      const newlyUnlocked: AchievementDef[] = [];
      const nextUnlocked = { ...unlockedAchievements };
      ACHIEVEMENT_DEFS.forEach(def => {
        if (!nextUnlocked[def.id] && def.condition(updatedStats)) {
          nextUnlocked[def.id] = true;
          updatedStats.xp += def.reward;
          newlyUnlocked.push(def);
        }
      });

      if (newlyUnlocked.length > 0) {
        setToastQueue(prev => [...prev, ...newlyUnlocked]);
      }

      setStats(updatedStats);
      setUnlockedAchievements(nextUnlocked);
      saveAllProgress(updatedStats, nextUnlocked, newHistory, newStreak, newBestStreak, today, nextMilestones);
    } else {
      const addedXp = DIFFICULTY_XP[difficulty] || 20;
      const isClean = mistakes === 0;
      const isNoHint = usedHints === 0;
      const isFast = (difficulty === 'Лёгкий' && timer <= 300) || stats.fastWin;
      const isMedFast = (difficulty === 'Средний' && timer <= 480) || stats.mediumFastWin;
      const best = stats.bestTime === null ? timer : Math.min(stats.bestTime, timer);

      const updatedStats: GameStats = {
        ...stats,
        played: stats.played + 1,
        wins: stats.wins + 1,
        cleanWins: isClean ? stats.cleanWins + 1 : stats.cleanWins,
        bestTime: best,
        xp: stats.xp + addedXp,
        winStreak: stats.winStreak + 1,
        noHintWins: isNoHint ? stats.noHintWins + 1 : stats.noHintWins,
        fastWin: isFast,
        mediumFastWin: isMedFast,
        easyWins: difficulty === 'Лёгкий' ? stats.easyWins + 1 : stats.easyWins,
        mediumWins: difficulty === 'Средний' ? stats.mediumWins + 1 : stats.mediumWins,
        hardWins: difficulty === 'Сложный' ? stats.hardWins + 1 : stats.hardWins,
        expertWins: difficulty === 'Эксперт' ? stats.expertWins + 1 : stats.expertWins
      };

      // Check achievements
      const newlyUnlocked: AchievementDef[] = [];
      const nextUnlocked = { ...unlockedAchievements };
      ACHIEVEMENT_DEFS.forEach(def => {
        if (!nextUnlocked[def.id] && def.condition(updatedStats)) {
          nextUnlocked[def.id] = true;
          updatedStats.xp += def.reward;
          newlyUnlocked.push(def);
        }
      });

      if (newlyUnlocked.length > 0) {
        setToastQueue(prev => [...prev, ...newlyUnlocked]);
      }

      setStats(updatedStats);
      setUnlockedAchievements(nextUnlocked);
      saveAllProgress(updatedStats, nextUnlocked, dailyHistory, dailyStreak, dailyBestStreak, dailyLastCompletedDate);
    }

    setScreen('win');
  }, [dailyHistory, dailyLastCompletedDate, dailyStreak, dailyBestStreak, isDailyMode, difficulty, mistakes, usedHints, timer, stats, unlockedAchievements, claimedMilestones, saveAllProgress]);

  // Handle Loss
  const handleLoss = useCallback(() => {
    sound.playLoss();

    if (isDailyMode) {
      const today = getTodayStr();
      const newHistory = { ...dailyHistory, [today]: 'lost' as const };
      setDailyHistory(newHistory);
      setDailyStreak(0);
      saveAllProgress(stats, unlockedAchievements, newHistory, 0, dailyBestStreak, dailyLastCompletedDate);
    } else {
      const updatedStats = {
        ...stats,
        played: stats.played + 1,
        winStreak: 0
      };
      setStats(updatedStats);
      saveAllProgress(updatedStats, unlockedAchievements, dailyHistory, dailyStreak, dailyBestStreak, dailyLastCompletedDate);
    }

    setScreen('lose');
  }, [dailyHistory, isDailyMode, dailyBestStreak, dailyLastCompletedDate, stats, unlockedAchievements, saveAllProgress]);

  // Cell Selection
  const selectCell = (r: number, c: number) => {
    sound.playClick();
    setSelectedCell({ row: r, col: c });

    const key = `${r},${c}`;
    if (errorCells.has(key) && board[r][c] !== 0) {
      setActiveMistakePopup(getMistakeExplanation(board, r, c, board[r][c], catMode));
    } else {
      setActiveMistakePopup(null);
    }
  };

  // Check if current board is completely solved
  const checkWinCondition = (currentBoard: number[][], currentSol: number[][]) => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentBoard[r][c] !== currentSol[r][c]) {
          return false;
        }
      }
    }
    return true;
  };

  // Number Input Logic
  const applyNumber = useCallback((number: number) => {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const key = `${row},${col}`;

    // Can't edit locked initial cells or already correctly solved cells
    if (initialBoard[row][col] !== 0) return;
    if (correctCells.has(key)) return;

    // Pencil Mode: toggle note candidates
    if (pencilMode) {
      sound.playPencil();
      const newNotes = notes.map((rArr, r) =>
        rArr.map((set, c) => {
          if (r === row && c === col) {
            const nextSet = new Set(set);
            if (number === 0) {
              nextSet.clear();
            } else {
              if (nextSet.has(number)) {
                nextSet.delete(number);
              } else {
                nextSet.add(number);
              }
            }
            return nextSet;
          }
          return set;
        })
      );
      setNotes(newNotes);
      return;
    }

    // Erase action (number === 0)
    if (number === 0) {
      sound.playClick();
      const newBoard = board.map(rArr => rArr.slice());
      newBoard[row][col] = 0;
      setBoard(newBoard);

      const newErrors = new Set(errorCells);
      newErrors.delete(key);
      setErrorCells(newErrors);
      setActiveMistakePopup(null);

      if (autoNoteMode) {
        setNotes(computeAllBoardNotes(newBoard));
      } else {
        const newNotes = notes.map((rArr, r) =>
          rArr.map((set, c) => (r === row && c === col ? new Set<number>() : set))
        );
        setNotes(newNotes);
      }
      return;
    }

    // Inputting a number: check correctness
    const isCorrect = solution[row][col] === number;
    const newBoard = board.map(rArr => rArr.slice());
    newBoard[row][col] = number;
    setBoard(newBoard);

    if (isCorrect) {
      // 1. Correct sound: cheerful pleasant ding chime (~0.5s)
      sound.playCorrect();
      setActiveMistakePopup(null);

      // Auto-note candidates update or smart note pruning
      if (autoNoteMode) {
        setNotes(computeAllBoardNotes(newBoard));
      } else {
        const startRow = Math.floor(row / 3) * 3;
        const startCol = Math.floor(col / 3) * 3;
        const newNotes = notes.map((rArr, r) =>
          rArr.map((set, c) => {
            if (r === row && c === col) return new Set<number>();
            const isSameRow = r === row;
            const isSameCol = c === col;
            const isSameBox = r >= startRow && r < startRow + 3 && c >= startCol && c < startCol + 3;
            if (isSameRow || isSameCol || isSameBox) {
              if (set.has(number)) {
                const nextSet = new Set(set);
                nextSet.delete(number);
                return nextSet;
              }
            }
            return set;
          })
        );
        setNotes(newNotes);
      }

      // 1. Visual animation: scale pulse + flash for 250ms
      setActiveCellAnim({ row, col, type: 'correct' });
      setTimeout(() => {
        setActiveCellAnim(current => (current?.row === row && current?.col === col ? null : current));
      }, 300);

      const newCorrect = new Set(correctCells);
      newCorrect.add(key);
      setCorrectCells(newCorrect);

      const newErrors = new Set(errorCells);
      newErrors.delete(key);
      setErrorCells(newErrors);

      // Check if won
      if (checkWinCondition(newBoard, solution)) {
        setTimeout(() => {
          handleWin();
        }, 350);
      }
    } else {
      // Clear notes in this cell on error attempt
      if (!autoNoteMode) {
        const newNotes = notes.map((rArr, r) =>
          rArr.map((set, c) => (r === row && c === col ? new Set<number>() : set))
        );
        setNotes(newNotes);
      }

      // 3. Wrong sound: soft muted buzz / low thud (~0.5s)
      sound.playWrong();

      // 2. Visual animation: cell shake + red flash
      setActiveCellAnim({ row, col, type: 'wrong' });
      setTimeout(() => {
        setActiveCellAnim(current => (current?.row === row && current?.col === col ? null : current));
      }, 450);

      const newErrors = new Set(errorCells);
      newErrors.add(key);
      setErrorCells(newErrors);

      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);

      // Show the Oops pop-up explanation for why it is incorrect
      setActiveMistakePopup(getMistakeExplanation(newBoard, row, col, number, catMode));

      if (nextMistakes >= 3) {
        setTimeout(() => {
          handleLoss();
        }, 500);
      }
    }
  }, [selectedCell, initialBoard, correctCells, pencilMode, notes, board, errorCells, solution, handleWin, mistakes, handleLoss, catMode, autoNoteMode, computeAllBoardNotes]);

  // Give a hint
  const giveHint = () => {
    if (hints <= 0) return;

    // Find all empty or incorrect cells
    const candidateCells: { row: number; col: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        if (initialBoard[r][c] === 0 && (!correctCells.has(key) || board[r][c] !== solution[r][c])) {
          candidateCells.push({ row: r, col: c });
        }
      }
    }

    if (candidateCells.length === 0) return;

    // Pick targeted cell
    const target = (selectedCell && initialBoard[selectedCell.row][selectedCell.col] === 0 && !correctCells.has(`${selectedCell.row},${selectedCell.col}`))
      ? selectedCell
      : candidateCells[Math.floor(Math.random() * candidateCells.length)];

    const { row, col } = target;
    const key = `${row},${col}`;

    // 6. Sound: light magical sparkle chime with bells
    sound.playHint();

    // 5. Visual effect: sparkle and pulsating glow
    setSelectedCell({ row, col });
    setActiveCellAnim({ row, col, type: 'hint' });
    setHintSparklePos({ row, col });

    // After a brief shimmer, populate the answer
    setTimeout(() => {
      const correctVal = solution[row][col];
      const newBoard = board.map(rArr => rArr.slice());
      newBoard[row][col] = correctVal;
      setBoard(newBoard);

      const newCorrect = new Set(correctCells);
      newCorrect.add(key);
      setCorrectCells(newCorrect);

      const newErrors = new Set(errorCells);
      newErrors.delete(key);
      setErrorCells(newErrors);

      setHints(h => Math.max(0, h - 1));
      setUsedHints(u => u + 1);

      // Auto-note candidates update or smart note pruning
      if (autoNoteMode) {
        setNotes(computeAllBoardNotes(newBoard));
      } else {
        const startRow = Math.floor(row / 3) * 3;
        const startCol = Math.floor(col / 3) * 3;
        const newNotes = notes.map((rArr, r) =>
          rArr.map((set, c) => {
            if (r === row && c === col) return new Set<number>();
            const isSameRow = r === row;
            const isSameCol = c === col;
            const isSameBox = r >= startRow && r < startRow + 3 && c >= startCol && c < startCol + 3;
            if (isSameRow || isSameCol || isSameBox) {
              if (set.has(correctVal)) {
                const nextSet = new Set(set);
                nextSet.delete(correctVal);
                return nextSet;
              }
            }
            return set;
          })
        );
        setNotes(newNotes);
      }

      // Trigger correct scale pulse
      setActiveCellAnim({ row, col, type: 'correct' });
      setTimeout(() => {
        setActiveCellAnim(null);
        setHintSparklePos(null);
      }, 350);

      if (checkWinCondition(newBoard, solution)) {
        setTimeout(() => {
          handleWin();
        }, 400);
      }
    }, 450);
  };

  // Keyboard navigation and numbers input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global shortcut: ? or Shift+/ to toggle shortcuts modal, Escape to close
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        sound.playClick();
        setShowShortcutsModal(prev => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
          return;
        }
        if (showMusicSlider) {
          e.preventDefault();
          setShowMusicSlider(false);
          return;
        }
      }
      // Global shortcut: M to toggle background music
      if (e.key === 'm' || e.key === 'M') {
        handleToggleMusicMute();
        return;
      }

      if (screen !== 'game') return;

      if (e.key >= '1' && e.key <= '9') {
        applyNumber(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        applyNumber(0);
      } else if (e.key === 'p' || e.key === 'P') {
        sound.playPencil();
        setPencilMode(prev => !prev);
      } else if (e.key === 'n' || e.key === 'N') {
        toggleAutoNoteMode();
      } else if (e.key === 'c' || e.key === 'C') {
        clearAllNotes();
      } else if (e.key === 'h' || e.key === 'H') {
        giveHint();
      } else if (selectedCell) {
        // Arrow navigation
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectCell(Math.max(0, selectedCell.row - 1), selectedCell.col);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectCell(Math.min(8, selectedCell.row + 1), selectedCell.col);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          selectCell(selectedCell.row, Math.max(0, selectedCell.col - 1));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          selectCell(selectedCell.row, Math.min(8, selectedCell.col + 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, selectedCell, applyNumber, showShortcutsModal, showMusicSlider, toggleAutoNoteMode, clearAllNotes, handleToggleMusicMute]);

  // Format time MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Count completions of each digit (1-9)
  const digitCounts = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r][c];
      const key = `${r},${c}`;
      if (val !== 0 && (initialBoard[r][c] !== 0 || correctCells.has(key))) {
        digitCounts[val]++;
      }
    }
  }

  // Level info
  const levelInfo = getLevelInfo(stats.xp);
  const circumference = 2 * Math.PI * 72;
  const progressRatio = levelInfo.xpToNext > 0 ? Math.min(1, levelInfo.xpIntoLevel / levelInfo.xpToNext) : 0;
  const dashOffset = circumference * (1 - progressRatio);

  const todayStr = getTodayStr();
  const isDailyDoneToday = dailyHistory[todayStr] === 'won';

  return (
    <div className="min-h-screen text-[#5B3B22] font-sans relative overflow-x-hidden" style={{ background: 'radial-gradient(1200px 600px at 15% -10%, #FFF1DC 0%, #FFF9F2 60%), #FFF9F2' }}>
      {/* Background Decorative Rings and Cat Paws */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <div className="absolute top-[8%] left-[2%] w-56 h-56 rounded-full border-[24px] border-[#E28C3C]/[0.06]" />
        <div className="absolute bottom-[10%] left-[5%] w-32 h-32 rounded-full bg-[#E28C3C]/[0.05]" />
        <div className="absolute top-[14%] right-[4%] w-44 h-44 rounded-full bg-[#E28C3C]/[0.05]" />
        <div className="absolute bottom-[14%] right-[5%] w-36 h-36 rounded-full border-[18px] border-[#E28C3C]/[0.07]" />
        {/* Cat Paw silhouettes */}
        <svg className="absolute top-[22%] left-[7%] w-16 h-16 -rotate-12 fill-[#E28C3C]/20" viewBox="0 0 24 24">
          <ellipse cx="12" cy="16" rx="6" ry="5" />
          <ellipse cx="4.5" cy="9.5" rx="2.6" ry="3.4" transform="rotate(-18 4.5 9.5)" />
          <ellipse cx="9.5" cy="5.5" rx="2.3" ry="3" transform="rotate(-6 9.5 5.5)" />
          <ellipse cx="14.5" cy="5.5" rx="2.3" ry="3" transform="rotate(6 14.5 5.5)" />
          <ellipse cx="19.5" cy="9.5" rx="2.6" ry="3.4" transform="rotate(18 19.5 9.5)" />
        </svg>
        <svg className="absolute top-[64%] right-[6%] w-14 h-14 rotate-12 fill-[#E28C3C]/20" viewBox="0 0 24 24">
          <ellipse cx="12" cy="16" rx="6" ry="5" />
          <ellipse cx="4.5" cy="9.5" rx="2.6" ry="3.4" transform="rotate(-18 4.5 9.5)" />
          <ellipse cx="9.5" cy="5.5" rx="2.3" ry="3" transform="rotate(-6 9.5 5.5)" />
          <ellipse cx="14.5" cy="5.5" rx="2.3" ry="3" transform="rotate(6 14.5 5.5)" />
          <ellipse cx="19.5" cy="9.5" rx="2.6" ry="3.4" transform="rotate(18 19.5 9.5)" />
        </svg>
      </div>

      {/* HEADER / TOP NAVIGATION */}
      <header className="relative z-20 max-w-6xl mx-auto px-4 pt-5 pb-3 flex items-center justify-between">
        <button
          onClick={() => {
            sound.playClick();
            setScreen('main');
          }}
          className="flex items-center gap-3 text-left group transition-transform active:scale-95"
        >
          <div className="w-12 h-12 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
            🐱
          </div>
          <div>
            <div className="font-baloo font-extrabold text-2xl md:text-3xl tracking-wide text-[#C2571A] leading-none">
              KOTOKU
            </div>
            <div className="text-[11px] font-bold tracking-[0.18em] text-[#B79A80]">
              SUDOKU WITH KITTENS
            </div>
          </div>
        </button>

        {/* Top Controls: Shortcuts, Sound Toggle & Mode Switch */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => {
              sound.playClick();
              setShowShortcutsModal(true);
            }}
            aria-label="Keyboard Shortcuts & Help"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#F3D9BC] shadow-xs text-[#C2571A] hover:bg-[#FEF4E7] transition-all active:scale-95 text-sm font-bold cursor-pointer"
            title="Keyboard Shortcuts Cheat Sheet (or press ?)"
          >
            <Keyboard className="w-4 h-4 text-[#C2571A]" />
            <span className="hidden sm:inline text-xs text-[#C2571A]">Shortcuts</span>
          </button>

          <button
            onClick={handleToggleMute}
            aria-label="Toggle Sound Effects"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#F3D9BC] shadow-xs text-[#C2571A] hover:bg-[#FEF4E7] transition-all active:scale-95 text-sm font-bold cursor-pointer"
            title={isMuted ? "Sound Effects Muted (Click to unmute)" : "Sound Effects On (Click to mute)"}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-[#A9866A]" />
                <span className="hidden sm:inline text-xs text-[#A9866A]">SFX Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-[#C2571A]" />
                <span className="hidden sm:inline text-xs text-[#C2571A]">SFX</span>
              </>
            )}
          </button>

          {/* Dedicated Music Control (Toggle + Volume Slider Popover) */}
          <div className="relative" ref={musicPopoverRef}>
            <div className="flex items-center bg-white border border-[#F3D9BC] rounded-xl shadow-xs p-0.5">
              <button
                onClick={handleToggleMusicMute}
                aria-label="Toggle Background Music"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold transition-all active:scale-95 cursor-pointer ${
                  isMusicMuted
                    ? 'text-[#A9866A] hover:bg-[#FFF8EE]'
                    : 'text-[#C2571A] hover:bg-[#FEF4E7] bg-[#FEF4E7]/70'
                }`}
                title={isMusicMuted ? "Music Muted (Click to play, or press M)" : "Music Playing (Click to mute, or press M)"}
              >
                <Music className={`w-4 h-4 ${!isMusicMuted ? 'text-[#C2571A]' : 'text-[#A9866A]'}`} />
                <span className="hidden sm:inline text-xs font-baloo">Music</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-black ${isMusicMuted ? 'bg-stone-100 text-stone-500' : 'bg-amber-100 text-[#C2571A]'}`}>
                  {isMusicMuted ? 'OFF' : `${Math.round(musicVolume * 100)}%`}
                </span>
              </button>

              <button
                onClick={() => setShowMusicSlider(prev => !prev)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  showMusicSlider ? 'bg-[#FEF4E7] text-[#C2571A]' : 'text-stone-400 hover:text-[#C2571A] hover:bg-[#FFF8EE]'
                }`}
                title="Adjust Music Volume"
                aria-label="Adjust Music Volume"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cozy Music Volume Popover */}
            {showMusicSlider && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-[#FFFDF9] border-2 border-[#F3D9BC] rounded-2xl p-4 shadow-xl shadow-[#C47A32]/20 w-64 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-[#F6E7D6]">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🐱🎶</span>
                    <span className="font-baloo font-bold text-sm text-[#5B3B22]">Cozy Lo-Fi Music</span>
                  </div>
                  <button
                    onClick={() => setShowMusicSlider(false)}
                    className="text-stone-400 hover:text-stone-700 p-1 rounded-md cursor-pointer"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="pt-3 pb-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8B6A4D] font-bold">Music Volume</span>
                    <span className="font-mono font-extrabold text-[#C2571A]">
                      {isMusicMuted ? 'Muted' : `${Math.round(musicVolume * 100)}%`}
                    </span>
                  </div>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={handleToggleMusicMute}
                      className="p-1.5 text-stone-500 hover:text-[#C2571A] rounded-lg transition-colors cursor-pointer"
                      title={isMusicMuted ? "Unmute" : "Mute"}
                    >
                      {isMusicMuted || musicVolume === 0 ? (
                        <VolumeX className="w-4 h-4 text-stone-400" />
                      ) : (
                        <Music className="w-4 h-4 text-[#C2571A]" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMusicMuted ? 0 : musicVolume}
                      onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
                      className="flex-1 accent-[#F0A02A] h-2 bg-[#F6E7D6] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Quick Volume Preset Chips */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    {[
                      { label: 'Soft 25%', val: 0.25 },
                      { label: 'Cozy 50%', val: 0.5 },
                      { label: 'Lively 80%', val: 0.8 }
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => handleMusicVolumeChange(preset.val)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          !isMusicMuted && Math.abs(musicVolume - preset.val) < 0.08
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : 'bg-white border border-[#F3D9BC] text-[#8B6A4D] hover:bg-[#FEF4E7]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-[#A9866A] italic leading-tight pt-1 border-t border-[#F6E7D6]">
                    Lo-Fi background track sits gently beneath sound effects for peaceful puzzle focus.
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => handleToggleCatMode()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 shadow-xs cursor-pointer ${
              catMode
                ? 'bg-[#FEF4E7] border-[#F0A02A] text-[#C2571A]'
                : 'bg-white border-[#F3D9BC] text-[#8B6A4D]'
            }`}
          >
            <span>{catMode ? '🐱 Cat Mode' : '🔢 1-9 Mode'}</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-4 md:py-6">
        {/* ────────────────────────────────────────────────────────── */}
        {/* 1. MAIN SCREEN */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'main' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Stats & Play CTAs */}
            <div className="lg:col-span-7 bg-white border border-[#F6E7D6] rounded-3xl p-6 md:p-8 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 pb-5 border-b border-[#F6E7D6]">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-white font-black text-lg">
                  Σ
                </div>
                <h2 className="font-baloo font-bold text-2xl text-[#5B3B22]">Overall Stats</h2>
              </div>

              {/* Progress Ring & Stats summary */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center py-6">
                {/* Level Ring with Level Up Moment celebration */}
                <div className="sm:col-span-5 flex justify-center">
                  <div className={`relative w-40 h-40 flex items-center justify-center transition-all ${isLevelingUp ? 'scale-105' : ''}`}>
                    {/* Sparkles around ring if leveling up */}
                    {isLevelingUp && (
                      <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                        <span className="absolute -top-3 left-4 text-xl animate-ping">✨</span>
                        <span className="absolute -bottom-3 right-4 text-xl animate-ping">⭐</span>
                        <span className="absolute top-6 -right-4 text-xl animate-bounce">🌟</span>
                        <span className="absolute bottom-6 -left-4 text-xl animate-bounce">✨</span>
                      </div>
                    )}

                    <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
                      <circle cx="80" cy="80" r="72" fill="none" stroke="#F6E7D6" strokeWidth="9" />
                      <circle
                        cx="80"
                        cy="80"
                        r="72"
                        fill="none"
                        stroke={isLevelingUp ? '#FFD700' : '#F0A02A'}
                        strokeWidth={isLevelingUp ? 12 : 9}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className={`transition-all duration-700 ease-out ${isLevelingUp ? 'animate-ring-flash' : ''}`}
                      />
                    </svg>

                    <div className={`absolute inset-0 flex flex-col items-center justify-center text-center p-2 ${isLevelingUp ? 'animate-level-up-text' : ''}`}>
                      <span className="text-3xl mb-1">{isLevelingUp ? '🌟' : '🐱'}</span>
                      <div className="font-baloo font-extrabold text-base text-[#5B3B22] leading-tight">
                        {levelInfo.rank}
                      </div>
                      <div className={`text-[11px] font-bold transition-all ${isLevelingUp ? 'text-[#C2571A] font-black scale-110' : 'text-[#B79A80]'}`}>
                        LEVEL {levelInfo.levelInRank}
                      </div>
                      <div className="text-[11px] font-semibold text-[#C2571A] mt-0.5">
                        {levelInfo.xpIntoLevel} / {levelInfo.xpToNext} 🐾
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats rows */}
                <div className="sm:col-span-7 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center bg-[#FEF6EC] rounded-2xl px-4 py-3">
                    <span className="text-sm font-semibold text-[#8B6A4D]">Total games played</span>
                    <span className="font-baloo font-extrabold text-lg text-[#5B3B22]">{stats.played}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#FEF6EC] rounded-2xl px-4 py-3">
                    <span className="text-sm font-semibold text-[#8B6A4D]">Wins</span>
                    <span className="font-baloo font-extrabold text-lg text-[#5B3B22]">{stats.wins}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#FEF6EC] rounded-2xl px-4 py-3">
                    <span className="text-sm font-semibold text-[#8B6A4D]">Wins without mistakes</span>
                    <span className="font-baloo font-extrabold text-lg text-[#5B3B22]">{stats.cleanWins}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#FEF6EC] rounded-2xl px-4 py-3">
                    <span className="text-sm font-semibold text-[#8B6A4D]">Best time</span>
                    <span className="font-baloo font-extrabold text-lg text-[#5B3B22]">
                      {stats.bestTime !== null ? formatTime(stats.bestTime) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Daily Challenge Banner with animated flame 🔥 & Milestone celebration */}
              <button
                onClick={() => {
                  sound.playClick();
                  if (isDailyDoneToday) {
                    setScreen('dailyCalendar');
                  } else {
                    startDailyChallenge();
                  }
                }}
                className={`mt-2 w-full flex items-center justify-between p-4 rounded-2xl bg-[#FEF4E7] border border-[#F3D9BC] hover:border-[#E8A96A] transition-all text-left group shadow-xs cursor-pointer active:scale-[0.99] relative overflow-hidden ${
                  activeMilestoneCelebration ? 'animate-milestone-glow border-[#F0A02A] ring-2 ring-amber-400' : ''
                }`}
              >
                {/* Milestone Sparkle burst celebration overlay */}
                {activeMilestoneCelebration && (
                  <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center bg-amber-400/10">
                    <span className="absolute top-2 left-6 text-xl animate-ping">✨</span>
                    <span className="absolute bottom-2 right-8 text-xl animate-ping">⭐</span>
                    <span className="absolute top-2 right-16 text-lg animate-bounce">🎉</span>
                  </div>
                )}

                <div className="flex items-center gap-3.5 relative z-10">
                  <div className="w-11 h-11 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-xl shadow-xs">
                    📅
                  </div>
                  <div>
                    <div className="font-baloo font-bold text-lg text-[#5B3B22] flex items-center gap-2">
                      <span>Daily Challenge</span>
                      {isDailyDoneToday && (
                        <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      )}
                      {activeMilestoneCelebration && (
                        <span className="text-xs bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                          🎉 {activeMilestoneCelebration}-Day Milestone!
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#C2571A] font-bold">
                      {isDailyDoneToday ? 'View calendar & streaks' : 'Medium sudoku · +50 XP today'}
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2 relative z-10">
                  <div className="flex items-center gap-1 text-sm font-bold text-[#C2571A]">
                    <span className="animate-flame text-lg">🔥</span>
                    <span>{dailyStreak} {dailyStreak === 1 ? 'day' : 'days'} streak</span>
                  </div>
                </div>
              </button>

              {/* Primary CTA: New Game */}
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => {
                    sound.playClick();
                    setScreen('difficulty');
                  }}
                  className="w-full py-4 rounded-2xl bg-linear-to-r from-[#F0A02A] to-[#D2691E] hover:from-[#E5921D] hover:to-[#C2571A] text-white font-baloo font-bold text-xl shadow-md shadow-[#D2691E]/25 transition-all transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Play New Game</span>
                  <span className="text-2xl">🐾</span>
                </button>
                <p className="text-xs text-[#B79A80] text-center font-medium">
                  Choose between Easy, Medium, Hard, and Expert difficulties
                </p>
              </div>
            </div>

            {/* Right Column: Achievements & Display Mode */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Achievements Card */}
              <div className="bg-white border border-[#F6E7D6] rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-white font-bold text-base">
                      ★
                    </div>
                    <h3 className="font-baloo font-bold text-xl text-[#5B3B22]">
                      Achievements
                    </h3>
                  </div>
                  <span className="font-baloo font-bold text-sm text-[#C2571A]">
                    {Object.values(unlockedAchievements).filter(Boolean).length} / {ACHIEVEMENT_DEFS.length}
                  </span>
                </div>
                <p className="text-xs text-[#B79A80] pb-4">
                  Unlock trophies as you solve puzzles without mistakes and set speed records!
                </p>

                <div className="grid grid-cols-5 gap-2.5">
                  {ACHIEVEMENT_DEFS.map(a => {
                    const isUnlocked = !!unlockedAchievements[a.id];
                    return (
                      <div
                        key={a.id}
                        title={`${a.titleKey} (+${a.reward} XP)`}
                        className={`aspect-square rounded-xl flex items-center justify-center text-xl transition-transform hover:scale-110 cursor-help ${
                          isUnlocked
                            ? 'bg-linear-to-br from-[#FFE9BE] to-[#FFD27A] shadow-xs ring-1 ring-[#F0A02A]/40'
                            : 'bg-[#FBEFE0] opacity-40 grayscale'
                        }`}
                      >
                        {a.icon}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Display Mode Card */}
              <div className="bg-white border border-[#F6E7D6] rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-3 pb-3">
                  <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-white font-bold text-base">
                    ⊞
                  </div>
                  <h3 className="font-baloo font-bold text-xl text-[#5B3B22]">
                    Display Mode
                  </h3>
                </div>
                <p className="text-xs text-[#B79A80] pb-4">
                  Play with cute kitten tokens or classic numbers 1–9.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleToggleCatMode(false)}
                    className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                      !catMode
                        ? 'bg-[#FFF8EE] border-2 border-[#F0A02A] shadow-xs'
                        : 'bg-white border-[#F3D9BC] hover:bg-[#FFFDF9]'
                    }`}
                  >
                    <div className="flex justify-center gap-1.5 pb-2 text-base font-baloo font-bold text-[#5B3B22]">
                      <span className="w-6 h-6 rounded bg-[#FFF8EE] border border-[#F0E4D4] flex items-center justify-center">1</span>
                      <span className="w-6 h-6 rounded bg-[#FFF8EE] border border-[#F0E4D4] flex items-center justify-center">2</span>
                      <span className="w-6 h-6 rounded bg-[#FFF8EE] border border-[#F0E4D4] flex items-center justify-center">3</span>
                    </div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Classic</div>
                    <div className="text-[11px] text-[#B79A80]">Digits 1–9</div>
                  </button>

                  <button
                    onClick={() => handleToggleCatMode(true)}
                    className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                      catMode
                        ? 'bg-[#FFF8EE] border-2 border-[#F0A02A] shadow-xs'
                        : 'bg-white border-[#F3D9BC] hover:bg-[#FFFDF9]'
                    }`}
                  >
                    <div className="text-xl pb-2">🐱 ⭐ 🐈</div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">CAT MODE</div>
                    <div className="text-[11px] text-[#B79A80]">Kitten tokens</div>
                  </button>
                </div>
              </div>

              {/* Keyboard Shortcuts & Help Card */}
              <button
                onClick={() => {
                  sound.playClick();
                  setShowShortcutsModal(true);
                }}
                className="w-full bg-white border border-[#F6E7D6] hover:border-[#F0A02A] rounded-3xl p-5 shadow-xs hover:shadow-md transition-all flex items-center justify-between group cursor-pointer text-left active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                    <Keyboard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-baloo font-bold text-base text-[#5B3B22] group-hover:text-[#C2571A] transition-colors flex items-center gap-2">
                      <span>Keyboard Shortcuts</span>
                      <span className="text-[10px] bg-[#FEF4E7] border border-[#F3D9BC] text-[#C2571A] px-2 py-0.5 rounded-full font-bold">
                        Help & Cheat Sheet
                      </span>
                    </div>
                    <div className="text-xs text-[#B79A80]">
                      1–9: Input · P: Pencil · H: Hint · Arrows: Move
                    </div>
                  </div>
                </div>
                <span className="w-8 h-8 rounded-xl bg-[#FEF4E7] border border-[#F3D9BC] flex items-center justify-center text-[#C2571A] font-bold text-sm group-hover:bg-[#FBE9D5] shadow-2xs">
                  ?
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* 2. DIFFICULTY SELECTION */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'difficulty' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 pb-6">
              <button
                onClick={() => {
                  sound.playClick();
                  setScreen('main');
                }}
                className="w-10 h-10 rounded-xl bg-[#FEF4E7] border border-[#F3D9BC] flex items-center justify-center text-[#C2571A] hover:bg-[#FBE9D5] transition-all cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="font-baloo font-extrabold text-3xl text-[#5B3B22]">Choose Difficulty</h2>
                <p className="text-sm text-[#B79A80]">Select a difficulty ball and enjoy solving with kittens</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Easy */}
              <button
                onClick={() => startGame('Лёгкий')}
                className="flex flex-col gap-3 p-6 rounded-3xl bg-[#F1F8EE] border border-[#E0EFE0] hover:border-[#5C9E6A] shadow-xs hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out text-left group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#5C9E6A] flex items-center justify-center text-3xl text-white shadow-xs group-hover:scale-105 transition-transform">
                    🧶
                  </div>
                  <div>
                    <h3 className="font-baloo font-extrabold text-2xl text-[#5B3B22]">Easy</h3>
                    <div className="flex gap-1 text-[#5C9E6A]">
                      <span>🐾</span>
                      <span className="opacity-25">🐾</span>
                      <span className="opacity-25">🐾</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#768F74] leading-relaxed">
                  41 starting hints · fill 40 cells. Minimum pressure, maximum purring, great for beginners!
                </p>
              </button>

              {/* Medium */}
              <button
                onClick={() => startGame('Средний')}
                className="flex flex-col gap-3 p-6 rounded-3xl bg-[#FFFAEC] border border-[#FCEECF] hover:border-[#D4900A] shadow-xs hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out text-left group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#D4900A] flex items-center justify-center text-3xl text-white shadow-xs group-hover:scale-105 transition-transform">
                    🧶
                  </div>
                  <div>
                    <h3 className="font-baloo font-extrabold text-2xl text-[#5B3B22]">Medium</h3>
                    <div className="flex gap-1 text-[#D4900A]">
                      <span>🐾</span>
                      <span>🐾</span>
                      <span className="opacity-25">🐾</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#A89059] leading-relaxed">
                  31 starting hints · fill 50 cells. Requires concentration and logical deduction.
                </p>
              </button>

              {/* Hard */}
              <button
                onClick={() => startGame('Сложный')}
                className="flex flex-col gap-3 p-6 rounded-3xl bg-[#FDF1EA] border border-[#F8DCB8] hover:border-[#C4622D] shadow-xs hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out text-left group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#C4622D] flex items-center justify-center text-3xl text-white shadow-xs group-hover:scale-105 transition-transform">
                    🧶
                  </div>
                  <div>
                    <h3 className="font-baloo font-extrabold text-2xl text-[#5B3B22]">Hard</h3>
                    <div className="flex gap-1 text-[#C4622D]">
                      <span>🐾</span>
                      <span>🐾</span>
                      <span>🐾</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#A66F56] leading-relaxed">
                  21 starting hints · fill 60 cells. For experienced number hunters seeking a rich challenge.
                </p>
              </button>

              {/* Expert */}
              <button
                onClick={() => startGame('Эксперт')}
                className="flex flex-col gap-3 p-6 rounded-3xl bg-[#F5F1EC] border border-[#E8DDD1] hover:border-[#5C3D1A] shadow-xs hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out text-left group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#5C3D1A] flex items-center justify-center text-3xl text-white shadow-xs group-hover:scale-105 transition-transform">
                    🧶
                  </div>
                  <div>
                    <h3 className="font-baloo font-extrabold text-2xl text-[#5B3B22]">Expert</h3>
                    <div className="flex gap-1 text-[#5C3D1A]">
                      <span>🐾</span>
                      <span>🐾</span>
                      <span>🐾</span>
                      <span>🐾</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#876F5E] leading-relaxed">
                  11 starting hints · fill 70 cells. The pinnacle test for true Sudoku masters.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* 3. DAILY CHALLENGE CALENDAR */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'dailyCalendar' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 pb-6">
              <button
                onClick={() => {
                  sound.playClick();
                  setScreen('main');
                }}
                className="w-10 h-10 rounded-xl bg-[#FEF4E7] border border-[#F3D9BC] flex items-center justify-center text-[#C2571A] hover:bg-[#FBE9D5] transition-all cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="font-baloo font-extrabold text-3xl text-[#5B3B22]">Daily Challenges</h2>
                <p className="text-sm text-[#B79A80]">One daily kitten puzzle every day — keep your streak alive!</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Calendar Card */}
              <div className="md:col-span-7 bg-white border border-[#F6E7D6] rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-[#F6E7D6]">
                  <button
                    onClick={() => {
                      sound.playClick();
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear(y => y - 1);
                      } else {
                        setCalMonth(m => m - 1);
                      }
                    }}
                    className="w-8 h-8 rounded-lg bg-[#FEF4E7] border border-[#F3D9BC] text-[#C2571A] font-bold flex items-center justify-center hover:bg-[#FBE9D5]"
                  >
                    ‹
                  </button>
                  <div className="font-baloo font-bold text-lg text-[#5B3B22]">
                    {new Date(calYear, calMonth).toLocaleString('en', { month: 'long', year: 'numeric' })}
                  </div>
                  <button
                    onClick={() => {
                      sound.playClick();
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear(y => y + 1);
                      } else {
                        setCalMonth(m => m + 1);
                      }
                    }}
                    className="w-8 h-8 rounded-lg bg-[#FEF4E7] border border-[#F3D9BC] text-[#C2571A] font-bold flex items-center justify-center hover:bg-[#FBE9D5]"
                  >
                    ›
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-2 pt-4 pb-2 text-center text-xs font-bold text-[#B79A80]">
                  {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(wd => (
                    <div key={wd}>{wd}</div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-2">
                  {(() => {
                    const firstDayIndex = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
                    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                    const cells = [];

                    for (let i = 0; i < firstDayIndex; i++) {
                      cells.push(<div key={`pad-${i}`} className="aspect-square" />);
                    }

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    for (let d = 1; d <= daysInMonth; d++) {
                      const curDate = new Date(calYear, calMonth, d);
                      const curDateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const status = dailyHistory[curDateStr];
                      const isToday = curDate.getTime() === today.getTime();

                      let bg = 'bg-[#FBEFE0] text-[#8B6A4D]';
                      if (status === 'won') {
                        bg = 'bg-[#F0A02A] text-white shadow-xs font-extrabold';
                      } else if (status === 'lost') {
                        bg = 'bg-[#E08A8A] text-white';
                      } else if (curDate > today) {
                        bg = 'bg-[#F7F1E8] text-[#D9C9AE]';
                      }

                      cells.push(
                        <div
                          key={d}
                          className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold ${bg} ${
                            isToday ? 'ring-2 ring-[#C2571A]' : ''
                          }`}
                        >
                          {d}
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>

                {/* Legend */}
                <div className="flex gap-4 pt-5 justify-center text-xs text-[#8B6A4D] font-medium border-t border-[#F6E7D6] mt-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#F0A02A]" />
                    <span>Done</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#E08A8A]" />
                    <span>Missed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#EADFCF]" />
                    <span>Upcoming</span>
                  </div>
                </div>
              </div>

              {/* Stats & Play CTA */}
              <div className="md:col-span-5 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border border-[#F6E7D6] rounded-2xl p-4 text-center shadow-xs">
                    <span className="text-xs text-[#B79A80] font-bold">Current Streak</span>
                    <div className="font-baloo font-extrabold text-2xl text-[#C2571A] mt-1 flex items-center justify-center gap-1">
                      <span className="animate-flame">🔥</span>
                      <span>{dailyStreak}</span>
                    </div>
                  </div>

                  <div className="bg-white border border-[#F6E7D6] rounded-2xl p-4 text-center shadow-xs">
                    <span className="text-xs text-[#B79A80] font-bold">Best Streak</span>
                    <div className="font-baloo font-extrabold text-2xl text-[#C2571A] mt-1 flex items-center justify-center gap-1">
                      <span>🏆</span>
                      <span>{dailyBestStreak}</span>
                    </div>
                  </div>
                </div>

                {/* 7 or 30 Day Streak Goal with milestone glow celebration */}
                <div className={`bg-[#FEF4E7] border border-[#F3D9BC] rounded-2xl p-5 shadow-xs relative overflow-hidden transition-all ${
                  activeMilestoneCelebration ? 'animate-milestone-glow border-[#F0A02A] ring-2 ring-amber-400' : ''
                }`}>
                  {/* Floating sparkles if milestone achieved */}
                  {activeMilestoneCelebration && (
                    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center bg-amber-400/10">
                      <span className="absolute top-2 left-6 text-xl animate-ping">✨</span>
                      <span className="absolute bottom-2 right-8 text-xl animate-ping">⭐</span>
                      <span className="absolute top-2 right-16 text-lg animate-bounce">🎉</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pb-2 relative z-10">
                    <span className="font-baloo font-bold text-base text-[#5B3B22]">
                      {dailyStreak >= 7 ? '30-Day Streak Goal' : '7-Day Streak Goal'}
                    </span>
                    <span className="font-baloo font-extrabold text-sm text-[#C2571A]">
                      {dailyStreak >= 7 ? '+500 XP' : '+150 XP'}
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[#F3D9BC] overflow-hidden relative z-10">
                    <div
                      className="h-full bg-linear-to-r from-[#F0A02A] to-[#D2691E] rounded-full transition-all"
                      style={{
                        width: dailyStreak >= 7
                          ? `${Math.min(100, Math.round((dailyStreak / 30) * 100))}%`
                          : `${Math.min(100, Math.round((dailyStreak / 7) * 100))}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-[#B08600] pt-2 relative z-10">
                    {activeMilestoneCelebration ? (
                      <span className="font-bold text-amber-700">🎉 Milestone reached! Reward claimed!</span>
                    ) : dailyStreak >= 7 ? (
                      `${Math.max(0, 30 - dailyStreak)} days left to claim your 30-day mega milestone!`
                    ) : (
                      `${Math.max(0, 7 - dailyStreak)} days left to claim your 7-day reward!`
                    )}
                  </p>
                </div>

                {!isDailyDoneToday ? (
                  <button
                    onClick={() => startDailyChallenge()}
                    className="w-full py-4 rounded-2xl bg-linear-to-r from-[#F0A02A] to-[#D2691E] hover:from-[#E5921D] hover:to-[#C2571A] text-white font-baloo font-bold text-lg shadow-md shadow-[#D2691E]/25 transition-all transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Play Today&apos;s Challenge</span>
                    <span className="animate-flame">🔥</span>
                  </button>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center text-emerald-800 text-sm font-bold flex items-center justify-center gap-2">
                    <Check className="w-5 h-5 text-emerald-600" />
                    <span>Today&apos;s challenge is already completed!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* 4. GAME SCREEN */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'game' && (
          <div className="max-w-5xl mx-auto">
            {/* Top Bar: Menu Back, Timer, Hearts, Difficulty */}
            <div className="flex items-center justify-between pb-4 gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    sound.playClick();
                    setScreen('main');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#FEF4E7] border border-[#F3D9BC] text-[#C2571A] font-baloo font-bold text-sm hover:bg-[#FBE9D5] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Menu</span>
                </button>
                <div className="bg-white border border-[#F6E7D6] px-3.5 py-2 rounded-xl text-xs font-bold text-[#A9866A]">
                  <span>Difficulty: </span>
                  <span className="text-[#C2571A]">{difficulty}</span>
                </div>
                <button
                  onClick={() => toggleAutoNoteMode()}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    autoNoteMode
                      ? 'bg-amber-100 text-[#C2571A] border-amber-300 ring-1 ring-amber-400'
                      : 'bg-white text-stone-500 border-[#F6E7D6] hover:bg-amber-50'
                  }`}
                  title="Toggle Auto-Note mode (Shortcut: N)"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${autoNoteMode ? 'text-amber-500' : 'text-stone-400'}`} />
                  <span>Auto-Notes: <strong className={autoNoteMode ? 'text-amber-700' : 'text-stone-600'}>{autoNoteMode ? 'ON' : 'OFF'}</strong></span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                {/* Timer Badge */}
                <div className="bg-linear-to-r from-[#F0A02A] to-[#D2691E] px-4 py-1.5 rounded-xl text-white flex items-center gap-2 shadow-xs">
                  <span className="text-[11px] font-bold tracking-wider opacity-90">TIME</span>
                  <span className="font-baloo font-extrabold text-xl leading-none">{formatTime(timer)}</span>
                </div>

                {/* Mistakes / Hearts */}
                <div className="bg-white border border-[#F6E7D6] px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                  <span className="text-xs font-bold text-[#A9866A] hidden sm:inline">Mistakes</span>
                  <div className="flex items-center gap-1 text-base">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className={`transition-all duration-300 ${
                          i < 3 - mistakes ? 'scale-100 opacity-100' : 'scale-75 opacity-30 grayscale'
                        }`}
                      >
                        💛
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Layout: Sudoku Grid + Controls Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 9x9 Sudoku Board */}
              <div className="lg:col-span-8 flex flex-col items-center">
                <div className="relative bg-white border-2 border-[#E8A96A] rounded-2xl md:rounded-3xl p-2.5 sm:p-3.5 shadow-md shadow-[#C47A32]/10 w-full max-w-[540px] aspect-square">
                  {/* Magical hint sparkle overlay if active */}
                  {hintSparklePos && (
                    <div
                      className="absolute z-30 pointer-events-none transition-all duration-300"
                      style={{
                        top: `${(hintSparklePos.row / 9) * 100}%`,
                        left: `${(hintSparklePos.col / 9) * 100}%`,
                        width: '11.11%',
                        height: '11.11%'
                      }}
                    >
                      <div className="w-full h-full flex items-center justify-center animate-ping">
                        <Sparkles className="w-6 h-6 text-amber-400 drop-shadow-md" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-9 grid-rows-9 w-full h-full">
                    {board.map((row, r) =>
                      row.map((val, c) => {
                        const key = `${r},${c}`;
                        const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                        const isInitial = initialBoard[r][c] !== 0;
                        const isSolved = correctCells.has(key);
                        const isError = errorCells.has(key);
                        const isRelated = selectedCell
                          ? r === selectedCell.row ||
                            c === selectedCell.col ||
                            (Math.floor(r / 3) === Math.floor(selectedCell.row / 3) &&
                              Math.floor(c / 3) === Math.floor(selectedCell.col / 3))
                          : false;

                        const isAnim = activeCellAnim?.row === r && activeCellAnim?.col === c;
                        const animType = isAnim ? activeCellAnim?.type : null;

                        const isConflictingCell = activeMistakePopup?.conflictingCells?.some(
                          cell => cell.row === r && cell.col === c
                        );

                        const cat = val ? CATS.find(ct => ct.num === val) : null;
                        const hasNotes = val === 0 && notes[r][c].size > 0;

                        // Borders for 3x3 boxes
                        const borderTop = r % 3 === 0 ? 'border-t-2 border-t-[#E8A96A]' : 'border-t border-t-[#F2E1CD]';
                        const borderLeft = c % 3 === 0 ? 'border-l-2 border-l-[#E8A96A]' : 'border-l border-l-[#F2E1CD]';
                        const borderRight = c === 8 ? 'border-r-2 border-r-[#E8A96A]' : '';
                        const borderBottom = r === 8 ? 'border-b-2 border-b-[#E8A96A]' : '';

                        // Color handling with animations & mistake conflicts
                        let bgClass = 'bg-[#FFFCF7]';
                        if (isConflictingCell) {
                          bgClass = 'bg-amber-100 ring-2 ring-amber-500 ring-inset shadow-xs font-black';
                        } else if (animType === 'wrong' || isError) {
                          bgClass = 'bg-red-200 text-red-800 ring-2 ring-red-500/80';
                        } else if (animType === 'correct') {
                          bgClass = 'bg-amber-100 ring-2 ring-amber-400';
                        } else if (animType === 'hint') {
                          bgClass = 'bg-amber-200 ring-2 ring-amber-500 animate-cell-hint';
                        } else if (catMode && cat && val !== 0) {
                          bgClass = ''; // using cat inline style
                        } else if (isSelected) {
                          bgClass = 'bg-[#FBE0BC] ring-2 ring-[#F0A02A] ring-inset';
                        } else if (isRelated) {
                          bgClass = 'bg-[#FFF6EA] ring-1 ring-[#F0A02A]/30 ring-inset';
                        }

                        // Text color
                        let textClass = isInitial ? 'text-[#5B3B22] font-black' : 'text-[#D2691E] font-extrabold';
                        if (catMode && cat) {
                          textClass = '';
                        }

                        // Animation class
                        let animClass = '';
                        if (animType === 'wrong') animClass = 'animate-cell-shake';
                        if (animType === 'correct') animClass = 'animate-cell-correct';
                        if (animType === 'hint') animClass = 'animate-cell-hint';
                        if (isConflictingCell) animClass = 'animate-pulse';

                        return (
                          <button
                            key={key}
                            onClick={() => selectCell(r, c)}
                            style={{
                              backgroundColor: catMode && cat && !isError && !isConflictingCell && animType !== 'correct' && animType !== 'wrong' && animType !== 'hint' ? cat.bg : undefined,
                              color: catMode && cat ? cat.fg : undefined
                            }}
                            className={`relative w-full h-full flex items-center justify-center p-0 transition-all select-none cursor-pointer ${borderTop} ${borderLeft} ${borderRight} ${borderBottom} ${bgClass} ${textClass} ${animClass}`}
                            title={isError ? "Mistake cell — click to see why it's incorrect!" : undefined}
                          >
                            {/* Conflicting cell warning badge */}
                            {isConflictingCell && (
                              <span className="absolute -top-1 -right-1 z-20 bg-amber-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-black shadow-xs">
                                ⚠️
                              </span>
                            )}

                            {/* Small Oops icon badge on error cells */}
                            {isError && !isConflictingCell && (
                              <span className="absolute top-0.5 right-0.5 z-10 text-[10px] leading-none opacity-80" title="Click for explanation">
                                ❓
                              </span>
                            )}

                            {/* Notes candidates display */}
                            {hasNotes ? (
                              <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-0.5 pointer-events-none">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                  <div
                                    key={n}
                                    className="flex items-center justify-center text-[9px] md:text-[11px] font-bold text-[#B08600] leading-none"
                                  >
                                    {notes[r][c].has(n) ? n : ''}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span
                                style={{ animationDelay: modeTransitioning ? `${(r + c) * 16}ms` : undefined }}
                                className={`font-baloo text-base sm:text-xl md:text-2xl leading-none inline-block ${
                                  modeTransitioning ? 'animate-cat-flip' : ''
                                }`}
                              >
                                {val !== 0 ? (catMode && cat ? cat.glyph : val) : ''}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 'Oops' Kitten Learning Pop-up Card */}
                {activeMistakePopup && (
                  <div className="mt-3.5 w-full max-w-[540px] bg-linear-to-r from-[#FFF9F0] to-[#FFF4E5] border-2 border-[#F3D9BC] rounded-3xl p-4 shadow-lg shadow-[#C47A32]/10 flex flex-col sm:flex-row items-center sm:items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-300 relative z-20">
                    <div className="relative shrink-0">
                      <img
                        src={OOPS_KITTEN_IMG}
                        alt="Oops Kitten Sticker"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-2xl bg-white p-1 border border-[#F3D9BC] shadow-xs"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                        Oops!
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
                          <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                            Learning Helper 🐾
                          </span>
                          <h4 className="font-baloo font-bold text-base sm:text-lg text-[#5B3B22] leading-tight">
                            {activeMistakePopup.title}
                          </h4>
                        </div>
                        <button
                          onClick={() => setActiveMistakePopup(null)}
                          className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-200/50 transition-colors cursor-pointer"
                          title="Dismiss explanation"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs sm:text-sm text-[#8B6A4D] font-medium leading-relaxed mt-1.5">
                        {activeMistakePopup.detail}
                      </p>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap justify-center sm:justify-start">
                        <button
                          onClick={() => {
                            sound.playClick();
                            applyNumber(0);
                            setActiveMistakePopup(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <span>🧹 Erase Mistake</span>
                        </button>

                        <button
                          onClick={() => {
                            giveHint();
                            setActiveMistakePopup(null);
                          }}
                          disabled={hints <= 0}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-[#B08600] border border-[#F3D9BC] text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span>Solve with Hint ({hints})</span>
                        </button>

                        <button
                          onClick={() => setActiveMistakePopup(null)}
                          className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-800 font-bold ml-auto cursor-pointer"
                        >
                          Got it! 🐱
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls Panel */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* 1-9 Number Input Grid + ✕ Erase */}
                <div className="bg-white border border-[#F6E7D6] rounded-3xl p-4 sm:p-5 shadow-xs">
                  <div className="grid grid-cols-5 sm:grid-cols-5 lg:grid-cols-3 gap-2 sm:gap-2.5">
                    {CATS.map((cat, idx) => {
                      const num = idx + 1;
                      const isCompleted = digitCounts[num] >= 9;

                      return (
                        <button
                          key={num}
                          disabled={isCompleted}
                          onClick={() => applyNumber(num)}
                          style={{
                            backgroundColor: catMode ? cat.bg : (isCompleted ? '#F2ECE3' : '#FFF8EE'),
                            color: catMode ? cat.fg : (isCompleted ? '#C7B9A8' : '#C2571A')
                          }}
                          className={`py-3.5 rounded-2xl border font-baloo font-extrabold text-xl md:text-2xl flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs ${
                            isCompleted
                              ? 'border-[#EAE0D2] opacity-40 cursor-default'
                              : 'border-[#F3D9BC] hover:border-[#E8A96A] hover:shadow-xs'
                          }`}
                        >
                          <span>{catMode ? cat.glyph : num}</span>
                        </button>
                      );
                    })}

                    {/* Erase button */}
                    <button
                      onClick={() => applyNumber(0)}
                      className="py-3.5 rounded-2xl border border-[#F3D9BC] bg-[#FFE0B2] text-[#C2571A] font-baloo font-extrabold text-xl md:text-2xl flex items-center justify-center hover:bg-[#FFD699] transition-all cursor-pointer active:scale-95 shadow-2xs"
                      title="Erase cell (Backspace/Delete)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Special Action Buttons: Hint, Pencil, Auto-Notes, Clear Notes */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Hint Button */}
                  <button
                    onClick={giveHint}
                    disabled={hints <= 0}
                    className={`p-3 rounded-2xl border font-baloo font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-2xs ${
                      hints > 0
                        ? 'bg-[#FFF2C2] text-[#B08600] border-[#F3D9BC] hover:bg-[#FFEAA6]'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                    }`}
                    title="Magical Hint (Shortcut: H)"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span>Hint ({hints})</span>
                  </button>

                  {/* Pencil Toggle Button */}
                  <button
                    onClick={() => {
                      sound.playPencil();
                      setPencilMode(prev => !prev);
                    }}
                    className={`p-3 rounded-2xl border font-baloo font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-2xs ${
                      pencilMode
                        ? 'bg-[#E8D5C4] text-[#8B4513] border-[#C2571A] ring-2 ring-[#C2571A]'
                        : 'bg-[#FFF8EE] text-[#C2571A] border-[#F3D9BC] hover:bg-[#FEF0DD]'
                    }`}
                    title="Toggle manual Pencil notes (Shortcut: P)"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>{pencilMode ? 'Notes ON' : 'Pencil'}</span>
                  </button>

                  {/* Auto-Notes Toggle Button */}
                  <button
                    onClick={() => toggleAutoNoteMode()}
                    className={`p-3 rounded-2xl border font-baloo font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-2xs ${
                      autoNoteMode
                        ? 'bg-linear-to-r from-amber-100 to-orange-100 text-[#C2571A] border-[#F0A02A] ring-2 ring-[#F0A02A]/60 shadow-xs'
                        : 'bg-[#FFF8EE] text-[#8B6A4D] border-[#F3D9BC] hover:bg-[#FEF0DD]'
                    }`}
                    title="Toggle Auto-Note mode (Shortcut: N) — auto-fills & cleans valid candidates"
                  >
                    <Sparkles className={`w-4 h-4 ${autoNoteMode ? 'text-amber-500' : 'text-[#8B6A4D]'}`} />
                    <span>{autoNoteMode ? 'Auto-Notes ON' : 'Auto-Notes'}</span>
                  </button>

                  {/* Clear / Fill Notes Action */}
                  <button
                    onClick={() => {
                      if (autoNoteMode) {
                        clearAllNotes();
                      } else {
                        autoFillAllNotes();
                      }
                    }}
                    className="p-3 rounded-2xl bg-[#FFF8EE] hover:bg-[#FEF0DD] text-[#8B6A4D] border border-[#F3D9BC] font-baloo font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-2xs"
                    title={autoNoteMode ? 'Clear all notes from board (Shortcut: C)' : 'Auto-fill all candidate notes'}
                  >
                    {autoNoteMode ? (
                      <>
                        <Trash2 className="w-4 h-4 text-stone-500" />
                        <span>Clear Notes</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 text-amber-500" />
                        <span>Fill Notes</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Free Hint / Reward Option */}
                <button
                  onClick={() => {
                    sound.playClick();
                    setHints(h => h + 1);
                    sound.playHint();
                  }}
                  className="p-3 rounded-2xl bg-[#E8F4EA] border border-[#CDE8D1] text-[#3D7248] font-baloo font-bold text-sm hover:bg-[#DDF0E0] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-[#3D7248]" />
                  <span>Get Free Bonus Hint (+1 💡)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* 5. VICTORY SCREEN */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'win' && (
          <div className="relative z-30 max-w-lg mx-auto py-8">
            <ConfettiOverlay />

            <div className="bg-white border-2 border-[#F3D9BC] rounded-3xl p-8 text-center shadow-2xl shadow-[#C47A32]/25 animate-win-card relative z-40">
              {/* Joyful cat face & sticker */}
              <div className="relative mx-auto w-28 h-28 mb-3">
                <img
                  src={CONFETTI_PAWS_IMG}
                  alt="Celebration Paws"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-2xl shadow-sm"
                />
              </div>

              <h2 className="font-baloo font-extrabold text-3xl md:text-4xl text-[#C2571A]">
                Purrfectly Solved!
              </h2>
              <p className="text-sm text-[#A9866A] mt-1">
                The kitten is happily purring — awesome puzzle mastery!
              </p>

              {/* Match stats */}
              <div className="grid grid-cols-3 gap-3 my-6">
                <div className="bg-[#FEF4E7] rounded-2xl p-3 border border-[#F6E7D6]">
                  <div className="text-[11px] font-bold text-[#A9866A] uppercase">Time</div>
                  <div className="font-baloo font-extrabold text-xl text-[#C2571A] mt-0.5">
                    {formatTime(timer)}
                  </div>
                </div>

                <div className="bg-[#FEF4E7] rounded-2xl p-3 border border-[#F6E7D6]">
                  <div className="text-[11px] font-bold text-[#A9866A] uppercase">Mistakes</div>
                  <div className="font-baloo font-extrabold text-xl text-[#C2571A] mt-0.5">
                    {mistakes} / 3
                  </div>
                </div>

                <div className="bg-[#FEF4E7] rounded-2xl p-3 border border-[#F6E7D6]">
                  <div className="text-[11px] font-bold text-[#A9866A] uppercase">Hints</div>
                  <div className="font-baloo font-extrabold text-xl text-[#C2571A] mt-0.5">
                    {usedHints}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    sound.playClick();
                    startGame(difficulty);
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-linear-to-r from-[#F0A02A] to-[#D2691E] text-white font-baloo font-bold text-lg hover:from-[#E5921D] hover:to-[#C2571A] transition-all shadow-md cursor-pointer active:scale-98"
                >
                  Play Again
                </button>
                <button
                  onClick={() => {
                    sound.playClick();
                    setScreen('main');
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-[#F3D9BC] text-[#C2571A] font-baloo font-bold text-lg hover:bg-[#FEF4E7] transition-all cursor-pointer active:scale-98"
                >
                  Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* 6. LOSS SCREEN */}
        {/* ────────────────────────────────────────────────────────── */}
        {screen === 'lose' && (
          <div className="max-w-md mx-auto py-10">
            <div className="bg-white border-2 border-[#F6D0D0] rounded-3xl p-8 text-center shadow-xl shadow-red-900/10">
              <div className="w-24 h-24 mx-auto rounded-full bg-red-100 flex items-center justify-center text-5xl mb-4 shadow-inner">
                😿
              </div>
              <h2 className="font-baloo font-extrabold text-3xl text-red-600">
                The Kitten is Sad
              </h2>
              <p className="text-sm text-[#A9866A] mt-1 mb-6">
                You made 3 mistakes, but kittens never give up!
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    sound.playClick();
                    startGame(difficulty);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-linear-to-r from-[#F0A02A] to-[#D2691E] text-white font-baloo font-bold text-lg hover:from-[#E5921D] hover:to-[#C2571A] transition-all shadow-md cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>Try Again</span>
                </button>
                <button
                  onClick={() => {
                    sound.playClick();
                    setScreen('main');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-white border-2 border-[#F3D9BC] text-[#C2571A] font-baloo font-bold text-lg hover:bg-[#FEF4E7] transition-all cursor-pointer active:scale-98"
                >
                  Return to Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Visual Cheat Sheet / Shortcuts Modal */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            sound.playClick();
            setShowShortcutsModal(false);
          }}
        >
          <div
            className="bg-white border-2 border-[#F3D9BC] rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl shadow-[#C47A32]/25 relative animate-in zoom-in-95 duration-200 text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#F6E7D6]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] flex items-center justify-center text-white shadow-xs">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-baloo font-bold text-xl text-[#5B3B22]">
                    Keyboard Shortcuts Cheat Sheet
                  </h3>
                  <p className="text-xs text-[#B79A80]">
                    Speed up your kitten solving with quick keyboard controls
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowShortcutsModal(false);
                }}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-xl hover:bg-[#FEF4E7] transition-all cursor-pointer"
                title="Close cheat sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Shortcuts List */}
            <div className="py-4 flex flex-col gap-2.5">
              {/* 1-9 Input */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🐱</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Input Kitten / Number</div>
                    <div className="text-[11px] text-[#8B6A4D]">Places selected digit into active cell</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2.5 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">1</kbd>
                  <span className="text-xs text-stone-400 font-bold">–</span>
                  <kbd className="px-2.5 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">9</kbd>
                </div>
              </div>

              {/* P: Pencil */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">✏️</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Pencil / Notes Mode</div>
                    <div className="text-[11px] text-[#8B6A4D]">Toggle manual note candidate marks on & off</div>
                  </div>
                </div>
                <kbd className="px-3 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">P</kbd>
              </div>

              {/* N: Auto-Notes */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">✨</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Auto-Note Mode</div>
                    <div className="text-[11px] text-[#8B6A4D]">Automatically fills & updates valid candidate notes</div>
                  </div>
                </div>
                <kbd className="px-3 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">N</kbd>
              </div>

              {/* C: Clear Notes */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🗑️</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Clear Candidate Notes</div>
                    <div className="text-[11px] text-[#8B6A4D]">Erases all pencil candidate marks on the board</div>
                  </div>
                </div>
                <kbd className="px-3 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">C</kbd>
              </div>

              {/* M: Background Music */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎵</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Background Music</div>
                    <div className="text-[11px] text-[#8B6A4D]">Toggle cozy lo-fi background music track on & off</div>
                  </div>
                </div>
                <kbd className="px-3 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">M</kbd>
              </div>

              {/* H: Hint */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Magical Hint</div>
                    <div className="text-[11px] text-[#8B6A4D]">Reveals correct kitten for active or random empty cell</div>
                  </div>
                </div>
                <kbd className="px-3 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">H</kbd>
              </div>

              {/* Arrow Keys: Movement */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🧭</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Arrow Keys Movement</div>
                    <div className="text-[11px] text-[#8B6A4D]">Move cell selection across the 9×9 grid</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">↑</kbd>
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">↓</kbd>
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">←</kbd>
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">→</kbd>
                </div>
              </div>

              {/* Backspace / Delete / 0: Erase */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF8EE] border border-[#F6E7D6]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🧹</span>
                  <div>
                    <div className="font-baloo font-bold text-sm text-[#5B3B22]">Erase / Clear Cell</div>
                    <div className="text-[11px] text-[#8B6A4D]">Clears the number or candidate notes</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 text-[11px] font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">Backspace</kbd>
                  <span className="text-xs text-stone-400 font-bold">or</span>
                  <kbd className="px-2 py-1 text-[11px] font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">Del</kbd>
                  <span className="text-xs text-stone-400 font-bold">or</span>
                  <kbd className="px-2 py-1 text-[11px] font-mono font-bold bg-white border border-[#E8A96A] text-[#C2571A] rounded-lg shadow-xs">0</kbd>
                </div>
              </div>
            </div>

            {/* Footer tips */}
            <div className="pt-3.5 border-t border-[#F6E7D6] flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-[#B79A80]">
                Pro-tip: Press <kbd className="font-mono font-bold text-[#C2571A] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">?</kbd> at any time to toggle this cheat sheet!
              </span>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowShortcutsModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-linear-to-r from-[#F0A02A] to-[#D2691E] hover:from-[#E5921D] hover:to-[#C2571A] text-white text-xs font-baloo font-bold shadow-xs cursor-pointer active:scale-95"
              >
                Got it! 🐾
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 2. Achievement Unlock Toast Notification */}
      {activeToast && (
        <div
          className="fixed top-5 right-5 z-50 max-w-sm w-full bg-linear-to-r from-[#FFFDF9] to-[#FFF6EA] border-2 border-[#F3D9BC] hover:border-[#F0A02A] rounded-2xl p-4 shadow-xl shadow-[#C47A32]/20 animate-toast-enter flex items-center gap-3.5 cursor-pointer transition-all"
          onClick={() => setActiveToast(null)}
          title="Click to dismiss"
        >
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-[#FFE9BE] to-[#FFD27A] border border-[#F0A02A]/50 flex items-center justify-center text-2xl shadow-xs shrink-0">
            {activeToast.icon}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#C2571A] tracking-wider uppercase">
              <span>Achievement Unlocked!</span>
              <span>🐾</span>
            </div>
            <div className="font-baloo font-bold text-sm sm:text-base text-[#5B3B22] truncate leading-snug">
              {activeToast.titleKey}
            </div>
            <div className="text-[11px] text-[#B08600] font-bold">
              +{activeToast.reward} XP Earned
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveToast(null);
            }}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Daily Challenge Streak Milestone Notification */}
      {activeMilestoneCelebration && (
        <div
          className="fixed top-20 right-5 z-40 max-w-sm w-full bg-linear-to-r from-[#FFF8EE] to-[#FEF3E2] border-2 border-[#F0A02A] rounded-2xl p-4 shadow-xl shadow-amber-900/15 animate-toast-enter flex items-center gap-3.5"
          onClick={() => setActiveMilestoneCelebration(null)}
        >
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-[#F7A93B] to-[#E8801E] text-white flex items-center justify-center text-2xl shadow-xs shrink-0">
            🎉
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#C2571A] uppercase tracking-wider">
              <span>Milestone Reached!</span>
              <span>🔥</span>
            </div>
            <div className="font-baloo font-extrabold text-base text-[#5B3B22]">
              {activeMilestoneCelebration}-Day Streak Master!
            </div>
            <div className="text-xs text-[#B08600] font-bold">
              +{activeMilestoneCelebration === 7 ? '150' : '500'} Bonus XP Awarded 🐾
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMilestoneCelebration(null);
            }}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
