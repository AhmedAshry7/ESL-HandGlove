import React, { useState, useEffect, memo } from 'react';
import { __imuAxisConfig, FINGER_LABELS, CAL_FINGER_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_FULL_SCALE, CAL_FINGER_ORDER } from '../../constants';
import { voltageToColor, getFingerCalState } from '../../utils';

export function AxisMappingWidget({ isLeft, onChange }) {
  const handKey = isLeft ? 'left' : 'right';
  const cfg = __imuAxisConfig[handKey];
  const [order, setOrder] = useState(cfg.order);
  const [sX, setSX] = useState(cfg.sX);
  const [sY, setSY] = useState(cfg.sY);
  const [sZ, setSZ] = useState(cfg.sZ);

  useEffect(() => {
    cfg.order = order;
    cfg.sX = sX;
    cfg.sY = sY;
    cfg.sZ = sZ;
    if (onChange) onChange();
  }, [order, sX, sY, sZ, cfg, onChange]);

  return (
    <div className="flex gap-2.5">
      <select 
        value={order} 
        onChange={e => setOrder(e.target.value)}
        className="py-1 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50"
      >
        {['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
      </select>
      <select value={sX} onChange={e => setSX(Number(e.target.value))} className="py-1 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50">
        <option value={1}>+X</option><option value={-1}>-X</option>
      </select>
      <select value={sY} onChange={e => setSY(Number(e.target.value))} className="py-1 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50">
        <option value={1}>+Y</option><option value={-1}>-Y</option>
      </select>
      <select value={sZ} onChange={e => setSZ(Number(e.target.value))} className="py-1 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50">
        <option value={1}>+Z</option><option value={-1}>-Z</option>
      </select>
    </div>
  );
}