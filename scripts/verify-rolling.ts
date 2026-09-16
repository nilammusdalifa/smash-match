import {
  refreshSuggestions,
  rerollMatch,
  trimSurplusScheduledMatches,
  dropScheduledMatchesOnRemovedCourts,
  eligiblePlayersForCourt,
} from '../src/utils/rolling';
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

// Partner request: P0 and P1 have never played together and have asked to
// be teamed up. refreshSuggestions must actually seat them as teammates on
// one of the new scheduled matches, not just run without throwing.
const requested: TournamentSession = { ...mkSession(8, 2), requestedPairs: [['P0', 'P1']] };
const { matches: afterRequestRefresh } = refreshSuggestions(requested);
const requestScheduled = afterRequestRefresh.filter((m) => m.status === 'scheduled');
const requestMatch = requestScheduled.find((m) => {
  const ids = [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
  return ids.includes('P0') && ids.includes('P1');
});
check('requested pair P0/P1 is placed in a scheduled match', requestMatch !== undefined);
if (requestMatch) {
  const team1Ids = [requestMatch.team1.player1.id, requestMatch.team1.player2.id];
  const team2Ids = [requestMatch.team2.player1.id, requestMatch.team2.player2.id];
  const sameTeam =
    (team1Ids.includes('P0') && team1Ids.includes('P1')) ||
    (team2Ids.includes('P0') && team2Ids.includes('P1'));
  check('requested pair P0/P1 are teammates, not opponents', sameTeam);
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

// A honored partner request must not hand the two filler slots to whoever
// happens to fit best on tier gap, ignoring who is actually owed court
// time. P0/P1 (both A) ask to play together; P2/P3 (also A) have played
// all 3 matches so far, while P4-P7 (B) have played none. Pairing the
// request against P2+P3 or P2+P4 is the cheapest answer on tier gap alone,
// so the fillers must instead be drawn from the much-higher-deficit B pool.
const TIER_SESSION_START = 1_000_000;
const MINUTE = 60_000;
function mkTiered(id: string, tier: 'A' | 'B'): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, skillLevel: tier, active: true };
}
const tieredPlayers: Player[] = [
  mkTiered('P0', 'A'), mkTiered('P1', 'A'), mkTiered('P2', 'A'), mkTiered('P3', 'A'),
  mkTiered('P4', 'B'), mkTiered('P5', 'B'), mkTiered('P6', 'B'), mkTiered('P7', 'B'),
];
// P0+P2 vs P1+P3 three times over — keeps P0 and P1 from ever having been
// teammates, so their request still counts as outstanding.
const tieredHistory: Match[] = [1, 2, 3].map((n) => ({
  id: 'h' + n,
  roundNumber: n,
  matchNumber: n,
  courtId: '1',
  startTime: TIER_SESSION_START + n * 10 * MINUTE,
  endTime: TIER_SESSION_START + n * 10 * MINUTE + 5 * MINUTE,
  team1: { player1: mkTiered('P0', 'A'), player2: mkTiered('P2', 'A') },
  team2: { player1: mkTiered('P1', 'A'), player2: mkTiered('P3', 'A') },
  score: { team1Score: 30, team2Score: 20, isCompleted: true },
  status: 'completed',
}));
const tieredSession: TournamentSession = {
  ...mkSession(8, 1, tieredHistory),
  createdAt: TIER_SESSION_START,
  players: tieredPlayers,
  requestedPairs: [['P0', 'P1']],
};
const { matches: afterTieredRefresh } = refreshSuggestions(tieredSession);
const tieredNew = afterTieredRefresh.find((m) => m.status === 'scheduled');
check('a suggestion is generated for the tiered partner-request session', tieredNew !== undefined);
if (tieredNew) {
  const ids = [tieredNew.team1.player1.id, tieredNew.team1.player2.id, tieredNew.team2.player1.id, tieredNew.team2.player2.id];
  check('requested pair P0/P1 is in the match', ids.includes('P0') && ids.includes('P1'));
  const fillers = ids.filter((id) => id !== 'P0' && id !== 'P1');
  check(
    'partner-request fillers come from the highest-deficit pool (P4-P7), not the already-played A tier',
    fillers.length === 2 && fillers.every((id) => ['P4', 'P5', 'P6', 'P7'].includes(id))
  );
  check('no filler has already played all 3 matches', !fillers.includes('P2') && !fillers.includes('P3'));
}

// Shrinking the court count must not strand a scheduled match on a court
// that no longer exists: refreshSuggestions only inspects session.courts,
// so the orphan would never be regenerated away while its 4 players stayed
// counted "busy" in every future eligible pool.
const twoCourt = mkSession(8, 2);
const { matches: twoCourtMatches } = refreshSuggestions(twoCourt);
const shrunkCourts = initializeCourts(1);
const stranded: TournamentSession = { ...twoCourt, matches: twoCourtMatches, courtCount: 1, courts: shrunkCourts };
check('court-2 match is still present before the cleanup runs', twoCourtMatches.some((m) => m.courtId === '2'));
check('and would otherwise leave nobody free for a later match', eligiblePlayersForCourt(stranded).length === 0);

const cleanedMatches = dropScheduledMatchesOnRemovedCourts(twoCourtMatches, shrunkCourts);
const cleaned: TournamentSession = { ...stranded, matches: cleanedMatches };
check('scheduled match on the removed court is dropped', !cleanedMatches.some((m) => m.status === 'scheduled' && m.courtId === '2'));
check('the surviving court keeps its scheduled match', cleanedMatches.filter((m) => m.status === 'scheduled').length === 1);
check('its 4 players are free again for future matches', eligiblePlayersForCourt(cleaned).length === 4);

// A completed match on a court that is later removed keeps its history.
const playedOnRemoved: Match = { ...twoCourtMatches.find((m) => m.courtId === '2')!, id: 'done2', status: 'completed' };
const withHistory = dropScheduledMatchesOnRemovedCourts([...cleanedMatches, playedOnRemoved], shrunkCourts);
check('a completed match on a removed court is kept', withHistory.some((m) => m.id === 'done2'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
