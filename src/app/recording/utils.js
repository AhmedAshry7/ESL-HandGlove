import * as THREE from 'three';
import {
  __imuAxisConfig, DEG2RAD, EMPTY_FINGER, VOLTAGE_FULL_SCALE, VOLTAGE_NEUTRAL, HAND_CHANNEL_MAPS
} from './constants';
export const getHandChannelMap = (hand) => HAND_CHANNEL_MAPS[hand] || HAND_CHANNEL_MAPS.right;
export const toRad = (deg) => (Number.isFinite(deg) ? deg : 0) * DEG2RAD;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function buildCommandBuffer(cmdId, payload, isLeft = false) {
  const prefixSize = isLeft ? 1 : 0;
  const payloadSize = payload ? payload.length : 0;
  const buf = new Uint8Array(prefixSize + 1 + payloadSize);
  let offset = 0;
  if (isLeft) {
    buf[offset++] = 0xA0;
  }
  buf[offset++] = cmdId;
  if (payload && payloadSize > 0) {
    buf.set(payload, offset);
  }
  return buf;
}
export function buildKnotsPayload(fingerIdx, axisIdx, knots) {
  const buf = new ArrayBuffer(2 + (5 * 4));
  const view = new DataView(buf);
  view.setUint8(0, fingerIdx);
  view.setUint8(1, axisIdx);
  for (let i = 0; i < 5; i += 1) {
    view.setFloat32(2 + (i * 4), knots[i] ?? 0, true);
  }
  return new Uint8Array(buf);
}
export function buildCouplingPayload(fingerIdx, coeffs) {
  const len = coeffs.length;
  const buf = new ArrayBuffer(1 + (len * 4));
  const view = new DataView(buf);
  view.setUint8(0, fingerIdx);
  for (let i = 0; i < len; i += 1) {
    view.setFloat32(1 + (i * 4), coeffs[i] ?? 0, true);
  }
  return new Uint8Array(buf);
}
export function quatFromEuler(x, y, z) {
  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  return [q.x, q.y, q.z, q.w];
}
export function ConvertToThreeSpace(q, hand = 'right') {
  const conf = __imuAxisConfig[hand] || __imuAxisConfig.right;
  let mappedX = q.x, mappedY = q.y, mappedZ = q.z;

  // 1. Map components based on user selection
  if (conf.order === 'xyz') { mappedX = q.x; mappedY = q.y; mappedZ = q.z; }
  else if (conf.order === 'xzy') { mappedX = q.x; mappedY = q.z; mappedZ = q.y; }
  else if (conf.order === 'yxz') { mappedX = q.y; mappedY = q.x; mappedZ = q.z; }
  else if (conf.order === 'yzx') { mappedX = q.y; mappedY = q.z; mappedZ = q.x; }
  else if (conf.order === 'zxy') { mappedX = q.z; mappedY = q.x; mappedZ = q.y; }
  else if (conf.order === 'zyx') { mappedX = q.z; mappedY = q.y; mappedZ = q.x; }

  mappedX *= conf.sX;
  mappedY *= conf.sY;
  mappedZ *= conf.sZ;
  let mappedW = q.w * conf.sW;

  // 2. Parity Check: Ensure the mapping is a valid Right-Handed rotation
  const isSwapped = (conf.order === 'xzy' || conf.order === 'yxz' || conf.order === 'zyx');
  const signFlips = (conf.sX < 0 ? 1 : 0) + (conf.sY < 0 ? 1 : 0) + (conf.sZ < 0 ? 1 : 0);

  // If we swapped axes (Det = -1) or flipped an odd number of signs (Det = -1)
  const det = (isSwapped ? -1 : 1) * (signFlips % 2 !== 0 ? -1 : 1);

  // If Det == -1, the mapping turned the rotation inside-out (left-handed).
  // Invert W to correct the rotation parity back to Right-Handed for Three.js.
  if (det < 0) {
    mappedW = -mappedW;
  }

  return new THREE.Quaternion(mappedX, mappedY, mappedZ, mappedW).normalize();
}
// Returns true if the finger at fingerIdx (0=Pinky…4=Thumb) is calibrated
export function isFingerCalibrated(calStatus, fingerIdx) {
  return !!(calStatus & (1 << fingerIdx));
}
/**
 * Build the 16-element finger bone quaternion array for ArmModel.
 * calStatus bitmask: bit0=Pinky, bit1=Ring, bit2=Middle, bit3=Index, bit4=Thumb.
 * Uncalibrated fingers stay in rest pose (null slots → ArmModel uses getSpreadRotation).
 */
