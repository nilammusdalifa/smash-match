import React, { useState } from 'react';
import { TournamentSession } from '../types/badminton';
import { X } from 'lucide-react';

interface ChangeCourtsModalProps {
  session: TournamentSession;
  onUpdateCourtCount: (count: number, courtNames?: string[]) => void;
  onClose: () => void;
}

export const ChangeCourtsModal: React.FC<ChangeCourtsModalProps> = ({ session, onUpdateCourtCount, onClose }) => {
  const [selectedCourtCount, setSelectedCourtCount] = useState<number | null>(null);
  const [newCourtNameInputs, setNewCourtNameInputs] = useState<string[]>([]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 light:border-slate-200 pb-3">
          <h3 className="text-base font-bold text-white light:text-slate-900">Change Courts</h3>
          <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400 light:text-slate-500">
          Re-balances any matches that haven't started yet. A court with a
          live match on it can't be removed until that match finishes or
          moves.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 6].map((cnt) => (
            <button
              key={cnt}
              onClick={() => {
                if (cnt <= session.courtCount) {
                  onUpdateCourtCount(cnt);
                  onClose();
                } else {
                  setSelectedCourtCount(cnt);
                  setNewCourtNameInputs(Array.from({ length: cnt - session.courtCount }, () => ''));
                }
              }}
              className={`py-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                (selectedCourtCount ?? session.courtCount) === cnt
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                  : 'bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 border-slate-700 light:border-slate-300 hover:bg-slate-700 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900'
              }`}
            >
              {cnt}
            </button>
          ))}
        </div>

        {selectedCourtCount !== null && selectedCourtCount > session.courtCount && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-slate-400 light:text-slate-500">
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
                className="w-full bg-slate-950 light:bg-slate-50 border border-slate-700 light:border-slate-300 rounded-xl px-3 py-2 text-xs text-white light:text-slate-900 placeholder-slate-500 light:placeholder-slate-400 focus:outline-none focus:border-emerald-500"
              />
            ))}
            <button
              onClick={() => {
                const fullNames = Array.from({ length: selectedCourtCount }, (_, i) =>
                  i < session.courtCount ? '' : newCourtNameInputs[i - session.courtCount] || ''
                );
                onUpdateCourtCount(selectedCourtCount, fullNames);
                onClose();
              }}
              className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        <div className="flex items-center justify-end pt-2 border-t border-slate-800 light:border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 text-xs font-semibold hover:bg-slate-700 light:hover:bg-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
