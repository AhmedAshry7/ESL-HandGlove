import React from 'react';

export function RestPoseTuner({ tunerOpen, setTunerOpen, restRotationR, setR, restRotationL, setL, manualArmsEnable, setManualArmsEnable, manualRightArm, setManualRightArm, manualLeftArm, setManualLeftArm }) {
  return (
          <div
            onClick={() => setTunerOpen(o => !o)}
            className={`flex justify-between items-center py-2.5 px-4 cursor-pointer select-none ${tunerOpen ? 'border-b border-white/5' : ''}`}
          >
            <span className="text-[11px] font-semibold text-slate-400 tracking-[0.8px] uppercase">
              🎛 Rest Pose Tuner
            </span>
            <span className="text-[11px] text-slate-600">{tunerOpen ? '▲' : '▼'}</span>
          </div>
          {tunerOpen && (
            <div className="py-3 px-4 flex flex-col gap-2.5 border-b border-white/5">
              <button
                onClick={() => {
                  const txt = `restRotationR={[${restRotationR.map(v => v.toFixed(3)).join(', ')}]}\nrestRotationL={[${restRotationL.map(v => v.toFixed(3)).join(', ')}]}`;
                  navigator.clipboard.writeText(txt);
                }}
                className="text-[11px] py-1.5 px-3 bg-[#e2b96f]/10 text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg cursor-pointer"
              >
                📋 Copy values to clipboard
              </button>
              <div className="text-[11px] text-[#e2b96f] font-semibold mt-1">Right hand</div>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <div key={`r${axis}`} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-slate-500 w-[14px]">{axis}</span>
                  <input type="range" min="-3.15" max="3.15" step="0.01"
                    value={restRotationR[i]} onChange={e => setR(i, parseFloat(e.target.value))} className="flex-1" />
                  <span className="text-[11px] text-[#e2b96f] w-[42px] text-right">{restRotationR[i].toFixed(2)}</span>
                </div>
              ))}
              <div className="text-[11px] text-blue-400 font-semibold mt-1">Left hand</div>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <div key={`l${axis}`} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-slate-500 w-[14px]">{axis}</span>
                  <input type="range" min="-3.15" max="3.15" step="0.01"
                    value={restRotationL[i]} onChange={e => setL(i, parseFloat(e.target.value))} className="flex-1" />
                  <span className="text-[11px] text-blue-400 w-[42px] text-right">{restRotationL[i].toFixed(2)}</span>
                </div>
              ))}

              {/* ARMS SECTION */}
              <div className="flex justify-between items-center mb-2 mt-4 border-t border-white/5 pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">🧪 Manual Arms / Offline Pose</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {[
                  { label: 'Right Arm', state: manualRightArm, setter: setManualRightArm, color: '#e2b96f', overrides: manualArmsEnable.right, armKey: 'right' },
                  { label: 'Left Arm', state: manualLeftArm, setter: setManualLeftArm, color: '#60a5fa', overrides: manualArmsEnable.left, armKey: 'left' }
                ].map(({ label, state, setter, color, overrides, armKey }) => (
                  <div key={label} className="mt-1 p-2 bg-white/5 rounded-lg" style={{ border: `1px solid ${color}33` }}>
                    <div className="text-[12px] font-bold mb-2" style={{ color }}>{label}</div>
                    {['upperArm', 'forearm', 'hand'].map((joint) => (
                      <div key={joint} className="mb-3">
                        <div className="flex flex-row justify-between items-center mb-1.5">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={overrides[joint]}
                              onChange={e => setManualArmsEnable(prev => ({
                                ...prev, [armKey]: { ...prev[armKey], [joint]: e.target.checked }
                              }))}
                            />
                            <span className="text-[11px] text-slate-400 capitalize">{joint} override</span>
                          </label>
                          <span className="text-[11px]" style={{ color }}>{state[joint].map(v => Math.round(v)).join(' , ')}</span>
                        </div>
                        <div className="flex flex-col gap-4">
                          <input type="range" min="-180" max="180" step="1" value={state[joint][0]} title={`${joint} X`}
                            onChange={e => { const v = Number(e.target.value); setter(p => ({ ...p, [joint]: [v, p[joint][1], p[joint][2]] })); }} />
                          <input type="range" min="-180" max="180" step="1" value={state[joint][1]} title={`${joint} Y`}
                            onChange={e => { const v = Number(e.target.value); setter(p => ({ ...p, [joint]: [p[joint][0], v, p[joint][2]] })); }} />
                          <input type="range" min="-180" max="180" step="1" value={state[joint][2]} title={`${joint} Z`}
                            onChange={e => { const v = Number(e.target.value); setter(p => ({ ...p, [joint]: [p[joint][0], p[joint][1], v] })); }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
  );
}