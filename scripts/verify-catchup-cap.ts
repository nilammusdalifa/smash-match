import { computeFairShare, deficitOf } from '../src/utils/fairness';
import { Match, Player } from '../src/types/badminton';

const SESSION_START = 1_000_000;
const MINUTE = 60_000;

function mkPlayer(id: string): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, active: true };
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

// The bug scenario: 3 matches are played among P0-P3 while LATE has quietly
// walked in without anyone marking them Away first — so `arrivedAt` is
// undefined and fairness thinks LATE has been present since session start,
// racking up a large unearned deficit for time they were never in the room.
const p0123 = ['P0', 'P1', 'P2', 'P3'].map(mkPlayer);
const late = mkPlayer('LATE');
const roster = [...p0123, late];
const played = [
  mkMatch(1, SESSION_START + 10 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(2, SESSION_START + 30 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(3, SESSION_START + 50 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
];

const withLate = computeFairShare(played, roster, SESSION_START);
// Without a cap: entitled = 3 * (4/5) = 2.4, played = 0, deficit = 2.4.
// P0-P3 each played 3 of 3, entitled 2.4, played 3, deficit = -0.6.
// Ceiling = max(deficit among played>=1) + 1.0 = -0.6 + 1.0 = 0.4.
check('LATE deficit is clamped to the ceiling, not the raw 2.4', deficitOf(withLate, 'LATE'), 0.4);

// Honest players who actually played are untouched by the cap: their raw
// deficit (-0.6) is already below the ceiling (0.4), so it passes through
// unclamped. (Comparing against a roster without LATE would NOT be a valid
// check here — removing LATE changes the present-count denominator for
// everyone's entitled share, so P0's deficit would differ from this run
// regardless of any cap. The direct value is the only correct assertion.)
check('P0 deficit is untouched by the cap (-0.6, not clamped)', deficitOf(withLate, 'P0'), -0.6);
check('P2 deficit is untouched by the cap (-0.6, not clamped)', deficitOf(withLate, 'P2'), -0.6);

// A genuinely fresh latecomer (arrivedAt correctly stamped after all 3
// matches) still accrues nothing extra — the cap must not interfere with
// the already-correct "present since arrival only" behavior.
const freshLate = { ...mkPlayer('FRESH'), arrivedAt: SESSION_START + 90 * MINUTE };
const withFresh = computeFairShare(played, [...p0123, freshLate], SESSION_START);
check('correctly-marked latecomer still gets 0 deficit', deficitOf(withFresh, 'FRESH'), 0);

// The clamp must fire ONLY for a player the app wrongly believes has been
// here since session start (arrivedAt === undefined). A latecomer who WAS
// marked in — here, correctly stamped just after match 1, so they were
// present for matches 2 and 3 but played neither — has a legitimately
// earned deficit and must pass through untouched, otherwise they lose all
// priority ordering against the never-marked case.
const midLate = { ...mkPlayer('MID'), arrivedAt: SESSION_START + 20 * MINUTE };
const withMid = computeFairShare(played, [...p0123, midLate], SESSION_START);
// Match 1 (t+10m): MID not yet present — 4 players share, MID gets 0.
// Matches 2 (t+30m) and 3 (t+50m): 5 present — MID earns 4/5 each.
// MID played none, so deficit = 0.8 + 0.8 = 1.6, well above the ceiling
// (max played-deficit + 1.0), and must NOT be clamped down to it.
check('correctly-marked mid-session latecomer keeps their full deficit', deficitOf(withMid, 'MID'), 1.6);
// P0-P3 played all 3: entitled 1 + 0.8 + 0.8 = 2.6, played 3.
check('P0 deficit alongside a marked mid-session latecomer', deficitOf(withMid, 'P0'), 2.6 - 3);
// The old unguarded clamp would have pulled MID down to this ceiling
// (max played-deficit + 1.0 = -0.4 + 1.0 = 0.6). MID must sit strictly
// above it, which is only possible because of the arrivedAt guard.
const ceilingForMid = deficitOf(withMid, 'P0') + 1.0;
check('MID escapes the ceiling the old clamp would have applied', deficitOf(withMid, 'MID') > ceilingForMid ? 1 : 0, 1);

// ...while the never-marked-away latecomer in the SAME shape of session is
// still clamped, proving the guard narrowed the cap rather than removing it.
const unmarkedLate = mkPlayer('UNMARKED');
const withUnmarked = computeFairShare(played, [...p0123, unmarkedLate], SESSION_START);
// Present (as far as the app knows) for all 3: entitled 3 * 4/5 = 2.4,
// played 0 — clamped to ceiling = -0.6 + 1.0 = 0.4.
check('never-marked latecomer is still clamped', deficitOf(withUnmarked, 'UNMARKED'), 0.4);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
