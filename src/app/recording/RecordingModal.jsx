import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scene } from './components/viewer';

// ─── Recording modal ──────────────────────────────────────────────────────────
export function RecordingModal({
  signLabel,
  isRecording,
  frames,
  trimRange,
  setTrimRange,
  onStop,
  onDiscard,
  onSave,
  currentFrame,
  calibrate,
  restRotationR,
  restRotationL,
  wristLimits,
  armLimits,
  fingerLimits,
  restPosesRef,
  computeRigFromFrame,
}) {
  const frameCount = frames.length;
  const duration = (frameCount / 60).toFixed(1);
  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedCount = Math.max(0, Math.floor(((trimEnd - trimStart) / 100) * frameCount));

  // Playback of recorded frames when stopped
  const [playbackFrame, setPlaybackFrame] = useState(null);
  const playbackRef = useRef(null);

  useEffect(() => {
    if (!isRecording && frames.length > 0) {
      // Loop playback over trimmed range
      let idx = Math.floor((trimStart / 100) * frames.length);
      const endIdx = Math.floor((trimEnd / 100) * frames.length);
      playbackRef.current = setInterval(() => {
        setPlaybackFrame(frames[idx]);
        idx++;
        if (idx >= endIdx) idx = Math.floor((trimStart / 100) * frames.length);
      }, 1000 / 30); // 30fps playback
    }
    return () => clearInterval(playbackRef.current);
  }, [isRecording, frames, trimStart, trimEnd]);

  const displayFrame = isRecording ? currentFrame : playbackFrame;
  const displayRigData = computeRigFromFrame(displayFrame);
  const displayRigDataRef = useRef(null);
  displayRigDataRef.current = displayRigData;
  const handleRestPosesLoaded = useCallback((poses) => {
    if (restPosesRef) {
      restPosesRef.current = poses;
    }
  }, [restPosesRef]);

  return (
    <div className="fixed inset-0 bg-[#050712]/85 backdrop-blur-md flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease] p-6">
      <style>
        {`.close-btn:hover { background: #2e2e51 !important; }`}
      </style>
      <div className="bg-[#0d1020] border border-white/10 rounded-[24px] w-full max-w-[900px] flex flex-col overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)] animate-[slideUp_0.3s_ease]">
        {/* Header */}
        <div className="flex justify-between items-center py-4.5 px-6 bg-white/5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2 py-1.5 px-3.5 bg-[#e2b96f]/10 border border-[#e2b96f]/25 rounded-full">
              <span className="text-base">✋</span>
              <span className="text-sm font-semibold text-[#e2b96f]">{signLabel}</span>
            </div>
            {isRecording
              ? <div className="flex items-center gap-2 py-1.5 px-3 rounded-full bg-red-500/10 border border-red-500/25 text-red-500 text-xs font-medium"><span className="rec-dot w-2 h-2 rounded-full bg-red-500 inline-block" /> REC · {frameCount} frames</div>
              : <div className="text-xs text-emerald-400 py-1.5 px-3 bg-emerald-400/10 border border-emerald-400/20 rounded-full">Playback loop · {frameCount} frames captured</div>
            }
          </div>
          <div className="flex">
            <span className="text-[13px] text-slate-500 flex items-center mr-2.5">{duration}s</span>
            <button
              className="close-btn w-[34px] h-[34px] rounded-full border-none bg-transparent cursor-pointer text-[13px] text-slate-400 flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
              onClick={onDiscard}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div className="relative w-full h-[380px] bg-gradient-to-br from-[#0a0c18] to-[#111827] rounded-[20px] border border-white/5 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col">
          <div className="absolute top-3 left-4 z-10 text-[10px] text-slate-600 tracking-[1.5px] uppercase">
            {isRecording ? 'LIVE CAPTURE' : 'PLAYBACK PREVIEW'}
          </div>
          <Scene
            rigDataRef={displayRigDataRef}
            restRotationR={restRotationR}
            restRotationL={restRotationL}
            wristLimits={wristLimits}
            armLimits={armLimits}
            fingerLimits={fingerLimits}
            onRestPosesLoaded={handleRestPosesLoaded}
          />
          {!displayFrame && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[13px] text-slate-600">Waiting for glove connection…</p>
            </div>
          )}
        </div>

        {/* Bottom controls — changes depending on state */}
        {isRecording ? (
          <div className="py-4.5 px-6 flex items-center justify-between bg-white/5 border-t border-white/10 shrink-0">
            <div className="text-[13px] text-slate-600">Perform the sign now — recording in progress</div>
            <button className="stop-modal-btn flex items-center gap-2 py-3 px-7 bg-red-600 text-white border-none rounded-xl text-sm font-medium cursor-pointer hover:bg-red-500 transition-colors font-sans" onClick={onStop}>
              Stop Recording
            </button>
          </div>
        ) : (
          <div className="py-4.5 px-6 bg-white/5 border-t border-white/10 shrink-0">
            {/* Trim sliders */}
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="text-sm font-medium text-slate-200">Trim Sign</h3>
              <span className="text-xs text-slate-500">{trimmedCount} frames selected</span>
            </div>

            <div className="mb-4">
              <div className="mb-3">
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-slate-400">Start</label>
                  <span className="text-xs text-[#e2b96f] font-medium">{trimStart}%</span>
                </div>
                <input type="range" min="0" max="100" value={trimStart} className="w-full"
                  onChange={e => setTrimRange([parseInt(e.target.value), trimEnd])} />
              </div>
              <div className="mb-3">
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-slate-400">End</label>
                  <span className="text-xs text-[#e2b96f] font-medium">{trimEnd}%</span>
                </div>
                <input type="range" min="0" max="100" value={trimEnd} className="w-full"
                  onChange={e => setTrimRange([trimStart, parseInt(e.target.value)])} />
              </div>

              {/* Visual trim bar */}
              <div className="h-1.5 bg-[#1a1f35] rounded-full overflow-hidden mt-1 relative">
                <div className="absolute h-full bg-gradient-to-r from-[#0f3460] to-[#e2b96f] rounded-full" style={{ left: `${trimStart}%`, width: `${trimEnd - trimStart}%` }} />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="discard-btn py-2.5 px-5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-medium cursor-pointer hover:bg-red-500/20 transition-colors font-sans" onClick={onDiscard}>
                ✕ Discard
              </button>
              <button className="save-sign-btn py-2.5 px-7 bg-emerald-600 text-white border-none rounded-xl text-sm font-medium cursor-pointer hover:bg-emerald-500 transition-colors font-sans" onClick={onSave}>
                ✓ Save Sign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}