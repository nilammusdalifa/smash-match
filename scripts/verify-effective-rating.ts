import { computeEffectiveRatings } from '../src/utils/strength';
import { Match, Player } from '../src/types/badminton';

function mkPlayer(id: string, rating: number): Player {
  return { id, name: id, initialRating: rating, currentRating: rating, active: true };
}

function mkMatch(n: number, endTime: number, ids: string[], t1Score: number, t2Score: number): Match {
  const byId = new Map(ids.map((id) => [id, mkPlayer(id, 1200)]));
  return {
    id: 'm' + n,
    roundNumber: n,
    matchNumber: n,
    endTime,
    team1: { player1: byId.get(ids[0])!, player2: byId.get(ids[1])! },
    team2: { player1: byId.get(ids[2])!, player2: byId.get(ids[3])! },
    score: { team1Score: t1Score, team2Score: t2Score, isCompleted: true },
    status: 'completed',
  };
}

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-9;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}, want ${expected}`);
}

// P0 is on team1 for all 3 matches: win, win, loss (most recent last).
const matches = [
  mkMatch(1, 1000, ['P0', 'P1', 'P2', 'P3'], 30, 20), // P0 wins
  mkMatch(2, 2000, ['P0', 'P1', 'P2', 'P3'], 30, 25), // P0 wins
  mkMatch(3, 3000, ['P0', 'P1', 'P2', 'P3'], 15, 30), // P0 loses
];
const roster = [mkPlayer('P0', 1200), mkPlayer('P1', 1200), mkPlayer('P2', 1200), mkPlayer('P3', 1200)];

const ratings = computeEffectiveRatings(roster, matches);
// Most recent first: loss(-20), win(+13), win(+7) => 1200 - 20 + 13 + 7 = 1200
check('P0 effective rating (W,W,L most-recent-first: L,W,W)', ratings.get('P0')!, 1200 - 20 + 13 + 7);

// A player with zero completed matches gets no nudge.
const fresh = mkPlayer('NEW', 1150);
const freshRatings = computeEffectiveRatings([fresh], []);
check('player with no matches keeps base rating', freshRatings.get('NEW')!, 1150);

// A player with exactly 1 completed match (a win) gets only the +20 slot.
const oneMatch = [mkMatch(1, 1000, ['P0', 'P1', 'P2', 'P3'], 30, 10)];
const oneRatings = computeEffectiveRatings(roster, oneMatch);
check('P0 with exactly 1 win', oneRatings.get('P0')!, 1200 + 20);
check('P2 with exactly 1 loss', oneRatings.get('P2')!, 1200 - 20);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
