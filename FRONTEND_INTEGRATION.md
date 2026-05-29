# ESL Glove — Frontend (React Three Fiber) Integration Guide

## Overview

This document is the single source of truth for connecting a React Three Fiber (R3F)
frontend to the ESP32 glove firmware running in **WiFi mode** (WebSocket on port 81).

The firmware streams two types of binary packets:

| Packet | Header | Size | Contents |
|--------|--------|------|----------|
| **IMU** | `0xAABBCCDD` | 90 bytes | Hand orientation quaternion + diagnostic fields |
| **Finger** | `0xF1F2F3F4` | 73 bytes | Per-finger yaw / pitch1 / pitch2 angles + calibration status |
| **Raw Voltages** | `0xC0DEC0DE` | 72 bytes | 16 raw hall-sensor voltages (calibration tool) |

All values are **little-endian** IEEE 754 floats unless otherwise noted.

---

## 1. WebSocket Connection

```javascript
const GLOVE_IP = '192.168.1.8';   // Read from ESP32 serial monitor
const WS_PORT  = 81;

const ws = new WebSocket(`ws://${GLOVE_IP}:${WS_PORT}`);
ws.binaryType = 'arraybuffer';

ws.onopen    = () => console.log('[Glove] Connected');
ws.onclose   = () => console.log('[Glove] Disconnected');
ws.onerror   = (e) => console.error('[Glove] WS error:', e);
```

### Packet Dispatch

```javascript
ws.onmessage = async (event) => {
  const buffer = event.data instanceof ArrayBuffer
    ? event.data
    : await event.data.arrayBuffer();

  const view   = new DataView(buffer);
  const header = view.getUint32(0, true);   // all headers are LE uint32

  if      (header === 0xAABBCCDD) handleIMUPacket(view);
  else if (header === 0xF1F2F3F4) handleFingerPacket(view);
  else if (header === 0xC0DEC0DE) handleRawVoltagesPacket(view);
};
```

---

## 2. IMU Packet — Wrist / Hand Orientation

**Header**: `0xAABBCCDD`  
**Firmware struct**: `IMUPacket` in `config.h`  
**Total size**: 90 bytes (packed, `#pragma pack(1)`)

### Full Binary Layout

```
Offset  Size  Type     Field
------  ----  -------  ----------------------------------------
  0      4    uint32   header            (0xAABBCCDD)
  4      4    uint32   timestamp         (µs since boot)
  8      4    float32  q_w               ← quaternion W
 12      4    float32  q_x               ← quaternion X
 16      4    float32  q_y               ← quaternion Y
 20      4    float32  q_z               ← quaternion Z
 24      4    float32  accel_ref_mag
 28      4    float32  accel_curr_mag
 32      4    float32  time_since_good_accel  (seconds)
 36      4    float32  drift_exposure         (seconds; high = drift risk)
 40      4    float32  mag_ref_mag
 44      4    float32  mag_curr_mag
 48      4    float32  time_since_good_mag    (seconds)
 52      4    float32  yaw_offset
 56      4    float32  yaw_err
 60      4    float32  h_ref_x
 64      4    float32  h_ref_y
 68      4    float32  env_stable_sec
 72      4    float32  ref_dip
 76      4    float32  current_dip
 80      4    float32  mag_stability     (0.0 – 1.0; 1.0 = stable)
 84      4    float32  debug_residual
 --- (4 more debug floats skipped) ---
 [86]    1    uint8    use_mag           (1 = magnetometer active)
 [87]    1    uint8    env_change_eligible
```

> **Note**: `ENABLE_IMU` is currently `0` in `config.h`, so the IMU packet is **not broadcast**.
> To enable wrist rotation, set `ENABLE_IMU 1` and reflash. When disabled, only Finger packets stream.

### Parsing the Quaternion

