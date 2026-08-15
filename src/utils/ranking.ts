import { Match, Player, PlayerStats } from '../types/badminton';

/**
 * Calculates updated Elo rating for doubles match.
 * Base K-factor: 32.
 * Margin of victory multiplier: sqrt(|pointDiff| / maxPoints).
 */
export function calculateDoublesEloChange(
  team1Players: Player[],
  team2Players: Player[],
  team1Score: number,
  team2Score: number,
  kFactor: number = 32
): { team1Delta: number; team2Delta: number } {
  const avgTeam1 = (team1Players[0].currentRating + team1Players[1].currentRating) / 2;
  const avgTeam2 = (team2Players[0].currentRating + team2Players[1].currentRating) / 2;

  // Expected score for Team 1
  const expected1 = 1 / (1 + Math.pow(10, (avgTeam2 - avgTeam1) / 400));
  const expected2 = 1 - expected1;

  // Actual outcome (1 for win, 0 for loss)
  const actual1 = team1Score > team2Score ? 1 : 0;
  const actual2 = 1 - actual1;

  // Margin multiplier based on point ratio
  const totalPoints = Math.max(1, team1Score + team2Score);
  const pointDiff = Math.abs(team1Score - team2Score);
  const marginMultiplier = 1 + (pointDiff / totalPoints) * 0.5;

  const team1Delta = Math.round(kFactor * (actual1 - expected1) * marginMultiplier);
  const team2Delta = Math.round(kFactor * (actual2 - expected2) * marginMultiplier);

  return { team1Delta, team2Delta };
}

/**
 * Computes individual player stats, rankings, partner synergies, and head-to-head records
 */
export function computePlayerStats(players: Player[], matches: Match[]): PlayerStats[] {
  const completedMatches = matches.filter((m) => m.status === 'completed' && m.score.isCompleted);

  // Map to hold cumulative stats per player ID
  const statsMap = new Map<
    string,
    {
      player: Player;
      mp: number;
      won: number;
      lost: number;
      pf: number;
      pa: number;
      form: ('W' | 'L')[];
      partnerRecords: Map<string, { won: number; played: number }>;
      opponentRecords: Map<string, { won: number; lost: number; played: number }>;
    }
  >();

  players.forEach((p) => {
    statsMap.set(p.id, {
      player: p,
      mp: 0,
      won: 0,
      lost: 0,
      pf: 0,
      pa: 0,
      form: [],
      partnerRecords: new Map(),
      opponentRecords: new Map(),
    });
  });

  // Process completed matches chronologically
  completedMatches.forEach((m) => {
    const t1 = [m.team1.player1, m.team1.player2];
    const t2 = [m.team2.player1, m.team2.player2];
    const t1Score = m.score.team1Score;
    const t2Score = m.score.team2Score;
    const t1Won = t1Score > t2Score;

    // Process Team 1 players
    t1.forEach((p, idx) => {
      const partner = t1[1 - idx];
      const rec = statsMap.get(p.id);
      if (rec) {
        rec.mp += 1;
        rec.pf += t1Score;
        rec.pa += t2Score;
        if (t1Won) {
          rec.won += 1;
          rec.form.push('W');
        } else {
          rec.lost += 1;
          rec.form.push('L');
        }

        // Partner synergy
        if (partner) {
          const pRec = rec.partnerRecords.get(partner.id) || { won: 0, played: 0 };
          pRec.played += 1;
          if (t1Won) pRec.won += 1;
          rec.partnerRecords.set(partner.id, pRec);
        }

        // Opponents
        t2.forEach((opp) => {
          if (!opp) return;
          const oRec = rec.opponentRecords.get(opp.id) || { won: 0, lost: 0, played: 0 };
          oRec.played += 1;
          if (t1Won) oRec.won += 1;
          else oRec.lost += 1;
          rec.opponentRecords.set(opp.id, oRec);
        });
      }
    });

    // Process Team 2 players
    t2.forEach((p, idx) => {
      const partner = t2[1 - idx];
      const rec = statsMap.get(p.id);
      if (rec) {
        rec.mp += 1;
        rec.pf += t2Score;
        rec.pa += t1Score;
        if (!t1Won) {
          rec.won += 1;
          rec.form.push('W');
        } else {
          rec.lost += 1;
          rec.form.push('L');
        }

        // Partner synergy
        if (partner) {
          const pRec = rec.partnerRecords.get(partner.id) || { won: 0, played: 0 };
          pRec.played += 1;
          if (!t1Won) pRec.won += 1;
          rec.partnerRecords.set(partner.id, pRec);
        }

        // Opponents
        t1.forEach((opp) => {
          if (!opp) return;
          const oRec = rec.opponentRecords.get(opp.id) || { won: 0, lost: 0, played: 0 };
          oRec.played += 1;
          if (!t1Won) oRec.won += 1;
          else oRec.lost += 1;
          rec.opponentRecords.set(opp.id, oRec);
        });
      }
    });
  });

  // Convert to PlayerStats array
  const playerMap = new Map<string, Player>(players.map((p) => [p.id, p]));
  const result: PlayerStats[] = [];

  statsMap.forEach((val) => {
    const diff = val.pf - val.pa;
    const winRate = val.mp > 0 ? Math.round((val.won / val.mp) * 100) : 0;
    const rating = val.player.currentRating;
    const ratingChange = rating - val.player.initialRating;

    // Find best partner
    let bestPartner: { partner: Player; winRate: number; playedTogether: number } | undefined;
    let highestPWinRate = -1;
    val.partnerRecords.forEach((pData, partnerId) => {
      const partnerObj = playerMap.get(partnerId);
      if (partnerObj && pData.played >= 1) {
        const rate = (pData.won / pData.played) * 100;
        if (rate > highestPWinRate || (rate === highestPWinRate && pData.played > (bestPartner?.playedTogether || 0))) {
          highestPWinRate = rate;
          bestPartner = {
            partner: partnerObj,
            winRate: Math.round(rate),
            playedTogether: pData.played,
          };
        }
      }
    });

    // Find tough opponent
    let toughOpponent: { opponent: Player; lossRate: number; playedAgainst: number } | undefined;
    let highestLossRate = -1;
    val.opponentRecords.forEach((oData, oppId) => {
      const oppObj = playerMap.get(oppId);
      if (oppObj && oData.played >= 1) {
        const lossRate = (oData.lost / oData.played) * 100;
        if (lossRate > highestLossRate && lossRate > 0) {
          highestLossRate = lossRate;
          toughOpponent = {
            opponent: oppObj,
            lossRate: Math.round(lossRate),
            playedAgainst: oData.played,
          };
        }
      }
    });

    result.push({
      player: val.player,
      matchesPlayed: val.mp,
      matchesWon: val.won,
      matchesLost: val.lost,
      winRate,
      pointsScored: val.pf,
      pointsConceded: val.pa,
      pointDiff: diff,
      rating,
      ratingChange,
      form: val.form.slice(-5), // last 5
      rank: 0,
      favoritePartner: bestPartner,
      toughOpponent,
    });
  });

  // Sort by Wins desc -> Point Diff desc -> Points Scored desc -> Elo Rating desc
  result.sort((a, b) => {
    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsScored !== a.pointsScored) return b.pointsScored - a.pointsScored;
    return b.rating - a.rating;
  });

  // Assign ranks
  result.forEach((st, idx) => {
    st.rank = idx + 1;
  });

  return result;
}
