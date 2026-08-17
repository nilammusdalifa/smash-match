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

/**
 * Given exactly 4 players, picks the fairest 2v2 split. In priority order:
 * 1. Smallest tier gap between the two teams (don't stack all the strength
 *    on one side).
 * 2. Avoid putting anyone into a carry pairing (mixed-tier teammate) for the
 *    second match in a row.
 * 3. Nudge each player's carry/hard game count back toward parity over the
 *    session, so nobody is always the one carrying or always being carried.
 * 4. Minimize repeat partnerships (existing tiebreak).
 */
export function pickBestTeamSplit(
  four: [Player, Player, Player, Player],
  opts: { partnerCounts?: Map<string, number>; carryHistory?: Map<string, CarryStats> } = {}
): { t1: [Player, Player]; t2: [Player, Player] } {
  const partnerCounts = opts.partnerCounts || new Map<string, number>();
  const carryHistory = opts.carryHistory || new Map<string, CarryStats>();
  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');

  type Config = { t1: [Player, Player]; t2: [Player, Player] };
  const configs: Config[] = [
    { t1: [four[0], four[1]], t2: [four[2], four[3]] },
    { t1: [four[0], four[2]], t2: [four[1], four[3]] },
    { t1: [four[0], four[3]], t2: [four[1], four[2]] },
  ];

  const tierGap = (c: Config) =>
    Math.abs((tierScore(c.t1[0]) + tierScore(c.t1[1])) - (tierScore(c.t2[0]) + tierScore(c.t2[1])));

  // A gap of 0-2 is still a reasonably competitive match — e.g. A+B vs A+B
  // (gap 0, both teams carrying) and A+A vs B+B (gap 2, both teams playing
  // their own level) are both fine outcomes. Treat those as tied so carry
  // history gets to pick between them, instead of the perfectly-balanced
  // carry pairing always winning and locking the same players into carrying
  // every round. A real blowout (gap 3+, e.g. stacking A+A vs B+C) still
  // dominates outright regardless of carry history.
  const tierGapBucket = (c: Config) => {
    const gap = tierGap(c);
    return gap <= 2 ? 0 : gap;
  };

  const repeatCarryViolations = (c: Config) => {
    let count = 0;
    [c.t1, c.t2].forEach((team) => {
      if (!isCarryPairing(team[0], team[1])) return;
      team.forEach((p) => {
        if (carryHistory.get(p.id)?.lastWasCarry) count++;
      });
    });
    return count;
  };

  const carryBalanceScore = (c: Config) => {
    let score = 0;
    [c.t1, c.t2].forEach((team) => {
      const carry = isCarryPairing(team[0], team[1]);
      team.forEach((p) => {
        const stats = carryHistory.get(p.id) || { carryCount: 0, hardCount: 0, lastWasCarry: null };
        score += carry ? stats.carryCount - stats.hardCount : stats.hardCount - stats.carryCount;
      });
    });
    return score;
  };

  const partnerCost = (c: Config) =>
    (partnerCounts.get(getPairKey(c.t1[0].id, c.t1[1].id)) || 0) +
    (partnerCounts.get(getPairKey(c.t2[0].id, c.t2[1].id)) || 0);

  configs.sort((cA, cB) => {
    const tg = tierGapBucket(cA) - tierGapBucket(cB);
    if (tg !== 0) return tg;
    const rc = repeatCarryViolations(cA) - repeatCarryViolations(cB);
    if (rc !== 0) return rc;
    const cb = carryBalanceScore(cA) - carryBalanceScore(cB);
    if (cb !== 0) return cb;
    return partnerCost(cA) - partnerCost(cB);
  });

  return configs[0];
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
    const selectedPlayers = pool.slice(0, playersInRoundCount);
    const restingIds = pool.slice(playersInRoundCount).map((p) => p.id);

    for (let m = 0; m < matchesPerRound; m++) {
      const four = selectedPlayers.slice(m * 4, m * 4 + 4);
      if (four.length < 4) break;

      const best = pickBestTeamSplit(four as [Player, Player, Player, Player], {
        partnerCounts,
        carryHistory,
      });

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
      matches.push({
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
        restingPlayerIds: restingIds,
      });
    }
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