```javascript
function handleIMUPacket(view) {
  if (view.byteLength < 24) return;

  const timestamp = view.getUint32(4, true);

  // Firmware sends [w, x, y, z] — map to Three.js [x, y, z, w]
  const qw = view.getFloat32( 8, true);
  const qx = view.getFloat32(12, true);
  const qy = view.getFloat32(16, true);
  const qz = view.getFloat32(20, true);
  const imuQuat = [qx, qy, qz, qw];   // Three.js / R3F order

  // ── Diagnostic fields (for HUD / debug overlay) ──
  const driftExposure      = view.getFloat32(36, true); // seconds of low-accel exposure
  const magStability       = view.getFloat32(80, true); // 0–1; show warning if < 0.7
  const useMag             = view.byteLength > 86 ? view.getUint8(86) : 0;
  const timeSinceGoodAccel = view.getFloat32(32, true);
  const timeSinceGoodMag   = view.getFloat32(48, true);

  // Pass to 3-D scene
  applyWristOrientation(imuQuat);

  // Optional diagnostics HUD
  updateIMUDiagnostics({
    timestamp,
    driftExposure,
    magStability,
    useMag: !!useMag,
    timeSinceGoodAccel,
    timeSinceGoodMag,
  });
}
```

### Applying to Wrist Bone (ArmModel)

The `ArmModel` / `CombinedArmRig` component consumes a `rigData` prop shaped as:

```javascript
// rigData shape ─────────────────────────────────────────────────
{
  palm:    [qx, qy, qz, qw],   // hand/wrist bone quaternion — drives wrist rotation
  fingers: [                    // 16-element array of [qx, qy, qz, qw] per bone slot
    /* [0]  thumb01  MCP  */ [qx, qy, qz, qw],
    /* [1]  thumb02  PIP  */ [qx, qy, qz, qw],
    /* [2]  thumb03  IP   */ [qx, qy, qz, qw],
    /* [3]  index01  MCP  */ [qx, qy, qz, qw],
    /* [4]  index02  PIP  */ [qx, qy, qz, qw],
    /* [5]  index03  DIP  */ [qx, qy, qz, qw],
    /* [6]  middle01 MCP  */ [qx, qy, qz, qw],
    /* [7]  middle02 PIP  */ [qx, qy, qz, qw],
    /* [8]  middle03 DIP  */ [qx, qy, qz, qw],
    /* [9]  ring01   MCP  */ [qx, qy, qz, qw],
    /* [10] ring02   PIP  */ [qx, qy, qz, qw],
    /* [11] ring03   DIP  */ [qx, qy, qz, qw],
    /* [12] pinky01  MCP  */ [qx, qy, qz, qw],
    /* [13] pinky02  PIP  */ [qx, qy, qz, qw],
    /* [14] pinky03  DIP  */ [qx, qy, qz, qw],
    /* [15] pinky03  end  */ [qx, qy, qz, qw],
  ],
}
```

The `ArmModel` component wires `rigData.palm` directly to the wrist bone (`handR_010` /
`handL_031`) via slerp at 18 % per frame:

```jsx
import { ArmModel } from './components/ArmModel';

// Inside your R3F Canvas:
<ArmModel
  rightHandSensorData={rigData}   // { palm, fingers }
  leftHandSensorData={rigData}
  restRotationR={[-3.15,  2.29, 3.15]}
  restRotationL={[-3.15, -2.29, 3.15]}
/>
```

When `palm` is `undefined` / `null`, the hand falls back to the rest rotation (Euler XYZ).

---

## 3. Coordinate System & Axis Mapping

```
ESP32 ICM-20948 body frame:         Three.js / R3F world frame:
    +X = glove forward (fingertips)      +X = right
    +Y = glove left                      +Y = up
    +Z = glove up (back of hand)         +Z = toward camera

Quaternion field order:
    Firmware → [q_w, q_x, q_y, q_z]
    Three.js  → new THREE.Quaternion(x, y, z, w)   ← swap w to last
```

If the wrist rotates on the wrong axis, apply a coordinate-fix quaternion:

```javascript
import * as THREE from 'three';

// Rotate 90° around X to align ESP NED-ish frame to Three.js Y-up
const COORD_FIX = new THREE.Quaternion()
  .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

function applyWristOrientation([qx, qy, qz, qw]) {
  const q = new THREE.Quaternion(qx, qy, qz, qw).multiply(COORD_FIX);
  wristBone.quaternion.slerp(q, 0.18);
}
```

