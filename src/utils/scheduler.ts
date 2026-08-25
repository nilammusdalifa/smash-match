import { Match, Player, GameRules, Court, TournamentSession } from '../types/badminton';
import { presentPlayers, computeFairShare, deficitOf, FairShareStats, FAIR_SHARE_EPSILON } from './fairness';

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

  return (
    tierGapBucket * 10000 +
    repeatCarryViolations * 1000 +
    carryBalanceScore * 100 +
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

/**
 * Generates `roundsToGenerate` rounds of matches starting at `startRound`,
 * seeded with tracking state from `historyMatches` (already-played or
 * already-scheduled matches) so fairness (rest turns, repeat partners, carry
 * balance) accounts for the whole session, not just the matches generated
 * in this call. Shared by the initial schedule generator and by
 * `regenerateRemainingSchedule`.
 */
function generateGeneralRounds(
  activePlayers: Player[],
  courts: Court[],
  startRound: number,
  roundsToGenerate: number,
  historyMatches: Match[],
  startMatchNumber: number,
  sessionStart: number,
  requestedPairs: Array<[string, string]> = []
): Match[] {
  const n = activePlayers.length;
  const matches: Match[] = [];
  const partnerCounts = computePartnerCounts(historyMatches);
  const opponentCounts = computeOpponentCounts(historyMatches);
  const carryHistory = computeCarryHistory(historyMatches);
  const history: FairnessHistory = { partnerCounts, opponentCounts, carryHistory };
  const fairShare = computeFairShare(historyMatches, activePlayers, sessionStart);
  activePlayers.forEach((p) => {
    if (!fairShare.has(p.id)) fairShare.set(p.id, { entitled: 0, played: 0 });
  });

  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');
  let matchNum = startMatchNumber;

  // A request counts as already fulfilled if the pair has ever been
  // teammates in real history — derived, never stored, so re-running
  // generation (a reshuffle, another regeneration) doesn't re-request it.
  const historyPartnerCounts = computePartnerCounts(historyMatches);
  const outstanding = requestedPairs.filter(
    ([a, b]) => (historyPartnerCounts.get(getPairKey(a, b)) || 0) === 0
  );

  for (let r = startRound; r < startRound + roundsToGenerate; r++) {
    // Highest fair-share deficit plays first — whoever is owed the most
    // court time relative to what they've had.
    const pool = [...activePlayers].sort((a, b) => {
      const d = deficitOf(fairShare, b.id) - deficitOf(fairShare, a.id);
      if (Math.abs(d) > FAIR_SHARE_EPSILON) return d;
      return Math.random() - 0.5;
    });

    const matchesPerRound = Math.min(courts.length, Math.floor(n / 4));
    const playersInRoundCount = matchesPerRound * 4;

    // Whoever has a strictly higher deficit than the round's cutoff MUST
    // play this round — that's the non-negotiable fairness guarantee.
    // Everyone tied at the cutoff value is equally deserving of a slot, so
    // which of THEM fill the remaining spots is free to pick for carry
    // balance instead of arbitrary sort order.
    const cutoffPlayer = pool[playersInRoundCount - 1];
    const cutoffDeficit = cutoffPlayer ? deficitOf(fairShare, cutoffPlayer.id) : Infinity;
    let remainingMustPlay = pool.filter(
      (p) => deficitOf(fairShare, p.id) - cutoffDeficit > FAIR_SHARE_EPSILON
    );
    let remainingTied = pool.filter(
      (p) => Math.abs(deficitOf(fairShare, p.id) - cutoffDeficit) <= FAIR_SHARE_EPSILON
    );
    const alreadyResting = pool
      .filter((p) => cutoffDeficit - deficitOf(fairShare, p.id) > FAIR_SHARE_EPSILON)
      .map((p) => p.id);

    // Built without restingPlayerIds first — the full round has to be
    // settled (every court's foursome chosen) before we know who's left
    // over, otherwise an earlier court's match would wrongly list players
    // who are about to be assigned to a later court as "resting".
    const roundMatches: Match[] = [];

    for (let m = 0; m < matchesPerRound; m++) {
      const mustPlayForThisMatch = remainingMustPlay.slice(0, 4);
      remainingMustPlay = remainingMustPlay.slice(mustPlayForThisMatch.length);
      const slotsNeeded = 4 - mustPlayForThisMatch.length;
      if (mustPlayForThisMatch.length + remainingTied.length < 4) break;

      const eligible = [...mustPlayForThisMatch, ...remainingTied];
      const requestIdx = outstanding.findIndex(
        ([a, b]) => eligible.some((p) => p.id === a) && eligible.some((p) => p.id === b)
      );

      let four: [Player, Player, Player, Player];
      let best: TeamSplit;

      if (requestIdx >= 0) {
        const [aId, bId] = outstanding[requestIdx];
        const pa = eligible.find((p) => p.id === aId)!;
        const pb = eligible.find((p) => p.id === bId)!;
        const candidates = eligible.filter((p) => p.id !== aId && p.id !== bId);
        if (candidates.length >= 2) {
          const picked = pickFoursomeWithRequiredPair([pa, pb], candidates, history);
          four = picked.four;
          best = picked.split;
          outstanding.splice(requestIdx, 1);
        } else {
          const picked = pickBestFoursome(mustPlayForThisMatch, remainingTied, slotsNeeded, history);
          four = picked.four;
          best = picked.split;
        }
      } else {
        const picked = pickBestFoursome(mustPlayForThisMatch, remainingTied, slotsNeeded, history);
        four = picked.four;
        best = picked.split;
      }

      const chosenTiedIds = new Set(
        four.filter((p) => !mustPlayForThisMatch.some((mp) => mp.id === p.id)).map((p) => p.id)
      );
      remainingTied = remainingTied.filter((p) => !chosenTiedIds.has(p.id));

      // Project this match forward: everyone in the pool accrues their
      // slice of entitlement, and the four who play accrue a game.
      const share = 4 / activePlayers.length;
      activePlayers.forEach((p) => {
        const s = fairShare.get(p.id);
        if (s) s.entitled += share;
      });
      four.forEach((p) => {
        const s = fairShare.get(p.id);
        if (s) s.played += 1;
      });
      const k1 = getPairKey(best.t1[0].id, best.t1[1].id);
      const k2 = getPairKey(best.t2[0].id, best.t2[1].id);
      partnerCounts.set(k1, (partnerCounts.get(k1) || 0) + 1);
      partnerCounts.set(k2, (partnerCounts.get(k2) || 0) + 1);
      best.t1.forEach((a) => {
        best.t2.forEach((b) => {
          const ok = getPairKey(a.id, b.id);
          opponentCounts.set(ok, (opponentCounts.get(ok) || 0) + 1);
        });
      });

      [best.t1, best.t2].forEach((team) => {
        const carry = isCarryPairing(team[0], team[1]);
        team.forEach((p) => {
          const stats = carryHistory.get(p.id) || { carryCount: 0, hardCount: 0, lastWasCarry: null };
          if (carry) stats.carryCount++;
          else stats.hardCount++;
          stats.lastWasCarry = carry;
          carryHistory.set(p.id, stats);
        });
      });

      const court = courts[m % courts.length];
      roundMatches.push({
        id: generateId(),
        roundNumber: r,
        matchNumber: matchNum++,
        courtId: court.id,
        courtName: court.name,
        team1: { player1: best.t1[0], player2: best.t1[1] },
        team2: { player1: best.t2[0], player2: best.t2[1] },
        score: {
          team1Score: 0,
          team2Score: 0,
          isCompleted: false,
          history: [],
        },
        status: 'scheduled',
      });
    }

    // Now that every court's foursome for this round is settled, the true
    // resting list is whoever's left over — attach it to all of the round's
    // matches at once.
    const restingIds = [...alreadyResting, ...remainingTied.map((p) => p.id)];
    roundMatches.forEach((m) => {
      m.restingPlayerIds = restingIds;
    });
    matches.push(...roundMatches);
  }

  return matches;
}

/**
 * Regenerates every not-yet-played match against the CURRENT roster and
 * tiers — called after a player is added mid-session or a tier is edited,
 * so upcoming matches reflect the new pool instead of the one that existed
 * when the schedule was first generated. Matches already completed or in
 * progress are left untouched; only 'scheduled' matches are replaced.
 */
export function regenerateRemainingSchedule(
  session: TournamentSession
): { matches: Match[]; totalRounds: number } {
  // Only players who are both active and actually here get scheduled — an
  // away player (or one who hasn't arrived yet) is left out of the unplayed
  // tail until they're marked back.
  const schedulablePlayers = presentPlayers(session.players, Date.now(), session.createdAt);
  const lockedMatches = session.matches.filter((m) => m.status !== 'scheduled');

  if (schedulablePlayers.length < 4 || session.courts.length === 0) {
    return { matches: lockedMatches, totalRounds: session.totalRounds };
  }

  const maxLockedRound = lockedMatches.reduce((max, m) => Math.max(max, m.roundNumber), 0);
  const nextRound = maxLockedRound + 1;
  const desiredRounds = Math.min(10, Math.max(5, schedulablePlayers.length));
  const roundsToGenerate = Math.max(3, desiredRounds - maxLockedRound);
  const nextMatchNumber = lockedMatches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;

  const newMatches = generateGeneralRounds(
    schedulablePlayers,
    session.courts,
    nextRound,
    roundsToGenerate,
    lockedMatches,
    nextMatchNumber,
    session.createdAt,
    session.requestedPairs || []
  );

  return {
    matches: [...lockedMatches, ...newMatches],
    totalRounds: nextRound + roundsToGenerate - 1,
  };
}

/**
 * Rotating Doubles (American / Social Round Robin)
 * Designed for N players (e.g. 8 players) on C courts (e.g. 1 court).
 * Maximizes unique partner pairs and opponent variety while balancing playtime & rest.
 */
export function generateRotatingDoublesSchedule(
  players: Player[],
  courts: Court[],
  _rules: GameRules,
  requestedPairs: Array<[string, string]> = []
): { matches: Match[]; totalRounds: number } {
  const activePlayers = players.filter((p) => p.active);
  const n = activePlayers.length;

  if (n < 4 || courts.length === 0) {
    return { matches: [], totalRounds: 0 };
  }

  // General Algorithmic Generator for arbitrary N players (e.g., 4, 6, 7, 8, 10, 12, 16, etc.)
  // Uses greedy matching to maximize distinct partner pairs & balanced rest
  const desiredRounds = Math.min(10, Math.max(5, n));
  const matches = generateGeneralRounds(activePlayers, courts, 1, desiredRounds, [], 1, Date.now(), requestedPairs);

  return { matches, totalRounds: desiredRounds };
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
