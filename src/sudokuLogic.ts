// ════════════════════════════════════════════════════════════════════════════════
// KOTOKU SUDOKU GAME LOGIC & DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════════

export interface CatDef {
  num: number;
  glyph: string;
  bg: string;
  fg: string;
  name: string;
}

export const CATS: CatDef[] = [
  { num: 1, glyph: "🐱", bg: "#FFE0B2", fg: "#C2571A", name: "Ginger Kitten" },
  { num: 2, glyph: "🐈", bg: "#FFD6D6", fg: "#C2571A", name: "Playful Cat" },
  { num: 3, glyph: "🥛", bg: "#D9EBFF", fg: "#2F6DA8", name: "Warm Milk" },
  { num: 4, glyph: "🍲", bg: "#E3F5DC", fg: "#4A7A38", name: "Fish Bowl" },
  { num: 5, glyph: "🧶", bg: "#FFF2C2", fg: "#B08600", name: "Yarn Ball" },
  { num: 6, glyph: "😸", bg: "#EDE1FA", fg: "#6B4AA0", name: "Grinning Kitty" },
  { num: 7, glyph: "🐾", bg: "#FFDCEB", fg: "#B03B6B", name: "Cat Paws" },
  { num: 8, glyph: "😻", bg: "#DCF3F0", fg: "#2F7F76", name: "Loving Kitten" },
  { num: 9, glyph: "🎀", bg: "#F0E4D4", fg: "#8B5A3C", name: "Cute Ribbon" }
];

export type Difficulty = "Лёгкий" | "Средний" | "Сложный" | "Эксперт";

export const DIFFICULTY_CELLS_TO_REMOVE: Record<Difficulty, number> = {
  "Лёгкий": 40,
  "Средний": 50,
  "Сложный": 60,
  "Эксперт": 70
};

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  "Лёгкий": 20,
  "Средний": 40,
  "Сложный": 70,
  "Эксперт": 120
};

export function isValidPlacement(b: number[][], r: number, c: number, n: number): boolean {
  for (let x = 0; x < 9; x++) {
    if (b[r][x] === n || b[x][c] === n) return false;
  }
  const sr = Math.floor(r / 3) * 3, sc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (b[sr + i][sc + j] === n) return false;
    }
  }
  return true;
}

export function shuffleArray<T>(arr: T[], rng?: () => number): T[] {
  const rand = rng || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function generateSolvedBoard(rng?: () => number): number[][] {
  const b = Array(9).fill(null).map(() => Array(9).fill(0));

  function fillBoard(row: number, col: number): boolean {
    if (row === 9) return true;
    const nextRow = col === 8 ? row + 1 : row;
    const nextCol = col === 8 ? 0 : col + 1;

    for (const n of shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (isValidPlacement(b, row, col, n)) {
        b[row][col] = n;
        if (fillBoard(nextRow, nextCol)) return true;
        b[row][col] = 0;
      }
    }
    return false;
  }

  fillBoard(0, 0);
  return b;
}

export function createPuzzle(cellsToRemove: number, rng?: () => number): { solution: number[][]; initialBoard: number[][] } {
  const solution = generateSolvedBoard(rng);
  const initialBoard = solution.map(r => r.slice());

  const positions = shuffleArray(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9]),
    rng
  );

  for (let i = 0; i < cellsToRemove; i++) {
    const [r, c] = positions[i];
    initialBoard[r][c] = 0;
  }

  return { solution, initialBoard };
}

export interface AchievementDef {
  id: string;
  icon: string;
  titleKey: string;
  reward: number;
  condition: (data: GameStats) => boolean;
}