Test systematically: hold the glove flat → wrist should be horizontal. Tilt forward → hand tilts forward. If any axis is inverted, negate that component of the quaternion.

---

## 4. Finger Packet — Joint Angles

**Header**: `0xF1F2F3F4`  
**Firmware struct**: `FingerPacket` in `config.h`  
**Total size**: 73 bytes

### Binary Layout

```
Offset  Size  Type     Field
------  ----  -------  -----------------------------------------
  0      4    uint32   header          (0xF1F2F3F4)
  4      4    uint32   timestamp       (µs since boot)
  8     60    float32  angles[5][3]    5 fingers × [yaw°, pitch1°, pitch2°]
 68      4    float32  thumb_extra     Thumb IP joint angle (°)
 72      1    uint8    cal_status      Bitmask: bit N = finger N calibrated
                                        bit0=Pinky, bit1=Ring, bit2=Middle,
                                        bit3=Index, bit4=Thumb
```

### Finger Order in Packet

| Index | Finger | yaw sensor | pitch1 sensor | pitch2 sensor |
|-------|--------|-----------|--------------|--------------|
| 0 | Pinky  | ch 8  | ch 9  | ch 10 |
| 1 | Ring   | ch 11 | ch 12 | ch 13 |
| 2 | Middle | ch 0  | ch 15 | ch 14 |
| 3 | Index  | ch 1  | ch 2  | ch 3  |
| 4 | Thumb  | ch 7  | ch 6  | ch 5  |

Thumb also has a fourth angle (`thumb_extra` at offset 68) for the IP joint (ch 4).

### Parsing

```javascript
function handleFingerPacket(view) {
  if (view.byteLength < 73) return;

  const timestamp = view.getUint32(4, true);
  const calStatus = view.getUint8(72);

  const fingers = [];
  for (let f = 0; f < 5; f++) {
    const base = 8 + f * 12;  // 3 floats × 4 bytes each
    fingers.push({
      yaw:    view.getFloat32(base + 0, true),  // lateral spread (°)
      pitch1: view.getFloat32(base + 4, true),  // MCP knuckle curl (°)
      pitch2: view.getFloat32(base + 8, true),  // PIP tip curl (°)
    });
  }
  const thumbExtra = view.getFloat32(68, true); // thumb IP (°)

  // Build 16-bone quaternion array for ArmModel.fingers
  const fingerBoneQuats = buildFingerQuats(fingers, thumbExtra);

  return { timestamp, fingers, thumbExtra, calStatus, fingerBoneQuats };
}
```

### Converting Angles to Bone Quaternions

```javascript
const DEG2RAD = Math.PI / 180;

function toRad(deg) {
  return (Number.isFinite(deg) ? deg : 0) * DEG2RAD;
}

function quatFromEuler(x, y, z) {
  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Build the 16-element fingers array expected by ArmModel/CombinedArmRig.
 * Finger order in packet: [Pinky, Ring, Middle, Index, Thumb]
 */
function buildFingerQuats(fingers, thumbExtra) {
  const [pinky, ring, middle, index, thumb] = fingers;

  // MCP bone: pitch1 = curl (X), yaw = spread (Y)
  const mcpQuat = (f) => quatFromEuler(toRad(f.pitch1), toRad(f.yaw), 0);
  // PIP / DIP bone: pitch2 = curl (X) only
  const pipQuat = (f) => quatFromEuler(toRad(f.pitch2), 0, 0);
  const thumbIp =        quatFromEuler(toRad(thumbExtra), 0, 0);

  return [
    /* [0]  thumb01 MCP  */ mcpQuat(thumb),
    /* [1]  thumb02 PIP  */ pipQuat(thumb),
    /* [2]  thumb03 IP   */ thumbIp,
    /* [3]  index01 MCP  */ mcpQuat(index),
    /* [4]  index02 PIP  */ pipQuat(index),
    /* [5]  index03 DIP  */ pipQuat(index),     // DIP mirrors PIP
    /* [6]  middle01 MCP */ mcpQuat(middle),
    /* [7]  middle02 PIP */ pipQuat(middle),
    /* [8]  middle03 DIP */ pipQuat(middle),
    /* [9]  ring01 MCP   */ mcpQuat(ring),
    /* [10] ring02 PIP   */ pipQuat(ring),
    /* [11] ring03 DIP   */ pipQuat(ring),
    /* [12] pinky01 MCP  */ mcpQuat(pinky),
    /* [13] pinky02 PIP  */ pipQuat(pinky),
    /* [14] pinky03 DIP  */ pipQuat(pinky),
    /* [15] pinky03 end  */ pipQuat(pinky),     // end bone mirrors DIP
  ];
}
```

