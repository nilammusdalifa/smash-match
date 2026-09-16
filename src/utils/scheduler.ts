import { Match, Player, GameRules, Court, TournamentSession } from '../types/badminton';
import { computeFairShare, deficitOf, FairShareStats, FAIR_SHARE_EPSILON } from './fairness';
import { computeEffectiveRatings } from './strength';

export { computeEffectiveRatings };

/**
 * Generate unique ID
 */
export function generateId(): string {
  return 'id_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

/**
 * A=3, B=2, C=1 (untiered players count as a middle B) — used to keep the
 * two teams in a match roughly matched in strength, not to gate who can
 * play at all.
 */
export function tierScore(p: Player): number {
  if (p.skillLevel === 'A') return 3;
  if (p.skillLevel === 'C') return 1;
  return 2;
}

/** Two teammates of different tiers means one of them is "carrying" the other. */
export function isCarryPairing(a: Player, b: Player): boolean {
  return tierScore(a) !== tierScore(b);
}

export interface CarryStats {
  carryCount: number;
  hardCount: number;
  lastWasCarry: boolean | null;
}

/**
 * Walks matches in play order (round, then match number) and tallies, per
 * player, how many carry (mixed-tier teammate) vs. hard (same-tier teammate)
 * games they've had, plus whether their most recent game in this list was a
 * carry — used to avoid handing the same player a carry role twice running.
 */
export function computeCarryHistory(matches: Match[]): Map<string, CarryStats> {
  const history = new Map<string, CarryStats>();
  const ordered = [...matches].sort(
    (a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber
  );
  ordered.forEach((m) => {
    ([[m.team1.player1, m.team1.player2], [m.team2.player1, m.team2.player2]] as const).forEach(
      ([a, b]) => {
        const carry = isCarryPairing(a, b);
        [a, b].forEach((p) => {
          const stats = history.get(p.id) || { carryCount: 0, hardCount: 0, lastWasCarry: null };
          if (carry) stats.carryCount++;
          else stats.hardCount++;
          stats.lastWasCarry = carry;
          history.set(p.id, stats);
        });
      }
    );
  });
  return history;
}

/** How many times each pair of players has already been teammates. */
export function computePartnerCounts(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  const key = (id1: string, id2: string) => [id1, id2].sort().join('-');
  matches.forEach((m) => {
    ([[m.team1.player1, m.team1.player2], [m.team2.player1, m.team2.player2]] as const).forEach(
      ([a, b]) => {
        const k = key(a.id, b.id);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    );
  });
  return counts;
}

/** How many times each pair of players has already faced each other across the net. */
export function computeOpponentCounts(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  const key = (id1: string, id2: string) => [id1, id2].sort().join('-');
  matches.forEach((m) => {
    const t1 = [m.team1.player1, m.team1.player2];
    const t2 = [m.team2.player1, m.team2.player2];
    t1.forEach((a) => {
      t2.forEach((b) => {
        const k = key(a.id, b.id);
        counts.set(k, (counts.get(k) || 0) + 1);
      });
    });
  });
  return counts;
}

type TeamSplit = { t1: [Player, Player]; t2: [Player, Player] };

interface FairnessHistory {
  partnerCounts?: Map<string, number>;
  opponentCounts?: Map<string, number>;
  carryHistory?: Map<string, CarryStats>;
  effectiveRatings?: Map<string, number>;
}

/**
 * Lower is better. Scores a specific 2v2 split by, in order of weight:
 * 1. Tier gap bucket — 0/1 point gap is "fair" (tied); anything wider is a
 *    real mismatch and dominates everything else.
 * 2. Repeat-carry violations — putting someone into a mixed-tier (carry)
 *    pairing for the second time running.
 * 3. Carry/hard balance — nudges each player's carry vs. hard game count
 *    back toward parity over the session.
 * 4. Repeat partnerships (existing tiebreak).
 * 5. Repeat opponents — lowest priority; nudges away from facing the same
 *    pair across the net over and over, but never at the expense of 1-4.
 * Exported as a plain number (not just a comparator) so `pickBestFoursome`
 * can compare candidate foursomes against each other, not just compare
 * splits within one fixed foursome.
 */
function scoreTeamSplit(c: TeamSplit, history: FairnessHistory): number {
  const partnerCounts = history.partnerCounts || new Map<string, number>();
  const opponentCounts = history.opponentCounts || new Map<string, number>();
  const carryHistory = history.carryHistory || new Map<string, CarryStats>();
  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');

  const tierGap = Math.abs(
    (tierScore(c.t1[0]) + tierScore(c.t1[1])) - (tierScore(c.t2[0]) + tierScore(c.t2[1]))
  );
  // A gap of 0 or 1 is a fair match already (e.g. A+B vs A+B, or A+A vs A+B)
  // — treat those as tied. A wider gap (e.g. A+A vs B+B, gap 2) is a real
  // strength mismatch even though nobody's carrying within their own team,
  // so it does NOT count as a fair alternative to a carry pairing; the fix
  // for repeat carries is choosing WHO plays together (pickBestFoursome),
  // not accepting a lopsided team matchup.
  const tierGapBucket = tierGap <= 1 ? 0 : tierGap;

  let repeatCarryViolations = 0;
  let carryBalanceScore = 0;
  [c.t1, c.t2].forEach((team) => {
    const carry = isCarryPairing(team[0], team[1]);
    team.forEach((p) => {
      const stats = carryHistory.get(p.id) || { carryCount: 0, hardCount: 0, lastWasCarry: null };
      if (carry && stats.lastWasCarry) repeatCarryViolations++;
      carryBalanceScore += carry ? stats.carryCount - stats.hardCount : stats.hardCount - stats.carryCount;
    });
  });

  const partnerCost =
    (partnerCounts.get(getPairKey(c.t1[0].id, c.t1[1].id)) || 0) +
    (partnerCounts.get(getPairKey(c.t2[0].id, c.t2[1].id)) || 0);

  const opponentCost = c.t1.reduce(
    (sum, a) => sum + c.t2.reduce((s, b) => s + (opponentCounts.get(getPairKey(a.id, b.id)) || 0), 0),
    0
  );

  // Balances team strength within a match. Bucketed at 25 Elo so it acts as
  // a tie-break rather than a continuous score, and capped at 8 buckets
  // (200+ Elo gap) so the worst realistic mismatch (8 * 500 = 4000) never
  // outweighs one carry-balance unit (10000) or a repeat-carry violation
  // (100000) — see the design spec's rescale rationale.
  const effectiveRatings = history.effectiveRatings || new Map<string, number>();
  const ratingOf = (p: Player) => effectiveRatings.get(p.id) ?? p.currentRating;
  const avgRating1 = (ratingOf(c.t1[0]) + ratingOf(c.t1[1])) / 2;
  const avgRating2 = (ratingOf(c.t2[0]) + ratingOf(c.t2[1])) / 2;
  const ratingGapBucket = Math.min(8, Math.round(Math.abs(avgRating1 - avgRating2) / 25));

  return (
    tierGapBucket * 1000000 +
    repeatCarryViolations * 100000 +
    carryBalanceScore * 10000 +
    ratingGapBucket * 500 +
    partnerCost * 10 +
    opponentCost
  );
}

/** Given exactly 4 players, picks the lowest-scoring 2v2 split (see `scoreTeamSplit`). */
export function pickBestTeamSplit(
  four: [Player, Player, Player, Player],
  opts: FairnessHistory = {}
): TeamSplit {
  const configs: TeamSplit[] = [
    { t1: [four[0], four[1]], t2: [four[2], four[3]] },
    { t1: [four[0], four[2]], t2: [four[1], four[3]] },
    { t1: [four[0], four[3]], t2: [four[1], four[2]] },
  ];

  configs.sort((cA, cB) => scoreTeamSplit(cA, opts) - scoreTeamSplit(cB, opts));

  return configs[0];
}

function chooseKCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  const withHead = chooseKCombinations(rest, k - 1).map((c) => [head, ...c]);
  const withoutHead = chooseKCombinations(rest, k);
  return [...withHead, ...withoutHead];
}

/**
 * Picks which 4 players should play together, not just how to split a fixed
 * 4 — this is what actually lets a player who just carried get a genuinely
 * fair "hard" game (same-tier partner AND a similarly-matched opponent),
 * instead of only ever choosing between whichever 4 people happened to be
 * next in the rest rotation. `mustPlay` are non-negotiable (they've rested
 * more than anyone and must play this round); `tiedCandidates` are equally
 * deserving of a slot, so the choice of which of them fill the remaining
 * `slotsNeeded` spots is free to optimize for carry balance. Brute-forces
 * every valid combination — fine at real-world club sizes, capped to avoid
 * blowing up for large tied pools.
 */
function pickBestFoursome(
  mustPlay: Player[],
  tiedCandidates: Player[],
  slotsNeeded: number,
  history: FairnessHistory
): { four: [Player, Player, Player, Player]; split: TeamSplit } {
  return pickTopFoursomeOptions(mustPlay, tiedCandidates, slotsNeeded, history, 1)[0];
}

/**
 * Same search as pickBestFoursome, but returns the `topK` best-scoring
 * foursomes instead of only the single best — lets a caller offer a
 * reroll among comparably fair options instead of always the one true
 * best answer.
 */
function pickTopFoursomeOptions(
  mustPlay: Player[],
  tiedCandidates: Player[],
  slotsNeeded: number,
  history: FairnessHistory,
  topK: number
): Array<{ four: [Player, Player, Player, Player]; split: TeamSplit; score: number }> {
  const MAX_TIED_POOL_FOR_SEARCH = 14;
  const pool = tiedCandidates.length <= MAX_TIED_POOL_FOR_SEARCH
    ? tiedCandidates
    : tiedCandidates.slice(0, MAX_TIED_POOL_FOR_SEARCH);

  const combos = slotsNeeded > 0 ? chooseKCombinations(pool, slotsNeeded) : [[]];

  const scored: Array<{ four: [Player, Player, Player, Player]; split: TeamSplit; score: number }> = [];
  combos.forEach((tiedSubset) => {
    const four = [...mustPlay, ...tiedSubset] as [Player, Player, Player, Player];
    const split = pickBestTeamSplit(four, history);
    const score = scoreTeamSplit(split, history);
    scored.push({ four, split, score });
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, Math.max(1, topK));
}

/**
 * Builds a match around a pair who asked to play together. The pair is
 * team1; the other two are picked so the opposing team's combined tier is
 * as close as possible to the requested pair's, then by fewest repeat
 * partners/opponents. The resulting tier gap may exceed the usual limit —
 * that is the accepted cost of honoring an explicit request.
 */
export function pickFoursomeWithRequiredPair(
  pair: [Player, Player],
  candidates: Player[],
  history: FairnessHistory
): { four: [Player, Player, Player, Player]; split: TeamSplit } {
  const pairTier = tierScore(pair[0]) + tierScore(pair[1]);
  let best: { four: [Player, Player, Player, Player]; split: TeamSplit; score: number } | null = null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const opp: [Player, Player] = [candidates[i], candidates[j]];
      const gap = Math.abs(pairTier - (tierScore(opp[0]) + tierScore(opp[1])));
      const split: TeamSplit = { t1: pair, t2: opp };
      const score = gap * 1000 + scoreTeamSplit(split, history);
      if (!best || score < best.score) {
        best = { four: [pair[0], pair[1], opp[0], opp[1]], split, score };
      }
    }
  }

  if (!best) {
    throw new Error('pickFoursomeWithRequiredPair needs at least 2 candidates');
  }
  return best;
}

/**
 * Public entry point for picking a single match out of a pool of available
 * players (Auto Fill, reshuffle-one-match) — same rule as the main
 * scheduler: whoever has the highest fair-share deficit must be included,
 * and the choice among anyone tied on deficit is optimized for tier
 * balance, carry fairness, and partner/opponent variety rather than picked
 * arbitrarily.
 */
export function pickBestAvailableFoursome(
  available: Player[],
  opts: FairnessHistory & { fairShare?: Map<string, FairShareStats> } = {}
): { four: [Player, Player, Player, Player]; split: TeamSplit } {
  const fairShare = opts.fairShare || new Map<string, FairShareStats>();

  const pool = [...available].sort((a, b) => {
    const d = deficitOf(fairShare, b.id) - deficitOf(fairShare, a.id);
    if (Math.abs(d) > FAIR_SHARE_EPSILON) return d;
    return Math.random() - 0.5;
  });

  const cutoffPlayer = pool[3];
  const cutoffDeficit = cutoffPlayer ? deficitOf(fairShare, cutoffPlayer.id) : Infinity;
  const mustPlay = pool.filter(
    (p) => deficitOf(fairShare, p.id) - cutoffDeficit > FAIR_SHARE_EPSILON
  );
  const tiedCandidates = pool.filter(
    (p) => Math.abs(deficitOf(fairShare, p.id) - cutoffDeficit) <= FAIR_SHARE_EPSILON
  );
  const slotsNeeded = 4 - mustPlay.length;

  return pickBestFoursome(mustPlay, tiedCandidates, slotsNeeded, opts);
}

/**
 * How close to the fairness cutoff (in fair-share deficit units, roughly
 * "games owed") still counts as a legitimate reroll candidate rather than
 * a genuinely less-deserving player. Wide enough to give real variety,
 * narrow enough that everyone offered is still close to their fair turn.
 */
const REROLL_DEFICIT_TOLERANCE = 1.0;

/**
 * Same fairness rule as pickBestAvailableFoursome, but returns up to
 * `topK` comparably-fair options (instead of the single best) so a caller
 * can offer a reroll — e.g. Custom Match's "Auto Fill" trying again when
 * the suggested foursome isn't the one you wanted, without resorting to
 * manually picking all 4 players from scratch.
 */
export function pickTopAvailableFoursomeOptions(
  available: Player[],
  opts: FairnessHistory & { fairShare?: Map<string, FairShareStats> } = {},
  topK: number = 5
): Array<{ four: [Player, Player, Player, Player]; split: TeamSplit }> {
  const fairShare = opts.fairShare || new Map<string, FairShareStats>();

  const pool = [...available].sort((a, b) => {
    const d = deficitOf(fairShare, b.id) - deficitOf(fairShare, a.id);
    if (Math.abs(d) > FAIR_SHARE_EPSILON) return d;
    return Math.random() - 0.5;
  });

  const cutoffPlayer = pool[3];
  const cutoffDeficit = cutoffPlayer ? deficitOf(fairShare, cutoffPlayer.id) : Infinity;
  const mustPlay = pool.filter(
    (p) => deficitOf(fairShare, p.id) - cutoffDeficit > REROLL_DEFICIT_TOLERANCE
  );
  const tiedCandidates = pool.filter(
    (p) => Math.abs(deficitOf(fairShare, p.id) - cutoffDeficit) <= REROLL_DEFICIT_TOLERANCE
  );
  const slotsNeeded = 4 - mustPlay.length;

  return pickTopFoursomeOptions(mustPlay, tiedCandidates, slotsNeeded, opts, topK).map(({ four, split }) => ({
    four,
    split,
  }));
}

export interface CourtConfig {
  name: string;
  availableFrom?: string;
  availableUntil?: string;
}

/**
 * Court ids stay "1".."N" (stable keys the rest of the app already uses);
 * only the display name is configurable, so a venue's real court numbers
 * ("Court 6") survive into match cards and announcements.
 */
export function initializeCourts(courtCount: number, configs?: CourtConfig[]): Court[] {
  const total = configs && configs.length > 0 ? configs.length : courtCount;
  const courts: Court[] = [];
  for (let i = 1; i <= total; i++) {
    const cfg = configs?.[i - 1];
    courts.push({
      id: i.toString(),
      name: cfg?.name?.trim() || `Court ${i}`,
      isActive: true,
      availableFrom: cfg?.availableFrom,
      availableUntil: cfg?.availableUntil,
    });
  }
  return courts;
}
