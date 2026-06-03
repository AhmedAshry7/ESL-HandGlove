import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function IMUDiagnosticsPanel({ telemetry, isLeft }) {
  return (
    <div className="bg-[#0a0c1c]/98 border border-white/10 rounded-[16px] overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between py-3 px-4 border-b border-white/5">
        <span className="text-[12px] font-semibold text-slate-400 tracking-[0.8px] uppercase">
          IMU Diagnostics
        </span>
        <span className="text-[10px] text-slate-600">euler angles</span>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        {telemetry ? Object.keys(telemetry).map((key) => {
          const item = telemetry[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-[50px] shrink-0">{key}</span>
              <div className="flex-1 h-1 bg-[#1a1f35] rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#0f3460] to-[#e2b96f] rounded transition-all duration-200" 
                  style={{ width: `${Math.min(100, Math.max(0, (item.pitch + 180) / 3.6))}%` }} 
                />
              </div>
              <span className="text-[11px] text-[#e2b96f] w-[34px] text-right font-tabular-nums">
                {Math.round(item.pitch)}°
              </span>
            </div>
          );
        }) : <div className="text-[11px] text-slate-400">Waiting for data...</div>}
      </div>
    </div>
  );
}