export interface GameStats {
  played: number;
  wins: number;
  cleanWins: number;
  bestTime: number | null;
  xp: number;
  winStreak: number;
  noHintWins: number;
  fastWin: boolean;
  mediumFastWin: boolean;
  easyWins: number;
  mediumWins: number;
  hardWins: number;
  expertWins: number;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first_win", icon: "🏆", titleKey: "First Win — solve your first puzzle", reward: 25, condition: d => d.wins >= 1 },
  { id: "perfect_game", icon: "🎯", titleKey: "Perfect Game — win without a single mistake", reward: 50, condition: d => d.cleanWins >= 1 },
  { id: "no_hints", icon: "💪", titleKey: "No Hints — win without using hints", reward: 40, condition: d => d.noHintWins >= 1 },
  { id: "speed_runner", icon: "⚡", titleKey: "Speed Runner — win an Easy puzzle in under 5 minutes", reward: 60, condition: d => d.fastWin },
  { id: "win_streak_3", icon: "🔥", titleKey: "On Fire — win 3 games in a row", reward: 75, condition: d => d.winStreak >= 3 },
  { id: "all_difficulties", icon: "🌟", titleKey: "Master of All Levels — win at every difficulty", reward: 100, condition: d => d.easyWins >= 1 && d.mediumWins >= 1 && d.hardWins >= 1 && d.expertWins >= 1 },
  { id: "veteran_10", icon: "🎮", titleKey: "Veteran — win 10 games", reward: 50, condition: d => d.wins >= 10 },
  { id: "veteran_25", icon: "🎖️", titleKey: "Seasoned Player — win 25 games", reward: 100, condition: d => d.wins >= 25 },
  { id: "legend_50", icon: "👑", titleKey: "Legend — win 50 games", reward: 200, condition: d => d.wins >= 50 },
  { id: "expert_master", icon: "💎", titleKey: "Expert Conqueror — win 5 times on Expert", reward: 150, condition: d => d.expertWins >= 5 },
  { id: "perfect_streak", icon: "✨", titleKey: "Flawless — win 5 games without mistakes", reward: 125, condition: d => d.cleanWins >= 5 },
  { id: "time_master", icon: "⏱️", titleKey: "Time Master — win a Medium puzzle in under 8 minutes", reward: 80, condition: d => d.mediumFastWin },
  { id: "wins_100", icon: "💯", titleKey: "Century — win 100 games", reward: 300, condition: d => d.wins >= 100 },
  { id: "wins_250", icon: "🏅", titleKey: "Marathoner — win 250 games", reward: 600, condition: d => d.wins >= 250 },
  { id: "wins_500", icon: "🎰", titleKey: "Unstoppable — win 500 games", reward: 1200, condition: d => d.wins >= 500 },
  { id: "expert_25", icon: "🦁", titleKey: "Peak Conqueror — win 25 times on Expert", reward: 400, condition: d => d.expertWins >= 25 },
  { id: "expert_50", icon: "👹", titleKey: "Kotoku Legend — win 50 times on Expert", reward: 800, condition: d => d.expertWins >= 50 },
  { id: "xp_10000", icon: "⭐", titleKey: "Seasoned Kitty — earn 10,000 XP", reward: 500, condition: d => d.xp >= 10000 },
  { id: "xp_50000", icon: "🌙", titleKey: "Stellar Path — earn 50,000 XP", reward: 2000, condition: d => d.xp >= 50000 },
  { id: "perfect_20", icon: "🪄", titleKey: "Flawless Master — win 20 games without a single mistake", reward: 350, condition: d => d.cleanWins >= 20 }
];

export const RANK_KEYS = [
  { rank: "Newbie", levels: 5, baseXp: 50, growth: 25 },
  { rank: "Amateur", levels: 8, baseXp: 80, growth: 40 },
  { rank: "Connoisseur", levels: 10, baseXp: 120, growth: 60 },
  { rank: "Professional", levels: 12, baseXp: 180, growth: 90 },
  { rank: "Master", levels: 15, baseXp: 250, growth: 125 },
  { rank: "Grandmaster", levels: 20, baseXp: 350, growth: 175 },
  { rank: "Legend", levels: Infinity, baseXp: 500, growth: 250 }
];

export function getLevelInfo(xp: number) {
  let totalLevel = 1;
  let xpRequired = 0;

  for (const rank of RANK_KEYS) {
    const count = isFinite(rank.levels) ? rank.levels : 200;
    for (let i = 0; i < count; i++) {
      const xpToNext = rank.baseXp + i * rank.growth;
      if (xp < xpRequired + xpToNext) {
        return {
          rank: rank.rank,
          levelInRank: i + 1,
          totalLevel,
          xpIntoLevel: xp - xpRequired,
          xpToNext
        };
      }
      xpRequired += xpToNext;
      totalLevel++;
    }
  }

  const lastRank = RANK_KEYS[RANK_KEYS.length - 1];
  return { rank: lastRank.rank, levelInRank: 1, totalLevel, xpIntoLevel: 0, xpToNext: lastRank.baseXp };
}
