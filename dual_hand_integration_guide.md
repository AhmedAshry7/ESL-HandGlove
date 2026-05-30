# ESL-HandGlove Dual-Hand Integration Guide
> For Frontend/Integration Agents

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React / Next.js)                  │
│  WebSocket ws://192.168.x.x:81                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ TCP/WebSocket (binary)
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│           RIGHT HAND ESP32 — MASTER (env: right_hand)           │
│                                                                  │
│  • Connects to router WiFi                                       │
│  • Runs WebSocket server on port 81                             │
│  • Runs BLE (optional, currently disabled)                      │
│  • Local: 16 hall sensors → 5-finger angles                     │
│  • Receives left-hand data via ESP-NOW (≈1ms latency)           │
│  • Merges both hands → broadcasts DualFingerPacket              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ ESP-NOW (2.4GHz, ≈1ms)
                                │ Max 250 bytes/frame
┌───────────────────────────────▼─────────────────────────────────┐
│            LEFT HAND ESP32 — SLAVE (env: left_hand)             │
│                                                                  │
│  • No WiFi connection — radio in STA mode, channel locked       │
│  • Local: 16 hall sensors → 5-finger angles                     │
│  • Sends SlaveFingerPayload to master after each sweep (~35Hz)  │
│  • Receives calibration commands forwarded from master          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. WebSocket Packet Types

The master broadcasts **four** binary packet types. Identify by reading the first 4 bytes as a `uint32_t` (little-endian).

| Header (hex) | Constant | Description |
|---|---|---|
| `0xF1F2F3F4` | `FingerPacket` | **Legacy** — single right-hand angles only |
| `0xF1F2F3F5` | `DualFingerPacket` | **New** — both hands merged |
| `0xC0DEC0DE` | `RawVoltagesPacket` | **Legacy** — right-hand raw ADC |
| `0xC0DEC0DF` | `DualRawVoltagesPacket` | **New** — both hands raw ADC |
| `0xAABBCCDD` | `IMUPacket` | Right-hand IMU orientation |
| `0xAABBCCDE` | `DualIMUPacket` | **Future** — both hands IMU |

> **Migration note:** The frontend should prefer the new `0xF1F2F3F5` header when the master has a slave connected. Legacy `0xF1F2F3F4` continues to be emitted as a fallback when `ENABLE_ESPNOW=0`.

---

## 3. DualFingerPacket Layout (header `0xF1F2F3F5`)

```
Offset  Size  Field
──────  ────  ─────────────────────────────────────────────────
  0      4    header          = 0xF1F2F3F5
  4      4    timestamp       (uint32, master micros())
  8     60    right_angles    [5][3] float32  (yaw, pitch1, pitch2 × 5 fingers)
 68      4    right_thumb_extra   float32     (Thumb IP joint)
 72      1    right_cal_status    uint8       (bitmask, bit N = finger N calibrated)
 73     60    left_angles     [5][3] float32
133      4    left_thumb_extra    float32
137      1    left_cal_status     uint8
138      1    left_connected      uint8       (1 = slave online, 0 = absent/stale)
──────
Total: 139 bytes
```

**Finger order (index 0→4):** Pinky, Ring, Middle, Index, Thumb  
**Per-finger angle order:** `[0]=yaw`, `[1]=pitch1(MCP)`, `[2]=pitch2(PIP)`

### JavaScript parser example:
```js
function parseDualFingerPacket(buffer) {
  const v = new DataView(buffer);
  const header = v.getUint32(0, true);
  if (header !== 0xF1F2F3F5) return null;

  const fingers = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb'];
  const right = {}, left = {};

  for (let f = 0; f < 5; f++) {
    right[fingers[f]] = {
      yaw:    v.getFloat32(8  + f * 12,     true),
      pitch1: v.getFloat32(8  + f * 12 + 4, true),
      pitch2: v.getFloat32(8  + f * 12 + 8, true),
    };
    left[fingers[f]] = {
      yaw:    v.getFloat32(73 + f * 12,     true),
      pitch1: v.getFloat32(73 + f * 12 + 4, true),
      pitch2: v.getFloat32(73 + f * 12 + 8, true),
    };
  }

  right.Thumb.ip = v.getFloat32(68,  true);
  left.Thumb.ip  = v.getFloat32(133, true);

  right.calStatus    = v.getUint8(72);
  left.calStatus     = v.getUint8(137);
  const leftOnline   = v.getUint8(138) === 1;

  return { right, left, leftOnline, timestamp: v.getUint32(4, true) };
}
```

---

## 4. DualRawVoltagesPacket Layout (header `0xC0DEC0DF`)

```
Offset  Size  Field
──────  ────  ─────────────────────────────────────────────────
  0      4    header          = 0xC0DEC0DF
  4      4    timestamp       (uint32, master micros())
  8     64    right_voltages  [16] float32 — ch0…ch15
 72     64    left_voltages   [16] float32 — ch0…ch15
136      1    left_connected  uint8
──────
Total: 137 bytes
```

Use this during calibration to display raw sensor voltages for both hands simultaneously.

---

## 5. Config Packet Types (existing, unchanged)

These are sent in response to `CMD_LOAD_CAL_FROM_NVS` or after any calibration save. Header is always the first byte (command ID):

