import { Player } from '../types/badminton';

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
