import { Match, MatchmakingType, Player, GameRules, Court } from '../types/badminton';

/**
 * Generate unique ID
 */
export function generateId(): string {
  return 'id_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
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
  // Uses simulated annealing / greedy matching to maximize distinct partner pairs & balanced rest
  const matches: Match[] = [];
  const partnerCounts = new Map<string, number>();
  const gamesPlayed = new Map<string, number>();
  activePlayers.forEach((p) => gamesPlayed.set(p.id, 0));

  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');
  const desiredRounds = Math.min(10, Math.max(5, n));
  let matchNum = 1;

  for (let r = 1; r <= desiredRounds; r++) {
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

    // Group selected into foursomes
    for (let m = 0; m < matchesPerRound; m++) {
      const four = selectedPlayers.slice(m * 4, m * 4 + 4);
      if (four.length < 4) break;

      // Find combination of 2 vs 2 that minimizes previous partner count
      const configs = [
        { t1: [four[0], four[1]], t2: [four[2], four[3]] },
        { t1: [four[0], four[2]], t2: [four[1], four[3]] },
        { t1: [four[0], four[3]], t2: [four[1], four[2]] },
      ];

      configs.sort((cA, cB) => {
        const costA =
          (partnerCounts.get(getPairKey(cA.t1[0].id, cA.t1[1].id)) || 0) +
          (partnerCounts.get(getPairKey(cA.t2[0].id, cA.t2[1].id)) || 0);
        const costB =
          (partnerCounts.get(getPairKey(cB.t1[0].id, cB.t1[1].id)) || 0) +
          (partnerCounts.get(getPairKey(cB.t2[0].id, cB.t2[1].id)) || 0);
        return costA - costB;
      });

      const best = configs[0];

      // Update tracking
      four.forEach((p) => gamesPlayed.set(p.id, (gamesPlayed.get(p.id) || 0) + 1));
      partnerCounts.set(getPairKey(best.t1[0].id, best.t1[1].id), (partnerCounts.get(getPairKey(best.t1[0].id, best.t1[1].id)) || 0) + 1);
      partnerCounts.set(getPairKey(best.t2[0].id, best.t2[1].id), (partnerCounts.get(getPairKey(best.t2[0].id, best.t2[1].id)) || 0) + 1);

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
