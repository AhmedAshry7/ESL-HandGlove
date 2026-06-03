"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ArmModel, DEFAULT_WRIST_LIMITS, DEFAULT_ARM_LIMITS, BIOMECHANICAL_LIMITS } from "../components/ArmModel";
import Image from "next/image";
import logo from "../assets/logo.png";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import * as THREE from 'three';

// ─── Dev/Production toggle ───────────────────────────────────────────────────
// Set to false before deploying to production to hide all developer UI.
const DEV_MODE = true;


import { 
  __imuAxisConfig, FINGER_LABELS, UNIFIED_PACKET_HEADER, DEG2RAD, CAL_ALL_FINGERS, CMD, CALIBRATION_STEPS, CAL_FINGER_NAMES, CAL_AXIS_NAMES, COUPLING_LABELS_STANDARD, COUPLING_LABELS_THUMB, HAND_CHANNEL_MAPS, DEFAULT_SAMPLE_COUNT, DEFAULT_SAMPLE_DELAY_MS, VOLTAGE_MIN_VALID, VOLTAGE_MAX_VALID, VOLTAGE_NEUTRAL, VOLTAGE_FULL_SCALE, SENSOR_MIN_SPAN, SENSOR_DEAD_THRESH, EMPTY_FINGER, DEFAULT_FINGER_LIMITS, CH_FINGER_IDX, CAL_FINGER_ORDER 
} from './constants';
import { 
  toRad, sleep, buildCommandBuffer, buildKnotsPayload, buildCouplingPayload, quatFromEuler, ConvertToThreeSpace, isFingerCalibrated, buildFingerEulers, buildRigData, voltageToColor, percentToColor, percentFromKnots, buildChannelKnots, getFingerCalState, getHandChannelMap 
} from './utils';
import { useGloveWebSocket } from './useGloveWebSocket';
import { AxisMappingWidget, AlignmentPanel, IMUDiagnosticsPanel } from './components/imu';
import { FingerAnglesPanel, LiveVoltageMonitor, CalStatusStrip, CouplingCalibrationUI } from './components/hall';
import { Scene } from './components/viewer';
import { RestPoseTuner, BiomechanicalLimits, ManualFingers } from './components/debug';
import { RecordingModal } from './RecordingModal';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GloveCapture() {
  const router = useRouter();

  const [espIp, setEspIp] = useState("192.168.1.17");
  const [ipInput, setIpInput] = useState("192.168.1.17");

  useEffect(() => {
    const saved = localStorage.getItem('espIp');
    const defaultIp = saved || process.env.NEXT_PUBLIC_ESP_IP || '192.168.1.17';
    setEspIp(defaultIp);
    setIpInput(defaultIp);
  }, []);

  const handleApplyIp = () => {
    setEspIp(ipInput);
    localStorage.setItem('espIp', ipInput);
  };

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const isRecordingRef = useRef(false); // mirrors state for use inside WS closure

  // WebSocket & live frame
  // Sensor-health tracking: rolling 30-second min/max per channel
  const sensorHistoryRef = useRef(Array.from({ length: 16 }, () => ({ min: Infinity, max: -Infinity, samples: [] })));
  const [sensorHealth, setSensorHealth] = useState(() => Array(16).fill({ dead: false }));
  const sensorHealthTimerRef = useRef(null);
  const rawVoltagesByHandRef = useRef({
    right: Array(16).fill(null),
    left: Array(16).fill(null)
  });
  const latestRigDataRef = useRef(null);
  const handleFrame = useCallback((frame) => {
    if (frame?.source === 'config_knots') {
      setKnotsByAxis(prev => {
        const next = [...prev];
        next[frame.fingerIdx] = [...next[frame.fingerIdx]];
        next[frame.fingerIdx][frame.axis] = frame.newKnots;
        return next;
      });
      return;
    }

    if (frame?.source === 'config_coupling') {
      setCouplingByFinger(prev => {
        const next = [...prev];
        next[frame.fingerIdx] = frame.newCoeffs;
        return next;
      });
      return;
    }

    if (frame?.source === 'raw' || frame?.source === 'raw_dual' || frame?.source === 'unified') {
      if (frame?.source === 'unified') {
        if (Array.isArray(frame.rightVoltages)) rawVoltagesByHandRef.current.right = frame.rightVoltages;
        if (Array.isArray(frame.leftVoltages)) rawVoltagesByHandRef.current.left = frame.leftVoltages;
      }
      let voltages = frame.voltages;
      if (frame?.source === 'raw_dual' || frame?.source === 'unified') {
        voltages = calHandRef.current === 'left' ? frame.leftVoltages : frame.rightVoltages;
      }

      setRawVoltages(voltages);
      // Track per-channel variance for 30s dead-sensor detection
      const now = Date.now();
      const hist = sensorHistoryRef.current;
      let changed = false;
      voltages.forEach((v, ch) => {
        if (!Number.isFinite(v)) return;
        const h = hist[ch];
        h.samples.push({ t: now, v });
        // Trim samples older than 30s
        h.samples = h.samples.filter(s => now - s.t < 30000);
        const newMin = Math.min(...h.samples.map(s => s.v));
        const newMax = Math.max(...h.samples.map(s => s.v));
        if (newMin !== h.min || newMax !== h.max) { h.min = newMin; h.max = newMax; changed = true; }
      });
      if (changed) {
        clearTimeout(sensorHealthTimerRef.current);
        sensorHealthTimerRef.current = setTimeout(() => {
          setSensorHealth(hist.map(h => ({ dead: (h.max - h.min) < SENSOR_DEAD_THRESH && h.samples.length > 30 })));
        }, 500);
      }
      if (rawWaiterRef.current) {
        const waiter = rawWaiterRef.current;
        rawWaiterRef.current = null;
        clearTimeout(waiter.timer);
        waiter.resolve(voltages);
      }
      if (frame?.source !== 'unified') return;
    }

    if (!isRecordingRef.current) return;
    if (frame?.source !== 'finger' && frame?.source !== 'unified') return;
    if (!frame?.fingers) return;
    setRecordedFrames(prev => [...prev, frame]);
  }, []);

  const gloveFrame = useGloveWebSocket(espIp, handleFrame);

  const currentFrame = useMemo(() => {
    if (!gloveFrame?.imuQuat && !gloveFrame?.fingerAnglesFlat) return null;
    return {
      fingers: gloveFrame.fingerAnglesFlat,
      fingerAngles: gloveFrame.fingerAngles,
      thumbExtra: gloveFrame.thumbExtra,
      calStatus: gloveFrame.calStatus ?? 0,

      leftFingers: gloveFrame.leftFingerAnglesFlat,
      leftFingerAngles: gloveFrame.leftFingerAngles,
      leftThumbExtra: gloveFrame.leftThumbExtra,
      leftCalStatus: gloveFrame.leftCalStatus ?? 0,

      imuQuat: gloveFrame.imuQuat,
      leftImuQuat: gloveFrame.leftImuQuat,
      dualImuStatus: gloveFrame.dualImuStatus,
      imuDiag: gloveFrame.imuDiag ?? null,
      flex: {},
      pads: [],
    };
  }, [gloveFrame]);

  const [modelAlignRight, setModelAlignRight] = useState({
    upper: [0, 0, 0],
    forearm: [0, 0, 0],
    hand: [0, 0, 0]
  });
  const [modelAlignLeft, setModelAlignLeft] = useState({
    upper: [0, 0, 0],
    forearm: [0, 0, 0],
    hand: [0, 0, 0]
  });

  const mountCorrRef = useRef({
    upperR: new THREE.Quaternion(),
    forearmRL: new THREE.Quaternion(),
    forearmRR: new THREE.Quaternion(),
    handRL: new THREE.Quaternion(),
    handRR: new THREE.Quaternion(),
    upperL: new THREE.Quaternion(),
    forearmLL: new THREE.Quaternion(),
    forearmLR: new THREE.Quaternion(),
    handLL: new THREE.Quaternion(),
    handLR: new THREE.Quaternion()
  });

  const restPosesRef = useRef(null);
  const handleRestPosesLoaded = useCallback((poses) => { restPosesRef.current = poses; }, []);
  const tareUpperRRef = useRef(new THREE.Quaternion());
  const tareUpperLRef = useRef(new THREE.Quaternion());
  const modelAlignRightRef = useRef(modelAlignRight);
  const modelAlignLeftRef = useRef(modelAlignLeft);
  useEffect(() => { modelAlignRightRef.current = modelAlignRight; }, [modelAlignRight]);
  useEffect(() => { modelAlignLeftRef.current = modelAlignLeft; }, [modelAlignLeft]);

  const currentFrameRef = useRef(currentFrame);
  useEffect(() => { currentFrameRef.current = currentFrame; }, [currentFrame]);

  const [isCalibrated, setIsCalibrated] = useState(false);

  const calibrateMountOffsets = useCallback(() => {
    const frame = currentFrameRef.current;
    const isLeft = calHandRef.current === 'left';

    const imuQuat = isLeft ? frame?.leftImuQuat : frame?.imuQuat;
    const restPosesObj = isLeft ? restPosesRef.current?.left : restPosesRef.current?.right;

    if (!imuQuat?.upperArm || !restPosesObj) return;

    const handSide = isLeft ? 'left' : 'right';
    const hwUpperWorld = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.upperArm), handSide);
    const hwForearmLocal = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.forearm), handSide);
    const hwHandLocal = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.hand), handSide);

    const mAlign = isLeft ? modelAlignLeftRef.current : modelAlignRightRef.current;
    const mAlignUp = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.upper[0]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[1]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[2]) || 0) * DEG2RAD, 'XYZ'));
    const mAlignFo = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.forearm[0]) || 0) * DEG2RAD, (parseFloat(mAlign.forearm[1]) || 0) * DEG2RAD, (parseFloat(mAlign.forearm[2]) || 0) * DEG2RAD, 'XYZ'));
    const mAlignHa = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.hand[0]) || 0) * DEG2RAD, (parseFloat(mAlign.hand[1]) || 0) * DEG2RAD, (parseFloat(mAlign.hand[2]) || 0) * DEG2RAD, 'XYZ'));

    const { upper: upperRestPose, upperWorld: upperRestWorld, forearm: forearmRestPose, hand: handRestPose } = restPosesObj;

    // 1. Calculate World Tare (Body Facing Direction) via Swing-Twist
    const hwUpAligned = hwUpperWorld.clone().multiply(mAlignUp);
    const delta = hwUpAligned.clone().multiply(upperRestPose.clone().invert());

    // Extract pure Y-axis rotation, ignoring strap roll
    let tareQ = new THREE.Quaternion(0, delta.y, 0, delta.w).normalize();
    if (tareQ.lengthSq() < 0.0001) tareQ = new THREE.Quaternion(0, 1, 0, 0);

    if (isLeft) tareUpperLRef.current = tareQ;
    else tareUpperRRef.current = tareQ;

    // 2. Calculate Local Mount Offset
    // This perfectly absorbs the physical strap crookedness
    const upperMountCorr = hwUpperWorld.clone().invert()
      .multiply(tareQ)
      .multiply(upperRestWorld || upperRestPose)
      .multiply(mAlignUp.clone().invert());

    const forearmMountL = upperMountCorr.clone().invert();
    const forearmMountR = hwForearmLocal.clone().invert()
      .multiply(upperMountCorr).multiply(mAlignUp)
      .multiply(forearmRestPose)
      .multiply(mAlignFo.clone().invert());

    const handMountL = forearmMountR.clone().invert();
    const handMountR = hwHandLocal.clone().invert()
      .multiply(forearmMountR).multiply(mAlignFo)
      .multiply(handRestPose)
      .multiply(mAlignHa.clone().invert());

    if (isLeft) {
      mountCorrRef.current.upperL = upperMountCorr;
      mountCorrRef.current.forearmLL = forearmMountL;
      mountCorrRef.current.forearmLR = forearmMountR;
      mountCorrRef.current.handLL = handMountL;
      mountCorrRef.current.handLR = handMountR;
    } else {
      mountCorrRef.current.upperR = upperMountCorr;
      mountCorrRef.current.forearmRL = forearmMountL;
      mountCorrRef.current.forearmRR = forearmMountR;
      mountCorrRef.current.handRL = handMountL;
      mountCorrRef.current.handRR = handMountR;
    }

    setIsCalibrated(true);
  }, []);

  const tareHeading = useCallback(() => {
    const frame = currentFrameRef.current;
    const isLeft = calHandRef.current === 'left';
    const imuQuat = isLeft ? frame?.leftImuQuat : frame?.imuQuat;
    const restPosesObj = isLeft ? restPosesRef.current?.left : restPosesRef.current?.right;

    if (!imuQuat?.upperArm || !restPosesObj) return;

    const handSide = isLeft ? 'left' : 'right';
    const hwUpperWorld = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.upperArm), handSide);
    const { upper: upperRestPose } = restPosesObj;

    const mAlign = isLeft ? modelAlignLeftRef.current : modelAlignRightRef.current;
    const mAlignUp = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.upper[0]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[1]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[2]) || 0) * DEG2RAD, 'XYZ'));
    const mCorrR = isLeft ? mountCorrRef.current.upperL : mountCorrRef.current.upperR;

    // Find where the arm is currently pointing natively
    const currentUntared = hwUpperWorld.clone().multiply(mCorrR).multiply(mAlignUp);

    // Extract the new pure Y-axis difference
    const delta = currentUntared.clone().multiply(upperRestPose.clone().invert());
    let newTareQ = new THREE.Quaternion(0, delta.y, 0, delta.w).normalize();
    if (newTareQ.lengthSq() < 0.0001) newTareQ = new THREE.Quaternion(0, 1, 0, 0);

    if (isLeft) tareUpperLRef.current = newTareQ;
    else tareUpperRRef.current = newTareQ;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key.toLowerCase() === 'c') {
        calibrateMountOffsets();
      } else if (e.code === 'Space') {
        e.preventDefault();
        tareHeading();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calibrateMountOffsets, tareHeading]);

  // ─── Manual pose states (Must be before rigFrame) ───
  const [manualFingersEnable, setManualFingersEnable] = useState(false);
  const [manualArmsEnable, setManualArmsEnable] = useState({
    right: { upperArm: false, forearm: false, hand: false },
    left: { upperArm: false, forearm: false, hand: false }
  });
  const [manualFingers, setManualFingers] = useState(() => (
    Array.from({ length: 5 }, () => ({ yaw: 0, pitch1: 0, pitch2: 0 }))
  )); // order: [Pinky, Ring, Middle, Index, Thumb]
  const [manualThumbExtra, setManualThumbExtra] = useState(0);
  // Arm joints manual sliders in degrees [X, Y, Z]
  const [manualRightArm, setManualRightArm] = useState({
    upperArm: [-3, 0, 2],
    forearm: [92, -70, -1],
    hand: [0, 0, 0]
  });
  const [manualLeftArm, setManualLeftArm] = useState({
    upperArm: [1, -5, -4],
    forearm: [90, 73, 0],
    hand: [17, 0, 0]
  });

  const computeRigFromFrame = useCallback((frameDataInput) => {
    if (!frameDataInput) return null;
    const frameData = { ...frameDataInput };
    if (manualFingersEnable) {
      frameData.fingerAngles = manualFingers;
      frameData.thumbExtra = manualThumbExtra;
      frameData.calStatus = CAL_ALL_FINGERS;
      frameData.leftFingerAngles = manualFingers;
      frameData.leftThumbExtra = manualThumbExtra;
      frameData.leftCalStatus = CAL_ALL_FINGERS;
    }

    const rig = buildRigData(frameData);
    if (!rig) return null;

    const defaultPalmR = {
      upperArm: quatFromEuler(...manualRightArm.upperArm.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0))),
      forearm: quatFromEuler(...manualRightArm.forearm.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0))),
      hand: quatFromEuler(...manualRightArm.hand.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0)))
    };
    const defaultPalmL = {
      upperArm: quatFromEuler(...manualLeftArm.upperArm.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0))),
      forearm: quatFromEuler(...manualLeftArm.forearm.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0))),
      hand: quatFromEuler(...manualLeftArm.hand.map(d => (Number.isFinite(d) ? d * DEG2RAD : 0)))
    };

    const fallbackPalmR = { forceZeroPose: true, ...defaultPalmR };
    const fallbackPalmL = { forceZeroPose: true, ...defaultPalmL };

    const mc = mountCorrRef.current;

    const processArm = (imuQuat, mAlign, mCorrR, tareRef, handSide) => {
      if (!imuQuat?.upperArm) return null;
      const hwUp = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.upperArm), handSide);
      const hwFo = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.forearm), handSide);
      const hwHa = ConvertToThreeSpace(new THREE.Quaternion().fromArray(imuQuat.hand), handSide);

      const mUp = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.upper[0]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[1]) || 0) * DEG2RAD, (parseFloat(mAlign.upper[2]) || 0) * DEG2RAD, 'XYZ'));
      const mFo = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.forearm[0]) || 0) * DEG2RAD, (parseFloat(mAlign.forearm[1]) || 0) * DEG2RAD, (parseFloat(mAlign.forearm[2]) || 0) * DEG2RAD, 'XYZ'));
      const mHa = new THREE.Quaternion().setFromEuler(new THREE.Euler((parseFloat(mAlign.hand[0]) || 0) * DEG2RAD, (parseFloat(mAlign.hand[1]) || 0) * DEG2RAD, (parseFloat(mAlign.hand[2]) || 0) * DEG2RAD, 'XYZ'));

      // 1. Upper Arm: Inverse Tare (World Space) * Raw IMU * Mount Offset (Local Space) * Proxy
      const tareQ = tareRef.current || new THREE.Quaternion();
      const tareInverse = tareQ.clone().invert();
      const alUp = tareInverse.multiply(hwUp).multiply(mCorrR.upper).multiply(mUp);

      // 2. Forearm & Hand: (Relative IMUs don't need Tare)
      const mUpInv = mUp.clone().invert();
      const mFoInv = mFo.clone().invert();

      const alFo = mUpInv.multiply(mCorrR.forearmL).multiply(hwFo).multiply(mCorrR.forearmR).multiply(mFo);
      const alHa = mFoInv.multiply(mCorrR.handL).multiply(hwHa).multiply(mCorrR.handR).multiply(mHa);

      return {
        isAligned: true,
        upperArm: [alUp.x, alUp.y, alUp.z, alUp.w],
        forearm: [alFo.x, alFo.y, alFo.z, alFo.w],
        hand: [alHa.x, alHa.y, alHa.z, alHa.w]
      };
    };

    const processedRight = processArm(frameData?.imuQuat, modelAlignRight, {
      upper: mc.upperR, forearmL: mc.forearmRL, forearmR: mc.forearmRR, handL: mc.handRL, handR: mc.handRR
    }, tareUpperRRef, 'right') || { ...fallbackPalmR };

    const processedLeft = processArm(frameData?.leftImuQuat, modelAlignLeft, {
      upper: mc.upperL, forearmL: mc.forearmLL, forearmR: mc.forearmLR, handL: mc.handLL, handR: mc.handLR
    }, tareUpperLRef, 'left') || { ...fallbackPalmL };

    processedRight.manualOverrides = manualArmsEnable.right;
    processedRight.manualValues = defaultPalmR;
    processedLeft.manualOverrides = manualArmsEnable.left;
    processedLeft.manualValues = defaultPalmL;

    rig.right.palm = processedRight;
    rig.left.palm = processedLeft;

    return rig;
  }, [modelAlignRight, modelAlignLeft, isCalibrated, manualFingersEnable, manualArmsEnable, manualFingers, manualThumbExtra, manualRightArm, manualLeftArm]);

  const rigFrame = useMemo(() => computeRigFromFrame(currentFrame), [computeRigFromFrame, currentFrame]);
  latestRigDataRef.current = rigFrame;

  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
  // Calibration ref – set to true to trigger reset inside HandModel
  const calibrateRef = useRef(false);

  // Main Tab State
  const [mainTab, setMainTab] = useState('exo');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [signLabel, setSignLabel] = useState('');
  const [signInput, setSignInput] = useState('');
  const [trimRange, setTrimRange] = useState([0, 100]);

  const [restRotationR, setRestRotationR] = useState([-0.96, -3.15, -3.15]);
  const [restRotationL, setRestRotationL] = useState([-0.99, -3.15, -3.15]);
  const [tunerOpen, setTunerOpen] = useState(true);



  // Biomechanical constraint limits
  const [wristLimits, setWristLimits] = useState({ ...DEFAULT_WRIST_LIMITS });
  const [armLimits, setArmLimits] = useState({
    upper: { ...DEFAULT_ARM_LIMITS.upper },
    forearm: { ...DEFAULT_ARM_LIMITS.forearm }
  });
  const [fingerLimits, setFingerLimits] = useState(() => JSON.parse(JSON.stringify(BIOMECHANICAL_LIMITS)));
  const [bioFingerTab, setBioFingerTab] = useState('index');
  const [bioOpen, setBioOpen] = useState(false);

  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calError, setCalError] = useState(null);
  const [couplingByFinger, setCouplingByFinger] = useState(() =>
    Array.from({ length: 5 }, (_, fi) => fi === 4 ? [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0])
  );
  const [couplingInput, setCouplingInput] = useState('0,0,0,0');
  const [rawVoltages, setRawVoltages] = useState(() => Array(16).fill(null));
  const [sampleCount, setSampleCount] = useState(DEFAULT_SAMPLE_COUNT);
  const [sampleDelayMs, setSampleDelayMs] = useState(DEFAULT_SAMPLE_DELAY_MS);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [calFinger, setCalFinger] = useState(0);
  const [calAxis, setCalAxis] = useState(0);
  const [knotsByAxis, setKnotsByAxis] = useState(() => (
    Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => Array(5).fill(null)))
  ));
  const [calHand, setCalHand] = useState('right');
  const calHandRef = useRef('right');
  useEffect(() => { calHandRef.current = calHand; }, [calHand]);
  const activeChannelMap = useMemo(() => getHandChannelMap(calHand), [calHand]);
  const activeFingerDefaults = activeChannelMap.fingerDefaults;
  const activeChannelLabels = activeChannelMap.labels;

  // Load offline arm pose from local storage
  useEffect(() => {
    try {
      const savedRight = localStorage.getItem('esl_glove_offline_right');
      const savedLeft = localStorage.getItem('esl_glove_offline_left');
      if (savedRight) setManualRightArm(JSON.parse(savedRight));
      if (savedLeft) setManualLeftArm(JSON.parse(savedLeft));
    } catch (e) {
      console.warn('Could not parse offline arm pose from localStorage');
    }
  }, []);

  // New: knot sanity warnings
  const [sanityWarnings, setSanityWarnings] = useState([]);
  // New: NVS load banner
  const [nvsBannerVisible, setNvsBannerVisible] = useState(false);
  // New: selected finger for coupling panel
  const [couplingFinger, setCouplingFinger] = useState(0);
  // New: calibration panel active tab
  const [calTab, setCalTab] = useState('voltages'); // 'voltages' | 'knots' | 'coupling' | 'manage'
  const [calMainTab, setCalMainTab] = useState('exo'); // 'exo' | 'imu'

  // Dynamic calibration state
  const [dynCalRecording, setDynCalRecording] = useState(false);
  const [dynCalCountdown, setDynCalCountdown] = useState(0);
  const [dynCalDuration, setDynCalDuration] = useState(8); // seconds to record
  const dynCalSamplesRef = useRef([]); // [{ch0, ch1, ...ch15}]

  const rawWaiterRef = useRef(null);

  // Helper to update a single axis
  const setR = (axis, val) => setRestRotationR(prev => { const n = [...prev]; n[axis] = val; return n; });
  const setL = (axis, val) => setRestRotationL(prev => { const n = [...prev]; n[axis] = val; return n; });

  // Saved signs (one submission = many signs)
  const [signs, setSigns] = useState([]); // [{label, frames, trimStart, trimEnd}]
  const [downloadStatus, setDownloadStatus] = useState(null);

  // Nav dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Stats
  const frameCount = recordedFrames.length;
  const duration = (frameCount / 60).toFixed(1);

  const axisKnots = knotsByAxis[calFinger][calAxis];
  const nextStepIdx = axisKnots.findIndex((val) => !Number.isFinite(val));
  const axisComplete = axisKnots.every((val) => Number.isFinite(val));
  const axisAvailable = activeFingerDefaults[calFinger][calAxis] !== -1;
  const isConnected = !!gloveFrame?.connected;

  const waitForRawVoltages = useCallback((timeoutMs = 2000) => new Promise((resolve, reject) => {
    if (rawWaiterRef.current) {
      clearTimeout(rawWaiterRef.current.timer);
      rawWaiterRef.current.reject(new Error('Superseded raw request'));
    }

    const timer = setTimeout(() => {
      rawWaiterRef.current = null;
      reject(new Error('Raw voltages timeout'));
    }, timeoutMs);

    rawWaiterRef.current = { resolve, reject, timer };
  }), []);

  const takeMedianSamples = useCallback(async (durationMs = 800) => {
    const samples = [];
    const endTime = Date.now() + durationMs;
    while (Date.now() < endTime) {
      const handKey = calHandRef.current === 'left' ? 'left' : 'right';
      const v = rawVoltagesByHandRef.current?.[handKey] ?? gloveFrame.rawVoltagesRef?.current;
      if (Array.isArray(v) && v.every(val => val !== null)) {
        samples.push([...v]);
      }
      await sleep(20);
    }
    if (samples.length === 0) throw new Error('No raw voltage samples received.');

    const medians = new Array(16);
    for (let ch = 0; ch < 16; ch++) {
      const chValues = samples.map(s => s[ch]).filter(Number.isFinite).sort((a, b) => a - b);
      if (chValues.length === 0) {
        medians[ch] = null;
      } else {
        const mid = Math.floor(chValues.length / 2);
        const midVal = chValues.length % 2 !== 0 ? chValues[mid] : (chValues[mid - 1] + chValues[mid]) / 2;
        medians[ch] = midVal;
      }
    }
    return medians;
  }, [gloveFrame.rawVoltagesRef]);

  const sendCommandWsRef = useRef(gloveFrame?.sendCommand);
  useEffect(() => { sendCommandWsRef.current = gloveFrame?.sendCommand; }, [gloveFrame?.sendCommand]);

  const sendCommandUnified = useCallback(async (cmdId, payload) => {
    if (sendCommandWsRef.current) sendCommandWsRef.current(cmdId, payload, calHandRef.current === 'left');
  }, []);

  const runCommand = useCallback(async (cmdId, payload) => {
    try {
      setCalError(null);
      await sendCommandUnified(cmdId, payload);
    } catch (err) {
      setCalError(err?.message || 'Command failed');
    }
  }, [sendCommandUnified]);

  const [magEnabled, setMagEnabled] = useState(true);

  const toggleMagUsage = useCallback(async () => {
    const newState = !magEnabled;
    setMagEnabled(newState);
    await runCommand(CMD.SET_MAG_USAGE, new Uint8Array([newState ? 1 : 0]));
  }, [magEnabled, runCommand]);

  const requestRawVoltages = useCallback(async () => {
    await sendCommandUnified(CMD.REQUEST_RAW);
    return waitForRawVoltages(500);
  }, [sendCommandUnified, waitForRawVoltages]);

  // Sanity-check 5 captured knots; returns array of warning strings
  const checkKnotSanity = (knots) => {
    const warnings = [];
    const valid = knots.filter(k => Number.isFinite(k));
    if (valid.length < 5) return warnings;
    if (valid.some(v => v < VOLTAGE_MIN_VALID || v > VOLTAGE_MAX_VALID)) {
      warnings.push(`⚠ Voltage outside valid range (${VOLTAGE_MIN_VALID}–${VOLTAGE_MAX_VALID}V). Sensor may be disconnected or out of ADS range.`);
    }
    const span = Math.max(...valid) - Math.min(...valid);
    if (span < SENSOR_MIN_SPAN) {
      warnings.push(`⚠ Total voltage span is only ${span.toFixed(3)}V (expected ≥ ${SENSOR_MIN_SPAN}V). Sensor may have no usable range.`);
    }
    let inc = 0, dec = 0;
    for (let i = 1; i < knots.length; i++) {
      if (knots[i] > knots[i - 1]) inc++;
      if (knots[i] < knots[i - 1]) dec++;
    }
    if (inc > 0 && dec > 0) {
      warnings.push('⚠ Knots are not monotonically ordered — some positions may be out of sequence. Consider re-capturing.');
    } else if (dec === 4) {
      warnings.push('ℹ Sensor reads in reverse direction (high voltage = straight). This is fine — firmware handles inverted sensors.');
    }
    return warnings;
  };

  // Capture current live-stream voltage using median over 800ms
  const captureStep = useCallback(async () => {
    if (captureBusy || !axisAvailable) return;
    const stepIdx = axisKnots.findIndex((val) => !Number.isFinite(val));
    if (stepIdx === -1) return;
    const sensorIdx = activeFingerDefaults[calFinger][calAxis];
    if (sensorIdx === -1) { setCalError('Selected axis is not available for this finger.'); return; }

    setCaptureBusy(true);
    try {
      setCalError(null);
      const medians = await takeMedianSamples(800);
      const voltage = medians[sensorIdx];

      if (!Number.isFinite(voltage)) {
        setCalError('No live voltage reading yet — ensure glove is connected and streaming.');
        return;
      }

      setKnotsByAxis(prev => {
        const next = prev.map(fa => fa.map(ax => [...ax]));
        next[calFinger][calAxis][stepIdx] = voltage;
        if (stepIdx === 4) {
          const finalKnots = [...next[calFinger][calAxis]];
          finalKnots[4] = voltage;
          setSanityWarnings(checkKnotSanity(finalKnots));
        }
        return next;
      });
    } catch (err) {
      setCalError(err.message);
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, axisAvailable, axisKnots, calFinger, calAxis, takeMedianSamples, activeFingerDefaults]);

  const resetAxis = useCallback(() => {
    setKnotsByAxis(prev => {
      const next = prev.map(fingerAxes => fingerAxes.map(axis => [...axis]));
      next[calFinger][calAxis] = Array(5).fill(null);
      return next;
    });
    setSanityWarnings([]);
  }, [calFinger, calAxis]);

  const sendKnots = useCallback(async () => {
    if (!axisComplete) return;
    try {
      setCalError(null);
      const payload = buildKnotsPayload(calFinger, calAxis, axisKnots);
      await sendCommandUnified(CMD.SET_KNOTS, payload);
    } catch (err) {
      setCalError(err?.message || 'Failed to send knots');
    }
  }, [axisComplete, calFinger, calAxis, axisKnots, sendCommandUnified]);

  // Send coupling coefficients from slider state
  const sendCouplingSliders = useCallback(async (fingerIdx) => {
    try {
      setCalError(null);
      const payload = buildCouplingPayload(fingerIdx, couplingByFinger[fingerIdx]);
      await sendCommandUnified(CMD.SET_COUPLING, payload);
    } catch (err) {
      setCalError(err?.message || 'Failed to send coupling');
    }
  }, [couplingByFinger, sendCommandUnified]);

  // Legacy text-input coupling send (kept for DEV backward compat)
  const sendCoupling = useCallback(async () => {
    const parts = couplingInput.split(',').map(val => parseFloat(val.trim())).filter(val => Number.isFinite(val));
    const expectedLen = calFinger === 4 ? 6 : 4;
    if (parts.length < expectedLen) { setCalError(`Provide ${expectedLen} comma-separated coupling values.`); return; }
    try {
      setCalError(null);
      const payload = buildCouplingPayload(calFinger, parts.slice(0, expectedLen));
      await sendCommandUnified(CMD.SET_COUPLING, payload);
    } catch (err) {
      setCalError(err?.message || 'Failed to send coupling');
    }
  }, [calFinger, couplingInput, sendCommandUnified]);



  // Export calibration JSON
  const handleExportCal = useCallback(() => {
    const cal = {
      version: 1,
      exportedAt: new Date().toISOString(),
      fingers: CAL_FINGER_NAMES.map((name, fi) => ({
        name,
        knots: {
          yaw: knotsByAxis[fi][0].map(v => Number.isFinite(v) ? v : null),
          pitch1: knotsByAxis[fi][1].map(v => Number.isFinite(v) ? v : null),
          pitch2: knotsByAxis[fi][2].map(v => Number.isFinite(v) ? v : null),
          ...(fi === 4 ? { thumbIP: knotsByAxis[fi][3].map(v => Number.isFinite(v) ? v : null) } : {}),
        },
        coupling: couplingByFinger[fi],
      })),
    };
    const blob = new Blob([JSON.stringify(cal, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glove-cal-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [knotsByAxis, couplingByFinger]);

  // Import calibration JSON: load state + send all CMD 0x10 / 0x11 to device
  const importInputRef = useRef(null);
  const handleImportCal = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const cal = JSON.parse(text);
      if (!cal.version || !Array.isArray(cal.fingers)) throw new Error('Invalid calibration file.');
      const newKnots = Array.from({ length: 5 }, (_, fi) =>
        Array.from({ length: 4 }, (_, ai) => {
          const key = ['yaw', 'pitch1', 'pitch2', 'thumbIP'][ai];
          const k = cal.fingers[fi]?.knots?.[key];
          return Array.isArray(k) ? k.map(v => (typeof v === 'number' ? v : null)) : Array(5).fill(null);
        })
      );
      const newCoupling = Array.from({ length: 5 }, (_, fi) => cal.fingers[fi]?.coupling ?? (fi === 4 ? [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0]));
      setKnotsByAxis(newKnots);
      setCouplingByFinger(newCoupling);
      // Send to device
      for (let fi = 0; fi < 5; fi++) {
        for (let ai = 0; ai < 4; ai++) {
          if (activeFingerDefaults[fi][ai] === -1) continue;
          if (!newKnots[fi][ai].every(v => Number.isFinite(v))) continue;
          await sendCommandUnified(CMD.SET_KNOTS, buildKnotsPayload(fi, ai, newKnots[fi][ai]));
          await sleep(20);
        }
        await sendCommandUnified(CMD.SET_COUPLING, buildCouplingPayload(fi, newCoupling[fi]));
        await sleep(20);
      }
      setCalError(null);
    } catch (err) {
      setCalError(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  }, [sendCommandUnified, activeFingerDefaults]);

  // Load cal from NVS with banner + raw refresh
  const handleLoadCalNVS = useCallback(async () => {
    await runCommand(CMD.LOAD_CAL);
    setNvsBannerVisible(true);
    // Trigger raw voltages refresh after device reloads cal
    setTimeout(async () => { await sendCommandUnified(CMD.REQUEST_RAW); }, 600);
    setTimeout(() => setNvsBannerVisible(false), 10000);
  }, [runCommand, sendCommandUnified]);




  /**
   * Dynamic Global Calibration
   * Polls raw voltages for `dynCalDuration` seconds, then derives 5 knot-points
   * for every sensor channel by linearly spacing between observed min and max.
   * Sends SET_KNOTS for all 16 axes (finger×axis combos) in one batch.
   */
  const startDynamicCal = useCallback(async () => {
    if (dynCalRecording || captureBusy) return;
    setDynCalRecording(true);
    setCalError(null);
    dynCalSamplesRef.current = [];
    const durationMs = dynCalDuration * 1000;
    const pollIntervalMs = 80; // ~12 Hz polling
    const endTime = Date.now() + durationMs;

    // Countdown timer display
    const countdownInterval = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      setDynCalCountdown(Math.max(0, remaining));
    }, 200);

    try {
      while (Date.now() < endTime) {
        try {
          await sendCommandUnified(CMD.REQUEST_RAW);
          const voltages = await waitForRawVoltages(300);
          if (Array.isArray(voltages) && voltages.length === 16) {
            dynCalSamplesRef.current.push(voltages);
          }
        } catch {
          // tolerate individual timeouts — keep polling
        }
        await sleep(pollIntervalMs);
      }

      const samples = dynCalSamplesRef.current;
      if (samples.length < 5) {
        setCalError(`Only ${samples.length} samples captured — check glove connection.`);
        return;
      }

      // Compute per-channel min/max across all samples
      const mins = Array(16).fill(Infinity);
      const maxs = Array(16).fill(-Infinity);
      for (const reading of samples) {
        for (let ch = 0; ch < 16; ch++) {
          if (Number.isFinite(reading[ch])) {
            if (reading[ch] < mins[ch]) mins[ch] = reading[ch];
            if (reading[ch] > maxs[ch]) maxs[ch] = reading[ch];
          }
        }
      }

      // Build 5 knots for each channel: interpolate min→max at 0%,25%,50%,75%,100%
      const channelKnots = Array.from({ length: 16 }, (_, ch) => {
        const lo = mins[ch];
        const hi = maxs[ch];
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return null;
        return [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * (hi - lo));
      });

      // activeFingerDefaults[finger][axis] = channel index (-1 = N/A)
      let sentCount = 0;
      for (let finger = 0; finger < 5; finger++) {
        for (let axis = 0; axis < 4; axis++) {
          const ch = activeFingerDefaults[finger][axis];
          if (ch === -1) continue;
          const knots = channelKnots[ch];
          if (!knots) continue;
          const payload = buildKnotsPayload(finger, axis, knots);
          await sendCommandUnified(CMD.SET_KNOTS, payload);
          await sleep(20); // brief gap between WS sends
          sentCount++;
        }
      }

      // Persist to NVS
      await sendCommandUnified(CMD.SAVE_CAL);
      setCalError(null);
      // Surface computed knots into UI state for visual confirmation
      setKnotsByAxis(prev => {
        const next = prev.map(fa => fa.map(ax => [...ax]));
        for (let f = 0; f < 5; f++) {
          for (let a = 0; a < 4; a++) {
            const ch = activeFingerDefaults[f][a];
            if (ch === -1) continue;
            const k = channelKnots[ch];
            if (k) next[f][a] = k;
          }
        }
        return next;
      });
    } catch (err) {
      setCalError(err?.message || 'Dynamic calibration failed');
    } finally {
      clearInterval(countdownInterval);
      setDynCalRecording(false);
      setDynCalCountdown(0);
    }
  }, [dynCalRecording, captureBusy, dynCalDuration, sendCommandUnified, waitForRawVoltages, activeFingerDefaults]);

  // ── Dropdown outside click ─────────────────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);

      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user.email);
      setUserId(user.id);
      //console.log("Authenticated user:", user);
      const userRes = await fetch(`${backendUrl}/profile/info?userId=${user.id}`);
      const userData = await userRes.json();
      setUser(userData[0]);
      //console.log("Profile info:", userData);

      setLoading(false);
    }

    init();
  }, [backendUrl]);

  useEffect(() => {
    if (activeFingerDefaults[calFinger][calAxis] === -1) {
      setCalAxis(0);
    }
  }, [calFinger, calAxis, activeFingerDefaults]);

  // ── Recording flow ─────────────────────────────────────────────────────────
  const handleStartRecording = () => {
    if (!signInput.trim()) return;
    setSignLabel(signInput.trim());
    setRecordedFrames([]);
    setTrimRange([0, 100]);
    setIsRecording(true);
    isRecordingRef.current = true;
    setModalOpen(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    // Modal stays open for trim/review
  };

  const handleDiscardSign = () => {
    setModalOpen(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordedFrames([]);
    setSignInput('');
  };

  const handleSaveSign = () => {
    const startIdx = Math.floor((trimRange[0] / 100) * recordedFrames.length);
    const endIdx = Math.floor((trimRange[1] / 100) * recordedFrames.length);
    const trimmedFrames = recordedFrames.slice(startIdx, endIdx);
    setSigns(prev => [...prev, {
      label: signLabel,
      frames: trimmedFrames.map(f => [f.timestamp, ...(f.flat56 || [])]),
    }]);

    setModalOpen(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordedFrames([]);
    setSignInput('');
  };
  const handleDownload = () => {
    if (signs.length === 0) return;

    try {
      // 1. Convert the signs object/array to a JSON string
      // The arguments (null, 2) add pretty-printing (indentation)
      const jsonString = JSON.stringify(signs, null, 2);

      // 2. Create a Blob with the JSON data
      const blob = new Blob([jsonString], { type: 'application/json' });

      // 3. Create an object URL for the Blob
      const url = URL.createObjectURL(blob);

      // 4. Create a temporary anchor element
      const link = document.createElement('a');
      link.href = url;
      link.download = 'signs-data.json'; // The filename for the user

      // 5. Append to body, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 6. Clean up the URL object to free up memory
      URL.revokeObjectURL(url);

      // Update your existing UI states
      //console.log("download submission:", signs);
      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus(null), 3000);
      setSigns([]);

    } catch (error) {
      console.error("Download failed:", error);
      setDownloadStatus('error');
    }
  };

  const handleRemoveSign = (idx) => {
    setSigns(prev => prev.filter((_, i) => i !== idx));
  };
  if (loading) return (<div className="min-h-screen bg-[#0d0f1a] font-sans text-slate-200 flex flex-col">
    <style>{`        
                          .loader-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100vw;
                            height: 100vh;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            background: linear-gradient(135deg, #1a1a2e, #0f3460); /* Color1 */
                            z-index: 9999; /* Ensures it stays on top */
                          }

                          .main-spinner {
                            width: 50px;
                            height: 50px;
                            border: 5px solid rgba(226, 185, 111, 0.2); /* Faded Color2 */
                            border-radius: 50%;
                            border-top-color: #e2b96f; /* Solid Color2 */
                            animation: spin 1s linear infinite;
                          }

                          @keyframes spin { 
                            to { transform: rotate(360deg); } 
                          }
                        `}
    </style>
    <div className="loader-overlay">
      <div className="main-spinner"></div>
    </div>
  </div>);

  return (
    <div className="min-h-screen bg-[#0d0f1a] font-sans text-slate-200 flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .rec-dot { animation: pulse 1.2s ease-in-out infinite; }
        .start-btn:hover     { background:#b91c1c !important; transform:translateY(-1px); }
        .calib-btn { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        .calib-btn:hover     { background:rgba(226,185,111,0.15) !important; transform:translateY(-1px); }
        .upload-btn:hover    { background:#0f3460 !important; transform:translateY(-1px); }
        .stop-modal-btn:hover{ background:#991b1b !important; transform:translateY(-1px); }
        .save-sign-btn:hover { background:#047857 !important; transform:translateY(-1px); }
        .discard-btn:hover   { background:rgba(239,68,68,0.15) !important; color:#ef4444 !important; }
        .logout-item:hover   { background:rgba(220,38,38,0.08) !important; color:#ef4444 !important; }
        .dd-item:hover       { background:rgba(255,255,255,0.05) !important; }
        .sign-tag:hover .remove-sign { opacity:1 !important; }
        input[type=range] { -webkit-appearance:none; appearance:none; height:4px; border-radius:4px; background:#2d3748; outline:none; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:#e2b96f; border:2px solid #1a1a2e; cursor:pointer; transition:transform 0.15s; }
        input[type=range]::-webkit-slider-thumb:hover { transform:scale(1.2); }
        input[type=range]::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:#e2b96f; border:2px solid #1a1a2e; cursor:pointer; }
      `}</style>

      {/* ── NAV ── */}
      <nav className="flex items-center justify-between px-7 h-[60px] bg-white/5 border-b border-white/5 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <Image src={logo} alt="Logo" width={44} height={44} className="rounded-lg" />
          <span className="font-serif text-[18px] font-semibold text-white tracking-wide">صوتك</span>
          <span className="text-white/15 text-base">|</span>
          <span className="text-[13px] text-slate-400 font-light">Glove Studio</span>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button className="flex items-center gap-[9px] py-1.5 pl-1.5 pr-3 bg-white/5 border border-white/10 rounded-full cursor-pointer" onClick={() => setDropdownOpen(o => !o)}>
            <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#0f3460] to-[#e2b96f] text-[#1a1a2e] flex items-center justify-center text-[11px] font-bold tracking-wide shrink-0">{user?.initials}</div>
            <span className="text-[13px] font-medium text-slate-200">{user?.username}</span>
            <span className="text-[10px] text-slate-400">{dropdownOpen ? '▲' : '▼'}</span>
          </button>
          {dropdownOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 bg-[#1a1f35] rounded-2xl shadow-2xl border border-white/10 min-w-[200px] overflow-hidden z-[100] animate-[slideDown_0.15s_ease]">
              <div className="flex items-center gap-3 py-3.5 px-4 bg-white/5">
                <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#0f3460] to-[#e2b96f] text-[#1a1a2e] flex items-center justify-center text-[11px] font-bold tracking-wide shrink-0" style={{width: 36, height: 36, fontSize: 13 }}>{user?.initials}</div>
                <div>
                  <div className="text-[13px] font-medium text-slate-200">{user?.username}</div>
                  <div className="text-[11px] text-slate-500">{userEmail}</div>
                </div>
              </div>
              <div className="h-[1px] bg-white/5" />
              <button onClick={() => router.push("/")} className="dd-item block w-full py-2.5 px-4 bg-transparent border-none text-left text-[13px] text-slate-400 cursor-pointer hover:bg-white/5 transition-colors font-sans">Home</button>
              <button onClick={() => router.push("/recording")} className="dd-item block w-full py-2.5 px-4 bg-transparent border-none text-left text-[13px] text-slate-400 cursor-pointer hover:bg-white/5 transition-colors font-sans">Recording</button>
              <button onClick={() => router.push("/legacy")} className="dd-item block w-full py-2.5 px-4 bg-transparent border-none text-left text-[13px] text-slate-400 cursor-pointer hover:bg-white/5 transition-colors font-sans">Legacy System</button>
              <button onClick={() => router.push("/models")} className="dd-item block w-full py-2.5 px-4 bg-transparent border-none text-left text-[13px] text-slate-400 cursor-pointer hover:bg-white/5 transition-colors font-sans">Models</button>
              <div className="h-[1px] bg-white/5" />
              <button onClick={() => router.push("/login")} className="logout-item block w-full py-2.5 px-4 bg-transparent border-none text-left text-[13px] text-slate-400 cursor-pointer hover:bg-white/5 transition-colors font-sans" style={{color: '#ef4444' }}>Sign out →</button>
            </div>
          )}
        </div>
      </nav>

      {/* ── BODY ── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_minmax(340px,35vw)] gap-[2.5vw] p-[2.5vw] max-w-[96vw] mx-auto w-full">

        {/* ── LEFT COL ── */}
        <div className="flex flex-col gap-[2vw] min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-serif text-[26px] font-semibold text-white mb-1">Glove Data Studio</h1>
              <p className="text-[13px] text-slate-500 font-light">Capture hand gesture sequences for your submission</p>
            </div>
          </div>

          {/* Live 3-D preview */}
          <div className="flex-1 min-h-[55vh] h-[60vh] max-h-[72vh] bg-gradient-to-br from-[#0a0c18] to-[#111827] rounded-[20px] border border-white/5 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)] relative">
            <div className="absolute top-3.5 left-4.5 z-10 text-[11px] font-medium text-slate-600 tracking-wider uppercase">LIVE PREVIEW</div>
            <Scene
              rigDataRef={latestRigDataRef}
              restRotationR={restRotationR}
              restRotationL={restRotationL}
              wristLimits={wristLimits}
              armLimits={armLimits}
              fingerLimits={fingerLimits}
              onRestPosesLoaded={handleRestPosesLoaded}
            />
            {!currentFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[13px] text-slate-600">Waiting for glove connection…</p>
              </div>
            )}
          </div>

          {/* Control row: always-visible buttons */}
          <div className="flex gap-3 items-center">
            {/* Tare IMU — always visible, primary action */}
            <button
              className="calib-btn flex items-center gap-2 py-2.5 px-5 bg-[#e2b96f]/10 text-[#e2b96f] border border-[#e2b96f]/25 rounded-xl text-sm font-medium cursor-pointer hover:bg-[#e2b96f]/20 transition-all font-sans" style={{background: 'rgba(96,165,250,0.08)', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.25)' }}
              onClick={() => runCommand(CMD.TARE_IMU)}
              disabled={!isConnected}
              title="Put your hand flat, then click to set the zero orientation."
            >
              Set Zero Point
            </button>
            {/* Calibrate toggle */}
            <button
              className="calib-btn flex items-center gap-2 py-2.5 px-5 bg-[#e2b96f]/10 text-[#e2b96f] border border-[#e2b96f]/25 rounded-xl text-sm font-medium cursor-pointer hover:bg-[#e2b96f]/20 transition-all font-sans"
              onClick={() => setCalibrationOpen(o => !o)}
            >
              Calibrate
            </button>
            {/* Reconnect button */}
            <button
              className="calib-btn flex items-center gap-2 py-2.5 px-5 bg-[#e2b96f]/10 text-[#e2b96f] border border-[#e2b96f]/25 rounded-xl text-sm font-medium cursor-pointer hover:bg-[#e2b96f]/20 transition-all font-sans" style={{background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}
              onClick={() => gloveFrame?.reconnect?.()}
              title="Force reconnect to the glove"
            >
              Reconnect
            </button>
            {currentFrame && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Connected
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COL ── */}
        <div className="flex flex-col gap-[1.6vw] min-w-0">

          {/* Main Tab Switcher */}
          <div className="flex gap-2.5 mb-5">
            <button
              onClick={() => setMainTab('exo')}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                background: mainTab === 'exo' ? 'rgba(226,185,111,0.15)' : 'rgba(255,255,255,0.04)',
                color: mainTab === 'exo' ? '#e2b96f' : '#718096',
                border: `1px solid ${mainTab === 'exo' ? 'rgba(226,185,111,0.35)' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.2s'
              }}
            >
              🦾 Exoskeleton Data
            </button>
            <button
              onClick={() => setMainTab('imu')}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                background: mainTab === 'imu' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                color: mainTab === 'imu' ? '#60a5fa' : '#718096',
                border: `1px solid ${mainTab === 'imu' ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.2s'
              }}
            >
              📡 IMU Data
            </button>
            <button
              onClick={() => setMainTab('cal')}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                background: mainTab === 'cal' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                color: mainTab === 'cal' ? '#34d399' : '#718096',
                border: `1px solid ${mainTab === 'cal' ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.2s'
              }}
            >
              ⚙ Calibration
            </button>
          </div>

          {mainTab === 'exo' && (
            <>
              {/* Sign recorder panel */}
              <div className="bg-white/5 border border-white/10 rounded-[18px] p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-slate-200 mb-1">Record a Sign</h3>
                  <p className="text-xs text-slate-500 font-light">Type the label, then start recording</p>
                </div>

                <div className="flex flex-col gap-2 mb-3.5">
                  <label className="text-xs text-slate-400 font-medium">Sign label</label>
                  <input
                    type="text"
                    placeholder='e.g. "hello"'
                    value={signInput}
                    onChange={e => setSignInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStartRecording()}
                    className="py-2.5 px-3.5 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-sm font-sans transition-colors focus:border-[#e2b96f]/50 focus:shadow-[0_0_0_3px_rgba(226,185,111,0.08)] outline-none"
                    onFocus={e => Object.assign(e.target.style, s.inputFocus)}
                    onBlur={e => Object.assign(e.target.style, { borderColor: 'rgba(255,255,255,0.10)', boxShadow: 'none' })}
                  />
                </div>

                <button
                  className="start-btn w-full flex items-center justify-center gap-2 p-3 bg-red-600 text-white rounded-xl text-sm font-medium cursor-pointer hover:bg-red-500 transition-colors font-sans" style={{opacity: signInput.trim() ? 1 : 0.45 }}
                  onClick={handleStartRecording}
                  disabled={!signInput.trim()}
                >
                  <span className="text-[10px]">●</span> Start Recording
                </button>
              </div>
            </>
          )}

          {mainTab === 'cal' && (
            <>
              {/* Cal Main Tabs */}
              <div className="flex gap-2.5 mb-4">
                <button
                  onClick={() => setCalMainTab('exo')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: calMainTab === 'exo' ? 'rgba(226,185,111,0.15)' : 'rgba(255,255,255,0.04)',
                    color: calMainTab === 'exo' ? '#e2b96f' : '#718096',
                  }}
                >🦾 Exoskeleton Calibration</button>
                <button
                  onClick={() => setCalMainTab('imu')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: calMainTab === 'imu' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                    color: calMainTab === 'imu' ? '#60a5fa' : '#718096',
                  }}
                >📡 IMU Calibration</button>
              </div>

              {/* Hand Toggle */}
              <div className="flex gap-2 mt-0 mb-4 bg-black/20 p-1.5 rounded-lg border border-white/5">
                {['right', 'left'].map(hand => (
                  <button
                    key={hand}
                    onClick={() => setCalHand(hand)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: calHand === hand ? '#60a5fa' : 'transparent',
                      color: calHand === hand ? '#000' : '#a0aec0',
                      textTransform: 'uppercase',
                    }}
                  >
                    {hand} Hand
                  </button>
                ))}
              </div>

              {calMainTab === 'exo' && (
                <div className="bg-white/5 border border-white/10 rounded-[18px] p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-200 mb-1">⚙ Exoskeleton Calibration</h3>
                    <p className="text-xs text-slate-500 font-light">Guide the glove through its full calibration workflow</p>
                  </div>

                  {calError && <div className="text-[11px] text-red-500 mb-2">{calError}</div>}

                  {/* NVS load banner */}
                  {nvsBannerVisible && (
                    <div className="py-2.5 px-3 mb-3 bg-blue-400/10 border border-blue-400/30 rounded-xl text-[11px] text-blue-400">
                      ℹ Calibration loaded from device — voltage knots are not shown here (firmware does not send readback). Angle outputs will be correct.
                    </div>
                  )}

                  {/* Cal Status inline */}
                  <CalStatusStrip calStatus={calHand === 'left' ? (currentFrame?.leftCalStatus ?? 0) : (currentFrame?.calStatus ?? 0)} knotsByAxis={knotsByAxis} fingerDefaults={activeFingerDefaults} />


                  {/* Tab navigation */}
                  <div className="flex gap-1 mt-3.5 mb-0.5 border-b border-white/5 pb-0">
                    {[['voltages', 'Voltages'], ['knots', 'Knot Wizard'], ['coupling', 'Coupling'], ['manage', 'Manage']].map(([tab, label]) => (
                      <button key={tab} onClick={() => setCalTab(tab)}
                        style={{
                          padding: '7px 12px', fontSize: 11, fontWeight: 600, borderRadius: '8px 8px 0 0', cursor: 'pointer', border: 'none', fontFamily: "'DM Sans', sans-serif",
                          background: calTab === tab ? 'rgba(226,185,111,0.12)' : 'transparent',
                          color: calTab === tab ? '#e2b96f' : '#718096',
                          borderBottom: calTab === tab ? '2px solid #e2b96f' : '2px solid transparent',
                        }}>{label}</button>
                    ))}
                  </div>

                  {/* ── TAB: VOLTAGES ── */}
                  {calTab === 'voltages' && (
                    <div className="mt-3">
                      <LiveVoltageMonitor voltages={rawVoltages} sensorHealth={sensorHealth} labels={activeChannelLabels} />
                    </div>
                  )}

                  {/* ── TAB: KNOT WIZARD ── */}
                  {calTab === 'knots' && (
                    <div className="mt-3">
                      {/* Dynamic Global Cal */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">⚡ Dynamic Calibration (all fingers at once)</div>
                        <p className="text-[11px] text-slate-500 mb-2">Open and close your hand slowly — spread and curl all fingers. System records all 16 sensors simultaneously.</p>
                        <div className="flex items-center gap-2.5 mb-2">
                          <label className="text-[11px] text-slate-400">Duration (s)</label>
                          <input type="number" min="3" max="30" step="1"
                            className="w-[70px] py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50" style={{width: 60 }} value={dynCalDuration}
                            onChange={e => setDynCalDuration(Math.max(3, parseInt(e.target.value, 10) || 8))}
                            disabled={dynCalRecording} />
                        </div>
                        <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors" style={{width: '100%', padding: '10px', fontSize: 13,
                          background: dynCalRecording ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.12)',
                          color: dynCalRecording ? '#ef4444' : '#34d399',
                          borderColor: dynCalRecording ? 'rgba(239,68,68,0.30)' : 'rgba(52,211,153,0.30)'
                        }}
                          onClick={startDynamicCal} disabled={!isConnected || dynCalRecording || captureBusy}>
                          {dynCalRecording ? `Recording… ${dynCalCountdown}s remaining` : 'Start Dynamic Calibration'}
                        </button>
                      </div>

                      {/* Step-by-step Wizard */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">Step-by-Step Axis Wizard</div>
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <label className="text-[11px] text-slate-400">Finger</label>
                          <select className="py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50" value={calFinger} onChange={e => { setCalFinger(parseInt(e.target.value, 10)); setSanityWarnings([]); }}>
                            {CAL_FINGER_NAMES.map((name, idx) => <option key={name} value={idx}>{name}</option>)}
                          </select>
                          <label className="text-[11px] text-slate-400">Axis</label>
                          <select className="py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50" value={calAxis} onChange={e => { setCalAxis(parseInt(e.target.value, 10)); setSanityWarnings([]); }}>
                            {CAL_AXIS_NAMES.map((name, idx) => (
                              <option key={name} value={idx} disabled={activeFingerDefaults[calFinger][idx] === -1}>{name}</option>
                            ))}
                          </select>
                        </div>
                        {/* Live voltage for this axis */}
                        {axisAvailable && (() => {
                          const sensorIdx = activeFingerDefaults[calFinger][calAxis];
                          const liveV = rawVoltages[sensorIdx];
                          return (
                            <div className="flex justify-between items-center mb-2 py-1.5 px-2.5 bg-white/5 rounded-lg text-[11px]">
                              <span className="text-slate-500">ch{sensorIdx} live voltage:</span>
                              <span className="tabular-nums font-semibold" style={{ color: voltageToColor(liveV) }}>
                                {Number.isFinite(liveV) ? `${liveV.toFixed(3)} V` : '---'}
                              </span>
                            </div>
                          );
                        })()}
                        {/* Sanity warnings */}
                        {sanityWarnings.length > 0 && (
                          <div className="mb-2.5 py-2.5 px-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                            {sanityWarnings.map((w, i) => <div key={i} className="text-[11px]" style={{ color: w.startsWith('ℹ') ? '#60a5fa' : '#ef4444', marginBottom: i < sanityWarnings.length - 1 ? 4 : 0 }}>{w}</div>)}
                          </div>
                        )}
                        {/* Steps */}
                        <div className="flex flex-col gap-1.5 mb-2.5">
                          {CALIBRATION_STEPS.map((step, idx) => {
                            const value = axisKnots[idx];
                            const done = Number.isFinite(value);
                            const active = idx === nextStepIdx;
                            return (
                              <div key={step.pct} className="flex justify-between py-1.5 px-2 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-400" style={{...(done ? s.calStepDone : null), ...(active ? s.calStepActive : null) }}>
                                <span>{step.label}</span>
                                <span>{done ? `${value.toFixed(3)}V` : (active ? '← next' : '---')}</span>
                              </div>
                            );
                          })}
                        </div>
                        {nextStepIdx !== -1 && <p className="text-[11px] text-slate-500 mb-2">Hold <strong>{CAL_FINGER_NAMES[calFinger]} {CAL_AXIS_NAMES[calAxis]}</strong> at <strong>{CALIBRATION_STEPS[nextStepIdx]?.pct}%</strong> then press Capture.</p>}
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors" onClick={captureStep}
                            disabled={!isConnected || !axisAvailable || nextStepIdx === -1}>
                            Capture
                          </button>
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors" onClick={resetAxis}>Reset</button>
                          <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors" style={{opacity: axisComplete ? 1 : 0.5 }} onClick={sendKnots} disabled={!isConnected || !axisComplete}>
                            Send Knots
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── TAB: COUPLING ── */}
                  {calTab === 'coupling' && (
                    <div className="mt-3">
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">🔗 Cross-Axis Coupling Compensation</div>
                        <p className="text-[11px] text-slate-500 mb-2">Compensates for magnetic interference between adjacent sensors. Set all 4 coefficients per finger then Apply.</p>
                        <CouplingCalibrationUI
                          couplingByFinger={couplingByFinger}
                          setCouplingByFinger={setCouplingByFinger}
                          couplingFinger={couplingFinger}
                          setCouplingFinger={setCouplingFinger}
                          onApply={sendCouplingSliders}
                          isConnected={isConnected}
                          takeMedianSamples={takeMedianSamples}
                          setCalError={setCalError}
                          fingerDefaults={activeFingerDefaults}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── TAB: MANAGE ── */}
                  {calTab === 'manage' && (
                    <div className="mt-3 flex flex-col gap-2.5">
                      {/* IMU Commands */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">🧭 IMU Commands</div>
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors" onClick={() => runCommand(CMD.START_BOOT_CAL)} disabled={!isConnected}>Boot Cal</button>
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors" onClick={() => runCommand(CMD.START_MAG_CAL)} disabled={!isConnected}>Mag Cal</button>
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors" onClick={() => runCommand(CMD.END_MAG_CAL)} disabled={!isConnected}>End Mag</button>
                        </div>
                      </div>
                      {/* NVS Save/Load */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">NVS Flash</div>
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors flex-1" onClick={() => runCommand(CMD.SAVE_CAL)} disabled={!isConnected}>Save to Flash</button>
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors flex-1" onClick={handleLoadCalNVS} disabled={!isConnected}>Load from Flash</button>
                        </div>
                      </div>
                      {/* Export / Import */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">Export / Import JSON</div>
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors flex-1" onClick={handleExportCal}>Export Cal JSON</button>
                          <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors flex-1" onClick={() => importInputRef.current?.click()}>Import Cal JSON</button>
                          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportCal} />
                        </div>
                        <p className="text-[11px] text-slate-500 mb-2">JSON includes all knots and coupling coefficients. Import sends CMD 0x10 and 0x11 for all axes automatically.</p>
                      </div>
                      {/* Connection Settings */}
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">🌐 Connection Settings</div>
                        <p className="text-[11px] text-slate-500 mb-2">Set the WebSocket IP address of the Master ESP32.</p>
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <label className="text-[11px] text-slate-400">IP Address</label>
                          <input
                            type="text"
                            className="w-[70px] py-1.5 px-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-[11px] focus:outline-none focus:border-[#e2b96f]/50 flex-1"
                            value={ipInput}
                            onChange={e => setIpInput(e.target.value)}
                            placeholder="e.g. 192.168.1.17"
                          />
                          <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors" onClick={handleApplyIp}>
                            Connect
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}


              {calMainTab === 'imu' && (
                <div className="bg-white/5 border border-white/10 rounded-[18px] p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-200 mb-1">🧭 IMU Pipeline</h3>
                    <p className="text-xs text-slate-500 font-light">Step-by-step Mahony filter initialization</p>
                  </div>
                  {calError && <div className="text-[11px] text-red-500 mb-2">{calError}</div>}

                  <div className="flex flex-col gap-4 mt-3">

                    <AxisMappingWidget hand={calHand} />
                    <AlignmentPanel modelAlign={calHand === 'left' ? modelAlignLeft : modelAlignRight} setModelAlign={calHand === 'left' ? setModelAlignLeft : setModelAlignRight} onCalibrate={calibrateMountOffsets} onTare={tareHeading} />

                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">1. Boot Calibration</div>
                      <p className="text-[11px] text-slate-500 mb-2">Resets the filters and captures resting gyro biases. Keep arm still for 2 seconds.</p>
                      <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors w-full" onClick={() => runCommand(CMD.START_BOOT_CAL)} disabled={!isConnected}>
                        Start Boot Calibration
                      </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">2. Magnetometer Calibration</div>
                      <p className="text-[11px] text-slate-500 mb-2">Wave the arm in an aggressive figure-8 pattern to map the local magnetic hard-iron offsets.</p>
                      <div className="flex items-center flex-wrap gap-2 mb-2.5">
                        <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors flex-1" onClick={() => runCommand(CMD.START_MAG_CAL)} disabled={!isConnected}>Start Sweep</button>
                        <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors flex-1" onClick={() => runCommand(CMD.END_MAG_CAL)} disabled={!isConnected}>Finish & Save</button>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wide">3. 3-Pose Static Alignment</div>
                      <p className="text-[11px] text-slate-500 mb-2">Align the coordinate frames by holding 3 distinct poses:<br />
                        Pose 1: Arm straight down at your side, palm facing inward.<br />
                        Pose 2: Arm straight out to the side, palm facing down.<br />
                        Pose 3: Arm straight forward, palm faces inward (to the side).<br />
                        Click Record for each.
                      </p>
                      <div className="flex gap-2 mb-2">
                        <button className="py-2 px-2.5 bg-white/5 text-slate-400 border border-white/10 rounded-lg text-xs cursor-pointer font-sans hover:bg-white/10 transition-colors flex-1" onClick={() => runCommand(CMD.START_STATIC_ALIGN)} disabled={!isConnected}>
                          Start Alignment
                        </button>
                        <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors flex-[2]" style={{ background: (calHand === 'right' ? gloveFrame.imuPoseIdx : gloveFrame.imuPoseIdxL) < 3 ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)' }}
                          onClick={() => {
                            if ((calHand === 'right' ? gloveFrame.imuPoseIdx : gloveFrame.imuPoseIdxL) < 3) {
                              runCommand(CMD.RECORD_STATIC_POSE);
                            }
                          }}
                          disabled={!isConnected || (calHand === 'right' ? gloveFrame.imuPoseIdx : gloveFrame.imuPoseIdxL) >= 3}>
                          Record Pose {(calHand === 'right' ? gloveFrame.imuPoseIdx : gloveFrame.imuPoseIdxL) < 3 ? (calHand === 'right' ? gloveFrame.imuPoseIdx : gloveFrame.imuPoseIdxL) + 1 : 'Complete'}
                        </button>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors flex-1" style={{ borderColor: magEnabled ? '#34d399' : '#ef4444', color: magEnabled ? '#34d399' : '#ef4444' }} onClick={toggleMagUsage} disabled={!isConnected}>
                          Magnetometer Usage: {magEnabled ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </div>
                      <button className="py-2 px-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-lg text-xs cursor-pointer font-sans hover:bg-[#e2b96f]/10 transition-colors" style={{width: '100%', borderColor: '#60a5fa', color: '#60a5fa' }} onClick={() => runCommand(CMD.ENTER_RUNNING)} disabled={!isConnected}>
                        Skip to RUNNING State (Quick Test)
                      </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5" style={{background: '#000', padding: '8px', border: '1px solid #333', overflow: 'hidden' }}>
                      <div className="text-[10px] text-gray-500 uppercase mb-1 tracking-[1px] font-bold">Firmware Logs</div>
                      <div className="h-[140px] overflow-y-auto flex flex-col-reverse font-mono text-[11px] text-slate-400">
                        {[...(gloveFrame.consoleLogs?.[calHand] || [])].reverse().map((log, idx) => (
                          <div key={idx} className="whitespace-pre-wrap break-all">{log.trim()}</div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </>
          )}

          {mainTab === 'exo' && (
            <>
              {/* Signs collected */}
              <div className="bg-white/5 border border-white/10 rounded-[18px] p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-slate-200 mb-1">Recorded Signs</h3>
                  <p className="text-xs text-slate-500 font-light">{signs.length} sign{signs.length !== 1 ? 's' : ''} in this submission</p>
                </div>

                {signs.length === 0 ? (
                  <div className="flex flex-col items-center py-6 px-3 bg-white/5 rounded-xl border border-dashed border-white/10">
                    <span className="text-2xl opacity-30 mb-2">✋</span>
                    <p className="text-xs text-slate-600 text-center">No signs yet — record your first one</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {signs.map((sign, idx) => (
                      <div key={idx} className="sign-tag flex items-center justify-between py-2.5 px-3.5 bg-white/5 rounded-xl border border-white/10 transition-colors hover:border-[#e2b96f]/30 group">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5.5 h-5.5 rounded-full bg-[#e2b96f]/15 text-[#e2b96f] flex items-center justify-center text-[11px] font-bold">{idx + 1}</span>
                          <div>
                            <div className="text-[13.5px] font-medium text-slate-200">{sign.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {sign.frames.length} frames · {(sign.frames.length / 60).toFixed(1)}s
                            </div>
                          </div>
                        </div>
                        <button
                          className="remove-sign p-1 px-2 bg-transparent text-red-500 cursor-pointer text-xs opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-red-500/10"
                          onClick={() => handleRemoveSign(idx)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Download submission */}
              <div className="bg-white/5 border border-white/10 rounded-[18px] p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-slate-200 mb-1">Download Submission</h3>
                  <p className="text-xs text-slate-500 font-light">Download all recorded signs as a JSON file</p>
                </div>

                <button
                  className="upload-btn w-full p-3 bg-[#1a1a2e] text-[#e2b96f] border border-[#e2b96f]/25 rounded-xl text-sm font-medium cursor-pointer hover:bg-[#e2b96f]/10 transition-colors font-sans tracking-wide" style={{opacity: signs.length > 0 ? 1 : 0.4 }}
                  onClick={handleDownload}
                  disabled={signs.length === 0}
                >
                  {downloadStatus === 'success' ? '✓ Downloaded!' : `Download ${signs.length} Sign${signs.length !== 1 ? 's' : ''} →`}
                </button>

                {downloadStatus === 'success' && (
                  <div className="mt-3 py-2.5 px-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-[12.5px] text-emerald-400">
                    Submission downloaded successfully.
                  </div>
                )}
                {signs.length === 0 && (
                  <p className="mt-2.5 text-[11.5px] text-slate-600">Add at least one sign before downloading.</p>
                )}
              </div>

              {/* DEV-only live sensor panels */}
              {DEV_MODE && <FingerAnglesPanel frame={currentFrame} calStatus={currentFrame?.calStatus ?? 0} />}
              {DEV_MODE && <CalStatusStrip calStatus={currentFrame?.calStatus ?? 0} knotsByAxis={knotsByAxis} fingerDefaults={HAND_CHANNEL_MAPS.right.fingerDefaults} />}
            </>
          )}

          {mainTab === 'imu' && (
            <>
              <IMUDiagnosticsPanel
                diag={currentFrame?.imuDiag ?? null}
                imuQuat={currentFrame?.imuQuat ?? null}
                leftImuQuat={currentFrame?.leftImuQuat ?? null}
                dualImuStatus={currentFrame?.dualImuStatus ?? null}
              />
            </>
          )}

        </div>
      </div>

      {/* ── RECORDING MODAL ── */}
      {modalOpen && (
        <RecordingModal
          signLabel={signLabel}
          isRecording={isRecording}
          frames={recordedFrames}
          trimRange={trimRange}
          setTrimRange={setTrimRange}
          onStop={handleStopRecording}
          onDiscard={handleDiscardSign}
          onSave={handleSaveSign}
          currentFrame={currentFrame}
          calibrate={calibrateRef}
          restRotationR={restRotationR}
          restRotationL={restRotationL}
          wristLimits={wristLimits}
          armLimits={armLimits}
          fingerLimits={fingerLimits}
          restPosesRef={restPosesRef}
          computeRigFromFrame={computeRigFromFrame}
        />
      )}
      {/* ── DEV TOOLS PANEL (hidden in production) ── */}
      {DEV_MODE && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: 'rgba(10,12,28,0.97)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16, overflow: 'hidden', backdropFilter: 'blur(12px)',
          width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        }}>

          <RestPoseTuner 
            tunerOpen={tunerOpen} setTunerOpen={setTunerOpen}
            restRotationR={restRotationR} setR={setR}
            restRotationL={restRotationL} setL={setL}
            manualArmsEnable={manualArmsEnable} setManualArmsEnable={setManualArmsEnable}
            manualRightArm={manualRightArm} setManualRightArm={setManualRightArm}
            manualLeftArm={manualLeftArm} setManualLeftArm={setManualLeftArm}
          />
          <BiomechanicalLimits 
            bioOpen={bioOpen} setBioOpen={setBioOpen}
            wristLimits={wristLimits} setWristLimits={setWristLimits}
            armLimits={armLimits} setArmLimits={setArmLimits}
            fingerLimits={fingerLimits} setFingerLimits={setFingerLimits}
            bioFingerTab={bioFingerTab} setBioFingerTab={setBioFingerTab}
          />
          <ManualFingers 
            manualFingersEnable={manualFingersEnable} setManualFingersEnable={setManualFingersEnable}
            manualFingers={manualFingers} setManualFingers={setManualFingers}
            manualThumbExtra={manualThumbExtra} setManualThumbExtra={setManualThumbExtra}
          />
        </div>
      )}
    </div>
  );
}