| Byte 0 | Meaning | Payload |
|---|---|---|
| `0x10` | Knot sync | `[fingerIdx:1][axis:1][5×float32 = knots]` |
| `0x11` | Coupling sync | `[fingerIdx:1][6×float32 = coeffs]` |

---

## 6. Sending Commands

### Right Hand (Master) — via WebSocket binary message:
Send the command bytes directly. Examples:

```js
// Load calibration from NVS (right hand):
ws.send(new Uint8Array([0x13]));

// Save calibration to NVS (right hand):
ws.send(new Uint8Array([0x12]));

// Set coupling coefficients (right hand, finger 4 = Thumb):
const buf = new ArrayBuffer(1 + 1 + 6*4);
const v = new DataView(buf);
v.setUint8(0, 0x11);  // CMD_SET_COUPLING_COEFFS
v.setUint8(1, 4);     // fingerIdx (Thumb)
[p2p1, yp1, yp2, p1p2, ip_p2, ip_p1].forEach((c, i) =>
  v.setFloat32(2 + i*4, c, true));
ws.send(new Uint8Array(buf));
```

### Left Hand (Slave) — via WebSocket with prefix `0xA0`:
Prefix the entire right-hand command with `0xA0`. The master strips `0xA0` and forwards the rest via ESP-NOW.

```js
// Load calibration from NVS (LEFT hand):
ws.send(new Uint8Array([0xA0, 0x13]));

// Save calibration to NVS (LEFT hand):
ws.send(new Uint8Array([0xA0, 0x12]));

// Set coupling coefficients (LEFT hand, finger 4 = Thumb):
const rightHandCmd = buildCouplingCmd(4, [p2p1, yp1, yp2, p1p2, ip_p2, ip_p1]);
const leftCmd = new Uint8Array(1 + rightHandCmd.length);
leftCmd[0] = 0xA0;
leftCmd.set(rightHandCmd, 1);
ws.send(leftCmd);
```

---

## 7. First-Time Commissioning

### Step 1: Determine MAC Addresses
Flash each ESP32 with a temporary sketch that prints `WiFi.macAddress()`, or use the serial monitor after the firmware boots — it will print the local MAC at startup (add `Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());` in setup if needed).

### Step 2: Update MAC Addresses in config.h
Both `Right_Arm/config.h` and `Left_Arm/config.h` contain (identical) MAC definitions — update **both**:

```cpp
// In config.h (both files — they are kept in sync)
static constexpr uint8_t ESPNOW_MASTER_MAC[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF}; // Right hand
static constexpr uint8_t ESPNOW_SLAVE_MAC[6]  = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66}; // Left hand
```

### Step 3: Check WiFi Channel
ESP-NOW requires both devices on the **same WiFi channel** as the router. The master auto-selects its channel from the router after connecting. The slave locks its channel to `ESPNOW_WIFI_CHANNEL` (default: `1`).

To find your router's channel, run on the master after it connects to WiFi:
```cpp
uint8_t ch; wifi_second_chan_t sc;
esp_wifi_get_channel(&ch, &sc);
Serial.printf("Channel: %d\n", ch);
```
Then set `ESPNOW_WIFI_CHANNEL` in `config.h` to match.

### Step 4: Flash
```bash
# Flash right hand (master)
pio run -e right_hand -t upload

# Flash left hand (slave)
pio run -e left_hand -t upload
```

### Step 5: Verify Connection
Open serial monitor on the slave. After power-on you should see:
```
[ESPNOW] Slave: WiFi channel locked to 1
[ESPNOW] Slave: Adding master peer AA:BB:CC:DD:EE:FF
[ESPNOW] Initialised OK
```

On the master serial monitor, within a few seconds:
```
[ESPNOW] Master: slave data received (left hand online)
```
And in the WebSocket packets, `left_connected = 1`.

---

## 8. Calibration Workflow (Dual-Hand)

The calibration wizard should now present **two tabs**: Right Hand and Left Hand.

1. **Right hand** — calibration commands go directly via WebSocket (no prefix).
2. **Left hand** — all calibration commands must be prefixed with `0xA0` byte.

The calibration data for each hand is stored in its own ESP32's NVS under the `glove_cal` namespace — they are completely independent.

When `CMD_LOAD_CAL_FROM_NVS` (`0x13`) is sent (with appropriate prefix), the respective ESP32 loads its calibration and echoes `0x10` (knots) and `0x11` (coupling) config packets back through the WebSocket. The master relays the slave's calibration echoes transparently.

---

## 9. Finger Order Convention

**Both hands use the same finger index order:**

| Index | Finger |
|---|---|
| 0 | Pinky |
| 1 | Ring |
| 2 | Middle |
| 3 | Index |
| 4 | Thumb |

> **Note for 3D mapping:** The left hand is anatomically mirrored. When applying angles to a 3D model, yaw direction for the left hand should be negated relative to the right hand. Consult your `buildFingerEulers` function — left hand yaw sign flip is a frontend responsibility.

---

## 10. Link Quality / Slave Timeout

- `left_connected = 1` in the packet means the master received a frame from the slave within the last **500ms** (`ESPNOW_SLAVE_TIMEOUT_MS`).
- `left_connected = 0` means the slave is absent or timed out — left-hand angles will be **zeroed** in the packet.
- The master does NOT stop broadcasting when the slave is absent — the frontend always receives a full-size packet.