### Calibration Status Bitmask

```javascript
function isFingerCalibrated(calStatus, fingerIdx) {
  return !!(calStatus & (1 << fingerIdx));
}

// fingerIdx: 0=Pinky, 1=Ring, 2=Middle, 3=Index, 4=Thumb
const allCalibrated = calStatus === 0b00011111; // 0x1F
```

When a finger is **not calibrated** (`knotsSet[axis] == false`), the firmware outputs
the raw voltage (in volts) instead of degrees. Don't apply those values to bones until
calibration is complete.

---

## 5. Raw Voltages Packet (Calibration Tool)

**Header**: `0xC0DEC0DE`  
**Size**: 72 bytes  
**Sent only on demand** (in response to `CMD_REQUEST_RAW 0x30`)

```
Offset  Size  Type     Field
------  ----  -------  ----------------------------------------
  0      4    uint32   header      (0xC0DEC0DE)
  4      4    uint32   timestamp   (µs)
  8     64    float32  voltages[16]  — smoothed hall-sensor voltages (V)
```

```javascript
function handleRawVoltagesPacket(view) {
  if (view.byteLength < 72) return;
  const timestamp = view.getUint32(4, true);
  const voltages  = [];
  for (let i = 0; i < 16; i++) {
    voltages.push(view.getFloat32(8 + i * 4, true));
  }
  return { timestamp, voltages };
}
```

Hall sensor channel → finger/axis mapping (from `config.h / FINGER_DEFAULTS`):

| Channel | Finger  | Axis    |
|---------|---------|---------|
| 0       | Middle  | Pitch 1 (MCP) |
| 1       | Index   | Yaw |
| 2       | Index   | Pitch 1 |
| 3       | Index   | Pitch 2 |
| 4       | Thumb   | Extra (IP) |
| 5       | Thumb   | Pitch 2 |
| 6       | Thumb   | Pitch 1 |
| 7       | Thumb   | Yaw |
| 8       | Pinky   | Yaw |
| 9       | Pinky   | Pitch 1 |
| 10      | Pinky   | Pitch 2 |
| 11      | Ring    | Yaw |
| 12      | Ring    | Pitch 1 |
| 13      | Ring    | Pitch 2 |
| 14      | Middle  | Pitch 2 |
| 15      | Middle  | Pitch 1 (MCP backup) |

---

## 6. Sending Commands

All commands are binary. Byte 0 = command ID, remaining bytes = payload.

```javascript
function sendCommand(ws, cmdId, payload = new Uint8Array()) {
  const buf = new Uint8Array(1 + payload.length);
  buf[0] = cmdId;
  buf.set(payload, 1);
  ws.send(buf.buffer);
}

// Command IDs (config.h)
const CMD = {
  TARE_IMU:         0x01,
  START_BOOT_CAL:   0x02,  // 10-second stationary IMU boot calibration
  START_MAG_CAL:    0x03,
  END_MAG_CAL:      0x04,
  SET_FINGER_KNOTS: 0x10,  // payload: [finger(1), axis(1), 5×float(20)]
  SET_COUPLING:     0x11,  // payload: [finger(1), 4×float(16)]
  SAVE_CAL:         0x12,  // save all hall calibration to NVS
  LOAD_CAL:         0x13,  // reload hall calibration from NVS into RAM
  SWITCH_TO_WIFI:   0x20,  // payload: ssid_len(1), ssid(N), pass_len(1), pass(M)
  SWITCH_TO_BLE:    0x21,
  REQUEST_RAW:      0x30,  // triggers one RawVoltages response packet
  DEVICE_RESET:     0xFF,
};
```

