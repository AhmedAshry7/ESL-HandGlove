import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { UNIFIED_PACKET_HEADER } from './constants';
export function useGloveWebSocket(ipAddress, onFrame) {
  const [connectionId, setConnectionId] = useState(0);
  const [gloveState, setGloveState] = useState({
    connected: false,
    imuQuat: null,
    fingerAngles: null,
    fingerAnglesFlat: null,
    thumbExtra: 0,
    calStatus: 0,       // bitmask — 0 = no fingers calibrated
    leftFingerAngles: null,
    leftFingerAnglesFlat: null,
    leftThumbExtra: 0,
    leftCalStatus: 0,
    leftConnected: false,
    leftImuQuat: null,
    imuTimestamp: null,
    fingerTimestamp: null,
    imuDiag: null,
    consoleLogs: { right: [], left: [] },
    imuPoseIdx: 0,
    imuPoseIdxL: 0,
  });
  const imuQuatRef = useRef(null);
  const leftImuQuatRef = useRef(null);
  const fingerAnglesRef = useRef(null);
  const fingerAnglesFlatRef = useRef(null);
  const thumbExtraRef = useRef(0);
  const wsRef = useRef(null);
  // Exposes latest raw voltages synchronously (no render cycle needed)
  const rawVoltagesRef = useRef(Array(16).fill(null));

  const reconnect = useCallback(() => {
    setConnectionId(id => id + 1);
  }, []);

  useEffect(() => {
    if (!ipAddress) return undefined;

    const socket = new WebSocket(`ws://${ipAddress}:81`);
    socket.binaryType = 'arraybuffer';
    wsRef.current = socket;

    socket.onopen = () => {
      //console.log('[Glove] Connected');
      setGloveState(prev => ({ ...prev, connected: true }));
    };
    socket.onclose = () => {
      //console.log('[Glove] Disconnected');
      setGloveState(prev => ({ ...prev, connected: false }));
      wsRef.current = null;
    };
    socket.onerror = (e) => console.warn('\[Glove\] Error:', e);

    socket.onmessage = async (event) => {
      try {
        //console.log('[Glove] Received:', event);
        // //console.log("Here is the received data:", event.data);
        if (typeof event.data === 'string') {
          const logMsg = event.data;
          //console.log('[Glove] Received string:', logMsg);
          setGloveState(prev => {
            const isLeft = logMsg.includes("[LEFT]") || logMsg.includes("[SLAVE]");
            const target = isLeft ? 'left' : 'right';
            const currentLogs = prev.consoleLogs || { right: [], left: [] };
            const newLogs = { ...currentLogs };
            newLogs[target] = [...(currentLogs[target] || []), logMsg].slice(-50); // Keep last 50 logs per hand

            let newPoseIdx = prev.imuPoseIdx;
            let newPoseIdxL = prev.imuPoseIdxL;
            const match = logMsg.match(/Recorded Pose (\d+)\/[36] successfully/);
            if (match) {
              if (isLeft) newPoseIdxL = parseInt(match[1], 10);
              else newPoseIdx = parseInt(match[1], 10);
            }
            if (logMsg.includes("6-poses calibration") || logMsg.includes("3-poses calibration") || logMsg.includes("Restarting calibration")) {
              if (isLeft) newPoseIdxL = 0;
              else newPoseIdx = 0;
            }

            return { ...prev, consoleLogs: newLogs, imuPoseIdx: newPoseIdx, imuPoseIdxL: newPoseIdxL };
          });
          return;
        }

        const buffer = event.data instanceof ArrayBuffer
          ? event.data
          : await event.data.arrayBuffer();

        const view = new DataView(buffer);

        if (buffer.byteLength < 4) return;
        const header = view.getUint32(0, true);

        if (header === 0x494D5543) { // "IMUC"
          if (view.byteLength < 54) return;
          const role = view.getUint8(4);
          const imuIdx = view.getUint8(5);
          const bias = [view.getFloat32(6, true), view.getFloat32(10, true), view.getFloat32(14, true)];
          const W = [];
          for (let i = 0; i < 9; i++) {
            W.push(view.getFloat32(18 + (i * 4), true));
          }

          setGloveState(prev => {
            const next = { ...prev };
            if (!next.imuCalibrations) next.imuCalibrations = { right: [], left: [] };
            const target = role === 0 ? 'right' : 'left';
            const calList = [...(next.imuCalibrations[target] || [])];
            calList[imuIdx] = { bias, W };
            return { ...next, imuCalibrations: { ...next.imuCalibrations, [target]: calList } };
          });
          return;
        }

        if (header === UNIFIED_PACKET_HEADER) {
          //console.log("Unified packet received");
          if (view.byteLength < 154) return;
          const timestamp = view.getUint32(4, true);
          //console.log("Unified packet received, here are the contents:  ", view);
          console
          const parseHand = (offset) => {
            const unpackQuat = (off) => {
              const w = view.getInt16(off + 0, true) / 32767.0;
              const x = view.getInt16(off + 2, true) / 32767.0;
              const y = view.getInt16(off + 4, true) / 32767.0;
              const z = view.getInt16(off + 6, true) / 32767.0;

              if (w === 0 && x === 0 && y === 0 && z === 0) {
                return { x: NaN, y: NaN, z: NaN, w: NaN, isZero: true };
              }
              const result = new THREE.Quaternion(x, y, z, w).normalize();
              result.isZero = false;
              return result;
            };

            const rQ_U = unpackQuat(offset + 0);
            const rQ_F = unpackQuat(offset + 8);
            const rQ_H = unpackQuat(offset + 16);

            const fingers = [];
            for (let f = 0; f < 5; f++) {
              fingers.push({
                yaw: view.getInt8(offset + 24 + f * 3 + 0),
                pitch1: view.getInt8(offset + 24 + f * 3 + 1),
                pitch2: view.getInt8(offset + 24 + f * 3 + 2),
              });
            }
            const thumbExtra = view.getInt8(offset + 39);

            const voltages = new Array(16);
            for (let i = 0; i < 16; i++) {
              voltages[i] = view.getUint16(offset + 40 + i * 2, true) / 10000.0;
            }

            const status = view.getUint8(offset + 72);
            const calStatus = status & 0x1F;
            const connected = ((status >>> 5) & 0x1) === 1;

            return { rQ_U, rQ_F, rQ_H, fingers, thumbExtra, voltages, calStatus, connected };
          };

          const right = parseHand(8);
          const left = parseHand(81);

          let imuQuat;
          if (!isNaN(right.rQ_U.x) && !right.rQ_H.isZero) {
            imuQuat = {
              upperArm: [right.rQ_U.x, right.rQ_U.y, right.rQ_U.z, right.rQ_U.w],
              forearm: [right.rQ_F.x, right.rQ_F.y, right.rQ_F.z, right.rQ_F.w],
              hand: [right.rQ_H.x, right.rQ_H.y, right.rQ_H.z, right.rQ_H.w]
            };
          }

          let leftImuQuat;
          if (!isNaN(left.rQ_U.x) && !left.rQ_H.isZero) {
            leftImuQuat = {
              upperArm: [left.rQ_U.x, left.rQ_U.y, left.rQ_U.z, left.rQ_U.w],
              forearm: [left.rQ_F.x, left.rQ_F.y, left.rQ_F.z, left.rQ_F.w],
              hand: [left.rQ_H.x, left.rQ_H.y, left.rQ_H.z, left.rQ_H.w]
            };
          }

          if (imuQuat) {
            //console.log(`[IMU R] U[${imuQuat.upperArm.map(v => v.toFixed(2)).join(',')}] F[${imuQuat.forearm.map(v => v.toFixed(2)).join(',')}] H[${imuQuat.hand.map(v => v.toFixed(2)).join(',')}]`);
          }
          if (leftImuQuat) {
            //console.log(`[IMU L] U[${leftImuQuat.upperArm.map(v => v.toFixed(2)).join(',')}] F[${leftImuQuat.forearm.map(v => v.toFixed(2)).join(',')}] H[${leftImuQuat.hand.map(v => v.toFixed(2)).join(',')}]`);
          }

          const rightFloats = [...right.fingers.flatMap(f => [f.yaw, f.pitch1, f.pitch2]), right.thumbExtra];
          const leftFloats = [...left.fingers.flatMap(f => [f.yaw, f.pitch1, f.pitch2]), left.thumbExtra];

          fingerAnglesRef.current = right.fingers;
          fingerAnglesFlatRef.current = rightFloats;
          thumbExtraRef.current = right.thumbExtra;
          if (imuQuat) imuQuatRef.current = imuQuat;
          if (leftImuQuat) leftImuQuatRef.current = leftImuQuat;
          rawVoltagesRef.current = right.voltages;

          const getWXYZ = (qArr) => {
            if (!qArr || qArr.length !== 4 || qArr.some(isNaN)) return [1.0, 0.0, 0.0, 0.0];
            return [qArr[3], qArr[0], qArr[1], qArr[2]]; // Convert [x,y,z,w] to [w,x,y,z]
          };
          const iqR = imuQuat ?? imuQuatRef.current;
          const iqL = leftImuQuat ?? leftImuQuatRef.current;

          const flat56 = [
            ...rightFloats,
            ...getWXYZ(iqR?.hand),
            ...getWXYZ(iqR?.forearm),
            ...getWXYZ(iqR?.upperArm),
            ...leftFloats,
            ...getWXYZ(iqL?.hand),
            ...getWXYZ(iqL?.forearm),
            ...getWXYZ(iqL?.upperArm),
          ];

          setGloveState(prev => ({
            ...prev,
            ...(imuQuat ? { imuQuat } : {}),
            ...(leftImuQuat ? { leftImuQuat } : {}),
            fingerAngles: right.fingers,
            fingerAnglesFlat: rightFloats,
            thumbExtra: right.thumbExtra,
            calStatus: right.calStatus,
            leftFingerAngles: left.fingers,
            leftFingerAnglesFlat: leftFloats,
            leftThumbExtra: left.thumbExtra,
            leftCalStatus: left.calStatus,
            leftConnected: left.connected,
            connected: right.connected,
            fingerTimestamp: timestamp,
            imuTimestamp: timestamp,
          }));

          if (onFrame) {
            onFrame({
              source: 'unified',
              fingers: rightFloats,
              fingerAngles: right.fingers,
              thumbExtra: right.thumbExtra,
              calStatus: right.calStatus,
              leftFingerAnglesFlat: leftFloats,
              leftFingerAngles: left.fingers,
              leftThumbExtra: left.thumbExtra,
              leftCalStatus: left.calStatus,
              imuQuat: imuQuat ?? imuQuatRef.current,
              leftImuQuat,
              flex: {},
              pads: [],
              rightVoltages: right.voltages,
              leftVoltages: left.voltages,
              timestamp,
              flat56,
              leftConnected: left.connected,
              connected: right.connected
            });
          }
          return;
        }

      } catch (err) {
        console.error('Glove packet parse error:', err);
      }
    };

    return () => socket.close();
  }, [ipAddress, onFrame, connectionId]);

  const sendCommand = useCallback((cmdId, payload, isLeft = false) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(buildCommandBuffer(cmdId, payload, isLeft));
    }
  }, []);

  return { ...gloveState, sendCommand, rawVoltagesRef, reconnect };
}