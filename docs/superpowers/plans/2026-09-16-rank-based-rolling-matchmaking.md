# Rank-Based Rolling Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold Elo+form into team-balance scoring, cap fair-share deficit for late arrivals who were never marked Away, and replace batch schedule generation with one-match-at-a-time rolling suggestions that support reroll.

**Architecture:** Extend the existing fairness/tier engine (`src/utils/scheduler.ts`, `src/utils/fairness.ts`) rather than replace it. Add a new `src/utils/strength.ts` for Elo+form. Add a hard catch-up cap inside `computeFairShare`. Delete the batch generator (`generateRotatingDoublesSchedule`, `generateGeneralRounds`, `regenerateRemainingSchedule`) and replace it with a new `src/utils/rolling.ts` that creates exactly one `scheduled` match per idle court and supports reroll via the existing top-K fair-options search.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind v4. No test framework in this repo — pure logic is verified with `tsx` scripts under `scripts/` (`npx tsx scripts/verify-x.ts`, exits 0/1, prints `ALL PASS` or `N FAILURE(S)`), matching `scripts/verify-fair-share.ts`'s existing style. UI behavior is verified live via `npm run dev` + manual click-through (Playwright MCP if available, otherwise the browser directly).

**Spec:** `docs/superpowers/specs/2026-09-16-rank-based-rolling-matchmaking-design.md`

## Global Constraints