### Sending Calibration Knots

```javascript
/**
 * fingerIdx: 0=Pinky, 1=Ring, 2=Middle, 3=Index, 4=Thumb
 * axisIdx:   0=Yaw, 1=Pitch1 (MCP), 2=Pitch2 (PIP), 3=Thumb IP
 * knots:     Float32[5] — voltages at 0%, 25%, 50%, 75%, 100% position
 */
function sendCalibrationKnots(ws, fingerIdx, axisIdx, knots) {
  const buf  = new ArrayBuffer(2 + 5 * 4);
  const view = new DataView(buf);
  view.setUint8(0, fingerIdx);
  view.setUint8(1, axisIdx);
  for (let i = 0; i < 5; i++) {
    view.setFloat32(2 + i * 4, knots[i] ?? 0, true);
  }
  sendCommand(ws, CMD.SET_FINGER_KNOTS, new Uint8Array(buf));
}

function saveCalibratonToESP(ws) {
  sendCommand(ws, CMD.SAVE_CAL);  // persists to NVS flash
}

function loadCalibrationFromESP(ws) {
  sendCommand(ws, CMD.LOAD_CAL);  // re-applies NVS cal into live RAM
}
```

### Taring the IMU (zero wrist rotation)

```javascript
sendCommand(ws, CMD.TARE_IMU);
// The IMU will set its current orientation as the new "flat" reference.
// Perform this while the hand is resting flat and palm-down.
```

---

## 7. Full `useGloveWebSocket` Hook Reference

The current frontend implements this custom hook in `recording/page.jsx`:

```javascript
useGloveWebSocket(ipAddress, onFrame)
// Returns: { connected, imuQuat, fingerAngles, fingerAnglesFlat,
//            thumbExtra, imuTimestamp, fingerTimestamp, sendCommand }
```

| Return field | Type | Description |
|---|---|---|
| `connected` | `bool` | WebSocket is open |
| `imuQuat` | `[qx, qy, qz, qw]` | Latest wrist orientation (Three.js order) |
| `fingerAngles` | `[{yaw, pitch1, pitch2}×5]` | Per-finger angles in degrees |
| `fingerAnglesFlat` | `float[16]` | Flat array: 5×3 angles + thumbExtra |
| `thumbExtra` | `float` | Thumb IP joint angle (°) |
| `imuTimestamp` | `uint32` | µs since ESP boot (from last IMU packet) |
| `fingerTimestamp` | `uint32` | µs since ESP boot (from last Finger packet) |
| `sendCommand(cmdId, payload?)` | `fn` | Sends binary command over open socket |

The `onFrame` callback fires with:

```javascript
// Source = 'imu':    { source, imuQuat, fingers: fingerAnglesFlat }
// Source = 'finger': { source, imuQuat, fingerAngles, thumbExtra, fingers: fingerAnglesFlat }
// Source = 'raw':    { source, voltages: float[16], timestamp }
```

---

## 8. Building `rigData` for ArmModel

```javascript
import * as THREE from 'three';

function buildRigData(frame) {
  if (!frame) return null;

  const fingerBoneQuats = frame.fingerAngles
    ? buildFingerQuats(frame.fingerAngles, frame.thumbExtra ?? 0)
    : undefined;

  return {
    palm:    frame.imuQuat    ?? undefined,  // → wrist bone quaternion
    fingers: fingerBoneQuats  ?? undefined,  // → 16 finger-bone quaternions
  };
}

// In your component:
const rigData = useMemo(() => buildRigData(currentFrame), [currentFrame]);

// In Canvas:
<ArmModel
  rightHandSensorData={rigData}
  leftHandSensorData={rigData}
  restRotationR={[-3.15,  2.29, 3.15]}
  restRotationL={[-3.15, -2.29, 3.15]}
/>
```

