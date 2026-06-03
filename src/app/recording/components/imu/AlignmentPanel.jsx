import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function AlignmentPanel({ alignmentMatrix, setAlignmentMatrix }) {
  const isRight = alignmentMatrix === 'right';
  
  return (
    <div className="bg-[#0a0c1c]/98 border border-white/10 rounded-[16px] overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between py-3 px-4 border-b border-white/5">
        <span className="text-[12px] font-semibold text-slate-400 tracking-[0.8px] uppercase">
          Static Alignment Matrix
        </span>
        <span className="text-[10px] text-slate-600">6-pose map</span>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div className="text-[11px] text-slate-400">Not implemented in UI yet</div>
      </div>
    </div>
  );
}