import { Court, Match, Player, TournamentSession } from '../types/badminton';
import { computeFairShare, deficitOf, presentPlayers, FAIR_SHARE_EPSILON } from './fairness';
import {
  generateId,
  isCarryPairing,
  computeCarryHistory,
  computePartnerCounts,
  computeOpponentCounts,
  computeEffectiveRatings,
  pickBestAvailableFoursome,
  pickFoursomeWithRequiredPair,
  pickTopAvailableFoursomeOptions,
} from './scheduler';

const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('-');

/**
 * Players free to be placed on `court` right now: present, and not already
 * committed to another court's in-progress or still-scheduled match.
 * `excludeMatchId` lets a reroll treat the match being replaced as if it
 * didn't exist yet, so its own 4 players are eligible again.
 */
export function eligiblePlayersForCourt(session: TournamentSession, excludeMatchId?: string): Player[] {
  const busyIds = new Set(
    session.matches
      .filter((m) => m.id !== excludeMatchId && (m.status === 'in_progress' || m.status === 'scheduled'))
      .flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  return presentPlayers(session.players, Date.now(), session.createdAt).filter((p) => !busyIds.has(p.id));
}

/**
 * Ensures every idle court (no in-progress or scheduled match of its own)
 * has exactly one fair, rating- and tier-balanced `scheduled` match queued.
 * Replaces the old batch generator: no rounds are pre-built ahead of time,
 * one suggestion per idle court, generated against live history so it
 * reflects every match played so far.
 */
export function refreshSuggestions(session: TournamentSession): { matches: Match[]; totalRounds: number } {
  const activePlayers = session.players.filter((p) => p.active);
  if (activePlayers.length < 4 || session.courts.length === 0) {
    return { matches: session.matches, totalRounds: session.totalRounds };
  }

  const occupiedCourtIds = new Set(
    session.matches
      .filter((m) => m.status === 'scheduled' || m.status === 'in_progress')
      .map((m) => m.courtId)
  );
  const idleCourts = session.courts.filter((c) => !occupiedCourtIds.has(c.id));
  if (idleCourts.length === 0) {
    return { matches: session.matches, totalRounds: session.totalRounds };
  }

  const historyMatches = session.matches.filter((m) => m.status !== 'scheduled');
  const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
  activePlayers.forEach((p) => {
    if (!fairShare.has(p.id)) fairShare.set(p.id, { entitled: 0, played: 0 });
  });
  const partnerCounts = computePartnerCounts(historyMatches);
  const opponentCounts = computeOpponentCounts(historyMatches);
  const carryHistory = computeCarryHistory(historyMatches);
  const effectiveRatings = computeEffectiveRatings(session.players, historyMatches);

  const historyPartnerCounts = computePartnerCounts(historyMatches);
  let outstanding = (session.requestedPairs || []).filter(
    ([a, b]) => (historyPartnerCounts.get(getPairKey(a, b)) || 0) === 0
  );

  let matchNum = session.matches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;
  const newMatches: Match[] = [];

  idleCourts.forEach((court: Court) => {
    const busyIds = new Set(
      [...session.matches, ...newMatches]
        .filter((m) => m.status === 'in_progress' || m.status === 'scheduled')
        .flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
    );
    const eligible = presentPlayers(session.players, Date.now(), session.createdAt).filter((p) => !busyIds.has(p.id));
    if (eligible.length < 4) return;

    const history = { partnerCounts, opponentCounts, carryHistory, effectiveRatings };
    const requestIdx = outstanding.findIndex(
      ([a, b]) => eligible.some((p) => p.id === a) && eligible.some((p) => p.id === b)
    );

    let four: [Player, Player, Player, Player];
    let split: { t1: [Player, Player]; t2: [Player, Player] };

    if (requestIdx >= 0) {
      const [aId, bId] = outstanding[requestIdx];
      const pa = eligible.find((p) => p.id === aId)!;
      const pb = eligible.find((p) => p.id === bId)!;
      const rest = eligible.filter((p) => p.id !== aId && p.id !== bId);
      if (rest.length >= 2) {
        // Honoring a request must not cost someone else their turn: the two
        // filler slots still go to whoever is owed the most court time.
        // Mirrors the mustPlay/tiedCandidates split in
        // `pickBestAvailableFoursome`, with the cutoff taken at the
        // 2nd-highest deficit because 2 slots are being filled, plus an
        // epsilon tie band so equally-owed players all stay in contention
        // for the tier/carry/rating/variety choice among them.
        const byDeficit = [...rest].sort(
          (a, b) => deficitOf(fairShare, b.id) - deficitOf(fairShare, a.id)
        );
        const cutoffDeficit = deficitOf(fairShare, byDeficit[1].id);
        const band = byDeficit.filter(
          (p) => deficitOf(fairShare, p.id) - cutoffDeficit >= -FAIR_SHARE_EPSILON
        );
        // `band` always holds at least the top two by construction; the
        // fallback is a guard so a request is never dropped for want of
        // candidates.
        const candidates = band.length >= 2 ? band : rest;
        const picked = pickFoursomeWithRequiredPair([pa, pb], candidates, history);
        four = picked.four;
        split = picked.split;
        outstanding = outstanding.filter((_, i) => i !== requestIdx);
      } else {
        const picked = pickBestAvailableFoursome(eligible, { ...history, fairShare });
        four = picked.four;
        split = picked.split;
      }
    } else {
      const picked = pickBestAvailableFoursome(eligible, { ...history, fairShare });
      four = picked.four;
      split = picked.split;
    }

    // Project this match forward so the NEXT idle court in this same
    // refresh pass sees an up-to-date picture (mirrors the projection the
    // old batch generator did per-match within a round).
    const share = 4 / activePlayers.length;
    activePlayers.forEach((p) => {
      const s = fairShare.get(p.id);
      if (s) s.entitled += share;
    });
    four.forEach((p) => {
      const s = fairShare.get(p.id);
      if (s) s.played += 1;
    });
    const k1 = getPairKey(split.t1[0].id, split.t1[1].id);
    const k2 = getPairKey(split.t2[0].id, split.t2[1].id);
    partnerCounts.set(k1, (partnerCounts.get(k1) || 0) + 1);
    partnerCounts.set(k2, (partnerCounts.get(k2) || 0) + 1);
    split.t1.forEach((a) => {
      split.t2.forEach((b) => {
        const ok = getPairKey(a.id, b.id);
        opponentCounts.set(ok, (opponentCounts.get(ok) || 0) + 1);
      });
    });
    [split.t1, split.t2].forEach((team) => {
      const carry = isCarryPairing(team[0], team[1]);
      team.forEach((p) => {
        const stats = carryHistory.get(p.id) || { carryCount: 0, hardCount: 0, lastWasCarry: null };
        if (carry) stats.carryCount++;
        else stats.hardCount++;
        stats.lastWasCarry = carry;
        carryHistory.set(p.id, stats);
      });
    });

    const roundNumber = Math.floor((matchNum - 1) / session.courts.length) + 1;
    newMatches.push({
      id: generateId(),
      roundNumber,
      matchNumber: matchNum++,
      courtId: court.id,
      courtName: court.name,
      team1: { player1: split.t1[0], player2: split.t1[1] },
      team2: { player1: split.t2[0], player2: split.t2[1] },
      score: { team1Score: 0, team2Score: 0, isCompleted: false, history: [] },
      status: 'scheduled',
    });
  });

  if (newMatches.length === 0) {
    return { matches: session.matches, totalRounds: session.totalRounds };
  }

  const finalBusyIds = new Set(
    [...session.matches, ...newMatches]
      .filter((m) => m.status !== 'completed')
      .flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const restingIds = presentPlayers(session.players, Date.now(), session.createdAt)
    .filter((p) => !finalBusyIds.has(p.id))
    .map((p) => p.id);
  newMatches.forEach((m) => {
    m.restingPlayerIds = restingIds;
  });

  const matches = [...session.matches, ...newMatches];
  const totalRounds = matches.reduce((max, m) => Math.max(max, m.roundNumber), 1);
  return { matches, totalRounds };
}

/**
 * Replaces one still-`scheduled` match's 4 players with a different
 * comparably-fair foursome, drawn from the same top-K search Match Queue's
 * Auto Fill already uses — full tier/carry/rating/variety logic on every
 * reroll, never a blind shuffle. Returns null if the match isn't
 * reroll-able (already started) or there simply aren't 4 eligible players.
 */
export function rerollMatch(
  session: TournamentSession,
  matchId: string
): { team1: [string, string]; team2: [string, string] } | null {
  const match = session.matches.find((m) => m.id === matchId);
  if (!match || match.status !== 'scheduled') return null;

  const eligible = eligiblePlayersForCourt(session, matchId);
  if (eligible.length < 4) return null;

  const historyMatches = session.matches.filter((m) => m.id !== matchId && m.status !== 'scheduled');
  const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
  const carryHistory = computeCarryHistory(historyMatches);
  const partnerCounts = computePartnerCounts(historyMatches);
  const opponentCounts = computeOpponentCounts(historyMatches);
  const effectiveRatings = computeEffectiveRatings(session.players, historyMatches);

  const currentIds = new Set([
    match.team1.player1.id,
    match.team1.player2.id,
    match.team2.player1.id,
    match.team2.player2.id,
  ]);

  const options = pickTopAvailableFoursomeOptions(
    eligible,
    { fairShare, carryHistory, partnerCounts, opponentCounts, effectiveRatings },
    5
  );
  const different = options.filter((o) => !o.four.every((p) => currentIds.has(p.id)));
  const pool = different.length > 0 ? different : options;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  return {
    team1: [chosen.split.t1[0].id, chosen.split.t1[1].id],
    team2: [chosen.split.t2[0].id, chosen.split.t2[1].id],
  };
}

/**
 * Drops still-`scheduled` matches parked on a court that no longer exists.
 * Shrinking the court count would otherwise strand them in
 * `session.matches` forever: `refreshSuggestions` derives its idle courts
 * from `session.courts`, so it never sees the orphan, while the orphan's 4
 * players stay counted "busy" by every later eligible-pool computation —
 * silently shrinking the playable roster. `completed`/`in_progress`
 * matches keep their historical court id untouched, and a scheduled match
 * with no court assigned isn't on a removed court, so it stays too.
 */
export function dropScheduledMatchesOnRemovedCourts(matches: Match[], courts: Court[]): Match[] {
  const courtIds = new Set(courts.map((c) => c.id));
  return matches.filter(
    (m) => m.status !== 'scheduled' || m.courtId === undefined || courtIds.has(m.courtId)
  );
}

/**
 * One-time cleanup for a session saved before rolling generation existed:
 * keeps only the earliest (lowest matchNumber) `scheduled` match per court
 * and drops the rest. `completed`/`in_progress` matches are never touched.
 * Rolling generation only ever creates one `scheduled` match per idle
 * court going forward, so this surplus can't recur once trimmed.
 */
export function trimSurplusScheduledMatches(session: TournamentSession): Match[] {
  const nonScheduled = session.matches.filter((m) => m.status !== 'scheduled');
  const scheduled = session.matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const seenCourts = new Set<string>();
  const kept: Match[] = [];
  scheduled.forEach((m) => {
    const courtKey = m.courtId ?? '';
    if (seenCourts.has(courtKey)) return;
    seenCourts.add(courtKey);
    kept.push(m);
  });

  return [...nonScheduled, ...kept];
}

/**
 * The one-time cleanup a session saved under the old batch generator needs:
 * that generator could leave several `scheduled` matches queued on the same
 * court, and rolling generation assumes at most one it created itself.
 *
 * Gated on the persisted `rollingMigrated` flag rather than on the surplus
 * itself. Custom Match deliberately queues a SECOND scheduled match on a
 * court (it runs sequentially, after whatever's already there), so a
 * surplus-based gate would fire again the moment someone used that feature
 * and silently delete their match. Every session that predates the flag is
 * checked and stamped exactly once on its next load — including one that's
 * already clean, which just gets the stamp.
 *
 * Returns the migrated session, or null when there is nothing to do.
 */
export function migrateRollingSession(session: TournamentSession): TournamentSession | null {
  if (session.rollingMigrated) return null;

  const scheduledPerCourt = new Map<string, number>();
  session.matches.forEach((m) => {
    if (m.status !== 'scheduled') return;
    const key = m.courtId ?? '';
    scheduledPerCourt.set(key, (scheduledPerCourt.get(key) || 0) + 1);
  });
  const hasSurplus = [...scheduledPerCourt.values()].some((count) => count > 1);

  let matches = session.matches;
  let totalRounds = session.totalRounds;
  if (hasSurplus) {
    const trimmedMatches = trimSurplusScheduledMatches(session);
    ({ matches, totalRounds } = refreshSuggestions({ ...session, matches: trimmedMatches }));
  }

  return { ...session, matches, totalRounds, rollingMigrated: true };
}
