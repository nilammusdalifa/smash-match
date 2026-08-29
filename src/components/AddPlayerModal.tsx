import React, { useState } from 'react';
import { X } from 'lucide-react';

interface AddPlayerModalProps {
  onAddPlayer: (name: string, tier: 'A' | 'B' | 'C') => void;
  onClose: () => void;
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({ onAddPlayer, onClose }) => {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<'A' | 'B' | 'C'>('B');

  const handleConfirm = () => {
    if (!name.trim()) return;
    onAddPlayer(name, tier);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 light:border-slate-200 pb-3">
          <h3 className="text-base font-bold text-white light:text-slate-900">Add a Player</h3>
          <button onClick={onClose} className="p-1 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400 light:text-slate-500">
          Joining partway through re-balances any matches that haven't started yet.
        </p>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="Player name"
          className="w-full bg-slate-950 light:bg-slate-50 border border-slate-700 light:border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-200 light:text-slate-700 focus:outline-none focus:border-emerald-500"
        />
        <div className="flex items-center gap-2">
          {(['A', 'B', 'C'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                tier === t
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 light:bg-slate-100 border-slate-700 light:border-slate-300 text-slate-400 light:text-slate-500 hover:text-slate-200 light:hover:text-slate-700'
              }`}
            >
              Tier {t}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 light:border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 text-xs font-semibold hover:bg-slate-700 light:hover:bg-slate-200">
            Cancel
          </button>
          <button onClick={handleConfirm} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950">
            Add Player
          </button>
        </div>
      </div>
    </div>
  );
};
