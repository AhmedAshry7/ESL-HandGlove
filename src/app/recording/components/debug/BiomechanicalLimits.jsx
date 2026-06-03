import React from 'react';
import { DEFAULT_WRIST_LIMITS, DEFAULT_ARM_LIMITS, BIOMECHANICAL_LIMITS } from "../../../components/ArmModel";

export function BiomechanicalLimits({ bioOpen, setBioOpen, wristLimits, setWristLimits, armLimits, setArmLimits, fingerLimits, setFingerLimits, bioFingerTab, setBioFingerTab }) {
  return (
          <div
            onClick={() => setBioOpen(o => !o)}
            className={`flex justify-between items-center py-2.5 px-4 cursor-pointer select-none ${bioOpen ? 'border-b border-white/5' : ''}`}
          >
            <span className="text-[11px] font-semibold text-slate-400 tracking-[0.8px] uppercase">
              🦴 Biomechanical Limits
            </span>
            <span className="text-[11px] text-slate-600">{bioOpen ? '▲' : '▼'}</span>
          </div>
          {bioOpen && (
            <div className="py-3 px-4 flex flex-col gap-2.5">
              <button
                onClick={() => { setWristLimits({ ...DEFAULT_WRIST_LIMITS }); setArmLimits({ upper: { ...DEFAULT_ARM_LIMITS.upper }, forearm: { ...DEFAULT_ARM_LIMITS.forearm } }); setFingerLimits(JSON.parse(JSON.stringify(BIOMECHANICAL_LIMITS))); }}
                className="text-[11px] py-1 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg cursor-pointer"
              >
                Reset to anatomical defaults
              </button>

              {/* Wrist limits */}
              <div className="text-[11px] text-[#e2b96f] font-semibold mt-1">Wrist (degrees)</div>
              {[
                { key: 'flexion', label: 'Flexion', min: 0, max: 120 },
                { key: 'extension', label: 'Extension', min: 0, max: 90 },
                { key: 'radial', label: 'Radial Dev', min: 0, max: 40 },
                { key: 'ulnar', label: 'Ulnar Dev', min: 0, max: 50 },
                { key: 'pronation', label: 'Pronation', min: 0, max: 180 },
                { key: 'supination', label: 'Supination', min: 0, max: 180 },
              ].map(({ key, label, min, max }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-[72px] shrink-0">{label}</span>
                  <input type="range" min={min} max={max} step="1"
                    value={wristLimits[key]}
                    onChange={e => setWristLimits(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="flex-1" />
                  <span className="text-[10px] text-[#e2b96f] w-[32px] text-right">{wristLimits[key]}°</span>
                </div>
              ))}

              {/* Arm limits */}
              <div className="mt-2 mb-1">
                <span className="text-[11px] text-blue-400 font-semibold">Upper Arm</span>
              </div>
              {[
                { key: 'flexion', label: 'Flexion', min: 0, max: 180 },
                { key: 'extension', label: 'Extension', min: 0, max: 90 },
                { key: 'abduction', label: 'Abduction', min: 0, max: 180 },
                { key: 'adduction', label: 'Adduction', min: 0, max: 90 },
                { key: 'internal', label: 'Internal Rot', min: 0, max: 90 },
                { key: 'external', label: 'External Rot', min: 0, max: 90 },
              ].map(({ key, label, min, max }) => (
                <div key={`upper-${key}`} className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-slate-500 w-[72px] shrink-0">{label}</span>
                  <input type="range" min={min} max={max} step="1"
                    value={armLimits.upper[key]}
                    onChange={e => setArmLimits(prev => ({ ...prev, upper: { ...prev.upper, [key]: Number(e.target.value) } }))}
                    className="flex-1" />
                  <span className="text-[10px] text-[#e2b96f] w-[32px] text-right">{armLimits.upper[key]}°</span>
                </div>
              ))}

              <div className="mt-2 mb-1">
                <span className="text-[11px] text-blue-400 font-semibold">Forearm</span>
              </div>
              {[
                { key: 'flexion', label: 'Flexion', min: 0, max: 150 },
                { key: 'extension', label: 'Extension', min: 0, max: 90 },
                { key: 'pronation', label: 'Pronation', min: 0, max: 90 },
                { key: 'supination', label: 'Supination', min: 0, max: 90 },
              ].map(({ key, label, min, max }) => (
                <div key={`forearm-${key}`} className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-slate-500 w-[72px] shrink-0">{label}</span>
                  <input type="range" min={min} max={max} step="1"
                    value={armLimits.forearm[key]}
                    onChange={e => setArmLimits(prev => ({ ...prev, forearm: { ...prev.forearm, [key]: Number(e.target.value) } }))}
                    className="flex-1" />
                  <span className="text-[10px] text-[#e2b96f] w-[32px] text-right">{armLimits.forearm[key]}°</span>
                </div>
              ))}

              {/* Finger limits */}
              <div className="flex justify-between items-center mt-2 mb-2">
                <span className="text-[11px] text-blue-400 font-semibold">Fingers (degrees)</span>
                <select
                  value={bioFingerTab}
                  onChange={e => setBioFingerTab(e.target.value)}
                  className="text-[10px] bg-black/50 text-white border border-white/20 rounded px-1 py-0.5"
                >
                  {['thumb', 'index', 'middle', 'ring', 'pinky'].map(f => (
                    <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </select>
              </div>

              {Object.entries(fingerLimits[bioFingerTab] || {}).map(([joint, range]) => (
                <div key={joint} className="flex flex-col gap-1 mb-1.5">
                  <span className="text-[10px] text-slate-500 uppercase">{joint}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-600 w-[20px]">Min</span>
                    <input type="range" min="-90" max="150" step="1"
                      value={range[0]}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setFingerLimits(prev => {
                          const next = { ...prev };
                          next[bioFingerTab] = { ...next[bioFingerTab] };
                          next[bioFingerTab][joint] = [val, Math.max(val, next[bioFingerTab][joint][1])];
                          return next;
                        });
                      }}
                      className="flex-1" />
                    <span className="text-[10px] text-blue-400 w-[28px] text-right">{range[0]}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-600 w-[20px]">Max</span>
                    <input type="range" min="-90" max="150" step="1"
                      value={range[1]}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setFingerLimits(prev => {
                          const next = { ...prev };
                          next[bioFingerTab] = { ...next[bioFingerTab] };
                          next[bioFingerTab][joint] = [Math.min(val, next[bioFingerTab][joint][0]), val];
                          return next;
                        });
                      }}
                      className="flex-1" />
                    <span className="text-[10px] text-blue-400 w-[28px] text-right">{range[1]}°</span>
                  </div>
                </div>
              ))}
            </div>
          )}
  );
}