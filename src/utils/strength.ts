import { Match, Player } from '../types/badminton';

/**
 * How much a player's most recent completed matches nudge their effective
 * rating, most-recent-first. Small next to a real Elo spread (a full sweep
 * of all 3 is ±40) — enough to reflect being "hot" or "cold" today without
 * overriding a real skill gap.
 */
const FORM_WEIGHTS = [20, 13, 7];

function didPlayerWin(playerId: string, m: Match): boolean {
  const inTeam1 = m.team1.player1.id === playerId || m.team1.player2.id === playerId;
  const t1Won = m.score.team1Score > m.score.team2Score;
  return inTeam1 ? t1Won : !t1Won;
}

/**
 * `currentRating` (Elo) plus a recency-weighted nudge from this player's
 * last 3 completed matches — used only to balance team strength within a
 * single match, never displayed and never persisted. Recomputed fresh from
 * `matches` every time, the same pattern `computeFairShare` and
 * `computeCarryHistory` already use for derived-from-history stats.
 */
export function computeEffectiveRatings(players: Player[], matches: Match[]): Map<string, number> {
  const completed = matches
    .filter((m) => m.status === 'completed' && m.score.isCompleted)
    .slice()
    .sort((a, b) => (a.endTime ?? a.startTime ?? 0) - (b.endTime ?? b.startTime ?? 0) || a.matchNumber - b.matchNumber);

  const byPlayer = new Map<string, Match[]>();
  completed.forEach((m) => {
    [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id].forEach((id) => {
      if (!byPlayer.has(id)) byPlayer.set(id, []);
      byPlayer.get(id)!.push(m);
    });
  });

  const result = new Map<string, number>();
  players.forEach((p) => {
    const history = byPlayer.get(p.id) ?? [];
    const last3 = history.slice(-3).reverse(); // most recent first
    let nudge = 0;
    last3.forEach((m, i) => {
      nudge += didPlayerWin(p.id, m) ? FORM_WEIGHTS[i] : -FORM_WEIGHTS[i];
    });
    result.set(p.id, p.currentRating + nudge);
  });
  return result;
}
