import React from 'react';

export function ManualFingers({ manualFingersEnable, setManualFingersEnable, manualFingers, setManualFingers, manualThumbExtra, setManualThumbExtra }) {
  return (
          <div className="py-3 px-4 border-t border-white/5">

            {/* FINGERS SECTION */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-semibold text-slate-400">🧪 Manual Fingers</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={manualFingersEnable} onChange={e => setManualFingersEnable(e.target.checked)} />
                <span className="text-[11px] text-slate-500">Enable Override</span>
              </label>
            </div>
            {manualFingersEnable && (
              <div className="flex flex-col gap-2 mb-4">
                {['Pinky', 'Ring', 'Middle', 'Index', 'Thumb'].map((name, fi) => {
                  const isThumb = name === 'Thumb';
                  const yawAxis = isThumb ? 'Y' : 'Z';
                  const pitchAxis = isThumb ? 'Z' : '-X';
                  return (
                    <div key={name} className="py-1.5">
                      <div className="flex flex-col justify-between mb-1.5">
                        <span className="text-[11px] text-slate-400">{name}</span>
                        <span className="text-[11px] text-[#e2b96f]">{`Yaw(${yawAxis}) ${Math.round(manualFingers[fi].yaw)}° • P1(${pitchAxis}) ${Math.round(manualFingers[fi].pitch1)}° • P2(${pitchAxis}) ${Math.round(manualFingers[fi].pitch2)}°`}</span>
                      </div>
                      <div className="flex flex-col gap-6">
                        <input type="range" min="-90" max="90" step="1" value={manualFingers[fi].yaw} title={`Yaw (${yawAxis})`}
                          onChange={e => setManualFingers(prev => { const n = prev.map(f => ({ ...f })); n[fi].yaw = Number(e.target.value); return n; })} />
                        <input type="range" min="-90" max="90" step="1" value={manualFingers[fi].pitch1} title={`Pitch 1 (${pitchAxis})`}
                          onChange={e => setManualFingers(prev => { const n = prev.map(f => ({ ...f })); n[fi].pitch1 = Number(e.target.value); return n; })} />
                        <input type="range" min="-90" max="90" step="1" value={manualFingers[fi].pitch2} title={`Pitch 2 (${pitchAxis})`}
                          onChange={e => setManualFingers(prev => { const n = prev.map(f => ({ ...f })); n[fi].pitch2 = Number(e.target.value); return n; })} />
                      </div>
                    </div>
                  );
                })}

                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[11px] text-slate-400">Thumb Extra (IP) [Z-axis]</span>
                    <span className="text-[11px] text-[#e2b96f]">{Math.round(manualThumbExtra)}°</span>
                  </div>
                  <input type="range" min="-90" max="90" step="1" value={manualThumbExtra} title="Thumb IP (Z)"
                    onChange={e => setManualThumbExtra(Number(e.target.value))} className="w-full" />
                </div>
              </div>
            )}
          </div>
  );
}