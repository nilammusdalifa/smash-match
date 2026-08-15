import React, { useState } from 'react';
import { TournamentSession } from '../types/badminton';
import { soundManager } from '../utils/audio';
import { 
  Trophy, 
  Volume2, 
  VolumeX, 
  Plus, 
  Download, 
  RotateCcw, 
  Users, 
  Layers, 
  BarChart3,
  Calendar,
  Grid
} from 'lucide-react';
import { exportSessionToJSON } from '../utils/storage';

interface NavbarProps {
  session: TournamentSession;
  activeTab: 'courts' | 'schedule' | 'leaderboard' | 'synergy' | 'analytics';
  setActiveTab: (tab: 'courts' | 'schedule' | 'leaderboard' | 'synergy' | 'analytics') => void;
  onOpenNewSessionModal: () => void;
  onResetSession: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  activeTab,
  setActiveTab,
  onOpenNewSessionModal,
  onResetSession,
}) => {
  const [soundOn, setSoundOn] = useState<boolean>(soundManager.isSoundEnabled());
  const [showMenu, setShowMenu] = useState<boolean>(false);

  const toggleSound = () => {
    const next = !soundOn;
    soundManager.setSoundEnabled(next);
    soundManager.setSpeechEnabled(next);
    setSoundOn(next);
    if (next) {
      soundManager.playPointChime(1);
    }
  };

  const completedMatches = session.matches.filter((m) => m.status === 'completed').length;
  const totalMatches = session.matches.length;
  const progressPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  return (
    <header id="app-header" className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-16 gap-2">
          {/* Brand & Session Info */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shadow-inner shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  SmashMatch
                  <span className="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                    Doubles Hub
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[160px] sm:max-w-xs">
                {session.name} • {session.players.length} Players • {session.courtCount} {session.courtCount === 1 ? 'Court' : 'Courts'}
              </p>
            </div>
          </div>

          {/* Quick Progress Bar */}
          <div className="hidden lg:flex items-center space-x-3 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="text-slate-400 font-medium">Tournament Progress:</span>
            <div className="w-28 bg-slate-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-emerald-400 font-semibold">{completedMatches}/{totalMatches} Matches ({progressPercent}%)</span>
          </div>

          {/* Actions & Utilities */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Audio Toggle */}
            <button
              id="btn-toggle-sound"
              onClick={toggleSound}
              title={soundOn ? 'Sound & Announcements Enabled' : 'Muted'}
              className={`p-2.5 sm:p-2 rounded-lg border transition-all ${
                soundOn
                  ? 'bg-slate-800 text-emerald-400 border-emerald-500/30 hover:bg-slate-700'
                  : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700 hover:text-slate-300'
              }`}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Export JSON */}
            <button
              id="btn-export-json"
              onClick={() => exportSessionToJSON(session)}
              title="Export Tournament JSON"
              className="p-2.5 sm:p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all hidden sm:inline-flex"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Reset / New Session */}
            <button
              id="btn-new-session"
              onClick={onOpenNewSessionModal}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Session</span>
              <span className="sm:hidden">New</span>
            </button>

            {/* Secondary actions dropdown */}
            <div className="relative">
              <button
                id="btn-session-options"
                onClick={() => setShowMenu(!showMenu)}
                className="p-2.5 sm:p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 hover:bg-slate-700 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900 border border-slate-700 shadow-xl py-1 z-50 text-xs">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      if (confirm('Reset current match scores and schedule back to initial state?')) {
                        onResetSession();
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-rose-400 hover:bg-slate-800 flex items-center space-x-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Current Session</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      exportSessionToJSON(session);
                    }}
                    className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 flex items-center space-x-2 sm:hidden"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON Backup</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="grid grid-cols-5 gap-1 sm:flex sm:gap-0 sm:space-x-2 sm:overflow-x-auto sm:no-scrollbar py-2 border-t border-slate-800/80 text-xs font-medium">
          <button
            id="tab-courts"
            onClick={() => setActiveTab('courts')}
            className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'courts'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Grid className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">
              <span className="sm:hidden">Courts</span>
              <span className="hidden sm:inline">Live Courts ({session.courtCount})</span>
            </span>
          </button>

          <button
            id="tab-schedule"
            onClick={() => setActiveTab('schedule')}
            className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'schedule'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">
              <span className="sm:hidden">Schedule</span>
              <span className="hidden sm:inline">Match Schedule & Matchmaker</span>
            </span>
          </button>

          <button
            id="tab-leaderboard"
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'leaderboard'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">
              <span className="sm:hidden">Ranks</span>
              <span className="hidden sm:inline">Player Rankings & Elo</span>
            </span>
          </button>

          <button
            id="tab-synergy"
            onClick={() => setActiveTab('synergy')}
            className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'synergy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">
              <span className="sm:hidden">Synergy</span>
              <span className="hidden sm:inline">Partner Synergy Matrix</span>
            </span>
          </button>

          <button
            id="tab-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'analytics'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">
              <span className="sm:hidden">Stats</span>
              <span className="hidden sm:inline">Tournament Analytics</span>
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
};
