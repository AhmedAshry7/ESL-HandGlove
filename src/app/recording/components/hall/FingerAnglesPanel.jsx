import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function FingerAnglesPanel({ fingers }) {
  if (!fingers || !fingers.length) return null;
  return (
    <div className="bg-[#0a0c1c]/98 border border-white/10 rounded-[16px] overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between py-3 px-4 border-b border-white/5">
        <span className="text-[12px] font-semibold text-slate-400 tracking-[0.8px] uppercase">Calculated Fingers</span>
        <span className="text-[10px] text-slate-600">euler</span>
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        {fingers.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="text-[11.5px] text-slate-500 w-[50px]">{FINGER_LABELS[i]?.label || `F${i}`}</span>
            <div className="flex-1 h-1 bg-[#1a1f35] rounded overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#0f3460] to-[#e2b96f] rounded transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, f.yaw ? (f.yaw+90)/1.8 : 50))}%` }} 
              />
            </div>
            <span className="text-[11px] text-[#e2b96f] w-[34px] text-right font-tabular-nums">{Math.round(f.yaw || 0)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}