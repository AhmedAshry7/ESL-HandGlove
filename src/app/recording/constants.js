// ─── IMU Axis Mapping (Mutable Global) ──────────────────────────────────────
export let __imuAxisConfig = {
  right: { order: 'zxy', sX: -1, sY: -1, sZ: 1, sW: 1 },
  left: { order: 'zxy', sX: -1, sY: -1, sZ: 1, sW: 1 }
};
// ─── Sensor readings panel ───────────────────────────────────────────────────

export const FINGER_LABELS = [
  { label: 'Pinky Yaw', idx: 0 },
  { label: 'Pinky MCP', idx: 1 },
  { label: 'Pinky PIP', idx: 2 },
  { label: 'Ring Yaw', idx: 3 },
  { label: 'Ring MCP', idx: 4 },
  { label: 'Ring PIP', idx: 5 },
  { label: 'Middle Yaw', idx: 6 },
  { label: 'Middle MCP', idx: 7 },
  { label: 'Middle PIP', idx: 8 },
  { label: 'Index Yaw', idx: 9 },
  { label: 'Index MCP', idx: 10 },
  { label: 'Index PIP', idx: 11 },
  { label: 'Thumb Yaw', idx: 12 },
  { label: 'Thumb MCP', idx: 13 },
  { label: 'Thumb PIP', idx: 14 },
  { label: 'Thumb DIP', idx: 15 },
];
export const UNIFIED_PACKET_HEADER = 0x45534C47; // "ESLG"

export const DEG2RAD = Math.PI / 180;
export const CAL_ALL_FINGERS = 0b00011111; // 0x1F — all 5 fingers calibrated

export const CMD = {
  TARE_IMU: 0x01,
  START_BOOT_CAL: 0x02,
  START_MAG_CAL: 0x03,
  END_MAG_CAL: 0x04,
  START_STATIC_ALIGN: 0x05,
  RECORD_STATIC_POSE: 0x06,
  ENTER_RUNNING: 0x07,
  SET_MAG_USAGE: 0x08,
  SET_KNOTS: 0x10,
  SET_COUPLING: 0x11,
  SAVE_CAL: 0x12,
  LOAD_CAL: 0x13,
  SET_IMU_CAL: 0x14,
  SWITCH_TO_WIFI: 0x20,
  SWITCH_TO_BLE: 0x21,
  REQUEST_RAW: 0x30,
  REQ_IMU_CAL: 0x31,
  DEVICE_RESET: 0xFF,
};

export const CALIBRATION_STEPS = [
  { pct: 0, label: '0% - flat / relaxed / furthest left' },
  { pct: 25, label: '25% - slight curl' },
  { pct: 50, label: '50% - mid curl / centered' },
  { pct: 75, label: '75% - strong curl' },
  { pct: 100, label: '100% - fully curled / furthest right' },
];

export const CAL_FINGER_NAMES = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb'];
export const CAL_AXIS_NAMES = ['Yaw', 'Pitch 1', 'Pitch 2', 'Thumb IP'];
export const COUPLING_LABELS_STANDARD = ['p2→p1', 'yaw→p1', 'yaw→p2', 'p1→p2'];
export const COUPLING_LABELS_THUMB = ['p2→p1', 'yaw→p1', 'yaw→p2', 'p1→p2', 'ip→p1', 'yaw→ip'];

export const HAND_CHANNEL_MAPS = {
  right: {
    labels: [
      'Middle / Yaw',    // ch0
      'Index / Yaw',    // ch1
      'Index / P1',     // ch2
      'Index / P2',     // ch3
      'Thumb / IP',     // ch4
      'Thumb / P2',     // ch5
      'Thumb / P1',     // ch6
      'Thumb / Yaw',    // ch7
      'Pinky / Yaw',    // ch8
      'Pinky / P1',     // ch9
      'Pinky / P2',     // ch10
      'Ring / Yaw',     // ch11
      'Ring / P1',      // ch12
      'Ring / P2',      // ch13
      'Middle / P2',    // ch14
      'Middle / P1',    // ch15
    ],
    fingerDefaults: [
      [8, 9, 10, -1],   // Pinky:  yaw=ch8,  p1=ch9,  p2=ch10
      [11, 12, 13, -1], // Ring:   yaw=ch11, p1=ch12, p2=ch13
      [0, 15, 14, -1],  // Middle: yaw=ch0,  p1=ch15, p2=ch14
      [1, 2, 3, -1],    // Index:  yaw=ch1,  p1=ch2,  p2=ch3
      [7, 6, 5, 4],     // Thumb:  yaw=ch7,  p1=ch6,  p2=ch5,  ip=ch4
    ],
  },
  left: {
    labels: [
      'Pinky / P1',    // ch0
      'Pinky / Yaw',    // ch1
      'Ring / P2',     // ch2
      'Pinky / P2',     // ch3
      'Ring / P1',     // ch4
      'Ring / Yaw',     // ch5
      'Middle / P2',     // ch6
      'Middle / P1',    // ch7
      'Thumb / Yaw',    // ch8
      'Thumb / P1',     // ch9
      'Thumb / P2',     // ch10
      'Thumb / IP',     // ch11
      'Middle / Yaw',      // ch12
      'Index / Yaw',      // ch13
      'Index / P2',    // ch14
      'Index / P1',    // ch15
    ],
    fingerDefaults: [
      [1, 0, 3, -1],   // Pinky:  yaw=ch8,  p1=ch9,  p2=ch10
      [5, 4, 2, -1], // Ring:   yaw=ch11, p1=ch12, p2=ch13
      [12, 7, 6, -1],  // Middle: yaw=ch0,  p1=ch15, p2=ch14
      [13, 15, 14, -1],    // Index:  yaw=ch1,  p1=ch2,  p2=ch3
      [8, 9, 10, 11],     // Thumb:  yaw=ch7,  p1=ch6,  p2=ch5,  ip=ch4
    ],
  },
};
export const DEFAULT_SAMPLE_COUNT = 10;
export const DEFAULT_SAMPLE_DELAY_MS = 0;

// ADS1115 GAIN_TWO: SS49E sensor valid range and expected span
export const VOLTAGE_MIN_VALID = 0.3;   // below = sensor disconnected
export const VOLTAGE_MAX_VALID = 2.1;   // above = out of ADS range
export const VOLTAGE_NEUTRAL = 1.5;   // ~0mT, neutral position
export const VOLTAGE_FULL_SCALE = 2.5;   // used for bar fill (%)
export const SENSOR_MIN_SPAN = 0.2;   // warn if range < 0.2V
export const SENSOR_DEAD_THRESH = 0.1;   // flag dead if var < 0.1V over 30s

export const EMPTY_FINGER = { yaw: 0, pitch1: 0, pitch2: 0 };
export const DEFAULT_FINGER_LIMITS = { pitchMin: 0, pitchMax: 100, yawMin: -20, yawMax: 20 };
// Finger index (0=Pinky…4=Thumb) for each sensor channel
export const CH_FINGER_IDX = [2, 3, 3, 3, 4, 4, 4, 4, 0, 0, 0, 1, 1, 1, 2, 2];
// ─── Calibration Status Strip ─────────────────────────────────────────────────
// 3-state: grey=not cal, yellow=knots sent (UI), green=firmware confirms calibrated
export const CAL_FINGER_ORDER = [
  { label: 'Pinky', bit: 0 },
  { label: 'Ring', bit: 1 },
  { label: 'Mid', bit: 2 },
  { label: 'Index', bit: 3 },
  { label: 'Thumb', bit: 4 },
];