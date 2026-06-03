import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function LiveVoltageMonitor({ voltages, sensorHealth, labels }) {
  const channelLabels = Array.isArray(labels) && labels.length === 16
    ? labels
    : HAND_CHANNEL_MAPS.right.labels;
  return (
    <div className="bg-[#0a0c1c]/98 border border-white/10 rounded-[16px] overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between py-3 px-4 border-b border-white/5">
        <span className="text-[12px] font-semibold text-slate-400 tracking-[0.8px] uppercase">Hall Sensor Voltages</span>
        <span className="text-[10px] text-slate-600">raw volts</span>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        {channelLabels.map((label, idx) => {
          const v = voltages?.[idx];
          const valid = Number.isFinite(v);
          const outOfRange = valid && (v < VOLTAGE_MIN_VALID || v > VOLTAGE_MAX_VALID);
          const dead = sensorHealth?.[idx]?.dead;
          const fill = valid ? Math.min(100, (v / VOLTAGE_FULL_SCALE) * 100) : 0;
          const color = voltageToColor(v);
          const displayColor = outOfRange ? '#ef4444' : dead ? '#f59e0b' : color;
          const statusLabel = outOfRange ? 'out' : dead ? 'flat' : '';
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[9px] text-slate-600 w-[22px] text-right font-tabular-nums shrink-0">ch{idx}</span>
              <span className="text-[10px] text-slate-500 w-[108px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
              <div className="flex-1 h-1.5 bg-[#1a1f35] rounded-full relative">
                <div className="h-full rounded-full transition-all duration-150" style={{ width: `${fill}%`, background: color }} />
              </div>
              <span className="text-[10px] w-[60px] text-right font-tabular-nums shrink-0" style={{ color: displayColor }}>
                {valid ? `${v.toFixed(4)}V` : '---'}
                {statusLabel ? ` ${statusLabel}` : ''}
              </span>
            </div>
          );
        })}
        <div className="mt-1.5 flex gap-4 text-[10px]">
          <span className="text-[#34d399]">Green: Linear</span>
          <span className="text-[#e2b96f]">Yellow: Marginal</span>
          <span className="text-[#ef4444]">Red: Out of bounds</span>
        </div>
      </div>
    </div>
  );
}