- Tier scores are fixed: `A=3, B=2, C=1`, untiered counts as B (`tierScore` in `scheduler.ts`).
- A "carry"/*gendong* pairing means the two **teammates** are different tiers. A "hard" game means teammates share a tier.
- A match is only "fair" on strength-by-tier if the two teams' combined tier gap is **≤ 1**. Gap ≥ 2 is not an acceptable substitute for avoiding a carry.
- Priority ladder (highest weight first): equal playing time (fair-share deficit, non-negotiable) → tier balance → carry-repeat avoidance → carry/hard balance → **rating balance (new)** → partner variety → opponent variety.
- New player-facing copy stays short — no long explanatory paragraphs.
- Every task ends with `npm run lint` (tsc --noEmit) passing and a commit.

---

## Task 1: Effective rating helper

**Files:**
- Create: `src/utils/strength.ts`
- Test: `scripts/verify-effective-rating.ts`

**Interfaces:**
- Produces: `computeEffectiveRatings(players: Player[], matches: Match[]): Map<string, number>` — later tasks (Task 2, 5) call this once per scheduling pass and read it via `.get(player.id) ?? player.currentRating`.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-effective-rating.ts`:

```ts
import { computeEffectiveRatings } from '../src/utils/strength';
import { Match, Player } from '../src/types/badminton';

function mkPlayer(id: string, rating: number): Player {
  return { id, name: id, initialRating: rating, currentRating: rating, active: true };
}

function mkMatch(n: number, endTime: number, ids: string[], t1Score: number, t2Score: number): Match {
  const byId = new Map(ids.map((id) => [id, mkPlayer(id, 1200)]));
  return {
    id: 'm' + n,
    roundNumber: n,
    matchNumber: n,
    endTime,
    team1: { player1: byId.get(ids[0])!, player2: byId.get(ids[1])! },
    team2: { player1: byId.get(ids[2])!, player2: byId.get(ids[3])! },
    score: { team1Score: t1Score, team2Score: t2Score, isCompleted: true },
    status: 'completed',
  };
}

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-9;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}, want ${expected}`);
}

// P0 is on team1 for all 3 matches: win, win, loss (most recent last).
const matches = [
  mkMatch(1, 1000, ['P0', 'P1', 'P2', 'P3'], 30, 20), // P0 wins
  mkMatch(2, 2000, ['P0', 'P1', 'P2', 'P3'], 30, 25), // P0 wins
  mkMatch(3, 3000, ['P0', 'P1', 'P2', 'P3'], 15, 30), // P0 loses
];
const roster = [mkPlayer('P0', 1200), mkPlayer('P1', 1200), mkPlayer('P2', 1200), mkPlayer('P3', 1200)];

const ratings = computeEffectiveRatings(roster, matches);
// Most recent first: loss(-20), win(+13), win(+7) => 1200 - 20 + 13 + 7 = 1200
check('P0 effective rating (W,W,L most-recent-first: L,W,W)', ratings.get('P0')!, 1200 - 20 + 13 + 7);

// A player with zero completed matches gets no nudge.
const fresh = mkPlayer('NEW', 1150);
const freshRatings = computeEffectiveRatings([fresh], []);
check('player with no matches keeps base rating', freshRatings.get('NEW')!, 1150);

// A player with exactly 1 completed match (a win) gets only the +20 slot.
const oneMatch = [mkMatch(1, 1000, ['P0', 'P1', 'P2', 'P3'], 30, 10)];
const oneRatings = computeEffectiveRatings(roster, oneMatch);
check('P0 with exactly 1 win', oneRatings.get('P0')!, 1200 + 20);
check('P2 with exactly 1 loss', oneRatings.get('P2')!, 1200 - 20);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/verify-effective-rating.ts`
Expected: FAIL — `Cannot find module '../src/utils/strength'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/strength.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/verify-effective-rating.ts`
Expected: `ALL PASS`

- [ ] **Step 5: Run typecheck and commit**

Run: `npm run lint`
Expected: no errors.

```bash
git add src/utils/strength.ts scripts/verify-effective-rating.ts
git commit -m "Add effective-rating helper (Elo + recent-form nudge)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Rating balance in team-split scoring

**Files:**
- Modify: `src/utils/scheduler.ts` (the `FairnessHistory` interface and `scoreTeamSplit` function, both currently just above `pickBestTeamSplit`)
- Test: `scripts/verify-rating-balance.ts`

**Interfaces:**
- Consumes: `computeEffectiveRatings(players, matches): Map<string, number>` from Task 1 (`src/utils/strength.ts`).
- Produces: `FairnessHistory.effectiveRatings?: Map<string, number>` — a new optional field later tasks (5, 7) populate when building the history object passed to `pickBestAvailableFoursome` / `pickTopAvailableFoursomeOptions`.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-rating-balance.ts`:

```ts
import { pickBestTeamSplit, computeEffectiveRatings } from '../src/utils/scheduler';
import { Player } from '../src/types/badminton';

function mkPlayer(id: string, tier: 'A' | 'B' | 'C', rating: number): Player {
  return { id, name: id, initialRating: rating, currentRating: rating, skillLevel: tier, active: true };
}

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

// Same tier, four different ratings: rating balance should pick the split
// with the smallest team-average gap (highest+lowest vs the middle two),
// not just whichever split comes first.
const p0 = mkPlayer('P0', 'B', 1400);
const p1 = mkPlayer('P1', 'B', 1300);
const p2 = mkPlayer('P2', 'B', 1200);
const p3 = mkPlayer('P3', 'B', 1100);
const effectiveRatings = computeEffectiveRatings([p0, p1, p2, p3], []);
const split = pickBestTeamSplit([p0, p1, p2, p3], { effectiveRatings });
const ids = (team: [Player, Player]) => [team[0].id, team[1].id].sort().join(',');
const balanced = ids(split.t1) === 'P0,P3' || ids(split.t2) === 'P0,P3';
check('same-tier split balances team ratings (P0+P3 vs P1+P2)', balanced);

// Rating balance must NOT override tier balance: A+A vs C+C has a perfect
// rating match (0 gap) but a tier gap of 4 (unacceptable); the mixed A+C vs
// A+C split must win even though its rating gap is worse.
const a1 = mkPlayer('A1', 'A', 1200);
const a2 = mkPlayer('A2', 'A', 1400);
const c1 = mkPlayer('C1', 'C', 1200);
const c2 = mkPlayer('C2', 'C', 1400);
const mixedRatings = computeEffectiveRatings([a1, a2, c1, c2], []);
const mixedSplit = pickBestTeamSplit([a1, a2, c1, c2], { effectiveRatings: mixedRatings });
const isStacked =
  (mixedSplit.t1.every((p) => p.skillLevel === 'A') && mixedSplit.t2.every((p) => p.skillLevel === 'C')) ||
  (mixedSplit.t1.every((p) => p.skillLevel === 'C') && mixedSplit.t2.every((p) => p.skillLevel === 'A'));
check('tier gap still dominates a perfect rating match', !isStacked);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/verify-rating-balance.ts`
Expected: FAIL — `computeEffectiveRatings` is not exported from `../src/utils/scheduler` (it currently only exists in `strength.ts`), and `pickBestTeamSplit` doesn't yet accept `effectiveRatings`.

- [ ] **Step 3: Wire rating balance into `scoreTeamSplit`**

In `src/utils/scheduler.ts`, add the import at the top of the file (alongside the existing imports):

```ts
import { computeEffectiveRatings } from './strength';
```

Re-export it so callers that already import from `scheduler.ts` (Task 5's `rolling.ts`, Task 7's `MatchQueue.tsx`) don't need a second import path:

```ts
export { computeEffectiveRatings };
```

Update the `FairnessHistory` interface (currently just above `scoreTeamSplit`):

```ts
interface FairnessHistory {
  partnerCounts?: Map<string, number>;
  opponentCounts?: Map<string, number>;
  carryHistory?: Map<string, CarryStats>;
  effectiveRatings?: Map<string, number>;
}
```

Replace the body of `scoreTeamSplit` — find:

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/verify-rating-balance.ts`
Expected: `ALL PASS`

- [ ] **Step 5: Re-run existing fairness scripts to confirm no regression**

Run: `npx tsx scripts/verify-fair-share.ts`
Expected: `ALL PASS` (unaffected — this task only touches `scoreTeamSplit`, not `computeFairShare`).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/scheduler.ts scripts/verify-rating-balance.ts
git commit -m "Balance team strength (Elo + form) as a new scoring tier

Slots in below carry balance and above partner/opponent variety, per
the priority ladder in the design spec.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Late-arrival catch-up cap

**Files:**
- Modify: `src/utils/fairness.ts` (`computeFairShare`)
- Test: `scripts/verify-catchup-cap.ts`

**Interfaces:**
- No signature changes — `computeFairShare(matches, players, sessionStart): Map<string, FairShareStats>` keeps its existing shape; only the returned values change for players whose deficit exceeds the new ceiling.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-catchup-cap.ts`:

```ts
import { computeFairShare, deficitOf } from '../src/utils/fairness';
import { Match, Player } from '../src/types/badminton';

const SESSION_START = 1_000_000;
const MINUTE = 60_000;

function mkPlayer(id: string): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, active: true };
}

function mkMatch(n: number, at: number, ids: string[]): Match {
  const p = (id: string) => mkPlayer(id);
  return {
    id: 'm' + n, roundNumber: n, matchNumber: n, startTime: at,
    team1: { player1: p(ids[0]), player2: p(ids[1]) },
    team2: { player1: p(ids[2]), player2: p(ids[3]) },
    score: { team1Score: 30, team2Score: 20, isCompleted: true },
    status: 'completed',
  };
}

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual.toFixed(4)}, want ${expected.toFixed(4)}`);
}

// The bug scenario: 3 matches are played among P0-P3 while LATE has quietly
// walked in without anyone marking them Away first — so `arrivedAt` is
// undefined and fairness thinks LATE has been present since session start,
// racking up a large unearned deficit for time they were never in the room.
const p0123 = ['P0', 'P1', 'P2', 'P3'].map(mkPlayer);
const late = mkPlayer('LATE');
const roster = [...p0123, late];
const played = [
  mkMatch(1, SESSION_START + 10 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(2, SESSION_START + 30 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
  mkMatch(3, SESSION_START + 50 * MINUTE, ['P0', 'P1', 'P2', 'P3']),
];

const withLate = computeFairShare(played, roster, SESSION_START);
// Without a cap: entitled = 3 * (4/5) = 2.4, played = 0, deficit = 2.4.
// P0-P3 each played 3 of 3, entitled 2.4, played 3, deficit = -0.6.
// Ceiling = max(deficit among played>=1) + 1.0 = -0.6 + 1.0 = 0.4.
check('LATE deficit is clamped to the ceiling, not the raw 2.4', deficitOf(withLate, 'LATE'), 0.4);

// Honest players who actually played are untouched by the cap — compare
// against a run with no bugged latecomer in the roster at all.
const withoutLate = computeFairShare(played, p0123, SESSION_START);
check('P0 deficit unaffected by the cap', deficitOf(withLate, 'P0'), deficitOf(withoutLate, 'P0'));
check('P2 deficit unaffected by the cap', deficitOf(withLate, 'P2'), deficitOf(withoutLate, 'P2'));

// A genuinely fresh latecomer (arrivedAt correctly stamped after all 3
// matches) still accrues nothing extra — the cap must not interfere with
// the already-correct "present since arrival only" behavior.
const freshLate = { ...mkPlayer('FRESH'), arrivedAt: SESSION_START + 90 * MINUTE };
const withFresh = computeFairShare(played, [...p0123, freshLate], SESSION_START);
check('correctly-marked latecomer still gets 0 deficit', deficitOf(withFresh, 'FRESH'), 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/verify-catchup-cap.ts`
Expected: FAIL — `LATE deficit is clamped to the ceiling, not the raw 2.4: got 2.4000, want 0.4000` (no cap exists yet).

- [ ] **Step 3: Implement the cap**

In `src/utils/fairness.ts`, find the end of `computeFairShare` (the `ordered.forEach(...)` block, right before `return stats;`):

```ts
    [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2].forEach((p) => {
      const s = stats.get(p.id);
      if (s) s.played += 1;
    });
  });

  return stats;
}
```

Replace with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/verify-catchup-cap.ts`
Expected: `ALL PASS`

- [ ] **Step 5: Re-run existing fairness scripts to confirm no regression**

Run: `npx tsx scripts/verify-fair-share.ts`
Expected: `ALL PASS`

Run: `npx tsx scripts/verify-presence-bug-fix.ts`
Expected: `ALL PASS`

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/fairness.ts scripts/verify-catchup-cap.ts
git commit -m "Cap fair-share deficit for a late arrival never marked Away

Bounds the catch-up debt a wrongly-present latecomer can accrue to 1
game beyond the most-behind player who has actually played, so they
never get force-played 3-4 matches in a row to 'pay back' a phantom
deficit. Never fires for a player who has already played, and never
overrides correct arrivedAt/leftAt accounting.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: "Baru datang" (just arrived) UI

**Files:**
- Modify: `src/components/AttendanceModal.tsx`
- Modify: `src/App.tsx` (new handler + prop wiring)

**Interfaces:**
- Consumes: `isPresentAt(player, at, sessionStart)` from `src/utils/fairness.ts` (existing, unchanged).
- Produces: `onMarkJustArrived: (playerId: string) => void` prop on `AttendanceModal`, implemented in `App.tsx` as `handleMarkJustArrived`.

- [ ] **Step 1: Add the handler in `App.tsx`**

Find `handleSetPlayerPresence` in `src/App.tsx`:

```ts
  const handleSetPlayerPresence = (playerId: string, present: boolean) => {
```

Add a new handler directly above it:

```ts
  // Fixes the case where a late arrival was never marked Away first, so
  // their `arrivedAt` is still undefined (= "present since session start")
  // even though they just walked in. Unlike the Away -> Here toggle, this
  // works on someone the app currently considers present the whole time —
  // it just stamps the real arrival moment so fair-share (and the Task 3
  // catch-up cap) stop crediting them for time they weren't here.
  const handleMarkJustArrived = (playerId: string) => {
    if (!session) return;
    const now = Date.now();
    const updatedPlayers = session.players.map((p) =>
      p.id === playerId ? { ...p, arrivedAt: now } : p
    );
    const sessionWithArrival = { ...session, players: updatedPlayers };
    const { matches, totalRounds } = refreshSuggestions(sessionWithArrival);
    const nextSession: TournamentSession = { ...sessionWithArrival, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
  };

  const handleSetPlayerPresence = (playerId: string, present: boolean) => {
```

(This references `refreshSuggestions`, added to `App.tsx`'s imports in Task 6 — if Task 6 hasn't run yet in your working tree, `npm run lint` will fail at this step with "Cannot find name 'refreshSuggestions'"; that's expected and resolves once Task 6's import line lands. If executing tasks out of order, do Task 6's import change first.)

Find where `AttendanceModal` is rendered in `src/App.tsx` (search for `<AttendanceModal`) and add the new prop next to `onSetPlayerPresence`:

```tsx
            onSetPlayerPresence={handleSetPlayerPresence}
            onMarkJustArrived={handleMarkJustArrived}
```

- [ ] **Step 2: Update `AttendanceModal.tsx`**

Replace the full contents of `src/components/AttendanceModal.tsx`:

```tsx
import React from 'react';
import { TournamentSession, Player } from '../types/badminton';
import { isPresentAt } from '../utils/fairness';
import { X, UserCheck, UserX, LogIn } from 'lucide-react';

interface AttendanceModalProps {
  session: TournamentSession;
  onSetPlayerPresence: (playerId: string, present: boolean) => void;
  onMarkJustArrived: (playerId: string) => void;
  onClose: () => void;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  session,
  onSetPlayerPresence,
  onMarkJustArrived,
  onClose,
}) => {
  const now = Date.now();
  const presentCount = session.players.filter(
    (p) => p.active && isPresentAt(p, now, session.createdAt)
  ).length;

  // The lowest matchNumber among matches that actually started at/after this
  // player's arrival — omitted if nothing has started since they arrived
  // (including the common case of "present since session start").
  const joinedAtMatchNumber = (p: Player): number | null => {
    if (p.arrivedAt === undefined) return null;
    const since = session.matches
      .filter((m) => m.status !== 'scheduled' && m.startTime !== undefined && m.startTime >= p.arrivedAt!)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    return since.length > 0 ? since[0].matchNumber : null;
  };

  // Play has to have actually started before "Baru datang" means anything —
  // showing it for everyone at session start would just be noise.
  const playHasStarted = session.matches.some((m) => m.status !== 'scheduled');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-800 light:border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white light:text-slate-900">
            Who's here <span className="text-slate-400 light:text-slate-500 font-mono">({presentCount}/{session.players.length})</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400 light:text-slate-500">
          Mark anyone who isn't here yet. They're skipped in the schedule
          until you mark them back.
        </p>

        <div className="p-5 space-y-2 overflow-y-auto min-h-0">
          {session.players.map((p) => {
            const here = isPresentAt(p, now, session.createdAt);
            const joinedAt = joinedAtMatchNumber(p);
            const showJustArrived = playHasStarted && here && p.arrivedAt === undefined;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${here ? 'text-white light:text-slate-900' : 'text-slate-500 light:text-slate-400 line-through'}`}>
                    {p.name}
                    <span className="text-[10px] text-slate-500 light:text-slate-400 ml-1.5">{p.skillLevel}</span>
                  </span>
                  {joinedAt !== null && (
                    <span className="text-[10px] text-slate-500 light:text-slate-400">joined at match #{joinedAt}</span>
                  )}
                </div>
                {showJustArrived && (
                  <button
                    onClick={() => onMarkJustArrived(p.id)}
                    title="Stamp their real arrival time so they stop being credited for time they missed"
                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 bg-amber-600/10 light:bg-amber-50 border-amber-500/30 light:border-amber-300 text-amber-300 light:text-amber-700"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Baru datang</span>
                  </button>
                )}
                <button
                  onClick={() => onSetPlayerPresence(p.id, !here)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    here
                      ? 'bg-emerald-600/20 light:bg-emerald-100 border-emerald-500/40 light:border-emerald-300 text-emerald-300 light:text-emerald-700'
                      : 'bg-slate-800 light:bg-slate-100 border-slate-700 light:border-slate-300 text-slate-400 light:text-slate-500'
                  }`}
                >
                  {here ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                  <span>{here ? 'Here' : 'Away'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: no errors (aside from the expected `refreshSuggestions` ordering note in Step 1 if Task 6 hasn't landed yet — if working through tasks in order, Task 6 comes after this one, so import it now as a forward reference: add `import { refreshSuggestions } from './utils/rolling';` to `App.tsx`'s imports as part of this task's Step 1, and Task 6 will delete the old `regenerateRemainingSchedule` import in its place. This avoids a broken intermediate state.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/AttendanceModal.tsx
git commit -m "Add 'Baru datang' action for a late arrival never marked Away

Fixes the arrival timestamp directly for someone the app still thinks
has been present since session start, without requiring the
Away-then-Here round trip. Also shows 'joined at match #N' on the
roster row once play has started.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Rolling suggestion engine

**Files:**
- Create: `src/utils/rolling.ts`
- Test: `scripts/verify-rolling.ts`

**Interfaces:**
- Consumes: `pickBestAvailableFoursome`, `pickFoursomeWithRequiredPair`, `pickTopAvailableFoursomeOptions`, `computeCarryHistory`, `computePartnerCounts`, `computeOpponentCounts`, `computeEffectiveRatings`, `generateId`, `isCarryPairing` (all exported from `src/utils/scheduler.ts`); `computeFairShare`, `presentPlayers` (from `src/utils/fairness.ts`).
- Produces:
  - `refreshSuggestions(session: TournamentSession): { matches: Match[]; totalRounds: number }`
  - `rerollMatch(session: TournamentSession, matchId: string): { team1: [string, string]; team2: [string, string] } | null`
  - `trimSurplusScheduledMatches(session: TournamentSession): Match[]`
  - `eligiblePlayersForCourt(session: TournamentSession, excludeMatchId?: string): Player[]`
  These four are consumed by Task 6 (`storage.ts`, `App.tsx`) and Task 7 (`App.tsx`'s reroll handler).

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-rolling.ts`:

```ts
import { refreshSuggestions, rerollMatch, trimSurplusScheduledMatches } from '../src/utils/rolling';
import { initializeCourts } from '../src/utils/scheduler';
import { Match, Player, TournamentSession } from '../src/types/badminton';

function mkPlayer(id: string): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, skillLevel: 'B', active: true };
}

function mkSession(playerCount: number, courtCount: number, matches: Match[] = []): TournamentSession {
  return {
    id: 's1',
    name: 'Test',
    date: '2026-01-01',
    createdAt: Date.now(),
    courtCount,
    courts: initializeCourts(courtCount),
    players: Array.from({ length: playerCount }, (_, i) => mkPlayer('P' + i)),
    rules: { pointsToWin: 21, winByTwo: true, maxPointsCap: 30, numberOfSets: 1, suddenDeathAtCap: true },
    matches,
    currentRound: 1,
    totalRounds: 0,
    isCompleted: false,
    ownerUid: 'u1',
    pin: '1234',
  };
}

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

// 8 players, 2 courts, fresh session: exactly one scheduled match per court,
// no more (this is the whole point of "rolling" vs the old batch generator).
const fresh = mkSession(8, 2);
const { matches: afterFirstRefresh } = refreshSuggestions(fresh);
const scheduled1 = afterFirstRefresh.filter((m) => m.status === 'scheduled');
check('exactly 2 scheduled matches for 2 idle courts', scheduled1.length === 2);
check('one match per court', new Set(scheduled1.map((m) => m.courtId)).size === 2);
check('all 8 players placed across the 2 matches', new Set(scheduled1.flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])).size === 8);

// Refreshing again while both courts are still occupied by their scheduled
// match must NOT add a second suggestion per court.
const { matches: afterSecondRefresh } = refreshSuggestions({ ...fresh, matches: afterFirstRefresh });
check('refreshing an already-full court adds nothing', afterSecondRefresh.length === afterFirstRefresh.length);

// Reroll must return a different foursome (or null only if truly stuck) and
// never touch a match that isn't 'scheduled'.
const rerollTarget = scheduled1[0];
const rerollResult = rerollMatch({ ...fresh, matches: afterFirstRefresh }, rerollTarget.id);
check('reroll returns a result for a scheduled match', rerollResult !== null);
if (rerollResult) {
  const originalIds = new Set([rerollTarget.team1.player1.id, rerollTarget.team1.player2.id, rerollTarget.team2.player1.id, rerollTarget.team2.player2.id]);
  const newIds = new Set([...rerollResult.team1, ...rerollResult.team2]);
  const sameFour = originalIds.size === newIds.size && [...originalIds].every((id) => newIds.has(id));
  // With only 8 players and 1 already occupying the other court's match,
  // the eligible pool for this court is small, so occasionally the "best"
  // alternative options may still land on the same 4 people in a different
  // split. What must never happen is an *invalid* result (wrong size, not
  // 4 distinct ids).
  check('reroll result has 4 distinct player ids', newIds.size === 4);
  void sameFour;
}

// Migration: an old-format session with 3 stale scheduled matches queued on
// a single court gets trimmed to 1 (the earliest by matchNumber).
const staleCourt = initializeCourts(1);
const stale: Match[] = [1, 2, 3].map((n) => ({
  id: 'stale' + n,
  roundNumber: n,
  matchNumber: n,
  courtId: '1',
  team1: { player1: mkPlayer('P0'), player2: mkPlayer('P1') },
  team2: { player1: mkPlayer('P2'), player2: mkPlayer('P3') },
  score: { team1Score: 0, team2Score: 0, isCompleted: false },
  status: 'scheduled',
}));
const staleSession = { ...mkSession(4, 1, stale), courts: staleCourt };
const trimmed = trimSurplusScheduledMatches(staleSession);
const trimmedScheduled = trimmed.filter((m) => m.status === 'scheduled');
check('trims 3 stale scheduled matches on 1 court down to 1', trimmedScheduled.length === 1);
check('keeps the earliest by matchNumber', trimmedScheduled[0].id === 'stale1');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/verify-rolling.ts`
Expected: FAIL — `Cannot find module '../src/utils/rolling'`.

- [ ] **Step 3: Implement `src/utils/rolling.ts`**

```ts
import { Court, Match, Player, TournamentSession } from '../types/badminton';
import { computeFairShare, presentPlayers } from './fairness';
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
      const candidates = eligible.filter((p) => p.id !== aId && p.id !== bId);
      if (candidates.length >= 2) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/verify-rolling.ts`
Expected: `ALL PASS`

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/rolling.ts scripts/verify-rolling.ts
git commit -m "Add rolling one-match-per-court suggestion engine

refreshSuggestions replaces batch generation: exactly one scheduled
match per idle court, computed against live history (fair-share,
tier, carry, rating, partner/opponent variety). rerollMatch offers a
different comparably-fair foursome on demand. trimSurplusScheduledMatches
migrates sessions saved under the old batch generator.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Wire rolling generation into storage and App, delete the batch generator

**Files:**
- Modify: `src/utils/storage.ts` (`createNewSession`)
- Modify: `src/utils/scheduler.ts` (delete `generateRotatingDoublesSchedule`, `generateGeneralRounds`, `regenerateRemainingSchedule`)
- Modify: `src/App.tsx` (swap all 5 `regenerateRemainingSchedule` call sites for `refreshSuggestions`, add the one-time migration effect)

**Interfaces:**
- Consumes: `refreshSuggestions`, `trimSurplusScheduledMatches` from Task 5 (`src/utils/rolling.ts`).

- [ ] **Step 1: Update `storage.ts`**

In `src/utils/storage.ts`, replace the import line:

```ts
import { generateRotatingDoublesSchedule, initializeCourts, CourtConfig } from './scheduler';
```

with:

```ts
import { initializeCourts, CourtConfig } from './scheduler';
import { refreshSuggestions } from './rolling';
```

In `createNewSession`, replace:

```ts
  const courts = initializeCourts(courtCount, courtConfigs);
  const { matches, totalRounds } = generateRotatingDoublesSchedule(players, courts, rules);

  const newSession: TournamentSession = {
    id: 'session_' + Date.now(),
    name,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now(),
    courtCount,
    courts,
    players: [...players],
    rules,
    matches,
    currentRound: 1,
    totalRounds,
    isCompleted: false,
    ownerUid: auth.currentUser?.uid || '',
    pin: generateSessionPin(),
  };
```

with:

```ts
  const courts = initializeCourts(courtCount, courtConfigs);

  const baseSession: TournamentSession = {
    id: 'session_' + Date.now(),
    name,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now(),
    courtCount,
    courts,
    players: [...players],
    rules,
    matches: [],
    currentRound: 1,
    totalRounds: 0,
    isCompleted: false,
    ownerUid: auth.currentUser?.uid || '',
    pin: generateSessionPin(),
  };
  const { matches, totalRounds } = refreshSuggestions(baseSession);
  const newSession: TournamentSession = { ...baseSession, matches, totalRounds };
```

- [ ] **Step 2: Delete the batch generator from `scheduler.ts`**

In `src/utils/scheduler.ts`, delete these three functions entirely (they are no longer called anywhere once Step 1 and Step 3 land): `generateGeneralRounds`, `regenerateRemainingSchedule`, and `generateRotatingDoublesSchedule`. Also remove the now-unused import at the top of the file:

```ts
import { presentPlayers, computeFairShare, deficitOf, FairShareStats, FAIR_SHARE_EPSILON } from './fairness';
```

check which of these are still used elsewhere in `scheduler.ts` after deletion (`presentPlayers` was only used inside `regenerateRemainingSchedule`; `computeFairShare`, `deficitOf`, `FairShareStats`, `FAIR_SHARE_EPSILON` are still used by `pickBestAvailableFoursome` / `pickTopAvailableFoursomeOptions`), and trim the import to only what remains:

```ts
import { computeFairShare, deficitOf, FairShareStats, FAIR_SHARE_EPSILON } from './fairness';
```

`chooseKCombinations`, `pickBestTeamSplit`, `pickBestFoursome`, `pickTopFoursomeOptions`, `pickFoursomeWithRequiredPair`, `pickBestAvailableFoursome`, `pickTopAvailableFoursomeOptions`, `initializeCourts`, `CourtConfig`, `tierScore`, `isCarryPairing`, `computeCarryHistory`, `computePartnerCounts`, `computeOpponentCounts`, `generateId`, `computeEffectiveRatings` (re-exported from Task 2) all stay — they're still used by `rolling.ts`, `MatchQueue.tsx`, `storage.ts`.

- [ ] **Step 3: Update `App.tsx` imports and call sites**

Replace the import line:

```ts
import { generateId, regenerateRemainingSchedule } from './utils/scheduler';
```

with (if Task 4 already added a `rolling` import, merge into one line instead of duplicating):

```ts
import { generateId } from './utils/scheduler';
import { refreshSuggestions, rerollMatch, trimSurplusScheduledMatches } from './utils/rolling';
```

Replace all 5 occurrences of `regenerateRemainingSchedule(` with `refreshSuggestions(` — the destructuring (`const { matches, totalRounds } = ...`) is identical in shape, so no other change is needed at each call site:

- `handleUpdatePlayerTier`: `regenerateRemainingSchedule(sessionWithTier)` → `refreshSuggestions(sessionWithTier)`
- `handleAddPlayer`: `regenerateRemainingSchedule(sessionWithPlayer)` → `refreshSuggestions(sessionWithPlayer)`
- `handleSetPlayerPresence`: `regenerateRemainingSchedule(sessionWithPresence)` → `refreshSuggestions(sessionWithPresence)`
- `handleSetRequestedPairs`: `regenerateRemainingSchedule(sessionWithPairs)` → `refreshSuggestions(sessionWithPairs)`
- `handleUpdateCourtCount`: `regenerateRemainingSchedule(sessionWithCourts)` → `refreshSuggestions(sessionWithCourts)`

- [ ] **Step 4: Add the one-time migration effect**

Find the existing ownerUid-repair effect in `src/App.tsx`:

```ts
  useEffect(() => {
    if (!authReady || isRemoteMode) return;
    if (!session || session.ownerUid) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const repaired: TournamentSession = { ...session, ownerUid: uid };
    setSession(repaired);
    saveSession(repaired);
    pushSessionOwnershipToFirebase(repaired);
  }, [authReady, isRemoteMode, session]);
```

Add a new effect directly after it:

```ts
  // One-time migration for a session saved under the old batch generator,
  // which could leave several 'scheduled' matches queued on the same
  // court. Rolling generation only ever creates one per idle court, so
  // this can't recur once trimmed — the effect's own trim makes
  // `hasSurplus` false on the next render, so it naturally runs once.
  useEffect(() => {
    if (!session || isRemoteMode) return;
    const scheduledPerCourt = new Map<string, number>();
    session.matches.forEach((m) => {
      if (m.status !== 'scheduled') return;
      const key = m.courtId ?? '';
      scheduledPerCourt.set(key, (scheduledPerCourt.get(key) || 0) + 1);
    });
    const hasSurplus = [...scheduledPerCourt.values()].some((count) => count > 1);
    if (!hasSurplus) return;
    const trimmedMatches = trimSurplusScheduledMatches(session);
    const { matches, totalRounds } = refreshSuggestions({ ...session, matches: trimmedMatches });
    const migrated: TournamentSession = { ...session, matches, totalRounds };
    setSession(migrated);
    persistSession(migrated);
  }, [session, isRemoteMode]);
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors. If `rerollMatch` shows as unused, that's expected until Task 7 wires it into a handler — leave the import in place since Task 7 lands next.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open the app in a browser, create a new session with 8 players / 2 courts. Confirm the Schedule tab shows exactly 2 matches total (not a pre-built batch of 5-10 rounds). Complete one match; confirm exactly one new match appears for that court afterward, not more.

- [ ] **Step 7: Commit**

```bash
git add src/utils/storage.ts src/utils/scheduler.ts src/App.tsx
git commit -m "Replace batch schedule generation with rolling suggestions

createNewSession and every roster/tier/court-change handler now call
refreshSuggestions instead of regenerateRemainingSchedule. Deletes the
batch generator (generateRotatingDoublesSchedule, generateGeneralRounds,
regenerateRemainingSchedule) entirely. Adds a one-time migration effect
that trims a pre-existing session's surplus scheduled matches down to
one per court.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Reroll UI on CourtBoard, rating-aware Auto Fill/Reshuffle

**Files:**
- Modify: `src/App.tsx` (add `handleRerollMatch`, wire into `CourtBoard`)
- Modify: `src/components/CourtBoard.tsx` (remove the ephemeral suggestion path, add a Reroll button)
- Modify: `src/components/MatchQueue.tsx` (thread `effectiveRatings` into Auto Fill / Reshuffle)

**Interfaces:**
- Consumes: `rerollMatch` from Task 5/6 (`src/utils/rolling.ts`), already imported in `App.tsx`; `handleUpdateMatchPlayers` (existing, `App.tsx`).
- Produces: `onRerollMatch: (matchId: string) => void` prop on `CourtBoard`.

- [ ] **Step 1: Add `handleRerollMatch` in `App.tsx`**

Find `handleUpdateMatchPlayers` in `src/App.tsx` and add a new handler directly after it:

```ts
  // Offers a different comparably-fair foursome for a not-yet-started
  // match — full tier/carry/rating/variety logic, never a blind shuffle.
  const handleRerollMatch = (matchId: string) => {
    if (!session) return;
    const result = rerollMatch(session, matchId);
    if (!result) {
      alert('Not enough players present to reroll this match.');
      return;
    }
    handleUpdateMatchPlayers(matchId, result.team1, result.team2);
  };
```

Find where `<CourtBoard` is rendered and add the new prop:

```tsx
          <CourtBoard
            session={session!}
            onUpdateMatchScore={handleUpdateMatchScore}
            onStartMatch={handleStartMatch}
            onOpenScorekeeper={handleOpenScorekeeper}
            onQuickAssignNextMatch={handleQuickAssignNextMatch}
            onStartSuggestedMatch={handleStartSuggestedMatch}
            onRerollMatch={handleRerollMatch}
            readOnly={isReadOnlyPlayer}
          />
```

- [ ] **Step 2: Update `CourtBoard.tsx` — remove the ephemeral suggestion, add Reroll**

Remove the now-unused imports (the ephemeral suggestion was the only caller of these). Find:

```ts
import { TournamentSession, Match, Court } from '../types/badminton';
import {
  pickBestAvailableFoursome,
  computePartnerCounts,
  computeOpponentCounts,
  computeCarryHistory,
} from '../utils/scheduler';
import { computeFairShare, presentPlayers } from '../utils/fairness';
import {
  Play,
  CheckCircle2,
  Clock,
  Maximize2,
  Users,
  Coffee,
  Minus,
  Sparkles,
  Edit3
} from 'lucide-react';
```

Replace with:

```ts
import { TournamentSession, Match, Court } from '../types/badminton';
import {
  Play,
  CheckCircle2,
  Clock,
  Maximize2,
  Users,
  Coffee,
  Minus,
  Edit3,
  Shuffle
} from 'lucide-react';
```

(`Sparkles` was only used by the removed ephemeral-suggestion block; `Shuffle` is added for the new Reroll button.)

Find the `CourtBoardProps` interface and add the new prop:

```ts
interface CourtBoardProps {
```

— locate `onStartSuggestedMatch: (courtId: string, playerIds: [string, string, string, string]) => void;` and add directly after it:

```ts
  onRerollMatch: (matchId: string) => void;
```

Do the same in the destructured props list a few lines below (add `onRerollMatch,` after `onStartSuggestedMatch,`).

Find and delete the entire ephemeral suggestion block:

```ts
  // Live "who should play next" suggestion — only meaningful once a court
  // has no pre-generated match queued for it at all (the schedule ran dry).
  // Unlike Custom Match's plan-ahead tools, this starts a match immediately,
  // so anyone already mid-match elsewhere is a real conflict and stays
  // excluded rather than just deprioritized.
  const now = Date.now();
  const busyElsewhere = new Set(
    session.matches
      .filter((m) => m.status === 'in_progress' || m.status === 'scheduled')
      .flatMap((m) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const eligibleForSuggestion = presentPlayers(session.players, now, session.createdAt).filter(
    (p) => !busyElsewhere.has(p.id)
  );
  const suggestionHistory = session.matches.filter((m) => m.status !== 'scheduled');
  const suggestion =
    !readOnly && eligibleForSuggestion.length >= 4
      ? pickBestAvailableFoursome(eligibleForSuggestion, {
          fairShare: computeFairShare(suggestionHistory, session.players, session.createdAt),
          partnerCounts: computePartnerCounts(suggestionHistory),
          opponentCounts: computeOpponentCounts(suggestionHistory),
          carryHistory: computeCarryHistory(suggestionHistory),
        })
      : null;
```

This is no longer needed: `refreshSuggestions` (Task 5) now keeps a real `scheduled` match queued for every idle court, so `nextMatch` (computed further down, unchanged) is populated the same way `suggestion` used to fill the gap.

Find the "Next Up / On Deck Section" block:

```tsx
                  {nextMatch ? (
                    // Purely informational here — when the court is idle, the
                    // "Court is Ready" block above already has the one Start
                    // button for this same match; a second one here would
                    // just be the same action twice.
                    <div className="bg-slate-950/80 light:bg-slate-50/80 p-3 rounded-xl border border-slate-800 light:border-slate-200 text-xs">
                      <div className="font-medium text-slate-200 light:text-slate-700">
                        <span className="text-emerald-400 light:text-emerald-600 font-semibold">{nextMatch.team1.player1.name} & {nextMatch.team1.player2.name}</span>
                        <span className="text-slate-500 light:text-slate-400 mx-1.5">vs</span>
                        <span className="text-teal-400 light:text-teal-600 font-semibold">{nextMatch.team2.player1.name} & {nextMatch.team2.player2.name}</span>
                      </div>
                    </div>
                  ) : suggestion && !activeMatch ? (
                    <div className="bg-slate-950/60 light:bg-slate-50/60 border border-emerald-500/30 light:border-emerald-300 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 light:text-slate-500">
                        <Sparkles className="w-3 h-3 text-emerald-400 light:text-emerald-600" />
                        <span>Suggested — nothing queued for this court yet</span>
                      </div>
                      <div className="text-xs text-slate-200 light:text-slate-700">
                        {suggestion.split.t1[0].name} &amp; {suggestion.split.t1[1].name}
                        <span className="text-slate-500 light:text-slate-400 mx-1.5">vs</span>
                        {suggestion.split.t2[0].name} &amp; {suggestion.split.t2[1].name}
                      </div>
                      <button
                        onClick={() =>
                          onStartSuggestedMatch(court.id, [
                            suggestion.split.t1[0].id,
                            suggestion.split.t1[1].id,
                            suggestion.split.t2[0].id,
                            suggestion.split.t2[1].id,
                          ])
                        }
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Start on {court.name}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 light:text-slate-400 italic py-1 text-center bg-slate-950/40 light:bg-slate-50/40 rounded-lg">
                      All scheduled matches completed!
                    </div>
                  )}
```

Replace with:

```tsx
                  {nextMatch ? (
                    <div className="bg-slate-950/80 light:bg-slate-50/80 p-3 rounded-xl border border-slate-800 light:border-slate-200 text-xs space-y-2">
                      <div className="font-medium text-slate-200 light:text-slate-700">
                        <span className="text-emerald-400 light:text-emerald-600 font-semibold">{nextMatch.team1.player1.name} & {nextMatch.team1.player2.name}</span>
                        <span className="text-slate-500 light:text-slate-400 mx-1.5">vs</span>
                        <span className="text-teal-400 light:text-teal-600 font-semibold">{nextMatch.team2.player1.name} & {nextMatch.team2.player2.name}</span>
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => onRerollMatch(nextMatch.id)}
                          className="w-full py-1.5 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Shuffle className="w-3 h-3" />
                          <span>Reroll</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 light:text-slate-400 italic py-1 text-center bg-slate-950/40 light:bg-slate-50/40 rounded-lg">
                      Not enough players present for another match yet.
                    </div>
                  )}
```

`onStartSuggestedMatch` and `handleStartSuggestedMatch` in `App.tsx` become unreachable dead code once this block is removed (nothing else calls `onStartSuggestedMatch`). Leave them in place for this task — removing an existing exported handler that other code might reference is out of scope for a UI-behavior task; if `npm run lint` doesn't flag it as an error (unused props/functions aren't a `tsc --noEmit` error in this codebase's config), no further action is needed. Confirm this in Step 3.

- [ ] **Step 3: Thread `effectiveRatings` into `MatchQueue.tsx`'s Auto Fill and Reshuffle**

In `src/components/MatchQueue.tsx`, update the import:

```ts
import {
  generateId,
  pickTopAvailableFoursomeOptions,
  computeCarryHistory,
  computePartnerCounts,
  computeOpponentCounts,
} from '../utils/scheduler';
```

to:

```ts
import {
  generateId,
  pickTopAvailableFoursomeOptions,
  computeCarryHistory,
  computePartnerCounts,
  computeOpponentCounts,
  computeEffectiveRatings,
} from '../utils/scheduler';
```

In `handleAutoBalanceCustom`, find:

```ts
    const historyMatches = session.matches.filter((m) => m.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
    });
```

Replace with:

```ts
    const historyMatches = session.matches.filter((m) => m.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);
    const effectiveRatings = computeEffectiveRatings(session.players, historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
      effectiveRatings,
    });
```

In `handleReshuffleMatch`, find the equivalent block:

```ts
    const historyMatches = session.matches.filter((o) => o.id !== m.id && o.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
    });
```

Replace with:

```ts
    const historyMatches = session.matches.filter((o) => o.id !== m.id && o.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);
    const effectiveRatings = computeEffectiveRatings(session.players, historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
      effectiveRatings,
    });
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. On the Courts tab, confirm the on-deck match shows a Reroll button; click it a few times and confirm the foursome changes (or the button stays functional even if it occasionally repeats — per the spec this is acceptable with a small eligible pool). Confirm Start still starts the currently-displayed on-deck match. On the Schedule tab, confirm Auto Fill and Reshuffle still work.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/CourtBoard.tsx src/components/MatchQueue.tsx
git commit -m "Add Reroll to the on-deck match, thread ratings into Auto Fill

CourtBoard's on-deck card now offers Reroll (full tier/carry/rating/
variety logic per option, never a blind shuffle) instead of the old
ephemeral 'suggestion' fallback, which is redundant now that rolling
generation always keeps one scheduled match queued per idle court.
Match Queue's Auto Fill and Reshuffle now factor in rating balance too.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: End-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Run every verification script**

```bash
npx tsx scripts/verify-effective-rating.ts
npx tsx scripts/verify-rating-balance.ts
npx tsx scripts/verify-catchup-cap.ts
npx tsx scripts/verify-fair-share.ts
npx tsx scripts/verify-presence-bug-fix.ts
npx tsx scripts/verify-rolling.ts
```

Expected: every script prints `ALL PASS` and exits 0.

- [ ] **Step 3: Live walkthrough**

Run: `npm run dev`. Using the browser (Playwright if available):

1. Create a new session, 7 players (use the app's default roster), 1 court. Confirm exactly 1 scheduled match exists (Schedule tab shows "1 Total Matches"), not a pre-built batch.
2. Start the match, enter a score, finish it. Confirm exactly 1 new scheduled match appears afterward.
3. Open Who's Here, toggle a player Away then Here again — confirm the schedule still shows exactly 1 scheduled match per court afterward (no leftover duplicates).
4. With play started, find a player still marked present with no explicit arrival stamp; confirm "Baru datang" is not shown for players who already have `arrivedAt` set, and is shown for one who doesn't — click it, confirm the roster row updates.
5. On the Courts tab, click Reroll on the on-deck match 3-4 times; confirm the foursome changes and Start still works afterward.
6. Add a Partner Request between two players who haven't played together; confirm the next generated suggestion (on whichever court frees up next) honors it.
7. Change court count from 1 to 2; confirm a second court's suggestion appears without disturbing the first court's already-queued match.

- [ ] **Step 4: Report results**

Summarize pass/fail for each of the 7 walkthrough steps and all 6 verification scripts. If anything fails, treat it as a bug against the specific task above, fix it there, and re-run this task's steps 1-3 in full before considering the plan complete.
