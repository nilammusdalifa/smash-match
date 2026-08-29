import React, { useState, useEffect } from 'react';
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

// A slim bar with a bright leading edge fading to a muted body — evoking a
// badminton net's white top tape over its mesh — separating the two teams
// from the score between them. Horizontal on mobile (teams stack), vertical
// on desktop (teams sit side by side).
const NetDivider: React.FC = () => (
  <div
    className="h-[3px] w-full rounded-full bg-gradient-to-r from-slate-200 light:from-slate-700 via-slate-600/30 light:via-slate-300/60 to-slate-600/30 light:to-slate-300/60 sm:h-auto sm:w-[3px] sm:self-stretch sm:bg-gradient-to-b sm:from-slate-200 sm:light:from-slate-700 sm:via-slate-600/30 sm:light:via-slate-300/60 sm:to-slate-600/30 sm:light:to-slate-300/60"
    aria-hidden="true"
  />
);

interface CourtBoardProps {
  session: TournamentSession;
  onUpdateMatchScore: (matchId: string, team1Score: number, team2Score: number, isCompleted?: boolean) => void;
  onStartMatch: (matchId: string, courtId: string) => void;
  onOpenScorekeeper: (match: Match) => void;
  onQuickAssignNextMatch: (courtId: string) => void;
  onStartSuggestedMatch: (courtId: string, playerIds: [string, string, string, string]) => void;
  readOnly?: boolean;
}

