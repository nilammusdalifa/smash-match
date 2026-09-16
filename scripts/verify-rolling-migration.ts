import { migrateRollingSession } from '../src/utils/rolling';
import { initializeCourts } from '../src/utils/scheduler';
import { Match, Player, TournamentSession } from '../src/types/badminton';

function mkPlayer(id: string): Player {
  return { id, name: id, initialRating: 1200, currentRating: 1200, skillLevel: 'B', active: true };
}

function mkScheduled(n: number, courtId: string, ids: string[]): Match {
  return {
    id: 'm' + n,
    roundNumber: n,
    matchNumber: n,
    courtId,
    team1: { player1: mkPlayer(ids[0]), player2: mkPlayer(ids[1]) },
    team2: { player1: mkPlayer(ids[2]), player2: mkPlayer(ids[3]) },
    score: { team1Score: 0, team2Score: 0, isCompleted: false },
    status: 'scheduled',
  };
}

function mkSession(matches: Match[], rollingMigrated?: boolean): TournamentSession {
  return {
    id: 's1',
    name: 'Test',
    date: '2026-01-01',
    createdAt: Date.now(),
    courtCount: 1,
    courts: initializeCourts(1),
    players: Array.from({ length: 8 }, (_, i) => mkPlayer('P' + i)),
    rules: { pointsToWin: 21, winByTwo: true, maxPointsCap: 30, numberOfSets: 1, suddenDeathAtCap: true },
    matches,
    currentRound: 1,
    totalRounds: matches.reduce((max, m) => Math.max(max, m.roundNumber), 1),
    isCompleted: false,
    rollingMigrated,
    ownerUid: 'u1',
    pin: '1234',
  };
}

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

const scheduledCount = (s: TournamentSession) => s.matches.filter((m) => m.status === 'scheduled').length;

// (a) An already-migrated session with two scheduled matches queued on the
// same court is a legitimate Custom Match queue, not batch-generator debris.
// The migration must leave it completely alone — this is the regression the
// old `hasSurplus`-gated effect caused, silently deleting the second match
// on the very next render after a user created it.
const customQueue = [mkScheduled(1, '1', ['P0', 'P1', 'P2', 'P3']), mkScheduled(2, '1', ['P4', 'P5', 'P6', 'P7'])];
const alreadyMigrated = mkSession(customQueue, true);
const noop = migrateRollingSession(alreadyMigrated);
check('an already-migrated session is not touched at all', noop === null);
check('its two queued matches on one court survive', scheduledCount(alreadyMigrated) === 2);

// (b) A session from before this flag existed (rollingMigrated unset) with
// the same surplus IS batch-generator debris: it gets trimmed to one
// scheduled match per court, exactly once, and comes back stamped.
const legacy = mkSession([
  mkScheduled(1, '1', ['P0', 'P1', 'P2', 'P3']),
  mkScheduled(2, '1', ['P4', 'P5', 'P6', 'P7']),
  mkScheduled(3, '1', ['P0', 'P2', 'P4', 'P6']),
]);
check('the legacy session starts with 3 scheduled matches on 1 court', scheduledCount(legacy) === 3);
const migrated = migrateRollingSession(legacy);
check('a never-migrated session is migrated', migrated !== null);
if (migrated) {
  check('surplus is trimmed down to one scheduled match on the court', scheduledCount(migrated) === 1);
  check('the earliest match by matchNumber is the one kept', migrated.matches.find((m) => m.status === 'scheduled')!.id === 'm1');
  check('the migrated session is stamped rollingMigrated', migrated.rollingMigrated === true);

  // ...and re-running is a no-op, so the next render can't trim again.
  check('re-running the migration on the result does nothing', migrateRollingSession(migrated) === null);

  // The user now queues a legitimate second match via Custom Match. Because
  // the stamp persists, the migration must not delete it.
  const withCustomMatch: TournamentSession = {
    ...migrated,
    matches: [...migrated.matches, mkScheduled(9, '1', ['P4', 'P5', 'P6', 'P7'])],
  };
  check('a Custom Match queued after migration is left alone', migrateRollingSession(withCustomMatch) === null);
  check('and it is still there', scheduledCount(withCustomMatch) === 2);
}

// (c) A never-migrated session that is already clean (at most one scheduled
// match per court) still gets stamped, with no other change, so it too stops
// re-entering this branch on every render.
const cleanLegacy = mkSession([mkScheduled(1, '1', ['P0', 'P1', 'P2', 'P3'])]);
const stamped = migrateRollingSession(cleanLegacy);
check('a clean never-migrated session is still stamped', stamped !== null && stamped.rollingMigrated === true);
if (stamped) {
  check('its matches are unchanged', stamped.matches === cleanLegacy.matches);
  check('and it never migrates again', migrateRollingSession(stamped) === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
