import React, { useState } from 'react';
import { TournamentSession } from '../types/badminton';
import { computePlayerStats } from '../utils/ranking';
import { 
  BarChart3, 
  Activity, 
  Flame, 
  Clock, 
  Award, 
  Copy, 
  Check, 
  Share2, 
  Zap,
  PieChart
} from 'lucide-react';

interface AnalyticsDashboardProps {
  session: TournamentSession;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ session }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const completedMatches = session.matches.filter((m) => m.status === 'completed');
  const totalMatches = session.matches.length;
  const stats = computePlayerStats(session.players, session.matches);

  // Points analytics
  let totalPointsScored = 0;
  let closeMatchesCount = 0; // margin <= 3
  let blowoutMatchesCount = 0; // margin >= 8

  completedMatches.forEach((m) => {
    const pts = m.score.team1Score + m.score.team2Score;
    const diff = Math.abs(m.score.team1Score - m.score.team2Score);
    totalPointsScored += pts;
    if (diff <= 3) closeMatchesCount++;
    if (diff >= 8) blowoutMatchesCount++;
  });

  const avgPointsPerMatch = completedMatches.length > 0 ? Math.round(totalPointsScored / completedMatches.length) : 0;
  const mediumMarginCount = Math.max(0, completedMatches.length - closeMatchesCount - blowoutMatchesCount);

  // Generate WhatsApp / Telegram shareable tournament summary text
  const generateShareText = () => {
    let txt = `🏸 *${session.name}* (${session.date})\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `🏆 *CURRENT STANDINGS & LEADERBOARD*\n`;
    stats.forEach((st, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      txt += `${medal} *${st.player.name}* | ${st.matchesWon}W-${st.matchesLost}L | Diff: ${st.pointDiff > 0 ? '+' : ''}${st.pointDiff}\n`;
    });
    txt += `━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `📊 Completed: ${completedMatches.length}/${totalMatches} matches (${totalPointsScored} pts scored)\n`;
    txt += `🏸 Managed via SmashMatch Doubles Hub`;
    return txt;
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(generateShareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Tournament Statistics & Analytics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Key match metrics, scoring competitiveness, point distribution, and shareable club summaries.
          </p>
        </div>

        <button
          id="btn-copy-summary"
          onClick={handleCopySummary}
          className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied to Clipboard!' : 'Copy Summary for Group Chat'}</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Matches Completed</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {completedMatches.length} <span className="text-sm text-slate-500">/ {totalMatches}</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold">
            {totalMatches > 0 ? Math.round((completedMatches.length / totalMatches) * 100) : 0}% complete
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Total Points Scored</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalPointsScored}
          </div>
          <div className="text-[11px] text-slate-400">
            Across all doubles rallies
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Avg Points / Game</span>
            <Zap className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {avgPointsPerMatch}
          </div>
          <div className="text-[11px] text-teal-400 font-semibold">
            Target win: {session.rules.pointsToWin} pts
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Active Courts</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {session.courtCount}
          </div>
          <div className="text-[11px] text-slate-400">
            {session.players.length} registered players
          </div>
        </div>
      </div>

      {/* Competitiveness / Margin Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <span>Match Competitiveness (Score Margin)</span>
          </h3>

          <div className="space-y-3 text-xs">
            {/* Close Matches */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Nail-biters (Margin ≤ 3 pts)</span>
                <span className="font-bold text-amber-400 font-mono">{closeMatchesCount} games</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full"
                  style={{ width: `${completedMatches.length > 0 ? (closeMatchesCount / completedMatches.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Medium Margin */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Competitive (Margin 4–7 pts)</span>
                <span className="font-bold text-emerald-400 font-mono">{mediumMarginCount} games</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${completedMatches.length > 0 ? (mediumMarginCount / completedMatches.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Blowout */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Dominant Wins (Margin ≥ 8 pts)</span>
                <span className="font-bold text-purple-400 font-mono">{blowoutMatchesCount} games</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full"
                  style={{ width: `${completedMatches.length > 0 ? (blowoutMatchesCount / completedMatches.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Text Recap Preview */}
        <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>Group Chat Report Preview</span>
            </h3>
            <button
              onClick={handleCopySummary}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <pre className="bg-slate-950 p-4 rounded-xl text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800 max-h-52">
            {generateShareText()}
          </pre>
        </div>
      </div>
    </div>
  );
};
