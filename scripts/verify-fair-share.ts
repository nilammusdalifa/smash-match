import { computeFairShare, deficitOf } from '../src/utils/fairness';
import { Match, Player } from '../src/types/badminton';

const SESSION_START = 1_000_000;
const MINUTE = 60_000;

function mkPlayer(id: string, arrivedAt?: number): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, active: true, arrivedAt };
}

function mkMatch(n: number, at: number, ids: string[]): Match {
  const p = (id: string) => mkPlayer(id);
  return {
    id: 'm' + n, roundNumber: n, matchNumber: n, startTime: at,
    team1: { player1: p(ids[0]), player2: p(ids[1]) },
    team2: { player1: p(ids[2]), player2: p(ids[3]) },
    score: { team1Score: 30, team2Score: 20, isCompleted: true },
    status: 'completed',
  };
}

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual.toFixed(4)}, want ${expected.toFixed(4)}`);
}

// 14 players present from the start, 3 matches played (12 of 56 slots).
const roster = Array.from({ length: 14 }, (_, i) => mkPlayer('P' + i));
const played = [
  mkMatch(1, SESSION_START + 1 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(2, SESSION_START + 30 * MINUTE, ['P4', 'P5', 'P6', 'P7']),
  mkMatch(3, SESSION_START + 60 * MINUTE, ['P8', 'P9', 'P10', 'P11']),
];

const base = computeFairShare(played, roster, SESSION_START);
check('entitled after 3 matches (14 present)', base.get('P0')!.entitled, 3 * (4 / 14));
check('deficit for someone who played once', deficitOf(base, 'P0'), 3 * (4 / 14) - 1);
check('deficit for someone still waiting', deficitOf(base, 'P12'), 3 * (4 / 14));

// A latecomer arriving after all 3 matches accrues nothing for time missed.
const late = mkPlayer('LATE', SESSION_START + 90 * MINUTE);
const withLate = computeFairShare(played, [...roster, late], SESSION_START);
check('latecomer entitled', withLate.get('LATE')!.entitled, 0);
check('latecomer deficit', deficitOf(withLate, 'LATE'), 0);

// Ordering: still-waiting > latecomer > already-played.
const waiting = deficitOf(withLate, 'P12');
const already = deficitOf(withLate, 'P0');
const lateDef = deficitOf(withLate, 'LATE');
const orderOk = waiting > lateDef && lateDef > already;
console.log(`${orderOk ? 'PASS' : 'FAIL'} priority order waiting(${waiting.toFixed(3)}) > late(${lateDef.toFixed(3)}) > played(${already.toFixed(3)})`);
if (!orderOk) failures++;

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
