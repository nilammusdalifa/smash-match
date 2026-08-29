import { TournamentSession, Player, GameRules } from '../types/badminton';
import { generateRotatingDoublesSchedule, initializeCourts, CourtConfig } from './scheduler';
import { auth, database } from './firebase';
import { ref, set, onValue, off } from 'firebase/database';

const STORAGE_KEY = 'smashmatch_sessions_v1';
const ACTIVE_SESSION_KEY = 'smashmatch_active_session_id';

export const DEFAULT_RULES: GameRules = {
  pointsToWin: 30,
  winByTwo: true,
  maxPointsCap: 30,
  numberOfSets: 1,
  suddenDeathAtCap: true,
};

export const DEFAULT_PLAYERS: Player[] = [
  { id: 'p1', name: 'Raden', initialRating: 1200, currentRating: 1200, skillLevel: 'A', active: true },
  { id: 'p2', name: 'Nilam', initialRating: 1200, currentRating: 1200, skillLevel: 'A', active: true },
  { id: 'p3', name: 'Eric', initialRating: 1200, currentRating: 1200, skillLevel: 'A', active: true },
  { id: 'p4', name: 'Fahmi', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
  { id: 'p5', name: 'Novi', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
  { id: 'p6', name: 'Wiznu', initialRating: 1200, currentRating: 1200, skillLevel: 'A', active: true },
  { id: 'p7', name: 'Jody', initialRating: 1150, currentRating: 1150, skillLevel: 'B', active: true },
  { id: 'p8', name: 'Marvin', initialRating: 1150, currentRating: 1150, skillLevel: 'B', active: true },
  { id: 'p9', name: 'Milton', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
  { id: 'p10', name: 'Gerry', initialRating: 1150, currentRating: 1150, skillLevel: 'B', active: true },
  { id: 'p11', name: 'Lily', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
  { id: 'p12', name: 'Yuda', initialRating: 1200, currentRating: 1200, skillLevel: 'A', active: true },
  { id: 'p13', name: 'Rita', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
  { id: 'p14', name: 'Vincent', initialRating: 1100, currentRating: 1100, skillLevel: 'C', active: true },
];

function generateSessionPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Mirrors a session's data to Firebase so anyone subscribed to
 * `sessions/{id}/data` sees it live. Fire-and-forget: localStorage remains
 * the source of truth for the organizer's own device even if this fails
 * (e.g. offline).
 *
 * `pin` and `ownerUid` are deliberately stripped from this payload: they live
 * at their own sibling paths (`sessions/{id}/pin`, `sessions/{id}/ownerUid`)
 * where the security rules can read them, and duplicating the PIN inside the
 * world-readable `data` blob would leak it to every Player.
 *
 * The whole body is wrapped in try/catch because Firebase's `set()` validates
 * its argument *synchronously* and throws (rather than rejecting) on e.g. an
 * `undefined` value anywhere in the object graph. This function is called from
 * inside React state updaters, so an escaping throw would blow up a render.
 */
export function pushSessionToFirebase(session: TournamentSession): void {
  if (typeof window === 'undefined' || !auth.currentUser) return;
  try {
    const { pin: _pin, ownerUid: _ownerUid, ...dataToSync } = session;
    void _pin;
    void _ownerUid;
    // JSON round-trip drops `undefined`-valued properties (e.g. a match's
    // cleared `winnerTeamId`), which Firebase rejects outright.
    const clean = JSON.parse(JSON.stringify(dataToSync));
    set(ref(database, `sessions/${session.id}/data`), clean).catch((err) => {
      console.error('Failed to sync session to Firebase:', err);
    });
  } catch (err) {
    console.error('Failed to sync session to Firebase:', err);
  }
}

/**
 * Writes a session's `pin` and `ownerUid` to their own sibling Firebase paths.
 * The deployed security rules look these up via `root.child(...)` to decide who
 * may write `sessions/{id}/data` and whether a submitted Umpire PIN matches, so
 * they must exist as real nodes — not just as fields inside the data blob.
 *
 * Both nodes are write-once (`".write": "!data.exists()"`), so re-running this
 * for an already-stamped session is a harmless no-op rejection. Fire-and-forget,
 * same as `pushSessionToFirebase`.
 */
export function pushSessionOwnershipToFirebase(session: TournamentSession): void {
  if (typeof window === 'undefined' || !auth.currentUser) return;
  try {
    if (session.pin) {
      set(ref(database, `sessions/${session.id}/pin`), session.pin).catch((err) => {
        console.error('Failed to sync session PIN to Firebase:', err);
      });
    }
    if (session.ownerUid) {
      set(ref(database, `sessions/${session.id}/ownerUid`), session.ownerUid).catch((err) => {
        console.error('Failed to sync session owner to Firebase:', err);
      });
    }
  } catch (err) {
    console.error('Failed to sync session ownership to Firebase:', err);
  }
}

/**
 * Creates a brand new tournament session
 */
export function createNewSession(
  name: string = 'Friday Night Social Doubles',
  players: Player[] = DEFAULT_PLAYERS,
  courtCount: number = 1,
  rules: GameRules = DEFAULT_RULES,
  courtConfigs?: CourtConfig[],
  details?: { venue?: string; date?: string; startTime?: string; endTime?: string }
): TournamentSession {
  const courts = initializeCourts(courtCount, courtConfigs);
  const { matches, totalRounds } = generateRotatingDoublesSchedule(players, courts, rules);

  const newSession: TournamentSession = {
    id: 'session_' + Date.now(),
    name,
    date: details?.date || new Date().toISOString().split('T')[0],
    venue: details?.venue,
    startTime: details?.startTime,
    endTime: details?.endTime,
    createdAt: Date.now(),
    courtCount,
    courts,
    players: [...players],
    rules,
    matches,
    currentRound: 1,
    totalRounds,
    isCompleted: false,
    ownerUid: auth.currentUser?.uid || '',
    pin: generateSessionPin(),
  };

  // Stamp `pin`/`ownerUid` at their own Firebase paths first, so the rules that
  // guard `sessions/{id}/data` have something to resolve against. If auth isn't
  // ready yet this is a no-op — App.tsx re-stamps once `authReady` flips true.
  pushSessionOwnershipToFirebase(newSession);

  saveSession(newSession);
  setActiveSessionId(newSession.id);
  return newSession;
}

/**
 * Load all saved sessions from localStorage
 */
export function getAllSessions(): TournamentSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw) as TournamentSession[];
    // Sessions saved before this feature existed have no `pin`/`ownerUid` keys
    // at all. Normalize so the rest of the app can treat both as real strings.
    // An empty `ownerUid` is the signal App.tsx uses to re-stamp ownership once
    // anonymous auth is ready.
    return sessions.map((s) => ({
      ...s,
      ownerUid: s.ownerUid ?? '',
      pin: s.pin ?? generateSessionPin(),
    }));
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
  pushSessionToFirebase(session);
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
 * Subscribes to a session's live data in Firebase (used by Player/Umpire
 * view mode). Returns an unsubscribe function.
 *
 * The remote `data` node intentionally carries no `pin`/`ownerUid` (see
 * `pushSessionToFirebase`), so both are filled in as empty strings here to keep
 * the in-memory `TournamentSession` shape honest. Neither is needed on a remote
 * device: Umpires get write access via `editorClaims`, and the PIN badge is only
 * meaningful on the organizer's own device.
 */
export function subscribeToRemoteSession(
  sessionId: string,
  callback: (session: TournamentSession | null) => void
): () => void {
  const sessionRef = ref(database, `sessions/${sessionId}/data`);
  const handleValue = (snapshot: { exists: () => boolean; val: () => unknown }) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const remote = snapshot.val() as TournamentSession;
    callback({
      ...remote,
      ownerUid: remote.ownerUid ?? '',
      pin: remote.pin ?? '',
    });
  };
  onValue(sessionRef, handleValue);
  return () => off(sessionRef, 'value', handleValue);
}

/**
 * Outcome of an Umpire access claim.
 * - `ok`         — the PIN matched and this device now holds an editor claim.
 * - `wrong-pin`  — the database rejected the write, i.e. the PIN was wrong.
 * - `unavailable`— live sync isn't usable right now (no anonymous auth uid yet),
 *                  which is NOT the user's fault and must not read as a bad PIN.
 */
export type UmpireClaimResult = 'ok' | 'wrong-pin' | 'unavailable';

/**
 * Attempts to claim Umpire (edit) access for this device by submitting a
 * PIN. The write only succeeds if the PIN matches the one stored on the
 * session — enforced by the Realtime Database security rules, not by this
 * function.
 */
export async function claimUmpireAccess(
  sessionId: string,
  enteredPin: string
): Promise<UmpireClaimResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 'unavailable';
  try {
    await set(ref(database, `sessions/${sessionId}/editorClaims/${uid}`), enteredPin);
    return 'ok';
  } catch {
    return 'wrong-pin';
  }
}
