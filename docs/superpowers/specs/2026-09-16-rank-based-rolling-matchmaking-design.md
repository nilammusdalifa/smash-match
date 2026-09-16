# Rank-Based Rolling Matchmaking — Design

**Goal:** Fold win/loss strength (Elo + recent form) into who gets matched with/against whom, make the fairness math resistant to a late arrival who never got marked Away, and replace batch schedule generation with a one-match-at-a-time rolling suggestion that supports reroll.

**Architecture:** The existing fairness/tier engine in `src/utils/scheduler.ts` and `src/utils/fairness.ts` is extended, not replaced, except for the batch generator itself. Team-quality scoring (`scoreTeamSplit`) gains a new rating-balance term sourced from a new `src/utils/strength.ts`. Fair-share deficit gains a hard catch-up cap in `src/utils/fairness.ts`. Batch generation (`generateRotatingDoublesSchedule`, `generateGeneralRounds`, `regenerateRemainingSchedule`) is deleted and replaced by a new `src/utils/rolling.ts` that produces exactly one `scheduled` suggestion per idle court, with a reroll that draws from the same top-K fair-options search already used by Match Queue's Auto Fill.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind v4. No test framework in this repo; pure logic is verified with `tsx` scripts under `scripts/` (see `verify-fair-share.ts`, `verify-presence-bug-fix.ts` for the existing pattern), UI behavior verified live with Playwright.

**Spec authority:** This document is the sole design authority (matches the pattern of the prior `2026-08-25-open-play-fairness` plan, which also skipped a separate spec file — this one is written out because the change is larger and touches the scheduling model itself).

## Global Constraints (carried over, unchanged)