export const CourtBoard: React.FC<CourtBoardProps> = ({
  session,
  onUpdateMatchScore,
  onStartMatch,
  onOpenScorekeeper,
  onQuickAssignNextMatch,
  onStartSuggestedMatch,
  readOnly = false,
}) => {
  // Local timer ticker for active match duration
  const [, setTick] = useState<number>(0);

  // Direct final-result entry (skip live point-by-point tracking)
  const [editingScoreMatchId, setEditingScoreMatchId] = useState<string | null>(null);
  const [editScoreT1, setEditScoreT1] = useState<number>(0);
  const [editScoreT2, setEditScoreT2] = useState<number>(0);

  const handleStartFinalScoreEntry = (match: Match) => {
    setEditingScoreMatchId(match.id);
    setEditScoreT1(match.score.team1Score);
    setEditScoreT2(match.score.team2Score);
  };

  const handleSaveFinalScore = (matchId: string) => {
    onUpdateMatchScore(matchId, editScoreT1, editScoreT2, true);
    setEditingScoreMatchId(null);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (startTime?: number) => {
    if (!startTime) return '00:00';
    const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Most recently finished matches, newest first — quick access without digging into Schedule
  const recentResults = [...session.matches]
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
    .slice(0, 3);

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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Overview & Quick Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 light:bg-white/60 p-4 sm:p-5 rounded-2xl border border-slate-800 light:border-slate-200">
        <div>
          <h2 className="text-base font-bold text-white light:text-slate-900 flex flex-wrap items-center gap-2">
            <span>Live Courts</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 light:bg-emerald-50 text-emerald-400 light:text-emerald-600 border border-emerald-500/30 light:border-emerald-300">
              {session.courtCount} {session.courtCount === 1 ? 'Court Active' : 'Courts Active'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-1">
            {session.players.length} players • {session.rules.pointsToWin} points to win (cap {session.rules.maxPointsCap})
          </p>
        </div>

        {/* Quick legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400 light:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Live on Court
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            On Deck (Next)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 light:bg-slate-400"></span>
            Resting
          </span>
        </div>
      </div>

      {/* Recent Results — quick access to what just finished, without opening Schedule */}
      {recentResults.length > 0 && (
        <div className="bg-slate-900/60 light:bg-white/60 p-3 sm:p-4 rounded-2xl border border-slate-800 light:border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 light:text-slate-600 uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 light:text-emerald-600" />
            <span>Recent Results</span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {recentResults.map((m) => {
              const team1Won = m.score.team1Score > m.score.team2Score;
              return (
                <div
                  key={m.id}
                  className="shrink-0 min-w-[240px] bg-slate-950/60 light:bg-slate-50/60 rounded-xl border border-slate-800/80 light:border-slate-200/80 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${team1Won ? 'text-emerald-400 light:text-emerald-600 font-semibold' : 'text-slate-400 light:text-slate-500'}`}>
                      {m.team1.player1.name} & {m.team1.player2.name}
                    </span>
                    <span className="font-mono font-bold text-white light:text-slate-900 shrink-0">
                      {m.score.team1Score}-{m.score.team2Score}
                    </span>
                    <span className={`truncate text-right ${!team1Won ? 'text-emerald-400 light:text-emerald-600 font-semibold' : 'text-slate-400 light:text-slate-500'}`}>
                      {m.team2.player1.name} & {m.team2.player2.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Courts Grid */}
      <div className={`grid gap-4 sm:gap-6 ${session.courtCount === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {session.courts.map((court) => {
          // Find currently active match on this court
          const activeMatch = session.matches.find(
            (m) => m.status === 'in_progress' && m.courtId === court.id
          );

          // Find next scheduled match for this court
          const nextMatch = session.matches.find(
            (m) => m.status === 'scheduled' && (m.courtId === court.id || !m.courtId)
          );

          // Find resting players for current active match
          const restingPlayerNames = activeMatch?.restingPlayerIds
            ? session.players.filter((p) => activeMatch.restingPlayerIds?.includes(p.id))
            : [];

          return (
            <div
              key={court.id}
              id={`court-card-${court.id}`}
              className="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition-all"
            >
              {/* Court Header */}
              <div className="bg-slate-950/80 light:bg-slate-50/80 px-5 py-3.5 border-b border-slate-800/80 light:border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/20 light:bg-emerald-100 border border-emerald-500/30 light:border-emerald-300 flex items-center justify-center text-emerald-400 light:text-emerald-600 font-bold text-sm">
                    {court.id}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-wide">{court.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {activeMatch ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 light:text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          Round {activeMatch.roundNumber} • Match #{activeMatch.matchNumber}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 light:text-slate-400 font-medium">Available</span>
                      )}
                    </div>
                  </div>
                </div>

                {activeMatch && (
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800/90 light:bg-slate-100/90 text-slate-300 light:text-slate-600 text-xs font-mono tabular-nums border border-slate-700 light:border-slate-300">
                      <Clock className="w-3.5 h-3.5 text-emerald-400 light:text-emerald-600" />
                      <span>{formatDuration(activeMatch.startTime)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Court Active Area */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                {activeMatch ? (
                  <div className="space-y-4">
                    {/* Live Match Scoreboard — hidden while entering a final
                        score directly, so that panel doesn't end up pushed
                        below the fold on a small screen. */}
                    {editingScoreMatchId !== activeMatch.id && (
                    <div className="bg-slate-950/60 light:bg-slate-50/60 rounded-xl p-3 sm:p-4 border border-slate-800/80 light:border-slate-200/80">
                      <div className="flex flex-col sm:grid sm:grid-cols-[4fr_auto_3fr_auto_4fr] gap-3 sm:gap-3 sm:items-stretch">
                        {/* Team 1 Box */}
                        <div className="text-center bg-slate-900/90 light:bg-white/90 p-3 rounded-xl border border-slate-800 light:border-slate-200">
                          <div className="text-xs font-semibold text-emerald-400 light:text-emerald-600 uppercase tracking-wider mb-1">
                            Team A
                          </div>
                          <div className="text-sm font-bold text-white light:text-slate-900 truncate" title={activeMatch.team1.player1.name}>
                            {activeMatch.team1.player1.name}
                          </div>
                          <div className="text-sm font-bold text-slate-300 light:text-slate-600 truncate" title={activeMatch.team1.player2.name}>
                            {activeMatch.team1.player2.name}
                          </div>

                          {/* Point Controls */}
                          {!readOnly && (
                          <div className="mt-3 flex items-center justify-center gap-2">
                            <button
                              id={`btn-sub-t1-${activeMatch.id}`}
                              onClick={() => {
                                const newScore = Math.max(0, activeMatch.score.team1Score - 1);
                                onUpdateMatchScore(activeMatch.id, newScore, activeMatch.score.team2Score);
                              }}
                              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-600 flex items-center justify-center text-xs font-bold transition-all shrink-0"
                            >
                              <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              id={`btn-add-t1-${activeMatch.id}`}
                              onClick={() => {
                                const newScore = activeMatch.score.team1Score + 1;
                                const isWin = newScore >= session.rules.pointsToWin && (newScore - activeMatch.score.team2Score >= 2 || newScore >= session.rules.maxPointsCap);
                                onUpdateMatchScore(activeMatch.id, newScore, activeMatch.score.team2Score, isWin);
                              }}
                              className="flex-1 sm:flex-none px-3 h-10 sm:h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-all shadow-sm active:scale-95"
                            >
                              +1 Pt
                            </button>
                          </div>
                          )}
                        </div>

                        <NetDivider />

                        {/* Scores in the middle */}
                        <div className="text-center flex flex-col items-center justify-center">
                          <div className="flex items-center justify-center space-x-1.5 font-mono tabular-nums font-black text-3xl sm:text-4xl text-white light:text-slate-900">
                            <span className={activeMatch.score.team1Score >= session.rules.pointsToWin - 1 ? 'text-amber-400 light:text-amber-600' : 'text-white light:text-slate-900'}>
                              {activeMatch.score.team1Score}
                            </span>
                            <span className="text-slate-600 light:text-slate-300 text-2xl">:</span>
                            <span className={activeMatch.score.team2Score >= session.rules.pointsToWin - 1 ? 'text-amber-400 light:text-amber-600' : 'text-white light:text-slate-900'}>
                              {activeMatch.score.team2Score}
                            </span>
                          </div>

                          {/* Match Point Alert */}
                          {(activeMatch.score.team1Score >= session.rules.pointsToWin - 1 || activeMatch.score.team2Score >= session.rules.pointsToWin - 1) && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-400 light:text-amber-600 bg-amber-400/10 light:bg-amber-100 px-2 py-0.5 rounded-full mt-1 border border-amber-400/20 light:border-amber-300 animate-pulse">
                              <Sparkles className="w-2.5 h-2.5" /> Match Point
                            </span>
                          )}

                          {!readOnly && (
                          <div className="mt-2 flex items-center justify-center gap-3">
                            <button
                              id={`btn-open-scorekeeper-${activeMatch.id}`}
                              onClick={() => onOpenScorekeeper(activeMatch)}
                              className="text-xs text-emerald-400 light:text-emerald-600 hover:text-emerald-300 light:hover:text-emerald-700 font-medium flex items-center gap-1 hover:underline cursor-pointer py-1"
                            >
                              <Maximize2 className="w-3 h-3" /> Full Umpire Mode
                            </button>
                            <span className="text-slate-700 light:text-slate-300">•</span>
                            <button
                              id={`btn-enter-final-score-${activeMatch.id}`}
                              onClick={() => handleStartFinalScoreEntry(activeMatch)}
                              className="text-xs text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-700 font-medium flex items-center gap-1 hover:underline cursor-pointer py-1"
                            >
                              <Edit3 className="w-3 h-3" /> Enter Final Score
                            </button>
                          </div>
                          )}
                        </div>

                        <NetDivider />

                        {/* Team 2 Box */}
                        <div className="text-center bg-slate-900/90 light:bg-white/90 p-3 rounded-xl border border-slate-800 light:border-slate-200">
                          <div className="text-xs font-semibold text-teal-400 light:text-teal-600 uppercase tracking-wider mb-1">
                            Team B
                          </div>
                          <div className="text-sm font-bold text-white light:text-slate-900 truncate" title={activeMatch.team2.player1.name}>
                            {activeMatch.team2.player1.name}
                          </div>
                          <div className="text-sm font-bold text-slate-300 light:text-slate-600 truncate" title={activeMatch.team2.player2.name}>
                            {activeMatch.team2.player2.name}
                          </div>

                          {/* Point Controls */}
                          {!readOnly && (
                          <div className="mt-3 flex items-center justify-center gap-2">
                            <button
                              id={`btn-sub-t2-${activeMatch.id}`}
                              onClick={() => {
                                const newScore = Math.max(0, activeMatch.score.team2Score - 1);
                                onUpdateMatchScore(activeMatch.id, activeMatch.score.team1Score, newScore);
                              }}
                              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-600 flex items-center justify-center text-xs font-bold transition-all shrink-0"
                            >
                              <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              id={`btn-add-t2-${activeMatch.id}`}
                              onClick={() => {
                                const newScore = activeMatch.score.team2Score + 1;
                                const isWin = newScore >= session.rules.pointsToWin && (newScore - activeMatch.score.team1Score >= 2 || newScore >= session.rules.maxPointsCap);
                                onUpdateMatchScore(activeMatch.id, activeMatch.score.team1Score, newScore, isWin);
                              }}
                              className="flex-1 sm:flex-none px-3 h-10 sm:h-8 rounded-lg bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center text-xs font-bold transition-all shadow-sm active:scale-95"
                            >
                              +1 Pt
                            </button>
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Quick Finish Match Button, or Direct Final-Score Entry */}
                    {!readOnly && (editingScoreMatchId === activeMatch.id ? (
                      <div className="bg-slate-950/60 light:bg-slate-50/60 p-3 rounded-xl border border-emerald-500/40 light:border-emerald-300 space-y-3">
                        <div className="flex items-center justify-center gap-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-emerald-400 light:text-emerald-600 font-semibold uppercase">Team A</span>
                            <span className="text-xs text-slate-300 light:text-slate-600 text-center leading-tight">
                              {activeMatch.team1.player1.name}<br />{activeMatch.team1.player2.name}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={editScoreT1 === 0 ? '' : editScoreT1}
                              onChange={(e) => setEditScoreT1(e.target.value === '' ? 0 : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="w-16 h-11 text-center bg-slate-900 light:bg-white border border-emerald-500/50 light:border-emerald-400 rounded-lg text-lg font-mono tabular-nums font-bold text-white light:text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <span className="text-slate-600 light:text-slate-300 font-bold mt-4">-</span>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-teal-400 light:text-teal-600 font-semibold uppercase">Team B</span>
                            <span className="text-xs text-slate-300 light:text-slate-600 text-center leading-tight">
                              {activeMatch.team2.player1.name}<br />{activeMatch.team2.player2.name}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={editScoreT2 === 0 ? '' : editScoreT2}
                              onChange={(e) => setEditScoreT2(e.target.value === '' ? 0 : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="w-16 h-11 text-center bg-slate-900 light:bg-white border border-teal-500/50 light:border-teal-400 rounded-lg text-lg font-mono tabular-nums font-bold text-white light:text-slate-900 focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingScoreMatchId(null)}
                            className="flex-1 py-2 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 text-xs font-semibold hover:text-white light:hover:text-slate-900 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            id={`btn-save-final-score-${activeMatch.id}`}
                            onClick={() => handleSaveFinalScore(activeMatch.id)}
                            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Save Final Result</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          id={`btn-finish-match-${activeMatch.id}`}
                          onClick={() => {
                            if (confirm(`Finish match with score ${activeMatch.score.team1Score} - ${activeMatch.score.team2Score}?`)) {
                              onUpdateMatchScore(
                                activeMatch.id,
                                activeMatch.score.team1Score,
                                activeMatch.score.team2Score,
                                true
                              );
                            }
                          }}
                          className="w-full py-2 px-4 rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-emerald-950/40 light:hover:bg-emerald-50 text-emerald-400 light:text-emerald-600 hover:text-emerald-300 light:hover:text-emerald-700 border border-emerald-500/30 light:border-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Finish & Save Match Score</span>
                        </button>
                      </div>
                    ))}

                    {/* Resting Players info if 8 players 1 court */}
                    {restingPlayerNames.length > 0 && (
                      <div className="bg-slate-950/40 light:bg-slate-50/40 px-3.5 py-2.5 rounded-xl border border-slate-800/60 light:border-slate-200/60 flex items-center gap-2 text-xs text-slate-400 light:text-slate-500">
                        <Coffee className="w-4 h-4 text-amber-400 light:text-amber-600 shrink-0" />
                        <span className="font-semibold text-slate-300 light:text-slate-600">Resting Rotation:</span>
                        <span className="text-slate-400 light:text-slate-500 truncate">
                          {restingPlayerNames.map((p) => p.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Court is Idle */
                  <div className="py-8 text-center bg-slate-950/40 light:bg-slate-50/40 rounded-xl border border-dashed border-slate-800 light:border-slate-200 flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-800/80 light:bg-slate-100/80 flex items-center justify-center text-slate-500 light:text-slate-400">
                      <Play className="w-6 h-6 ml-0.5 text-emerald-400 light:text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white light:text-slate-900">Court is Ready</h4>
                      <p className="text-xs text-slate-400 light:text-slate-500 max-w-xs mt-0.5">
                        No match in progress yet.
                      </p>
                    </div>
                    {nextMatch && !readOnly && (
                      <button
                        id={`btn-start-next-${court.id}`}
                        onClick={() => onStartMatch(nextMatch.id, court.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 light:shadow-emerald-200 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Match #{nextMatch.matchNumber} (Round {nextMatch.roundNumber})</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Next Up / On Deck Section */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 light:border-slate-200/80">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-slate-300 light:text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-400 light:text-amber-600" />
                      Next Up (On Deck)
                    </span>
                    {nextMatch && (
                      <span className="text-slate-400 light:text-slate-500 font-mono text-[11px]">
                        Round {nextMatch.roundNumber} • Match #{nextMatch.matchNumber}
                      </span>
                    )}
                  </div>

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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