When `palm` is `undefined` (no IMU packet — e.g. `ENABLE_IMU 0`), the hand
bone falls back to the Euler rest pose defined by `restRotationR`.

---

## 9. Enabling Wrist Rotation (IMU)

The IMU is currently **disabled** in firmware to avoid a hardware hang:

```cpp
// src/config.h
#define ENABLE_IMU  0   // set to 1 and reflash to enable wrist rotation
```

When enabled, the ESP streams `IMUPacket` (header `0xAABBCCDD`) alongside finger
packets. The frontend already parses these and populates `imuQuat`. The `ArmModel` wrist bone
will animate automatically once packets arrive.

**Steps to activate wrist rotation**:
1. Set `ENABLE_IMU 1` in `config.h`
2. Verify `PIN_IMU3_NCS 22` matches your active IMU chip-select
3. Flash via PlatformIO: `pio run -t upload`
4. Send `CMD_TARE_IMU (0x01)` once connected to zero the reference pose

---

## 10. Data Recording Schema

Frames stored during a recording session:

```javascript
// Each recorded frame (from 'finger' source):
{
  source:       'finger',
  fingers:      float[16],          // fingerAnglesFlat — 5×3 angles + thumbExtra
  fingerAngles: [{yaw, pitch1, pitch2}×5],
  thumbExtra:   float,
  imuQuat:      [qx, qy, qz, qw],  // snapshot of latest wrist orientation
  flex:         {},                  // legacy field (unused)
  pads:         [],                  // legacy field (unused)
}
```

### CSV Export (one row per frame)

```javascript
function exportCSV(frames) {
  const header = [
    'timestamp',
    'pinky_yaw','pinky_mcp','pinky_pip',
    'ring_yaw','ring_mcp','ring_pip',
    'middle_yaw','middle_mcp','middle_pip',
    'index_yaw','index_mcp','index_pip',
    'thumb_yaw','thumb_mcp','thumb_pip','thumb_ip',
    'imu_qx','imu_qy','imu_qz','imu_qw',
  ].join(',');

  const rows = frames.map(f => {
    const a = f.fingers ?? Array(16).fill(0);
    const q = f.imuQuat ?? [0, 0, 0, 1];
    return [Date.now(), ...a, ...q].join(',');
  });

  return header + '\n' + rows.join('\n');
}
```

---

## 11. Known Limitations & Caveats

| Item | Detail |
|------|--------|
| IMU disabled | `ENABLE_IMU 0` in firmware — no IMU packets stream until reflashed |
| No cal readback | `CMD_LOAD_CAL (0x13)` reloads NVS into firmware RAM but does **not** send knot values back to the frontend. The UI cannot show previously stored calibration data without a new firmware command. |
| Selective calibration | Fully supported by firmware — send `CMD_SET_FINGER_KNOTS` for only the axes you want; uncalibrated axes return raw voltage instead of degrees. |
| Coordinate transform | ESP IMU frame ≠ Three.js frame. Test each axis and apply a `COORD_FIX` quaternion if needed. |
| 50 Hz cap | WebSocket broadcasts are rate-limited to `WS_BROADCAST_INTERVAL_MS 20` (~50 Hz). |
| ENABLE_BLE 0 | BLE is disabled. `calibrate.py` (BLE-based) cannot connect. Use WebSocket commands instead. |

---

## 12. Quick-Start Checklist

- [ ] Get ESP32 IP from serial monitor (`[WIFI] Connected! IP: ...`)
- [ ] Set `GLOVE_IP` in frontend to match
- [ ] Connect WebSocket: `ws://<IP>:81`
- [ ] Confirm Finger packets arrive (header `0xF1F2F3F4`)
- [ ] Run calibration wizard → `SAVE_CAL (0x12)` → bones animate
- [ ] For wrist: set `ENABLE_IMU 1`, reflash, send `TARE_IMU (0x01)` once flat
- [ ] `palm` field in `rigData` will drive the wrist bone automatically
