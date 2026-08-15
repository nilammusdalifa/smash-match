import { TournamentSession, Player, GameRules, MatchmakingType } from '../types/badminton';
import { generateSchedule, initializeCourts } from './scheduler';

const STORAGE_KEY = 'smashmatch_sessions_v1';
const ACTIVE_SESSION_KEY = 'smashmatch_active_session_id';

export const DEFAULT_RULES: GameRules = {
  pointsToWin: 30,
  winByTwo: true,
  maxPointsCap: 30,
  numberOfSets: 1,
  suddenDeathAtCap: true,
  changeEndsAtScore: 15,
};

export const DEFAULT_8_PLAYERS: Player[] = [
  { id: 'p1', name: 'Raden', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p2', name: 'Nilam', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p3', name: 'Fahmi', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p4', name: 'Eric', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p5', name: 'Novi', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p6', name: 'Bernard', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p7', name: 'Marvin', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
  { id: 'p8', name: 'Player 8', initialRating: 1200, currentRating: 1200, skillLevel: 'Intermediate', active: true },
];

/**
 * Creates a brand new tournament session
 */
export function createNewSession(
  name: string = 'Friday Night Social Doubles',
  players: Player[] = DEFAULT_8_PLAYERS,
  courtCount: number = 1,
  rules: GameRules = DEFAULT_RULES,
  matchmakingType: MatchmakingType = 'rotating_doubles'
): TournamentSession {
  const courts = initializeCourts(courtCount);
  const { matches, totalRounds } = generateSchedule(matchmakingType, players, courtCount, rules);

  const newSession: TournamentSession = {
    id: 'session_' + Date.now(),
    name,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now(),
    courtCount,
    courts,
    players: [...players],
    matchmakingType,
    rules,
    matches,
    currentRound: 1,
    totalRounds,
    isCompleted: false,
  };

  saveSession(newSession);
  setActiveSessionId(newSession.id);
  return newSession;
}

/**
 * Create seed session with some played matches to make the initial experience rich and interactive
 */
export function createDefaultSeedSession(): TournamentSession {
  const session = createNewSession('Champions Lap 5 — Minggu, 16 Agustus 2026 (15:00-18:00)', DEFAULT_8_PLAYERS, 1, DEFAULT_RULES, 'rotating_doubles');
  session.date = '2026-08-16';

  // Pre-fill first match as completed with a realistic score so user immediately sees stats
  if (session.matches.length > 0) {
    const m1 = session.matches[0];
    m1.status = 'completed';
    m1.startTime = Date.now() - 18 * 60 * 1000;
    m1.endTime = Date.now() - 2 * 60 * 1000;
    m1.durationSeconds = 960;
    m1.score = {
      team1Score: 30,
      team2Score: 25,
      isCompleted: true,
      winnerTeamId: 1,
      history: [
        { team1: 30, team2: 25, scoredByTeam: 1, timestamp: Date.now() - 120000 }
      ]
    };
  }

  // Set second match as currently active in Court 1
  if (session.matches.length > 1) {
    const m2 = session.matches[1];
    m2.status = 'in_progress';
    m2.startTime = Date.now() - 5 * 60 * 1000;
    m2.score = {
      team1Score: 16,
      team2Score: 12,
      isCompleted: false,
      history: [
        { team1: 16, team2: 12, scoredByTeam: 1, timestamp: Date.now() - 30000 }
      ]
    };
    if (session.courts[0]) {
      session.courts[0].currentMatchId = m2.id;
    }
  }

  // Set third match as next on deck
  if (session.matches.length > 2 && session.courts[0]) {
    session.courts[0].nextMatchId = session.matches[2].id;
  }

  saveSession(session);
  return session;
}

/**
 * Load all saved sessions from localStorage
 */
export function getAllSessions(): TournamentSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TournamentSession[];
  } catch (e) {
    console.error('Failed to load sessions from storage:', e);
    return [];
  }
}

/**
 * Save or update a session
 */
export function saveSession(session: TournamentSession): void {
  if (typeof window === 'undefined') return;
  try {
    const sessions = getAllSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save session to storage:', e);
  }
}

/**
 * Get active session ID
 */
export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

/**
 * Set active session ID
 */
export function setActiveSessionId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

/**
 * Delete a session
 */
export function deleteSession(id: string): void {
  if (typeof window === 'undefined') return;
  const sessions = getAllSessions().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  if (getActiveSessionId() === id) {
    if (sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }
}

/**
 * Export session to JSON file download
 */
export function exportSessionToJSON(session: TournamentSession): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(session, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `smashmatch_${session.name.replace(/\s+/g, '_')}_${session.date}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
