import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TournamentSession } from '../types/badminton';
import { AttendanceModal } from './AttendanceModal';
import { PartnerRequestsModal } from './PartnerRequestsModal';
import { AddPlayerModal } from './AddPlayerModal';
import { ChangeCourtsModal } from './ChangeCourtsModal';
import {
  UserPlus,
  UserCheck,
  HeartHandshake,
  LayoutGrid,
  Plus,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';

interface SettingsPanelProps {
  session: TournamentSession;
  onAddPlayer: (name: string, tier: 'A' | 'B' | 'C') => void;
  onSetPlayerPresence: (playerId: string, present: boolean) => void;
  onMarkJustArrived: (playerId: string) => void;
  onSetRequestedPairs: (pairs: Array<[string, string]>) => void;
  onUpdateCourtCount: (count: number, courtNames?: string[]) => void;
  onOpenNewSessionModal: () => void;
  onResetSession: () => void;
  hideSessionControls?: boolean;
}

interface ActionRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}

const ActionRow: React.FC<ActionRowProps> = ({ icon, title, description, onClick, tone = 'default' }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
      tone === 'danger'
        ? 'bg-rose-950/20 light:bg-rose-50 border-rose-900/40 light:border-rose-200 hover:bg-rose-950/40 light:hover:bg-rose-100'
        : 'bg-slate-900 light:bg-white border-slate-800 light:border-slate-200 hover:border-slate-700 light:hover:border-slate-300 hover:bg-slate-800/60 light:hover:bg-slate-100/60'
    }`}
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
      tone === 'danger' ? 'bg-rose-500/15 light:bg-rose-100 text-rose-400 light:text-rose-600' : 'bg-emerald-500/15 light:bg-emerald-100 text-emerald-400 light:text-emerald-600'
    }`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-semibold ${tone === 'danger' ? 'text-rose-300 light:text-rose-700' : 'text-white light:text-slate-900'}`}>{title}</div>
      <div className="text-xs text-slate-400 light:text-slate-500 truncate">{description}</div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-600 light:text-slate-300 shrink-0" />
  </button>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  session,
  onAddPlayer,
  onSetPlayerPresence,
  onMarkJustArrived,
  onSetRequestedPairs,
  onUpdateCourtCount,
  onOpenNewSessionModal,
  onResetSession,
  hideSessionControls = false,
}) => {
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showChangeCourts, setShowChangeCourts] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-wider">Players</h2>
        <ActionRow
          icon={<UserPlus className="w-4 h-4" />}
          title="Add a Player"
          description="Bring in a walk-in mid-session"
          onClick={() => setShowAddPlayer(true)}
        />
        <ActionRow
          icon={<UserCheck className="w-4 h-4" />}
          title="Who's Here"
          description="Mark late arrivals or early leavers"
          onClick={() => setShowAttendance(true)}
        />
        <ActionRow
          icon={<HeartHandshake className="w-4 h-4" />}
          title="Partner Requests"
          description="Put two players on the same team, once"
          onClick={() => setShowRequests(true)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-wider">Courts</h2>
        <ActionRow
          icon={<LayoutGrid className="w-4 h-4" />}
          title="Change Courts"
          description={`Currently ${session.courtCount} ${session.courtCount === 1 ? 'court' : 'courts'}`}
          onClick={() => setShowChangeCourts(true)}
        />
      </div>

      {!hideSessionControls && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-wider">Session</h2>
          <ActionRow
            icon={<Plus className="w-4 h-4" />}
            title="Start a New Session"
            description="Set up a fresh event from scratch"
            onClick={onOpenNewSessionModal}
          />
          <ActionRow
            icon={<RotateCcw className="w-4 h-4" />}
            title="Reset This Session"
            description="Clear scores and regenerate the schedule"
            onClick={() => setShowResetConfirm(true)}
            tone="danger"
          />
        </div>
      )}

      {showAddPlayer && createPortal(
        <AddPlayerModal onAddPlayer={onAddPlayer} onClose={() => setShowAddPlayer(false)} />,
        document.body
      )}

      {showAttendance && createPortal(
        <AttendanceModal session={session} onSetPlayerPresence={onSetPlayerPresence} onMarkJustArrived={onMarkJustArrived} onClose={() => setShowAttendance(false)} />,
        document.body
      )}

      {showRequests && createPortal(
        <PartnerRequestsModal session={session} onSetRequestedPairs={onSetRequestedPairs} onClose={() => setShowRequests(false)} />,
        document.body
      )}

      {showChangeCourts && createPortal(
        <ChangeCourtsModal session={session} onUpdateCourtCount={onUpdateCourtCount} onClose={() => setShowChangeCourts(false)} />,
        document.body
      )}

      {showResetConfirm && createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 light:bg-rose-100 border border-rose-500/40 light:border-rose-300 flex items-center justify-center text-rose-400 light:text-rose-600 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white light:text-slate-900">Reset This Session?</h3>
            </div>
            <p className="text-xs text-slate-400 light:text-slate-500">
              This clears every score and builds a fresh schedule. Players
              and settings stay the same, but match results can't be
              recovered afterward.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 text-xs font-semibold hover:bg-slate-700 light:hover:bg-slate-200"
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
    </div>
  );
};
