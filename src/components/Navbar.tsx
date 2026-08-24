import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TournamentSession } from '../types/badminton';
import { soundManager } from '../utils/audio';
import { AttendanceModal } from './AttendanceModal';
import { PartnerRequestsModal } from './PartnerRequestsModal';
import {
  Trophy,
  Volume2,
  VolumeX,
  Plus,
  RotateCcw,
  MoreVertical,
  Users,
  UserPlus,
  UserCheck,
  HeartHandshake,
  BarChart3,
  Calendar,
  Grid,
  Share2,
  LayoutGrid
} from 'lucide-react';

interface NavbarProps {
  session: TournamentSession;
  activeTab: 'courts' | 'schedule' | 'leaderboard' | 'synergy' | 'analytics';
  setActiveTab: (tab: 'courts' | 'schedule' | 'leaderboard' | 'synergy' | 'analytics') => void;
  onOpenNewSessionModal: () => void;
  onResetSession: () => void;
  onAddPlayer: (name: string, tier: 'A' | 'B' | 'C') => void;
  onUpdateCourtCount: (count: number, courtNames?: string[]) => void;
  onSetPlayerPresence: (playerId: string, present: boolean) => void;
  onSetRequestedPairs: (pairs: Array<[string, string]>) => void;
  /** Player (view-only) mode: hides everything that mutates the session. */
  readOnly?: boolean;
  /**
   * True for ANY remote device (Player *and* Umpire). Session-lifecycle actions
   * (New Session, Reset, Export) are device-local: on a remote device they'd
   * silently fork off a brand-new local session while the live subscription
   * kept overwriting the screen. Umpires still keep all scoring controls.
   */
  hideSessionControls?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  activeTab,
  setActiveTab,
  onOpenNewSessionModal,
  onResetSession,
  onAddPlayer,
  onUpdateCourtCount,
  onSetPlayerPresence,
  onSetRequestedPairs,
  readOnly = false,
  hideSessionControls = false,
}) => {
  const [soundOn, setSoundOn] = useState<boolean>(soundManager.isSoundEnabled());
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [showAddPlayer, setShowAddPlayer] = useState<boolean>(false);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerTier, setNewPlayerTier] = useState<'A' | 'B' | 'C'>('B');
  const [showChangeCourts, setShowChangeCourts] = useState<boolean>(false);
  const [selectedCourtCount, setSelectedCourtCount] = useState<number | null>(null);
  const [newCourtNameInputs, setNewCourtNameInputs] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showAttendance, setShowAttendance] = useState<boolean>(false);
  const [showRequests, setShowRequests] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleConfirmAddPlayer = () => {
    if (!newPlayerName.trim()) return;
    onAddPlayer(newPlayerName, newPlayerTier);
    setNewPlayerName('');
    setNewPlayerTier('B');
    setShowAddPlayer(false);
  };

  // Close the "more options" dropdown when clicking anywhere outside it
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const toggleSound = () => {
    const next = !soundOn;
    soundManager.setSoundEnabled(next);
    soundManager.setSpeechEnabled(next);
    setSoundOn(next);
    if (next) {
      soundManager.playPointChime(1);
    }
  };

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

            {/* Share Live Link + PIN (organizer + umpire only) */}
            {!readOnly && (
              <div className="hidden md:flex items-center space-x-2">
                <button
                  id="btn-share-live-link"
                  onClick={handleShareLiveLink}
                  title="Copy a view-only link to share"
                  className="p-2.5 sm:p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                {/* Remote (Umpire) sessions carry no PIN — it lives only on the
                    organizer's local copy, and an Umpire already typed it in. */}
                {session.pin && (
                  <span className="text-xs text-slate-400 font-mono px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
                    PIN: {session.pin}
                  </span>
                )}
                {linkCopied && (
                  <span className="text-xs text-emerald-400 font-medium">Copied!</span>
                )}
              </div>
            )}

            {/* Reset / New Session — device-local lifecycle actions, hidden on
                every remote device (Player and Umpire alike). */}
            {!readOnly && !hideSessionControls && (
            <button
              id="btn-new-session"
              onClick={onOpenNewSessionModal}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Session</span>
              <span className="sm:hidden">New</span>
            </button>
            )}

            {/* Secondary actions dropdown. The button itself only needs
                !readOnly, so an Umpire on mobile can still reach Share Live
                Link — session-lifecycle items inside are separately gated
                on !hideSessionControls. */}
            {!readOnly && (
            <div className="relative" ref={menuRef}>
              <button
                id="btn-session-options"
                onClick={() => setShowMenu(!showMenu)}
                title="More options"
                className="p-2.5 sm:p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 hover:bg-slate-700 transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900 border border-slate-700 shadow-xl py-1 z-50 text-xs">
                  {/* Share Live Link — mobile equivalent of the desktop-only icon+PIN badge above */}
                  <button
                    onClick={handleShareLiveLink}
                    className="w-full text-left px-4 py-2 text-emerald-400 hover:bg-slate-800 flex items-center gap-2 md:hidden"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex flex-col">
                      <span>{linkCopied ? 'Copied!' : 'Share Live Link'}</span>
                      {session.pin && (
                        <span className="text-slate-400 font-mono text-[11px]">PIN: {session.pin}</span>
                      )}
                    </span>
                  </button>

                  {!hideSessionControls && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowAddPlayer(true);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Player</span>
                    </button>
                  )}
                  {!hideSessionControls && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowAttendance(true);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Who's Here</span>
                    </button>
                  )}
                  {!hideSessionControls && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowRequests(true);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <HeartHandshake className="w-3.5 h-3.5" />
                      <span>Partner Requests</span>
                    </button>
                  )}
                  {!hideSessionControls && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowChangeCourts(true);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Change Courts</span>
                    </button>
                  )}
                  {!hideSessionControls && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowResetConfirm(true);
                      }}
                      className="w-full text-left px-4 py-2 text-rose-400 hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Current Session</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            )}
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
              <span className="hidden sm:inline">Schedule</span>
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
              <span className="hidden sm:inline">Player Rankings</span>
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
              <span className="hidden sm:inline">Synergy</span>
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
              <span className="hidden sm:inline">Stats</span>
            </span>
          </button>
        </nav>
      </div>

      {/* Add Player Modal — portaled to <body> because this header uses
          backdrop-blur, and a CSS filter/backdrop-filter on any ancestor
          creates a new containing block for position:fixed descendants,
          which would center this modal inside the header's own small box
          instead of the full viewport (cutting off its top edge). */}
      {showAddPlayer && createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Add Player</h3>
              <button
                onClick={() => setShowAddPlayer(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Joining mid-session re-balances every match that hasn't been played yet.
            </p>
            <input
              type="text"
              autoFocus
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddPlayer()}
              placeholder="Player name"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center gap-2">
              {(['A', 'B', 'C'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewPlayerTier(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    newPlayerTier === t
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tier {t}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddPlayer(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddPlayer}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950"
              >
                Add to Session
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAttendance && createPortal(
        <AttendanceModal
          session={session}
          onSetPlayerPresence={onSetPlayerPresence}
          onClose={() => setShowAttendance(false)}
        />,
        document.body
      )}

      {showRequests && createPortal(
        <PartnerRequestsModal
          session={session}
          onSetRequestedPairs={onSetRequestedPairs}
          onClose={() => setShowRequests(false)}
        />,
        document.body
      )}

      {/* Change Courts Modal — also portaled, see the note above. */}
      {showChangeCourts && createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Change Courts</h3>
              <button
                onClick={() => {
                  setShowChangeCourts(false);
                  setSelectedCourtCount(null);
                }}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Re-balances every match that hasn't been played yet. A court
              with a live match on it can't be removed until that match is
              finished or moved.
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 6].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => {
                    if (cnt <= session.courtCount) {
                      onUpdateCourtCount(cnt);
                      setShowChangeCourts(false);
                      setSelectedCourtCount(null);
                    } else {
                      // Adding courts — collect a name for each new one
                      // before applying, so "Court 8" doesn't end up as a
                      // generic "Court 2".
                      setSelectedCourtCount(cnt);
                      setNewCourtNameInputs(Array.from({ length: cnt - session.courtCount }, () => ''));
                    }
                  }}
                  className={`py-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                    (selectedCourtCount ?? session.courtCount) === cnt
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>

            {selectedCourtCount !== null && selectedCourtCount > session.courtCount && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-slate-400">
                  Name the new court{newCourtNameInputs.length > 1 ? 's' : ''}:
                </p>
                {newCourtNameInputs.map((val, i) => (
                  <input
                    key={i}
                    type="text"
                    value={val}
                    onChange={(e) =>
                      setNewCourtNameInputs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={`Court ${session.courtCount + i + 1}`}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                ))}
                <button
                  onClick={() => {
                    const fullNames = Array.from({ length: selectedCourtCount }, (_, i) =>
                      i < session.courtCount ? '' : newCourtNameInputs[i - session.courtCount] || ''
                    );
                    onUpdateCourtCount(selectedCourtCount, fullNames);
                    setShowChangeCourts(false);
                    setSelectedCourtCount(null);
                  }}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowChangeCourts(false);
                  setSelectedCourtCount(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reset Session Confirmation Modal — portaled, see the note above. */}
      {showResetConfirm && createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Reset Current Session?</h3>
            </div>
            <p className="text-xs text-slate-400">
              This clears every score and regenerates the schedule from
              scratch. Players and settings stay the same, but match results
              can't be recovered afterward.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetSession();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950"
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};
