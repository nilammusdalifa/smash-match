import React, { useState } from 'react';
import { claimUmpireAccess } from '../utils/storage';

interface RolePickerModalProps {
  sessionId: string;
  onResolved: (role: 'player' | 'umpire') => void;
}

export const RolePickerModal: React.FC<RolePickerModalProps> = ({ sessionId, onResolved }) => {
  const [mode, setMode] = useState<'choose' | 'pin'>('choose');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [checking, setChecking] = useState<boolean>(false);

  const handleSubmitPin = async () => {
    setChecking(true);
    setError('');
    try {
      const ok = await claimUmpireAccess(sessionId, pin.trim());
      if (ok) {
        onResolved('umpire');
      } else {
        setError('Incorrect PIN. Ask the organizer for the right code.');
      }
    } catch (err) {
      console.error('claimUmpireAccess threw:', err);
      setError('Something went wrong, try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-white">How are you joining?</h2>
          <p className="text-xs text-slate-400">Pick your role for this live session.</p>
        </div>

        {mode === 'choose' ? (
          <div className="space-y-3">
            <button
              id="btn-role-player"
              onClick={() => onResolved('player')}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm cursor-pointer"
            >
              Player (just watching)
            </button>
            <button
              id="btn-role-umpire"
              onClick={() => setMode('pin')}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm cursor-pointer"
            >
              Umpire (I'm scoring)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              id="input-umpire-pin"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center tracking-[0.5em] text-lg bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            />
            {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
            <button
              id="btn-submit-pin"
              disabled={pin.length !== 4 || checking}
              onClick={handleSubmitPin}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm cursor-pointer"
            >
              {checking ? 'Checking...' : 'Continue as Umpire'}
            </button>
            <button
              onClick={() => {
                setMode('choose');
                setError('');
              }}
              className="w-full text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
