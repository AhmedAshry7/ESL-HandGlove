import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function CalStatusStrip({ calHand, calFinger, knotsByAxis }) {
  const stateColor = {
    empty: 'rgba(255,255,255,0.1)',
    partial: '#f59e0b',
    full: '#34d399'
  };

  return (
    <div className="flex gap-2.5 items-center bg-white/5 p-3 rounded-xl border border-white/10 mb-4 overflow-x-auto">
      {CAL_FINGER_ORDER.map((f, i) => {
        const c = getFingerCalState(calHand, i, knotsByAxis);
        const isSel = (calFinger === i);
        return (
          <div key={f.label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] ${isSel ? 'border-[#e2b96f] text-[#e2b96f] bg-[#e2b96f]/10' : 'border-white/5 text-slate-400 bg-white/5'}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: stateColor[c] }}></span>
            {f.label}
          </div>
        );
      })}
    </div>
  );
}