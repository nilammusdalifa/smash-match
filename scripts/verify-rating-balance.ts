import { pickBestTeamSplit, computeEffectiveRatings } from '../src/utils/scheduler';
import { Player } from '../src/types/badminton';

function mkPlayer(id: string, tier: 'A' | 'B' | 'C', rating: number): Player {
  return { id, name: id, initialRating: rating, currentRating: rating, skillLevel: tier, active: true };
}

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

// Same tier, four different ratings: rating balance should pick the split
// with the smallest team-average gap (highest+lowest vs the middle two),
// not just whichever split comes first.
const p0 = mkPlayer('P0', 'B', 1400);
const p1 = mkPlayer('P1', 'B', 1300);
const p2 = mkPlayer('P2', 'B', 1200);
const p3 = mkPlayer('P3', 'B', 1100);
const effectiveRatings = computeEffectiveRatings([p0, p1, p2, p3], []);
const split = pickBestTeamSplit([p0, p1, p2, p3], { effectiveRatings });
const ids = (team: [Player, Player]) => [team[0].id, team[1].id].sort().join(',');
const balanced = ids(split.t1) === 'P0,P3' || ids(split.t2) === 'P0,P3';
check('same-tier split balances team ratings (P0+P3 vs P1+P2)', balanced);

// Rating balance must NOT override tier balance: A+A vs C+C has a perfect
// rating match (0 gap) but a tier gap of 4 (unacceptable); the mixed A+C vs
// A+C split must win even though its rating gap is worse.
const a1 = mkPlayer('A1', 'A', 1200);
const a2 = mkPlayer('A2', 'A', 1400);
const c1 = mkPlayer('C1', 'C', 1200);
const c2 = mkPlayer('C2', 'C', 1400);
const mixedRatings = computeEffectiveRatings([a1, a2, c1, c2], []);
const mixedSplit = pickBestTeamSplit([a1, a2, c1, c2], { effectiveRatings: mixedRatings });
const isStacked =
  (mixedSplit.t1.every((p) => p.skillLevel === 'A') && mixedSplit.t2.every((p) => p.skillLevel === 'C')) ||
  (mixedSplit.t1.every((p) => p.skillLevel === 'C') && mixedSplit.t2.every((p) => p.skillLevel === 'A'));
check('tier gap still dominates a perfect rating match', !isStacked);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