- Tier scores are fixed: `A=3, B=2, C=1`, untiered counts as B (`tierScore` in `scheduler.ts`).
- A "carry"/*gendong* pairing means the two **teammates** are different tiers. A "hard" game means teammates share a tier.
- A match is only "fair" on strength-by-tier if the two teams' combined tier gap is **≤ 1**. Gap ≥ 2 is not an acceptable substitute for avoiding a carry.
- Equal playing time (fair-share deficit) is the non-negotiable guarantee. Tier balance, carry balance, rating balance, partner variety, and opponent variety are preferences layered under it, in that priority order.
- New player-facing copy stays short — no long explanatory paragraphs.
- Every task ends with `npm run lint` (tsc --noEmit) passing and a commit.

## 1. Rating-based team balance

### Effective rating (`src/utils/strength.ts`, new file)

```ts
export function effectiveRating(player: Player, matches: Match[]): number
```

- Base = `player.currentRating` (Elo, already maintained by `recomputeAllRatings` in `ranking.ts` — order-dependent, rebuilt from scratch on every score edit/delete, so this is always consistent).
- Form nudge: look at the player's last 3 **completed** matches in this player's own chronological order (by `endTime ?? startTime`, then `matchNumber`, matching the ordering `recomputeAllRatings` already uses). Most recent first: win = `+20`, `+13`, `+7`; loss = `-20`, `-13`, `-7`. Sum whatever exists (0-3 matches). No effect for a player with zero completed matches.
- Result: `currentRating + formNudge`. Never persisted — computed fresh each time from `session.matches`, same pattern as `computeFairShare`/`computeCarryHistory`.

### Scoring ladder change (`scoreTeamSplit` in `scheduler.ts`)

Add a new term between carry-balance and partner-cost:

```
tierGapBucket         × 1,000,000   (was × 10,000 — rescaled so lower terms fit under it, see below)
repeatCarryViolations ×   100,000   (was × 1,000)
carryBalanceScore     ×    10,000   (was × 100)
ratingGapBucket       ×       500   ← NEW
partnerCost           ×        10   (unchanged)
opponentCost          ×         1   (unchanged)
```

- `ratingGapBucket = min(8, round(|avgEffectiveRating(t1) - avgEffectiveRating(t2)| / 25))`. Bucketing avoids the continuous Elo gap acting as a tie-break for everything below it; capping at 8 (= 200+ Elo gap) means the worst realistic rating mismatch (`8 × 500 = 4000`) never outweighs one carry-balance unit (`10,000`) or a repeat-carry violation (`100,000`).
- Only the top three terms are rescaled (×100 from their old values), purely to open integer headroom for `ratingGapBucket` between `carryBalanceScore` and `partnerCost` — their relative ordering and tie-breaking behavior among themselves is unchanged. `partnerCost` and `opponentCost` keep their original weights: at realistic counts (low single digits), `partnerCost × 10` stays far below one `ratingGapBucket` unit (500), so no rescale is needed there.
- `pickFoursomeWithRequiredPair`'s external gap penalty (`gap * 1000`, unchanged) simply adds to whatever `scoreTeamSplit` returns for that candidate split — it duplicates emphasis on the same tier-gap signal `scoreTeamSplit` already scores internally for that pairing, the same relationship the original code had. No rescale needed here since it was never required to dominate `scoreTeamSplit`'s own max; it only needs to differentiate between candidate opponent pairs, which it still does unchanged.

### Where it flows

`pickBestTeamSplit`, `pickBestFoursome`, `pickBestAvailableFoursome`, `pickTopAvailableFoursomeOptions` all call `scoreTeamSplit` internally — no call-site changes needed except threading `matches` (or a pre-computed rating map) into `FairnessHistory` so `scoreTeamSplit` can look up effective ratings without recomputing form per-player per-comparison.

`FairnessHistory` gains:
```ts
interface FairnessHistory {
  partnerCounts?: Map<string, number>;
  opponentCounts?: Map<string, number>;
  carryHistory?: Map<string, CarryStats>;
  effectiveRatings?: Map<string, number>;  // NEW — player.id -> effectiveRating
}
```
Callers build this map once per scheduling pass via a new `computeEffectiveRatings(players, matches)` helper in `strength.ts`, same pattern as `computeCarryHistory`.

## 2. Late-arrival catch-up cap

### The cap (`fairness.ts`, `computeFairShare`)

After computing raw `entitled`/`played` for everyone:

```ts
const playedDeficits = players
  .filter(p => (stats.get(p.id)?.played ?? 0) > 0)
  .map(p => deficitOf(stats, p.id));
const ceiling = (playedDeficits.length > 0 ? Math.max(...playedDeficits) : 0) + 1.0;

stats.forEach((s, id) => {
  const deficit = s.entitled - s.played;
  if (deficit > ceiling) {
    s.entitled = s.played + ceiling; // clamp by trimming entitled, keeps `played` truthful
  }
});
```

- Only fires for players with `played === 0` in practice (anyone who has played at least once anchors — or is anchored by — the ceiling itself, since `Math.max` over played-deficits includes them).
- `1.0` headroom means a returning/late player can still be prioritized ahead of someone who's exactly caught up, just never allowed to be owed more than 1 full game beyond the most-behind active player. Matches the reroll-tolerance constant already in `scheduler.ts` (`REROLL_DEFICIT_TOLERANCE = 1.0`) for consistency.
- This is a safety net under the real fix (marking presence correctly) — it bounds the damage when that step is skipped, it doesn't replace `isPresentAt`/`arrivedAt` accounting.

### UI (`AttendanceModal.tsx`, `PlayerProfileModal.tsx` or wherever player cards render)

- Add a "Baru datang" (Just arrived) action, distinct from the existing Away→Here toggle, for a player currently marked present who has `arrivedAt === undefined` (i.e., still flagged as "here since start" but actually just walked in). It stamps `arrivedAt = Date.now()` directly — today this timestamp is only reachable by first toggling Away then Here.
- Player card / roster row shows "joined at match #N" (derived: first `matchNumber` among matches at/after their `arrivedAt`, or omitted if they've been present since start) so hosts can see who's on a fresh clock.

## 3. Rolling one-match-at-a-time suggestions

### Delete

- `generateRotatingDoublesSchedule`, `generateGeneralRounds`, `regenerateRemainingSchedule`, `chooseKCombinations`'s batch-only callers — removed from `scheduler.ts`.
- All 5 `regenerateRemainingSchedule` call sites in `App.tsx` (tier edit, add player, presence toggle, partner requests, court count change) replaced by a call to refresh rolling suggestions (see below) — same trigger points, cheaper effect.

### New: `src/utils/rolling.ts`

```ts
export function refreshSuggestions(session: TournamentSession): Match[]
```

- For each court with no `scheduled` match and no `in_progress` match: build the eligible pool (`presentPlayers` minus anyone in an `in_progress` or already-`scheduled` match elsewhere — reuses the double-booking fix from `CourtBoard`'s existing suggestion logic), run `pickBestAvailableFoursome` (now rating-aware per Part 1, and partner-request-aware — see below) against real history (`completed` + `in_progress` matches), and write one new `scheduled` `Match` for that court.
- Returns the full updated `matches` array (existing + newly appended suggestions), same shape callers already expect from `regenerateRemainingSchedule`.
- `roundNumber` for a new match = `Math.floor(totalCreatedSoFar / session.courts.length) + 1` (keeps Schedule tab's round grouping meaningful without a batch concept). `totalRounds` becomes `Math.max(existing roundNumbers, 1)`, recomputed each refresh — no longer a pre-committed number.
- **Partner requests fix**: `refreshSuggestions` checks `outstanding` requested pairs (same "never played together yet" derivation `generateGeneralRounds` used) against each court's eligible pool before falling back to `pickBestAvailableFoursome`, using the existing `pickFoursomeWithRequiredPair`. This finally wires partner requests into every suggestion path, closing the gap noted in the overview doc.

### Reroll

- CourtBoard's per-court "Next Up" card (already exists, currently read-only display) gets a **Reroll** button next to **Start**, visible only while that match is still `scheduled` (never once `in_progress`).
- Reroll calls `pickTopAvailableFoursomeOptions` (existing, unchanged) over that court's eligible pool, filters out the currently-displayed foursome, picks randomly among the rest, and replaces that one `Match` object in place (same id-less-replace pattern `MatchQueue`'s swap editor already does via `onUpdateMatchPlayers`, or a new `onRerollMatch(matchId)` if a full player-set swap—including court reassignment—is cleaner; **implementation detail for the plan**, not a design fork).
- Full tier + carry + rating + variety logic applies to every reroll option — never a blind shuffle.

### Session start (`storage.ts`, `createNewSession`)

- New sessions start with `matches: []`, `totalRounds: 0` (or `1` if UI assumes ≥1 — implementation detail). First call to `refreshSuggestions` (fired once on session creation, same as today's initial `generateRotatingDoublesSchedule` call) populates one suggestion per court.

### Migration for in-flight sessions

- On load (`getAllSessions`/subscribe path), any session with more `scheduled` matches than courts gets trimmed: keep only the earliest-`matchNumber` `scheduled` match per court, drop the rest. `completed`/`in_progress` are untouched. This is a one-time cleanup, not an ongoing constraint enforced elsewhere (rolling generation only ever creates one `scheduled` match per idle court going forward, so the surplus can't recur).

## Testing / Verification

- `scripts/verify-rating-balance.ts` (new, `tsx`): confirms `ratingGapBucket` moves a split choice when tiers are tied but Elo differs, and never overrides a tier-gap or carry-balance difference.
- `scripts/verify-catchup-cap.ts` (new, `tsx`): simulates a player arriving late without being marked Away, confirms their deficit is clamped and they don't get force-played more than `ceiling` worth of catch-up.
- `scripts/verify-fair-share.ts` (existing): re-run to confirm no regression from the cap for players who *were* marked away/present correctly.
- Live Playwright pass: create a session, confirm one suggestion per court appears (not a batch), Start/Reroll both work, reroll never repeats the same foursome twice in a row, partner request fires through the rolling path.
- `npm run lint` clean after every task.

## Deferred / Out of scope

- Per-court availability windows, session clock, projected match start times — same deferred list as the prior fairness plan, unaffected by this change.
- Persisting effective-rating snapshots (it's always recomputed from `matches`, consistent with every other derived-stat pattern in this codebase).
- Configurable form-nudge weights or window size (3 matches, ±20/13/7) — fixed constants for now, revisit if a real session shows they're miscalibrated.
