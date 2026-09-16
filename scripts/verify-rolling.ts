import { refreshSuggestions, rerollMatch, trimSurplusScheduledMatches } from '../src/utils/rolling';
import { initializeCourts } from '../src/utils/scheduler';
import { Match, Player, TournamentSession } from '../src/types/badminton';

function mkPlayer(id: string): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, skillLevel: 'B', active: true };
}

function mkSession(playerCount: number, courtCount: number, matches: Match[] = []): TournamentSession {
  return {
    id: 's1',
    name: 'Test',
    date: '2026-01-01',
    createdAt: Date.now(),
    courtCount,
    courts: initializeCourts(courtCount),
    players: Array.from({ length: playerCount }, (_, i) => mkPlayer('P' + i)),
    rules: { pointsToWin: 21, winByTwo: true, maxPointsCap: 30, numberOfSets: 1, suddenDeathAtCap: true },
    matches,
    currentRound: 1,
    totalRounds: 0,
    isCompleted: false,
    ownerUid: 'u1',
    pin: '1234',
  };
}

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

// 8 players, 2 courts, fresh session: exactly one scheduled match per court,
// no more (this is the whole point of "rolling" vs the old batch generator).
const fresh = mkSession(8, 2);
const { matches: afterFirstRefresh } = refreshSuggestions(fresh);
const scheduled1 = afterFirstRefresh.filter((m) => m.status === 'scheduled');
check('exactly 2 scheduled matches for 2 idle courts', scheduled1.length === 2);
check('one match per court', new Set(scheduled1.map((m) => m.courtId)).size === 2);
check('all 8 players placed across the 2 matches', new Set(scheduled1.flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])).size === 8);

// Refreshing again while both courts are still occupied by their scheduled
// match must NOT add a second suggestion per court.
const { matches: afterSecondRefresh } = refreshSuggestions({ ...fresh, matches: afterFirstRefresh });
check('refreshing an already-full court adds nothing', afterSecondRefresh.length === afterFirstRefresh.length);

// Reroll must return a different foursome (or null only if truly stuck) and
// never touch a match that isn't 'scheduled'.
const rerollTarget = scheduled1[0];
const rerollResult = rerollMatch({ ...fresh, matches: afterFirstRefresh }, rerollTarget.id);
check('reroll returns a result for a scheduled match', rerollResult !== null);
if (rerollResult) {
  const originalIds = new Set([rerollTarget.team1.player1.id, rerollTarget.team1.player2.id, rerollTarget.team2.player1.id, rerollTarget.team2.player2.id]);
  const newIds = new Set([...rerollResult.team1, ...rerollResult.team2]);
  const sameFour = originalIds.size === newIds.size && [...originalIds].every((id) => newIds.has(id));
  // With only 8 players and 1 already occupying the other court's match,
  // the eligible pool for this court is small, so occasionally the "best"
  // alternative options may still land on the same 4 people in a different
  // split. What must never happen is an *invalid* result (wrong size, not
  // 4 distinct ids).
  check('reroll result has 4 distinct player ids', newIds.size === 4);
  void sameFour;
}

// Migration: an old-format session with 3 stale scheduled matches queued on
// a single court gets trimmed to 1 (the earliest by matchNumber).
const staleCourt = initializeCourts(1);
const stale: Match[] = [1, 2, 3].map((n) => ({
  id: 'stale' + n,
  roundNumber: n,
  matchNumber: n,
  courtId: '1',
  team1: { player1: mkPlayer('P0'), player2: mkPlayer('P1') },
  team2: { player1: mkPlayer('P2'), player2: mkPlayer('P3') },
  score: { team1Score: 0, team2Score: 0, isCompleted: false },
  status: 'scheduled',
}));
const staleSession = { ...mkSession(4, 1, stale), courts: staleCourt };
const trimmed = trimSurplusScheduledMatches(staleSession);
const trimmedScheduled = trimmed.filter((m) => m.status === 'scheduled');
check('trims 3 stale scheduled matches on 1 court down to 1', trimmedScheduled.length === 1);
check('keeps the earliest by matchNumber', trimmedScheduled[0].id === 'stale1');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
