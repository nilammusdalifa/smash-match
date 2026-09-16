import { Match, Player } from '../types/badminton';

/**
 * A player counts as present at `at` if they had arrived by then (an absent
 * `arrivedAt` means "here since the session started") and had not yet left.
 */
export function isPresentAt(p: Player, at: number, sessionStart: number): boolean {
  const arrived = p.arrivedAt ?? sessionStart;
  if (arrived > at) return false;
  if (p.leftAt !== undefined && p.leftAt <= at) return false;
  return true;
}

export function presentPlayers(players: Player[], at: number, sessionStart: number): Player[] {
  return players.filter((p) => p.active && isPresentAt(p, at, sessionStart));
}

export interface FairShareStats {
  entitled: number;
  played: number;
}

/**
 * Deficits are sums of 4/N terms, so they are fractional and must never be
 * compared with ===. Accumulated error over a session is far below this.
 */
export const FAIR_SHARE_EPSILON = 1e-6;

/**
 * Every match that actually happened owes each player who was present at
 * its start an equal slice of its 4 slots. Whoever is owed the most
 * relative to what they've played goes next.
 *
 * This replaces raw games-played so a late arrival gets a fair share of the
 * time they're actually present — no catch-up bonus for the hour they
 * missed, and no penalty for it either.
 */
export function computeFairShare(
  matches: Match[],
  players: Player[],
  sessionStart: number
): Map<string, FairShareStats> {
  const stats = new Map<string, FairShareStats>();
  players.forEach((p) => stats.set(p.id, { entitled: 0, played: 0 }));

  const ordered = matches
    .filter((m) => m.status !== 'scheduled')
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0) || a.matchNumber - b.matchNumber);

  ordered.forEach((m) => {
    const at = m.startTime ?? sessionStart;
    const present = players.filter((p) => isPresentAt(p, at, sessionStart));
    if (present.length > 0) {
      const share = 4 / present.length;
      present.forEach((p) => {
        const s = stats.get(p.id);
        if (s) s.entitled += share;
      });
    }
    [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2].forEach((p) => {
      const s = stats.get(p.id);
      if (s) s.played += 1;
    });
  });

  // Safety net for a late arrival who was never marked Away: without this,
  // an undefined `arrivedAt` makes them look present since session start,
  // so they can accrue several games of unearned "catch-up" deficit and get
  // force-played match after match once they're finally scheduled. Anyone
  // who has actually played anchors the ceiling, so this only ever clamps a
  // never-played player's deficit — it never touches someone who's played
  // at least once, and it never overrides correct arrivedAt/leftAt
  // accounting (a correctly-marked latecomer already has deficit 0 and
  // never approaches the ceiling).
  const playedDeficits: number[] = [];
  stats.forEach((s, id) => {
    if (s.played > 0) playedDeficits.push(deficitOf(stats, id));
  });
  const ceiling = (playedDeficits.length > 0 ? Math.max(...playedDeficits) : 0) + 1.0;
  stats.forEach((s) => {
    const deficit = s.entitled - s.played;
    if (deficit > ceiling) {
      s.entitled = s.played + ceiling;
    }
  });

  return stats;
}

export function deficitOf(stats: Map<string, FairShareStats>, playerId: string): number {
  const s = stats.get(playerId);
  return s ? s.entitled - s.played : 0;
}
