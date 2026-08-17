import React, { useEffect, useRef, useState } from 'react';
import { PlayerStats } from '../types/badminton';
import { X, Download, Share2 } from 'lucide-react';

interface ShareRankingsModalProps {
  sessionName: string;
  topStats: PlayerStats[];
  onClose: () => void;
}

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Drawn directly on a <canvas> instead of rendered as HTML and captured —
// html2canvas (and similar DOM-to-image libraries) can't parse the
// oklch() colors Tailwind v4 generates for every color utility, so there's
// no reliable way to screenshot real app markup. A canvas never touches
// computed DOM styles at all, so it sidesteps the problem entirely.
function drawRankingsCard(canvas: HTMLCanvasElement, sessionName: string, topStats: PlayerStats[]) {
  const scale = 2;
  const width = 600;
  const rowHeight = 64;
  const headerHeight = 150;
  const footerPadding = 24;
  const height = headerHeight + topStats.length * rowHeight + footerPadding;

  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#062e26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#34d399';
  ctx.font = '700 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('SmashMatch', width / 2, 44);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 13px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(sessionName, width / 2, 66);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('🏆 Top 5 Rankings', width / 2, 100);

  // Rows
  const rowPaddingX = 28;
  const rowWidth = width - rowPaddingX * 2;
  topStats.forEach((st, i) => {
    const y = headerHeight + i * rowHeight;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(rowPaddingX, y, rowWidth, rowHeight - 12, 14);
    ctx.fill();

    const centerY = y + (rowHeight - 12) / 2;

    // Rank
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    const rankLabel = RANK_MEDAL[st.rank] || String(st.rank);
    ctx.fillText(rankLabel, rowPaddingX + 20, centerY);

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(st.player.name, rowPaddingX + 64, centerY);

    // Record + win rate (right-aligned, built right-to-left as separate
    // colored segments)
    ctx.textAlign = 'right';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    const rightEdge = rowPaddingX + rowWidth - 20;
    let cursorX = rightEdge;

    const drawSegment = (label: string, color: string, gapAfter = 0) => {
      ctx.fillStyle = color;
      ctx.fillText(label, cursorX, centerY);
      cursorX -= ctx.measureText(label).width + gapAfter;
    };

    drawSegment(`${st.matchesLost}L`, '#fb7185', 2);
    drawSegment('-', '#64748b', 4);
    drawSegment(`${st.matchesWon}W`, '#34d399', 10);
    drawSegment('•', '#475569', 10);
    drawSegment(`${st.winRate}%`, '#cbd5e1');
  });
}

export const ShareRankingsModal: React.FC<ShareRankingsModalProps> = ({
  sessionName,
  topStats,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      drawRankingsCard(canvasRef.current, sessionName, topStats);
    }
  }, [sessionName, topStats]);

  const handleShare = async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;
      const file = new File([blob], 'top-5-rankings.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Top 5 Rankings' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'top-5-rankings.png';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // AbortError fires when the user just cancels the native share sheet — not an error worth reporting
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Share Top 5</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto">
          <canvas ref={canvasRef} className="w-full rounded-2xl" />
        </div>

        <div className="p-4 sm:p-5 pt-0 flex items-center gap-2">
          <button
            onClick={handleShare}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            {navigator.share ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{busy ? 'Preparing...' : navigator.share ? 'Share' : 'Download'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
