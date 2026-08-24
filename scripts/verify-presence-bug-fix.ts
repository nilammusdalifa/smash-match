import { computeFairShare, deficitOf } from '../src/utils/fairness';
import { Match, Player } from '../src/types/badminton';

const SESSION_START = 1_000_000;
const HOUR = 60 * 60_000;

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

// 14 players. 2 of them (host/co-host) are away for hour 1, marked back at
// the top of hour 2. 4 matches happen during hour 1 with the other 12; then
// 1 match happens right after the host/co-host return.
const others = Array.from({ length: 12 }, (_, i) => mkPlayer('P' + i));
const hour1Matches = [
  mkMatch(1, SESSION_START + 5 * 60_000, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(2, SESSION_START + 20 * 60_000, ['P4', 'P5', 'P6', 'P7']),
  mkMatch(3, SESSION_START + 35 * 60_000, ['P8', 'P9', 'P10', 'P11']),
  mkMatch(4, SESSION_START + 50 * 60_000, ['P0', 'P4', 'P8', 'P1']),
];

console.log('=== Buggy behavior: arrivedAt falls back to session.createdAt ===');
{
  const host = mkPlayer('HOST', SESSION_START); // old bug: App.tsx set this to session.createdAt
  const cohost = mkPlayer('COHOST', SESSION_START);
  const roster = [...others, host, cohost];
  const stats = computeFairShare(hour1Matches, roster, SESSION_START);
  console.log('HOST entitled after hour 1 (should be 0 if truly away, since HOST never played):', stats.get('HOST')!.entitled.toFixed(4));
  console.log('HOST deficit after hour 1:', deficitOf(stats, 'HOST').toFixed(4));
  // This demonstrates the bug: HOST accrues entitlement for matches during
  // the hour they were supposedly away, because arrivedAt == session start.
}

console.log('\n=== Fixed behavior: arrivedAt stamped as the actual return time (now) ===');
{
  const returnTime = SESSION_START + HOUR; // marked "Here" at the top of hour 2
  const host = mkPlayer('HOST', returnTime);
  const cohost = mkPlayer('COHOST', returnTime);
  const roster = [...others, host, cohost];
  const stats = computeFairShare(hour1Matches, roster, SESSION_START);
  check('HOST entitled after hour 1 (away the whole time)', stats.get('HOST')!.entitled, 0);
  check('HOST deficit after hour 1 (no catch-up, no penalty)', deficitOf(stats, 'HOST'), 0);

  const afterReturn = [...hour1Matches, mkMatch(5, returnTime + 5 * 60_000, ['HOST', 'COHOST', 'P2', 'P3'])];
  const stats2 = computeFairShare(afterReturn, roster, SESSION_START);
  check('HOST entitled after playing 1 match post-return (14 present)', stats2.get('HOST')!.entitled, 4 / 14);
  check('HOST deficit after playing that match', deficitOf(stats2, 'HOST'), 4 / 14 - 1);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