export function buildFingerEulers(fingers, thumbExtra, calStatus = 0xFF, isLeft = false) {
  if (!Array.isArray(fingers) || fingers.length < 5) return null;
  // Packet order: [Pinky=0, Ring=1, Middle=2, Index=3, Thumb=4]
  const pinky = fingers[0] ?? EMPTY_FINGER;
  const ring = fingers[1] ?? EMPTY_FINGER;
  const middle = fingers[2] ?? EMPTY_FINGER;
  const index = fingers[3] ?? EMPTY_FINGER;
  const thumb = fingers[4] ?? EMPTY_FINGER;

  // Unity script New_Magnets.cs mapping:
  // Thumb: X=0, Y=Yaw, Z=Pitch (Positive Z curls inward)
  // Others: X=Pitch, Y=0, Z=Yaw (Negative X curls inward in Three.js right-handed system)
  const thumbMcpEuler = (f) => [toRad(f.yaw), 0, isLeft ? -toRad(f.pitch1) : toRad(f.pitch1)];
  const thumbPipEuler = (f) => [0, 0, isLeft ? -toRad(f.pitch2) : toRad(f.pitch2)];
  const thumbIpEuler = [0, 0, isLeft ? -toRad(thumbExtra) : toRad(thumbExtra)];

  const fingerMcpEuler = (f) => [-toRad(f.pitch1), 0, isLeft ? -toRad(f.yaw) : toRad(f.yaw)];
  const fingerPipEuler = (f) => [-toRad(f.pitch2), 0, 0];

  // Only apply eulers for calibrated fingers; null → ArmModel falls back to rest spread
  const thumbE = isFingerCalibrated(calStatus, 4) ? { mcp: thumbMcpEuler(thumb), pip: thumbPipEuler(thumb), ip: thumbIpEuler } : null;
  const indexE = isFingerCalibrated(calStatus, 3) ? { mcp: fingerMcpEuler(index), pip: fingerPipEuler(index) } : null;
  const middleE = isFingerCalibrated(calStatus, 2) ? { mcp: fingerMcpEuler(middle), pip: fingerPipEuler(middle) } : null;
  const ringE = isFingerCalibrated(calStatus, 1) ? { mcp: fingerMcpEuler(ring), pip: fingerPipEuler(ring) } : null;
  const pinkyE = isFingerCalibrated(calStatus, 0) ? { mcp: fingerMcpEuler(pinky), pip: fingerPipEuler(pinky) } : null;

  return [
    /* [0]  thumb01 MCP  */ thumbE?.mcp ?? null,
    /* [1]  thumb02 PIP  */ thumbE?.pip ?? null,
    /* [2]  thumb03 IP   */ thumbE?.ip ?? null,
    /* [3]  index01 MCP  */ indexE?.mcp ?? null,
    /* [4]  index02 PIP  */ indexE?.pip ?? null,
    /* [5]  index03 DIP  */ indexE?.pip ?? null,   // DIP mirrors PIP
    /* [6]  middle01 MCP */ middleE?.mcp ?? null,
    /* [7]  middle02 PIP */ middleE?.pip ?? null,
    /* [8]  middle03 DIP */ middleE?.pip ?? null,
    /* [9]  ring01 MCP   */ ringE?.mcp ?? null,
    /* [10] ring02 PIP   */ ringE?.pip ?? null,
    /* [11] ring03 DIP   */ ringE?.pip ?? null,
    /* [12] pinky01 MCP  */ pinkyE?.mcp ?? null,
    /* [13] pinky02 PIP  */ pinkyE?.pip ?? null,
    /* [14] pinky03 DIP  */ pinkyE?.pip ?? null,
    /* [15] pinky03 end  */ pinkyE?.pip ?? null,
  ];
}
export function buildRigData(frame) {
  if (!frame) return null;
  const rightFingers = buildFingerEulers(frame.fingerAngles, frame.thumbExtra ?? 0, frame.calStatus ?? 0xFF, false);
  const leftFingers = buildFingerEulers(frame.leftFingerAngles, frame.leftThumbExtra ?? 0, frame.leftCalStatus ?? 0xFF, true);

  return {
    right: {
      palm: frame.imuQuat ?? undefined,
      fingers: rightFingers ?? undefined,
    },
    left: {
      palm: frame.leftImuQuat ?? undefined,
      fingers: leftFingers ?? undefined,
    }
  };
}
// Interpolate voltage to a colour: 0V=red, 1.5V=green, 2.5V=blue
export function voltageToColor(v) {
  if (!Number.isFinite(v)) return '#4a5568';
  const c = Math.max(0, Math.min(VOLTAGE_FULL_SCALE, v));
  if (c <= VOLTAGE_NEUTRAL) {
    const t = c / VOLTAGE_NEUTRAL;
    return `hsl(${Math.round(t * 120)}, 75%, 48%)`;
  }
  const t = (c - VOLTAGE_NEUTRAL) / (VOLTAGE_FULL_SCALE - VOLTAGE_NEUTRAL);
  return `hsl(${Math.round(120 + t * 100)}, 70%, 52%)`;
}
export function percentToColor(pct) {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `hsl(${Math.round(t * 120)}, 75%, 45%)`;
}
export function percentFromKnots(voltage, knots) {
  if (!Number.isFinite(voltage) || !Array.isArray(knots) || knots.length < 2) return null;
  if (!knots.every(Number.isFinite)) return null;

  const steps = [0, 25, 50, 75, 100];
  const lastIdx = knots.length - 1;
  const first = knots[0];
  const last = knots[lastIdx];

  for (let i = 0; i < lastIdx; i += 1) {
    const a = knots[i];
    const b = knots[i + 1];
    const span = b - a;
    if (Math.abs(span) < 1e-6) continue;
    const inRange = (voltage - a) * (voltage - b) <= 0;
    if (!inRange) continue;
    const t = (voltage - a) / span;
    const pct = steps[i] + t * (steps[i + 1] - steps[i]);
    return Math.max(0, Math.min(1, pct / 100));
  }

  const span = last - first;
  if (Math.abs(span) < 1e-6) return null;
  const t = (voltage - first) / span;
  return Math.max(0, Math.min(1, t));
}
export function buildChannelKnots(knotsByAxis, fingerDefaults = HAND_CHANNEL_MAPS.right.fingerDefaults) {
  const channelKnots = Array.from({ length: 16 }, () => null);
  if (!Array.isArray(knotsByAxis)) return channelKnots;
  for (let finger = 0; finger < fingerDefaults.length; finger += 1) {
    for (let axis = 0; axis < fingerDefaults[finger].length; axis += 1) {
      const ch = fingerDefaults[finger][axis];
      if (ch === -1) continue;
      const knots = knotsByAxis?.[finger]?.[axis];
      if (Array.isArray(knots) && knots.every(Number.isFinite)) channelKnots[ch] = knots;
    }
  }
  return channelKnots;
}
export function getFingerCalState(fingerIdx, calStatus, knotsByAxis, fingerDefaults = HAND_CHANNEL_MAPS.right.fingerDefaults) {
  if (calStatus & (1 << fingerIdx)) return 'green';
  const axes = knotsByAxis?.[fingerIdx];
  if (axes) {
    const hasAnyAxis = axes.some((axKnots, ai) =>
      fingerDefaults[fingerIdx][ai] !== -1 && axKnots.every(k => Number.isFinite(k))
    );
    if (hasAnyAxis) return 'yellow';
  }
  return 'grey';
}