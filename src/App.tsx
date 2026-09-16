import React, { useState, useEffect, useCallback } from 'react';
import { 
  TournamentSession, 
  Match, 
  Player, 
  CourtNotification 
} from './types/badminton';
import {
  getAllSessions,
  saveSession,
  createNewSession,
  subscribeToRemoteSession,
  pushSessionToFirebase,
  pushSessionOwnershipToFirebase
} from './utils/storage';
import { auth, ensureAnonymousAuth } from './utils/firebase';
import { recomputeAllRatings } from './utils/ranking';
import { generateId, regenerateRemainingSchedule } from './utils/scheduler';
import { refreshSuggestions } from './utils/rolling';
import { Navbar } from './components/Navbar';
import { CourtBoard } from './components/CourtBoard';
import { MatchQueue } from './components/MatchQueue';
import { Leaderboard } from './components/Leaderboard';
import { SettingsPanel } from './components/SettingsPanel';
import { ScorekeeperModal } from './components/ScorekeeperModal';
import { SessionSetupModal } from './components/SessionSetupModal';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { NotificationsBanner } from './components/NotificationsBanner';
import { RolePickerModal } from './components/RolePickerModal';
import confetti from 'canvas-confetti';

export default function App() {
  // Dark is the only theme that existed before this, so it stays the
  // default for anyone who's never touched the toggle — light mode is
  // opt-in and only takes effect once the `light` class lands on <html>.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('smashmatch_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('smashmatch_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  // Wait for silent anonymous auth before doing anything session-related,
  // so every device has a uid by the time it creates or claims a session.
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    ensureAnonymousAuth()
      .then(() => setAuthReady(true))
      .catch((err) => {
        console.error('Firebase anonymous auth failed:', err);
        setAuthReady(true); // don't block the app forever; local-only mode still works
      });
  }, []);

  // Remote "view" mode: ?view=<sessionId> in the URL
  const [viewSessionId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('view')
  );
  const [remoteRole, setRemoteRole] = useState<'player' | 'umpire' | null>(null);
  const isRemoteMode = viewSessionId !== null;

  // Session State — null while a remote session is still loading, or when
  // this device has no session yet and needs to create its first one.
  const [session, setSession] = useState<TournamentSession | null>(() => {
    if (isRemoteMode) return null;
    const saved = getAllSessions();
    return saved && saved.length > 0 ? saved[0] : null;
  });

  // In remote mode, once a role is picked, subscribe to the live session
  useEffect(() => {
    if (!isRemoteMode || !viewSessionId || !remoteRole || !authReady) return;
    const unsubscribe = subscribeToRemoteSession(viewSessionId, setSession);
    return unsubscribe;
  }, [isRemoteMode, viewSessionId, remoteRole, authReady]);

  // The `session` useState initializer runs on the very first render, before
  // `ensureAnonymousAuth()` has resolved — so a session created right then gets
  // an empty `ownerUid` and never reaches Firebase. Once auth is ready, stamp
  // the real uid and (re)write `pin`/`ownerUid` to their own Firebase paths.
  // Both nodes are write-once, so this succeeds exactly when they were never
  // written and is a harmless rejection otherwise. Local sessions only —
  // remote/subscribed sessions aren't this device's to own.
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

  // In remote mode, writes go straight to Firebase instead of localStorage —
  // this isn't "this device's" session to keep locally.
  const persistSession = isRemoteMode ? pushSessionToFirebase : saveSession;

  // Remote Players (as opposed to Umpires) get a read-only view — no edit controls.
  const isReadOnlyPlayer = isRemoteMode && remoteRole === 'player';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'courts' | 'schedule' | 'leaderboard' | 'settings'>('courts');

  // Modals state
  const [scorekeeperMatch, setScorekeeperMatch] = useState<Match | null>(null);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [selectedProfilePlayer, setSelectedProfilePlayer] = useState<Player | null>(null);

  // Real-time notifications
  const [notifications, setNotifications] = useState<CourtNotification[]>([]);

  // Helper to add toast notification
  const addNotification = useCallback((
    title: string,
    message: string,
    courtName: string,
    type: CourtNotification['type']
  ) => {
    const newNotif: CourtNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      title,
      message,
      courtName,
      type,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
  }, []);

  // Update match score
  const handleUpdateMatchScore = (
    matchId: string, 
    team1Score: number, 
    team2Score: number, 
    isCompleted?: boolean
  ) => {
    // The session update is computed here as a plain value (not a setSession
    // functional updater) specifically so the side effects below — sound,
    // notification, persistence — run exactly once. React's StrictMode
    // intentionally invokes functional updaters twice in development to
    // catch impure ones; any side effect placed inside one fires twice too.
    if (!session) return;
    const matchIdx = session.matches.findIndex((m) => m.id === matchId);
    if (matchIdx < 0) return;

    const targetMatch = { ...session.matches[matchIdx] };
    const wasCompleted = targetMatch.status === 'completed';

    targetMatch.score = {
      ...targetMatch.score,
      team1Score,
      team2Score,
      isCompleted: !!isCompleted,
      winnerTeamId: isCompleted ? (team1Score > team2Score ? 1 : 2) : undefined,
    };

    const becameCompleted = !!isCompleted && !wasCompleted;
    if (becameCompleted) {
      targetMatch.status = 'completed';
      targetMatch.endTime = Date.now();
      if (targetMatch.startTime) {
        targetMatch.durationSeconds = Math.max(1, Math.floor((Date.now() - targetMatch.startTime) / 1000));
      }
    }

    // Either a fresh completion or a correction to an already-completed
    // match's score — either way, ratings must reflect the final recorded
    // score. Rebuilt from scratch (see recomputeAllRatings) rather than
    // patched with a single delta, since Elo is order-dependent.
    if (becameCompleted || (isCompleted && wasCompleted)) {
      const nextMatches = session.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m));
      const updatedPlayers = recomputeAllRatings(session.players, nextMatches);
      const updatedCourts = becameCompleted
        ? session.courts.map((c) => (c.currentMatchId === matchId ? { ...c, currentMatchId: undefined } : c))
        : session.courts;

      const nextSession: TournamentSession = {
        ...session,
        players: updatedPlayers,
        courts: updatedCourts,
        matches: nextMatches,
      };

      setSession(nextSession);
      persistSession(nextSession);

      if (becameCompleted) {
        const winTeam = team1Score > team2Score ? targetMatch.team1 : targetMatch.team2;
        const winNames = `${winTeam.player1.name} & ${winTeam.player2.name}`;
        addNotification(
          'Match Concluded',
          `${winNames} won ${Math.max(team1Score, team2Score)}-${Math.min(team1Score, team2Score)}`,
          targetMatch.courtName || 'Court 1',
          'match_completed'
        );
      }
      return;
    }

    // If just updating intermediate score during play
    const nextSession: TournamentSession = {
      ...session,
      matches: session.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m)),
    };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Start match on specific court
  const handleStartMatch = (matchId: string, courtId: string) => {
    if (!session) return;
    const matchIdx = session.matches.findIndex((m) => m.id === matchId);
    if (matchIdx < 0) return;

    const court = session.courts.find((c) => c.id === courtId);
    const targetMatch = {
      ...session.matches[matchIdx],
      status: 'in_progress' as const,
      startTime: Date.now(),
      courtId,
      courtName: court?.name || `Court ${courtId}`,
    };

    const updatedCourts = session.courts.map((c) => {
      if (c.id === courtId) {
        return { ...c, currentMatchId: matchId };
      }
      return c;
    });

    const nextMatches = session.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m));
    const nextSession: TournamentSession = {
      ...session,
      courts: updatedCourts,
      matches: nextMatches,
    };

    setSession(nextSession);
    persistSession(nextSession);

    const p1 = targetMatch.team1.player1.name;
    const p2 = targetMatch.team1.player2.name;
    const p3 = targetMatch.team2.player1.name;
    const p4 = targetMatch.team2.player2.name;

    const courtLabel = court?.name || `Court ${courtId}`;
    addNotification(
      'Match Starting',
      `${courtLabel}: ${p1} & ${p2} vs ${p3} & ${p4}`,
      courtLabel,
      'match_start'
    );
  };

  // Open Scorekeeper modal
  const handleOpenScorekeeper = (match: Match) => {
    // If match was scheduled, transition to in_progress
    if (match.status === 'scheduled') {
      handleStartMatch(match.id, match.courtId || '1');
    }
    setScorekeeperMatch(match);
  };

  // Quick Assign Next Match
  const handleQuickAssignNextMatch = (courtId: string) => {
    const nextMatch = session!.matches.find((m) => m.status === 'scheduled');
    if (nextMatch) {
      handleStartMatch(nextMatch.id, courtId);
    }
  };

  // Add Custom Match
  const handleAddCustomMatch = (newMatch: Match) => {
    if (!session) return;
    const nextSession: TournamentSession = {
      ...session,
      matches: [...session.matches, newMatch],
    };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Start a freshly-suggested balanced foursome directly on an idle court.
  const handleStartSuggestedMatch = (
    courtId: string,
    playerIds: [string, string, string, string]
  ) => {
    if (!session) return;
    const byId = new Map<string, Player>(session.players.map((p) => [p.id, p]));
    const four = playerIds.map((id) => byId.get(id));
    if (four.some((p) => !p)) return;
    const [p1, p2, p3, p4] = four as Player[];

    const court = session.courts.find((c) => c.id === courtId);
    const newMatch: Match = {
      id: generateId(),
      roundNumber: Math.max(...session.matches.map((m) => m.roundNumber), 0) + 1,
      matchNumber: session.matches.length + 1,
      courtId,
      courtName: court?.name || `Court ${courtId}`,
      team1: { player1: p1, player2: p2 },
      team2: { player1: p3, player2: p4 },
      score: { team1Score: 0, team2Score: 0, isCompleted: false, history: [] },
      status: 'in_progress',
      startTime: Date.now(),
    };

    const nextSession: TournamentSession = {
      ...session,
      matches: [...session.matches, newMatch],
      courts: session.courts.map((c) => (c.id === courtId ? { ...c, currentMatchId: newMatch.id } : c)),
    };
    setSession(nextSession);
    persistSession(nextSession);

    addNotification(
      'Match Starting',
      `${newMatch.courtName}: ${p1.name} & ${p2.name} vs ${p3.name} & ${p4.name}`,
      newMatch.courtName!,
      'match_start'
    );
  };

  // Edit a player's skill tier. Also re-balances every not-yet-played match
  // against the new tier — matches already completed or in progress are left
  // alone, since the game already happened under the old assumption.
  const handleUpdatePlayerTier = (playerId: string, tier: 'A' | 'B' | 'C') => {
    if (!session) return;
    const updatedPlayers = session.players.map((p) =>
      p.id === playerId ? { ...p, skillLevel: tier } : p
    );
    const sessionWithTier = { ...session, players: updatedPlayers };
    const { matches, totalRounds } = regenerateRemainingSchedule(sessionWithTier);
    const nextSession: TournamentSession = { ...sessionWithTier, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
    setSelectedProfilePlayer((prev) => (prev && prev.id === playerId ? { ...prev, skillLevel: tier } : prev));
  };

  // Add a new player mid-session and re-balance every not-yet-played match
  // so they get woven into the remaining rounds fairly.
  const handleAddPlayer = (name: string, tier: 'A' | 'B' | 'C') => {
    if (!session) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const startingRating = tier === 'A' ? 1200 : tier === 'B' ? 1150 : 1100;
    const newPlayer: Player = {
      id: generateId(),
      name: trimmed,
      initialRating: startingRating,
      currentRating: startingRating,
      skillLevel: tier,
      active: true,
      // An unset arrivedAt means "present since session start" — correct
      // for the initial roster, wrong for someone added mid-session, who
      // would otherwise retroactively count as owed entitlement for every
      // match that already happened before they existed.
      arrivedAt: Date.now(),
    };
    const sessionWithPlayer = { ...session, players: [...session.players, newPlayer] };
    const { matches, totalRounds } = regenerateRemainingSchedule(sessionWithPlayer);
    const nextSession: TournamentSession = { ...sessionWithPlayer, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
  };

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

  // Mark someone as here / not here yet. Everyone is present by default, so
  // this is only used for the exceptions (late arrivals, early leavers), and
  // it re-balances every match that hasn't been played yet.
  const handleSetPlayerPresence = (playerId: string, present: boolean) => {
    if (!session) return;
    const now = Date.now();
    const updatedPlayers = session.players.map((p) => {
      if (p.id !== playerId) return p;
      // Always stamp the actual return time — falling back to a stale
      // arrivedAt (or session.createdAt) here would retroactively count
      // them present for matches during the away window they just left,
      // handing them an unearned catch-up bonus in the fair-share math.
      return present
        ? { ...p, arrivedAt: now, leftAt: undefined }
        : { ...p, leftAt: now };
    });
    const sessionWithPresence = { ...session, players: updatedPlayers };
    const { matches, totalRounds } = regenerateRemainingSchedule(sessionWithPresence);
    const nextSession: TournamentSession = { ...sessionWithPresence, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Update which pairs have asked to play together, re-balancing every
  // not-yet-played match so a new request gets honored as early as possible.
  const handleSetRequestedPairs = (pairs: Array<[string, string]>) => {
    if (!session) return;
    const sessionWithPairs = { ...session, requestedPairs: pairs };
    const { matches, totalRounds } = regenerateRemainingSchedule(sessionWithPairs);
    const nextSession: TournamentSession = { ...sessionWithPairs, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Change how many courts the session has mid-session, re-balancing every
  // not-yet-played match against the new count (more courts means more
  // people play per round instead of resting).
  const handleUpdateCourtCount = (newCount: number, newCourtNames?: string[]) => {
    if (!session || newCount < 1) return;

    // Refuse to drop a court that's mid-match — nothing to safely do with
    // that live match's court assignment otherwise.
    const courtsBeingRemoved = session.courts.filter((c) => Number(c.id) > newCount);
    if (courtsBeingRemoved.some((c) => c.currentMatchId)) {
      alert('Finish or move the match on the court you want to remove first.');
      return;
    }

    // Existing courts keep their own name unless a different one was typed;
    // a brand-new court gets the name typed for it (e.g. "Court 8" when
    // going from 1 court to 2), or "Court N" if none was given.
    const newCourts = Array.from({ length: newCount }, (_, i) => {
      const id = (i + 1).toString();
      const existing = session.courts.find((c) => c.id === id);
      const typedName = newCourtNames?.[i]?.trim();
      if (existing) {
        return typedName ? { ...existing, name: typedName } : existing;
      }
      return { id, name: typedName || `Court ${id}`, isActive: true };
    });

    const sessionWithCourts = { ...session, courtCount: newCount, courts: newCourts };
    const { matches, totalRounds } = regenerateRemainingSchedule(sessionWithCourts);
    const nextSession: TournamentSession = { ...sessionWithCourts, matches, totalRounds };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Remove any match — scheduled (freed-up players just sit out that round),
  // in-progress (e.g. a mis-entered Custom Match), or completed (e.g. a
  // wrong score that was already saved). Ratings are rebuilt from scratch
  // afterward since Elo is order-dependent — see recomputeAllRatings.
  const handleDeleteMatch = (matchId: string) => {
    if (!session) return;
    const match = session.matches.find((m) => m.id === matchId);
    if (!match) return;

    const remainingMatches = session.matches.filter((m) => m.id !== matchId);
    const updatedPlayers = recomputeAllRatings(session.players, remainingMatches);
    const updatedCourts = session.courts.map((c) =>
      c.currentMatchId === matchId ? { ...c, currentMatchId: undefined } : c
    );

    const nextSession: TournamentSession = {
      ...session,
      matches: remainingMatches,
      players: updatedPlayers,
      courts: updatedCourts,
    };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Replace the 4 players in a not-yet-played match — used for both a
  // single-slot swap (3 ids unchanged, 1 new) and a full reshuffle (4 new
  // ids), decided by the caller.
  const handleUpdateMatchPlayers = (
    matchId: string,
    team1: [string, string],
    team2: [string, string]
  ) => {
    if (!session) return;
    const matchIdx = session.matches.findIndex((m) => m.id === matchId);
    if (matchIdx < 0) return;
    const match = session.matches[matchIdx];
    if (match.status !== 'scheduled') return;

    const byId = new Map<string, Player>(session.players.map((p) => [p.id, p]));
    const p1 = byId.get(team1[0]);
    const p2 = byId.get(team1[1]);
    const p3 = byId.get(team2[0]);
    const p4 = byId.get(team2[1]);
    if (!p1 || !p2 || !p3 || !p4) return;
    if (new Set([p1.id, p2.id, p3.id, p4.id]).size < 4) return;

    const updated: Match = { ...match, team1: { player1: p1, player2: p2 }, team2: { player1: p3, player2: p4 } };
    const nextSession: TournamentSession = {
      ...session,
      matches: session.matches.map((m, i) => (i === matchIdx ? updated : m)),
    };
    setSession(nextSession);
    persistSession(nextSession);
  };

  // Reset Session
  const handleResetSession = () => {
    const reset = createNewSession(
      session!.name,
      session!.players.map((p) => ({ ...p, currentRating: p.initialRating })),
      session!.courtCount,
      session!.rules,
      session!.courts.map((c) => ({ name: c.name }))
    );
    setSession(reset);
  };

  // Handle Session Created from wizard
  const handleSessionCreated = (newSession: TournamentSession) => {
    setSession(newSession);
    setActiveTab('courts');
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-white flex items-center justify-center">
        <div className="text-slate-400 light:text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (isRemoteMode && !remoteRole) {
    return <RolePickerModal sessionId={viewSessionId!} onResolved={setRemoteRole} />;
  }

  if (isRemoteMode && !session) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-white flex items-center justify-center">
        <div className="text-slate-400 light:text-slate-500 text-sm">Connecting to live session...</div>
      </div>
    );
  }

  // No local session yet (first-ever load, nothing saved) — go straight to
  // setting up a real one instead of showing sample/demo data.
  if (!isRemoteMode && !session) {
    return (
      <SessionSetupModal
        onClose={() => {}}
        onSessionCreated={handleSessionCreated}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 light:bg-white light:text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        session={session!}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        readOnly={isReadOnlyPlayer}
        hideSessionControls={isRemoteMode}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 sm:pb-6">
        {activeTab === 'courts' && (
          <CourtBoard
            session={session!}
            onUpdateMatchScore={handleUpdateMatchScore}
            onStartMatch={handleStartMatch}
            onOpenScorekeeper={handleOpenScorekeeper}
            onQuickAssignNextMatch={handleQuickAssignNextMatch}
            onStartSuggestedMatch={handleStartSuggestedMatch}
            readOnly={isReadOnlyPlayer}
          />
        )}

        {activeTab === 'schedule' && (
          <MatchQueue
            session={session!}
            onUpdateMatchScore={handleUpdateMatchScore}
            onStartMatch={handleStartMatch}
            onOpenScorekeeper={handleOpenScorekeeper}
            onAddCustomMatch={handleAddCustomMatch}
            onDeleteMatch={handleDeleteMatch}
            onUpdateMatchPlayers={handleUpdateMatchPlayers}
            readOnly={isReadOnlyPlayer}
          />
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard
            session={session!}
            onSelectPlayer={(p) => setSelectedProfilePlayer(p)}
            readOnly={isReadOnlyPlayer}
          />
        )}

        {activeTab === 'settings' && !isReadOnlyPlayer && (
          <SettingsPanel
            session={session!}
            onAddPlayer={handleAddPlayer}
            onSetPlayerPresence={handleSetPlayerPresence}
            onMarkJustArrived={handleMarkJustArrived}
            onSetRequestedPairs={handleSetRequestedPairs}
            onUpdateCourtCount={handleUpdateCourtCount}
            onOpenNewSessionModal={() => setShowSetupModal(true)}
            onResetSession={handleResetSession}
            hideSessionControls={isRemoteMode}
          />
        )}
      </main>

      {/* Real-time Toast Notifications */}
      <NotificationsBanner
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
      />

      {/* Full Digital Umpire Scorekeeper Modal */}
      {scorekeeperMatch && (
        <ScorekeeperModal
          match={scorekeeperMatch}
          rules={session!.rules}
          onClose={() => setScorekeeperMatch(null)}
          onSaveAndFinish={(mId, t1, t2) => {
            handleUpdateMatchScore(mId, t1, t2, true);
            setScorekeeperMatch(null);
          }}
          onUpdateScore={(mId, t1, t2) => handleUpdateMatchScore(mId, t1, t2, false)}
        />
      )}

      {/* New Tournament Session Setup Modal */}
      {showSetupModal && (
        <SessionSetupModal
          onClose={() => setShowSetupModal(false)}
          onSessionCreated={handleSessionCreated}
        />
      )}

      {/* Individual Player Profile Modal */}
      {selectedProfilePlayer && (
        <PlayerProfileModal
          player={selectedProfilePlayer}
          session={session!}
          onClose={() => setSelectedProfilePlayer(null)}
          onUpdatePlayerTier={handleUpdatePlayerTier}
          readOnly={isReadOnlyPlayer}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-400">
        SmashMatch • Doubles Tournament & Matchmaking Hub
      </footer>
    </div>
  );
}
