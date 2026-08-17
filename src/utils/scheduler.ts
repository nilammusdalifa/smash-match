import { Match, MatchmakingType, Player, GameRules, Court, TournamentSession } from '../types/badminton';

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

/** How many matches each player has already been part of. */
export function computeGamesPlayed(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  matches.forEach((m) => {
    [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id].forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  return counts;
}

type TeamSplit = { t1: [Player, Player]; t2: [Player, Player] };

/**
 * Lower is better. Scores a specific 2v2 split by, in order of weight:
 * 1. Tier gap bucket — 0/1 point gap is "fair" (tied); anything wider is a
 *    real mismatch and dominates everything else.
 * 2. Repeat-carry violations — putting someone into a mixed-tier (carry)
 *    pairing for the second time running.
 * 3. Carry/hard balance — nudges each player's carry vs. hard game count
 *    back toward parity over the session.
 * 4. Repeat partnerships (existing tiebreak).
 * Exported as a plain number (not just a comparator) so `pickBestFoursome`
 * can compare candidate foursomes against each other, not just compare
 * splits within one fixed foursome.
 */
function scoreTeamSplit(
  c: TeamSplit,
  partnerCounts: Map<string, number>,
  carryHistory: Map<string, CarryStats>
): number {
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

  return tierGapBucket * 1000 + repeatCarryViolations * 100 + carryBalanceScore * 10 + partnerCost;
}

/** Given exactly 4 players, picks the lowest-scoring 2v2 split (see `scoreTeamSplit`). */
export function pickBestTeamSplit(
  four: [Player, Player, Player, Player],
  opts: { partnerCounts?: Map<string, number>; carryHistory?: Map<string, CarryStats> } = {}
): TeamSplit {
  const partnerCounts = opts.partnerCounts || new Map<string, number>();
  const carryHistory = opts.carryHistory || new Map<string, CarryStats>();

  const configs: TeamSplit[] = [
    { t1: [four[0], four[1]], t2: [four[2], four[3]] },
    { t1: [four[0], four[2]], t2: [four[1], four[3]] },
    { t1: [four[0], four[3]], t2: [four[1], four[2]] },
  ];

  configs.sort(
    (cA, cB) => scoreTeamSplit(cA, partnerCounts, carryHistory) - scoreTeamSplit(cB, partnerCounts, carryHistory)
  );

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
  partnerCounts: Map<string, number>,
  carryHistory: Map<string, CarryStats>
): { four: [Player, Player, Player, Player]; split: TeamSplit } {
  const MAX_TIED_POOL_FOR_SEARCH = 14;
  const pool = tiedCandidates.length <= MAX_TIED_POOL_FOR_SEARCH
    ? tiedCandidates
    : tiedCandidates.slice(0, MAX_TIED_POOL_FOR_SEARCH);

  const combos = slotsNeeded > 0 ? chooseKCombinations(pool, slotsNeeded) : [[]];

  let best: { four: [Player, Player, Player, Player]; split: TeamSplit; score: number } | null = null;
  combos.forEach((tiedSubset) => {
    const four = [...mustPlay, ...tiedSubset] as [Player, Player, Player, Player];
    const split = pickBestTeamSplit(four, { partnerCounts, carryHistory });
    const score = scoreTeamSplit(split, partnerCounts, carryHistory);
    if (!best || score < best.score) {
      best = { four, split, score };
    }
  });

  return best!;
}

/**
 * Public entry point for picking a single match out of a pool of available
 * players (Auto Fill, reshuffle-one-match) — same rule as the main
 * scheduler: whoever's played the fewest games must be included, and the
 * choice among anyone tied on games played is optimized for tier balance
 * and carry fairness rather than picked arbitrarily.
 */
export function pickBestAvailableFoursome(
  available: Player[],
  opts: {
    gamesPlayed?: Map<string, number>;
    partnerCounts?: Map<string, number>;
    carryHistory?: Map<string, CarryStats>;
  } = {}
): { four: [Player, Player, Player, Player]; split: TeamSplit } {
  const gamesPlayed = opts.gamesPlayed || new Map<string, number>();
  const partnerCounts = opts.partnerCounts || new Map<string, number>();
  const carryHistory = opts.carryHistory || new Map<string, CarryStats>();

  const pool = [...available].sort((a, b) => {
    const gA = gamesPlayed.get(a.id) || 0;
    const gB = gamesPlayed.get(b.id) || 0;
    if (gA !== gB) return gA - gB;
    return Math.random() - 0.5;
  });

  const cutoffPlayer = pool[3];
  const cutoffGames = cutoffPlayer ? gamesPlayed.get(cutoffPlayer.id) || 0 : -1;
  const mustPlay = pool.filter((p) => (gamesPlayed.get(p.id) || 0) < cutoffGames);
  const tiedCandidates = pool.filter((p) => (gamesPlayed.get(p.id) || 0) === cutoffGames);
  const slotsNeeded = 4 - mustPlay.length;

  return pickBestFoursome(mustPlay, tiedCandidates, slotsNeeded, partnerCounts, carryHistory);
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
  courtCount: number,
  startRound: number,
  roundsToGenerate: number,
  historyMatches: Match[],
  startMatchNumber: number
): Match[] {
  const n = activePlayers.length;
  const matches: Match[] = [];
  const partnerCounts = computePartnerCounts(historyMatches);
  const gamesPlayed = computeGamesPlayed(historyMatches);
  const carryHistory = computeCarryHistory(historyMatches);
  activePlayers.forEach((p) => {
    if (!gamesPlayed.has(p.id)) gamesPlayed.set(p.id, 0);
  });

  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');
  let matchNum = startMatchNumber;

  for (let r = startRound; r < startRound + roundsToGenerate; r++) {
    // Sort players primarily by least games played, then random tiebreaker
    const pool = [...activePlayers].sort((a, b) => {
      const gA = gamesPlayed.get(a.id) || 0;
      const gB = gamesPlayed.get(b.id) || 0;
      if (gA !== gB) return gA - gB;
      return Math.random() - 0.5;
    });

    const matchesPerRound = Math.min(courtCount, Math.floor(n / 4));
    const playersInRoundCount = matchesPerRound * 4;

    // Whoever has played strictly fewer games than the round's cutoff MUST
    // play this round — that's the non-negotiable fairness guarantee.
    // Everyone tied at the cutoff value is equally deserving of a slot, so
    // which of THEM fill the remaining spots is free to pick for carry
    // balance instead of arbitrary sort order.
    const cutoffPlayer = pool[playersInRoundCount - 1];
    const cutoffGames = cutoffPlayer ? gamesPlayed.get(cutoffPlayer.id) || 0 : -1;
    let remainingMustPlay = pool.filter((p) => (gamesPlayed.get(p.id) || 0) < cutoffGames);
    let remainingTied = pool.filter((p) => (gamesPlayed.get(p.id) || 0) === cutoffGames);
    const alreadyResting = pool.filter((p) => (gamesPlayed.get(p.id) || 0) > cutoffGames).map((p) => p.id);

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

      const { four, split: best } = pickBestFoursome(
        mustPlayForThisMatch,
        remainingTied,
        slotsNeeded,
        partnerCounts,
        carryHistory
      );
      const chosenTiedIds = new Set(
        four.filter((p) => !mustPlayForThisMatch.some((mp) => mp.id === p.id)).map((p) => p.id)
      );
      remainingTied = remainingTied.filter((p) => !chosenTiedIds.has(p.id));

      four.forEach((p) => gamesPlayed.set(p.id, (gamesPlayed.get(p.id) || 0) + 1));
      const k1 = getPairKey(best.t1[0].id, best.t1[1].id);
      const k2 = getPairKey(best.t2[0].id, best.t2[1].id);
      partnerCounts.set(k1, (partnerCounts.get(k1) || 0) + 1);
      partnerCounts.set(k2, (partnerCounts.get(k2) || 0) + 1);

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

      const assignedCourt = ((m % courtCount) + 1).toString();
      roundMatches.push({
        id: generateId(),
        roundNumber: r,
        matchNumber: matchNum++,
        courtId: assignedCourt,
        courtName: `Court ${assignedCourt}`,
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
  session: TournamentSession,
  courtCount: number
): { matches: Match[]; totalRounds: number } {
  const activePlayers = session.players.filter((p) => p.active);
  const lockedMatches = session.matches.filter((m) => m.status !== 'scheduled');

  if (session.matchmakingType !== 'rotating_doubles' || activePlayers.length < 4) {
    return { matches: lockedMatches, totalRounds: session.totalRounds };
  }

  const maxLockedRound = lockedMatches.reduce((max, m) => Math.max(max, m.roundNumber), 0);
  const nextRound = maxLockedRound + 1;
  const desiredRounds = Math.min(10, Math.max(5, activePlayers.length));
  const roundsToGenerate = Math.max(3, desiredRounds - maxLockedRound);
  const nextMatchNumber = lockedMatches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;

  const newMatches = generateGeneralRounds(
    activePlayers,
    courtCount,
    nextRound,
    roundsToGenerate,
    lockedMatches,
    nextMatchNumber
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
  courtCount: number = 1,
  _rules: GameRules
): { matches: Match[]; totalRounds: number } {
  const activePlayers = players.filter((p) => p.active);
  const n = activePlayers.length;

  if (n < 4) {
    return { matches: [], totalRounds: 0 };
  }

  // Pre-calculated balanced combinatorial schedules for common social pool sizes (e.g., 8 players, 12 players, 16 players)
  // For 8 players (P0 to P7), classic 7-round Whist/Social schedule where every player pairs with all 7 others:
  if (n === 8) {
    const p = activePlayers;
    // 7 rounds of 2 matches each (total 14 pairings). If 1 court, matches run sequentially (14 matches or 7 selected).
    const roundPairings = [
      // Round 1
      [
        { t1: [p[0], p[1]], t2: [p[2], p[3]], resting: [p[4].id, p[5].id, p[6].id, p[7].id] },
        { t1: [p[4], p[5]], t2: [p[6], p[7]], resting: [p[0].id, p[1].id, p[2].id, p[3].id] },
      ],
      // Round 2
      [
        { t1: [p[0], p[2]], t2: [p[4], p[6]], resting: [p[1].id, p[3].id, p[5].id, p[7].id] },
        { t1: [p[1], p[3]], t2: [p[5], p[7]], resting: [p[0].id, p[2].id, p[4].id, p[6].id] },
      ],
      // Round 3
      [
        { t1: [p[0], p[3]], t2: [p[5], p[6]], resting: [p[1].id, p[2].id, p[4].id, p[7].id] },
        { t1: [p[1], p[2]], t2: [p[4], p[7]], resting: [p[0].id, p[3].id, p[5].id, p[6].id] },
      ],
      // Round 4
      [
        { t1: [p[0], p[4]], t2: [p[1], p[7]], resting: [p[2].id, p[3].id, p[5].id, p[6].id] },
        { t1: [p[2], p[5]], t2: [p[3], p[6]], resting: [p[0].id, p[1].id, p[4].id, p[7].id] },
      ],
      // Round 5
      [
        { t1: [p[0], p[5]], t2: [p[2], p[7]], resting: [p[1].id, p[3].id, p[4].id, p[6].id] },
        { t1: [p[1], p[4]], t2: [p[3], p[5]], resting: [p[0].id, p[2].id, p[6].id, p[7].id] },
      ],
      // Round 6
      [
        { t1: [p[0], p[6]], t2: [p[1], p[5]], resting: [p[2].id, p[3].id, p[4].id, p[7].id] },
        { t1: [p[2], p[4]], t2: [p[3], p[7]], resting: [p[0].id, p[1].id, p[5].id, p[6].id] },
      ],
      // Round 7
      [
        { t1: [p[0], p[7]], t2: [p[2], p[6]], resting: [p[1].id, p[3].id, p[4].id, p[5].id] },
        { t1: [p[1], p[6]], t2: [p[3], p[4]], resting: [p[0].id, p[2].id, p[5].id, p[7].id] },
      ],
    ];

    const matches: Match[] = [];
    let matchIdx = 1;

    roundPairings.forEach((round, rIdx) => {
      round.forEach((m, subIdx) => {
        const assignedCourt = courtCount === 1 ? '1' : ((subIdx % courtCount) + 1).toString();
        matches.push({
          id: generateId(),
          roundNumber: rIdx + 1,
          matchNumber: matchIdx++,
          courtId: assignedCourt,
          courtName: `Court ${assignedCourt}`,
          team1: { player1: m.t1[0], player2: m.t1[1] },
          team2: { player1: m.t2[0], player2: m.t2[1] },
          score: {
            team1Score: 0,
            team2Score: 0,
            isCompleted: false,
            history: [],
          },
          status: 'scheduled',
          restingPlayerIds: m.resting,
        });
      });
    });

    return { matches, totalRounds: roundPairings.length };
  }

  // General Algorithmic Generator for arbitrary N players (e.g., 4, 6, 10, 12, 16, etc.)
  // Uses greedy matching to maximize distinct partner pairs & balanced rest
  const desiredRounds = Math.min(10, Math.max(5, n));
  const matches = generateGeneralRounds(activePlayers, courtCount, 1, desiredRounds, [], 1);

  return { matches, totalRounds: desiredRounds };
}

/**
 * Fixed Doubles Schedule (Teams are fixed throughout the tournament)
 */
export function generateFixedDoublesSchedule(
  players: Player[],
  courtCount: number = 1,
  _rules: GameRules
): { matches: Match[]; totalRounds: number } {
  const activePlayers = players.filter((p) => p.active);
  if (activePlayers.length < 4) return { matches: [], totalRounds: 0 };

  // Create fixed pairs
  const teams: { id: string; p1: Player; p2: Player }[] = [];
  for (let i = 0; i < activePlayers.length - 1; i += 2) {
    teams.push({
      id: `team_${i / 2 + 1}`,
      p1: activePlayers[i],
      p2: activePlayers[i + 1],
    });
  }

  if (teams.length < 2) return { matches: [], totalRounds: 0 };

  // Round Robin between teams (Berger algorithm)
  const teamList = [...teams];
  if (teamList.length % 2 !== 0) {
    // dummy team for bye if odd
    teamList.push({
      id: 'bye',
      p1: { id: 'bye', name: 'BYE', initialRating: 0, currentRating: 0, active: false },
      p2: { id: 'bye', name: 'BYE', initialRating: 0, currentRating: 0, active: false },
    });
  }

  const numTeams = teamList.length;
  const numRounds = numTeams - 1;
  const half = numTeams / 2;
  const matches: Match[] = [];
  let matchNum = 1;

  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < half; i++) {
      const t1 = teamList[i];
      const t2 = teamList[numTeams - 1 - i];

      if (t1.id === 'bye' || t2.id === 'bye') continue;

      const courtIdx = ((matches.length % courtCount) + 1).toString();
      matches.push({
        id: generateId(),
        roundNumber: round + 1,
        matchNumber: matchNum++,
        courtId: courtIdx,
        courtName: `Court ${courtIdx}`,
        team1: { player1: t1.p1, player2: t1.p2 },
        team2: { player1: t2.p1, player2: t2.p2 },
        score: {
          team1Score: 0,
          team2Score: 0,
          isCompleted: false,
          history: [],
        },
        status: 'scheduled',
      });
    }

    // Rotate array (keep index 0 fixed)
    const last = teamList.pop()!;
    teamList.splice(1, 0, last);
  }

  return { matches, totalRounds: numRounds };
}

/**
 * Generate Master Schedule according to selected mode
 */
export function generateSchedule(
  type: MatchmakingType,
  players: Player[],
  courtCount: number,
  rules: GameRules
): { matches: Match[]; totalRounds: number } {
  if (type === 'fixed_doubles') {
    return generateFixedDoublesSchedule(players, courtCount, rules);
  }
  return generateRotatingDoublesSchedule(players, courtCount, rules);
}

/**
 * Initialize Courts
 */
export function initializeCourts(courtCount: number): Court[] {
  const courts: Court[] = [];
  for (let i = 1; i <= courtCount; i++) {
    courts.push({
      id: i.toString(),
      name: `Court ${i}`,
      isActive: true,
    });
  }
  return courts;
}
