import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function CouplingCalibrationUI({
  couplingByFinger,
  setCouplingByFinger,
  calHand,
  calFinger
}) {
  const [selectedAxisPair, setSelectedAxisPair] = useState(0);

  const cf = couplingByFinger[calHand]?.[calFinger];
  if (!cf) return <div className="text-[11px] text-slate-500 italic py-2.5">No coupling data for this finger</div>;

  const isThumb = calFinger === 4;
  const pairLabels = isThumb ? COUPLING_LABELS_THUMB : COUPLING_LABELS_STANDARD;
  const numPairs = pairLabels.length;

  const currentPair = cf.pairs[selectedAxisPair];

  const handleUpdateCurrentPair = (updates) => {
    setCouplingByFinger(prev => {
      const p = JSON.parse(JSON.stringify(prev));
      p[calHand][calFinger].pairs[selectedAxisPair] = { ...p[calHand][calFinger].pairs[selectedAxisPair], ...updates };
      return p;
    });
  };

  const addPoint = () => {
    const pts = [...currentPair.pts, { x: 0, y: 0 }];
    handleUpdateCurrentPair({ pts });
  };

  const removePoint = (i) => {
    const pts = [...currentPair.pts];
    pts.splice(i, 1);
    handleUpdateCurrentPair({ pts });
  };

  const updatePoint = (i, axis, val) => {
    const pts = [...currentPair.pts];
    pts[i] = { ...pts[i], [axis]: Number(val) };
    handleUpdateCurrentPair({ pts });
  };

  const toggleEnable = () => handleUpdateCurrentPair({ enabled: !currentPair.enabled });

  return (
    <div className="bg-[#0a0c1c] p-2 border border-[#333] rounded-lg mt-4 overflow-hidden">
      <div className="text-[12px] text-[#e2b96f] font-semibold mb-2">{CAL_FINGER_NAMES[calFinger]} Sensor Cross-Coupling</div>
      <div className="flex gap-2 overflow-x-auto mb-3">
        {pairLabels.map((lbl, idx) => (
          <button
            key={idx}
            className={`py-1.5 px-3 rounded-lg text-[11px] font-bold border-none cursor-pointer shrink-0 ${selectedAxisPair === idx ? 'bg-[#e2b96f] text-black' : 'bg-white/10 text-white'}`}
            onClick={() => setSelectedAxisPair(idx)}
          >
            {lbl} {cf.pairs[idx].enabled ? '(On)' : ''}
          </button>
        ))}
      </div>

      <div className="mb-3 px-3 py-2.5 bg-white/5 rounded-lg border border-white/5 text-[11px]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={currentPair.enabled} onChange={toggleEnable} />
          Enable {pairLabels[selectedAxisPair]} correction
        </label>
        <div className="mt-1.5 text-slate-400">
          X = offender % (e.g. pitch2), Y = correction to apply to victim % (e.g. pitch1)
        </div>
      </div>

      {currentPair.enabled && (
        <>
          <div className="flex flex-col gap-2">
            {currentPair.pts.map((pt, i) => (
              <div key={i} className="flex gap-4 items-center px-3.5 py-1">
                <span className="text-[11px] text-slate-500 w-3 shrink-0">{i}:</span>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">X:</span>
                  <input type="number" value={pt.x} onChange={e => updatePoint(i, 'x', e.target.value)}
                    className="w-[60px] py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50" />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Y:</span>
                  <input type="number" value={pt.y} onChange={e => updatePoint(i, 'y', e.target.value)}
                    className="w-[60px] py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50" />
                </label>
                <button onClick={() => removePoint(i)} className="bg-transparent border-none text-red-500 text-lg cursor-pointer hover:text-red-400 transition-colors">×</button>
              </div>
            ))}
          </div>
          <button onClick={addPoint} className="mt-3 py-1.5 px-3 rounded-lg bg-[#34d399] text-black font-bold text-[11px] cursor-pointer border-none hover:bg-emerald-400 transition-colors">+ Add Point</button>
        </>
      )}
    </div>
  );
}