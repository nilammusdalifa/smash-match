import React from 'react';
import { Player, TournamentSession } from '../types/badminton';
import { computePlayerStats } from '../utils/ranking';
import {
  X,
  Trophy,
  Flame,
  HeartHandshake,
  Swords,
  Activity,
  Award
} from 'lucide-react';

interface PlayerProfileModalProps {
  player: Player | null;
  session: TournamentSession;
  onClose: () => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  session,
  onClose,
}) => {
  if (!player) return null;

  const stats = computePlayerStats(session.players, session.matches);
  const playerStat = stats.find((s) => s.player.id === player.id);

  // Filter all matches for this player
  const playerMatches = session.matches.filter((m) => {
    return (
      m.team1.player1.id === player.id ||
      m.team1.player2.id === player.id ||
      m.team2.player1.id === player.id ||
      m.team2.player2.id === player.id
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-lg shrink-0">
              {player.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white truncate">{player.name}</h3>
                {playerStat && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                    #{playerStat.rank}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {player.skillLevel || 'Intermediate'} • Elo: {player.currentRating}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
          {/* Quick Metrics */}
          {playerStat && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-medium">Record (W-L)</span>
                <span className="text-lg font-bold text-white font-mono">
                  {playerStat.matchesWon}W - {playerStat.matchesLost}L
                </span>
                <span className="text-[10px] text-emerald-400 block font-semibold">{playerStat.winRate}% Win Rate</span>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-medium">Point Diff</span>
                <span className={`text-lg font-bold font-mono ${playerStat.pointDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {playerStat.pointDiff > 0 ? `+${playerStat.pointDiff}` : playerStat.pointDiff}
                </span>
                <span className="text-[10px] text-slate-400 block">{playerStat.pointsScored} PF / {playerStat.pointsConceded} PA</span>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-medium">Rating</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {playerStat.rating}
                </span>
                <span className="text-[10px] text-slate-400 block">Initial: {player.initialRating}</span>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-medium">Total Matches</span>
                <span className="text-lg font-bold text-white font-mono">
                  {playerStat.matchesPlayed}
                </span>
                <span className="text-[10px] text-slate-400 block">Doubles games</span>
              </div>
            </div>
          )}

          {/* Key Partner Insights */}
          {playerStat?.favoritePartner && (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-3">
                <HeartHandshake className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Best Doubles Partner</span>
                  <span className="text-xs text-slate-300">
                    Highest synergy pairing with <strong className="text-emerald-400">{playerStat.favoritePartner.partner.name}</strong>
                  </span>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {playerStat.favoritePartner.winRate}% Win
              </span>
            </div>
          )}

          {/* Toughest Opponent */}
          {playerStat?.toughOpponent && (
            <div className="bg-rose-950/20 border border-rose-500/30 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-3">
                <Swords className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">Toughest Opponent</span>
                  <span className="text-xs text-slate-300">
                    Loses most often against <strong className="text-rose-400">{playerStat.toughOpponent.opponent.name}</strong>
                  </span>
                </div>
              </div>
              <span className="text-sm font-bold text-rose-400 font-mono">
                {playerStat.toughOpponent.lossRate}% Loss
              </span>
            </div>
          )}

          {/* Player Match History */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Match History ({playerMatches.length})</span>
            </h4>

            <div className="space-y-2">
              {playerMatches.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-3 text-center">No matches played yet.</p>
              ) : (
                playerMatches.map((m) => {
                  const isTeam1 = m.team1.player1.id === player.id || m.team1.player2.id === player.id;
                  const partner = isTeam1 
                    ? (m.team1.player1.id === player.id ? m.team1.player2 : m.team1.player1)
                    : (m.team2.player1.id === player.id ? m.team2.player2 : m.team2.player1);
                  const opp1 = isTeam1 ? m.team2.player1 : m.team1.player1;
                  const opp2 = isTeam1 ? m.team2.player2 : m.team1.player2;

                  const myScore = isTeam1 ? m.score.team1Score : m.score.team2Score;
                  const oppScore = isTeam1 ? m.score.team2Score : m.score.team1Score;
                  const won = m.status === 'completed' && myScore > oppScore;

                  return (
                    <div
                      key={m.id}
                      className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 text-[10px]">R{m.roundNumber} #{m.matchNumber}</span>
                          <span className="font-semibold text-slate-200">
                            with <span className="text-emerald-400">{partner.name}</span>
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          vs {opp1.name} & {opp2.name}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        {m.status === 'completed' ? (
                          <>
                            <span className="font-mono font-bold text-white">
                              {myScore} - {oppScore}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                won
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {won ? 'WON' : 'LOST'}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500 text-[11px] capitalize">{m.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
