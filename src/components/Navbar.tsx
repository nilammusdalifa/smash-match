import React, { useState } from 'react';
import { TournamentSession } from '../types/badminton';
import {
  Trophy,
  Calendar,
  Grid,
  Settings2,
  Share2,
  Sun,
  Moon,
} from 'lucide-react';

interface NavbarProps {
  session: TournamentSession;
  activeTab: 'courts' | 'schedule' | 'leaderboard' | 'settings';
  setActiveTab: (tab: 'courts' | 'schedule' | 'leaderboard' | 'settings') => void;
  /** Player (view-only) mode: hides everything that mutates the session. */
  readOnly?: boolean;
  /**
   * True for ANY remote device (Player *and* Umpire). Session-lifecycle actions
   * (New Session, Reset, Export) are device-local: on a remote device they'd
   * silently fork off a brand-new local session while the live subscription
   * kept overwriting the screen. Umpires still keep all scoring controls.
   */
  hideSessionControls?: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  activeTab,
  setActiveTab,
  readOnly = false,
  theme,
  onToggleTheme,
}) => {
  const [linkCopied, setLinkCopied] = useState(false);

  const handleShareLiveLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=${session.id}`;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const completedMatches = session.matches.filter((m) => m.status === 'completed').length;
  const totalMatches = session.matches.length;
  const progressPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  return (
    <>
    <header id="app-header" className="sticky top-0 z-40 bg-slate-900/95 light:bg-white/95 backdrop-blur-md border-b border-slate-800 light:border-slate-200 text-slate-100 light:text-slate-900 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-16 gap-2">
          {/* Brand & Session Info */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 light:bg-emerald-100 border border-emerald-500/40 light:border-emerald-300 flex items-center justify-center text-emerald-400 light:text-emerald-600 font-bold shadow-inner shrink-0">
              {/* A shuttlecock in flight — cork base, flared feather skirt,
                  and two short trailing lines suggesting motion — in place
                  of a generic globe icon that had nothing to do with the
                  sport this app is actually for. */}
              <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 8 Q3.5 8 4.8 9.5" opacity="0.45" />
                <path d="M1 12.5 Q3.2 12.5 4.5 14.3" opacity="0.45" />
                <path d="M12 15L6.5 5" />
                <path d="M12 15L11 4.3" />
                <path d="M12 15L13.5 4.3" />
                <path d="M12 15L18 5" />
                <path d="M6.5 5Q12 2.5 18 5" />
                <circle cx="12" cy="17.5" r="2.3" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white light:text-slate-900 flex items-center gap-1.5">
                  SmashMatch
                  <span className="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 light:bg-emerald-100 text-emerald-400 light:text-emerald-700 border border-emerald-500/30 light:border-emerald-300 font-medium">
                    Doubles Hub
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 light:text-slate-500 truncate max-w-[160px] sm:max-w-xs">
                {session.name} • {session.players.length} Players • {session.courtCount} {session.courtCount === 1 ? 'Court' : 'Courts'}
              </p>
            </div>
          </div>

          {/* Quick Progress Bar */}
          <div className="hidden lg:flex items-center space-x-3 px-3 py-1.5 rounded-lg bg-slate-800/80 light:bg-slate-100 border border-slate-700/60 light:border-slate-200 text-xs">
            <span className="text-slate-400 light:text-slate-500 font-medium">Tournament Progress:</span>
            <div className="w-28 bg-slate-700 light:bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-emerald-400 light:text-emerald-600 font-semibold">{completedMatches}/{totalMatches} Matches ({progressPercent}%)</span>
          </div>

          {/* Theme toggle + Share Live Link + PIN. The toggle is visible to
              everyone (including read-only viewers) since it's a display
              preference, not an organizer permission. */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            <button
              id="btn-theme-toggle"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2.5 sm:p-2 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 border border-slate-700 light:border-slate-200 hover:bg-slate-700 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900 transition-all cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {!readOnly && (
              <>
                <button
                  id="btn-share-live-link"
                  onClick={handleShareLiveLink}
                  title="Copy a view-only link to share"
                  className="p-2.5 sm:p-2 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 border border-slate-700 light:border-slate-200 hover:bg-slate-700 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900 transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                {session.pin && (
                  <span className="hidden sm:inline text-xs text-slate-400 light:text-slate-500 font-mono px-2 py-1 rounded-md bg-slate-800 light:bg-slate-100 border border-slate-700 light:border-slate-200">
                    PIN: {session.pin}
                  </span>
                )}
                {linkCopied && (
                  <span className="text-xs text-emerald-400 light:text-emerald-600 font-medium whitespace-nowrap">Copied!</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop/tablet tab strip — the mobile bottom nav below replaces
            this on small screens. */}
        <nav className={`hidden sm:flex sm:space-x-2 py-2 border-t border-slate-800/80 light:border-slate-200 text-xs font-medium`}>
          <button
            id="tab-courts-desktop"
            onClick={() => setActiveTab('courts')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'courts'
                ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-300 light:text-emerald-700 border border-emerald-500/40 light:border-emerald-300 font-semibold'
                : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900 hover:bg-slate-800/60 light:hover:bg-slate-100'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Live Courts ({session.courtCount})</span>
          </button>

          <button
            id="tab-schedule-desktop"
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'schedule'
                ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-300 light:text-emerald-700 border border-emerald-500/40 light:border-emerald-300 font-semibold'
                : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900 hover:bg-slate-800/60 light:hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Schedule</span>
          </button>

          <button
            id="tab-leaderboard-desktop"
            onClick={() => setActiveTab('leaderboard')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'leaderboard'
                ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-300 light:text-emerald-700 border border-emerald-500/40 light:border-emerald-300 font-semibold'
                : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900 hover:bg-slate-800/60 light:hover:bg-slate-100'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Rankings</span>
          </button>

          {!readOnly && (
            <button
              id="tab-settings-desktop"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'settings'
                  ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-300 light:text-emerald-700 border border-emerald-500/40 light:border-emerald-300 font-semibold'
                  : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900 hover:bg-slate-800/60 light:hover:bg-slate-100'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}
        </nav>
      </div>
    </header>

    {/* Mobile-only fixed bottom tab bar — hidden from sm and up, where the
        desktop tab strip above takes over instead. */}
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 light:bg-white/95 backdrop-blur-md border-t border-slate-800 light:border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)]">
      <div className={`max-w-7xl mx-auto px-2 grid ${readOnly ? 'grid-cols-3' : 'grid-cols-4'}`}>
        <button
          id="tab-courts"
          onClick={() => setActiveTab('courts')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-all ${
            activeTab === 'courts' ? 'text-emerald-300 light:text-emerald-600' : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900'
          }`}
        >
          <Grid className="w-5 h-5" />
          <span className="text-[11px] font-medium">Courts</span>
        </button>

        <button
          id="tab-schedule"
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-all ${
            activeTab === 'schedule' ? 'text-emerald-300 light:text-emerald-600' : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-[11px] font-medium">Schedule</span>
        </button>

        <button
          id="tab-leaderboard"
          onClick={() => setActiveTab('leaderboard')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-all ${
            activeTab === 'leaderboard' ? 'text-emerald-300 light:text-emerald-600' : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900'
          }`}
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[11px] font-medium">Ranks</span>
        </button>

        {!readOnly && (
          <button
            id="tab-settings"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-all ${
              activeTab === 'settings' ? 'text-emerald-300 light:text-emerald-600' : 'text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-900'
            }`}
          >
            <Settings2 className="w-5 h-5" />
            <span className="text-[11px] font-medium">Settings</span>
          </button>
        )}
      </div>
    </nav>
    </>
  );
};
