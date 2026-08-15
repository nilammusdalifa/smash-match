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
  createDefaultSeedSession,
  createNewSession
} from './utils/storage';
import { ensureAnonymousAuth } from './utils/firebase';
import { calculateDoublesEloChange } from './utils/ranking';
import { soundManager } from './utils/audio';
import { Navbar } from './components/Navbar';
import { CourtBoard } from './components/CourtBoard';
import { MatchQueue } from './components/MatchQueue';
import { Leaderboard } from './components/Leaderboard';
import { PlayerMatrix } from './components/PlayerMatrix';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ScorekeeperModal } from './components/ScorekeeperModal';
import { SessionSetupModal } from './components/SessionSetupModal';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { NotificationsBanner } from './components/NotificationsBanner';
import confetti from 'canvas-confetti';

export default function App() {
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

  // Session State
  const [session, setSession] = useState<TournamentSession>(() => {
    const saved = getAllSessions();
    if (saved && saved.length > 0) {
      return saved[0];
    }
    return createDefaultSeedSession();
  });

  // Active Tab
  const [activeTab, setActiveTab] = useState<'courts' | 'schedule' | 'leaderboard' | 'synergy' | 'analytics'>('courts');

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
    type: CourtNotification['type'],
    speechText?: string
  ) => {
    const newNotif: CourtNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      title,
      message,
      courtName,
      type,
      timestamp: Date.now(),
      read: false,
      speechText,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);

    if (speechText) {
      soundManager.announce(speechText);
    }
  }, []);

  // Update match score
  const handleUpdateMatchScore = (
    matchId: string, 
    team1Score: number, 
    team2Score: number, 
    isCompleted?: boolean
  ) => {
    setSession((prev) => {
      const matchIdx = prev.matches.findIndex((m) => m.id === matchId);
      if (matchIdx < 0) return prev;

      const targetMatch = { ...prev.matches[matchIdx] };
      const wasCompleted = targetMatch.status === 'completed';

      targetMatch.score = {
        ...targetMatch.score,
        team1Score,
        team2Score,
        isCompleted: !!isCompleted,
        winnerTeamId: isCompleted ? (team1Score > team2Score ? 1 : 2) : undefined,
      };

      if (isCompleted && !wasCompleted) {
        targetMatch.status = 'completed';
        targetMatch.endTime = Date.now();
        if (targetMatch.startTime) {
          targetMatch.durationSeconds = Math.max(1, Math.floor((Date.now() - targetMatch.startTime) / 1000));
        }

        // Elo Rating Updates
        const { team1Delta, team2Delta } = calculateDoublesEloChange(
          [targetMatch.team1.player1, targetMatch.team1.player2],
          [targetMatch.team2.player1, targetMatch.team2.player2],
          team1Score,
          team2Score
        );

        // Update player rating copy in session
        const updatedPlayers = prev.players.map((p) => {
          if (p.id === targetMatch.team1.player1.id || p.id === targetMatch.team1.player2.id) {
            return { ...p, currentRating: Math.max(100, p.currentRating + team1Delta) };
          }
          if (p.id === targetMatch.team2.player1.id || p.id === targetMatch.team2.player2.id) {
            return { ...p, currentRating: Math.max(100, p.currentRating + team2Delta) };
          }
          return p;
        });

        // Trigger notification
        const winTeam = team1Score > team2Score ? targetMatch.team1 : targetMatch.team2;
        const winNames = `${winTeam.player1.name} & ${winTeam.player2.name}`;
        addNotification(
          'Match Concluded',
          `${winNames} won ${Math.max(team1Score, team2Score)}-${Math.min(team1Score, team2Score)}`,
          targetMatch.courtName || 'Court 1',
          'match_completed',
          `Match finished on ${targetMatch.courtName || 'Court 1'}. Winners: ${winNames}.`
        );

        // Update court status (clear active match from court)
        const updatedCourts = prev.courts.map((c) => {
          if (c.currentMatchId === matchId) {
            return { ...c, currentMatchId: undefined };
          }
          return c;
        });

        const nextSession: TournamentSession = {
          ...prev,
          players: updatedPlayers,
          courts: updatedCourts,
          matches: prev.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m)),
        };

        saveSession(nextSession);
        return nextSession;
      }

      // If just updating intermediate score during play
      const nextSession: TournamentSession = {
        ...prev,
        matches: prev.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m)),
      };
      saveSession(nextSession);
      return nextSession;
    });
  };

  // Start match on specific court
  const handleStartMatch = (matchId: string, courtId: string) => {
    setSession((prev) => {
      const matchIdx = prev.matches.findIndex((m) => m.id === matchId);
      if (matchIdx < 0) return prev;

      const targetMatch = {
        ...prev.matches[matchIdx],
        status: 'in_progress' as const,
        startTime: Date.now(),
        courtId,
        courtName: `Court ${courtId}`,
      };

      const updatedCourts = prev.courts.map((c) => {
        if (c.id === courtId) {
          return { ...c, currentMatchId: matchId };
        }
        return c;
      });

      const nextMatches = prev.matches.map((m, idx) => (idx === matchIdx ? targetMatch : m));
      const nextSession: TournamentSession = {
        ...prev,
        courts: updatedCourts,
        matches: nextMatches,
      };

      soundManager.playCourtChime();
      const p1 = targetMatch.team1.player1.name;
      const p2 = targetMatch.team1.player2.name;
      const p3 = targetMatch.team2.player1.name;
      const p4 = targetMatch.team2.player2.name;

      addNotification(
        'Match Starting',
        `Court ${courtId}: ${p1} & ${p2} vs ${p3} & ${p4}`,
        `Court ${courtId}`,
        'match_start',
        `Match starting on Court ${courtId}. ${p1} and ${p2} versus ${p3} and ${p4}. Ready, play!`
      );

      saveSession(nextSession);
      return nextSession;
    });
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
    const nextMatch = session.matches.find((m) => m.status === 'scheduled');
    if (nextMatch) {
      handleStartMatch(nextMatch.id, courtId);
    }
  };

  // Add Custom Match
  const handleAddCustomMatch = (newMatch: Match) => {
    setSession((prev) => {
      const nextSession: TournamentSession = {
        ...prev,
        matches: [...prev.matches, newMatch],
      };
      saveSession(nextSession);
      return nextSession;
    });
  };

  // Reset Session
  const handleResetSession = () => {
    const reset = createNewSession(
      session.name,
      session.players.map((p) => ({ ...p, currentRating: p.initialRating })),
      session.courtCount,
      session.rules,
      session.matchmakingType
    );
    setSession(reset);
  };

  // Handle Session Created from wizard
  const handleSessionCreated = (newSession: TournamentSession) => {
    setSession(newSession);
    setActiveTab('courts');
    soundManager.playFanfare();
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        session={session}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewSessionModal={() => setShowSetupModal(true)}
        onResetSession={handleResetSession}
      />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'courts' && (
          <CourtBoard
            session={session}
            onUpdateMatchScore={handleUpdateMatchScore}
            onStartMatch={handleStartMatch}
            onOpenScorekeeper={handleOpenScorekeeper}
            onQuickAssignNextMatch={handleQuickAssignNextMatch}
          />
        )}

        {activeTab === 'schedule' && (
          <MatchQueue
            session={session}
            onUpdateMatchScore={handleUpdateMatchScore}
            onStartMatch={handleStartMatch}
            onOpenScorekeeper={handleOpenScorekeeper}
            onAddCustomMatch={handleAddCustomMatch}
          />
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard
            session={session}
            onSelectPlayer={(p) => setSelectedProfilePlayer(p)}
          />
        )}

        {activeTab === 'synergy' && (
          <PlayerMatrix
            session={session}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            session={session}
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
          rules={session.rules}
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
          session={session}
          onClose={() => setSelectedProfilePlayer(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SmashMatch • Doubles Tournament & Matchmaking Hub</span>
          <span className="text-slate-400">
            Engineered for rotating doubles round-robin, multi-court scalability & Elo ranking
          </span>
        </div>
      </footer>
    </div>
  );
}
