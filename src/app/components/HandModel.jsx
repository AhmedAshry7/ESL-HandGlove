"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────
const LERP_SPEED       = 0.18;
const CURL_THRESHOLD   = 0.6;   // PIP / DIP sensors
const CURL_THRESHOLD_MCP = 0.4; // MCP sensors (more sensitive)
const R_THRESHOLD      = 900;   // ADC below this → two-finger press

// ⚠ If the thumb still swings the wrong way, try (1,0,0) or (0,0,1)
const BONE_FORWARD = new THREE.Vector3(0, 1, 0);

const eq = (x, y, z) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

// ─── Rest pose ────────────────────────────────────────────────────────────────
const REST_Q = {
  index_01R_017:  eq(-0.2, 0,  0),
  index_02R_018:  eq(0,    0,  0),
  index_03R_019:  eq(0,    0,  0),
  middle_01R_025: eq(0,    0,  0),
  middle_02R_026: eq(0,    0,  0),
  middle_03R_027: eq(0,    0,  0),
  ring_01R_033:   eq(0.2,  0,  0),
  ring_02R_034:   eq(0,    0,  0),
  ring_03R_035:   eq(0,    0,  0),
  pinky_01R_041:  eq(0.4,  0,  0),
  pinky_02R_042:  eq(0,    0,  0),
  pinky_03R_043:  eq(0,    0,  0),
  thumb_01R_08:   eq(0,    0,  0),
  thumb_02R_09:   eq(0,    0,  0),
};

// ─── Full-curl pose ───────────────────────────────────────────────────────────
// Uses Z-axis (local flexion toward palm).
// ⚠ If fingers still bend the wrong way, flip 1.3 → -1.3
const CURL_Q = {
  index_01R_017:  eq(0, 0, 1.3),
  middle_01R_025: eq(0, 0, 1.3),
  ring_01R_033:   eq(0, 0, 1.3),
  pinky_01R_041:  eq(0, 0, 1.3),
  index_02R_018:  eq(0, 0, 1.4),
  middle_02R_026: eq(0, 0, 1.4),
  ring_02R_034:   eq(0, 0, 1.4),
  pinky_02R_042:  eq(0, 0, 1.4),
  index_03R_019:  eq(0, 0, 1.4),
  middle_03R_027: eq(0, 0, 1.4),
  ring_03R_035:   eq(0, 0, 1.4),
  pinky_03R_043:  eq(0, 0, 1.4),
};

// ─── Side-touch pose (finger adduction toward neighbour) ──────────────────────
// Strength scales with zone: z=0 light, z=1 medium, z=2 full press.
// We store [light, medium, full] per finger to interpolate in fingerClosePairs.
const ADDUCT_Q = {
  // SIDE9 = index-side: index tilts toward middle
  SIDE9_primary: [
    eq(-0.3, 0, 0.2),  // z=0 light touch
    eq(-0.5, 0, 0.2),  // z=1 mid
    eq(-0.6, 0, 0.2),  // z=2 firm press
  ],
  // SIDE6 = middle-side: middle tilts toward index
  SIDE6_primary: [
    eq(-0.1, 0, 0.2),
    eq(-0.2, 0, 0.2),
    eq(-0.3, 0, 0.2),
  ],
  // SIDE7 = ring-side: ring tilts toward middle
  SIDE7_primary: [
    eq(0.3, 0, 0.2),
    eq(0.5, 0, 0.2),
    eq(0.6, 0, 0.2),
  ],
  // SIDE8 = pinky-side: pinky tilts toward ring
  SIDE8_primary: [
    eq(0.5, 0, 0.0),
    eq(0.7, 0, 0.0),
    eq(0.8, 0, 0.0),
  ],
};

// ─── Flex → bone mapping ──────────────────────────────────────────────────────
// ESP sends keys: idx_mcp, idx_pcp, mid_mcp, mid_pcp,
//                 rng_mcp, rng_pcp, pky_mcp, pky_pcp
// isMcp=true  → use CURL_THRESHOLD_MCP (0.4)
// isMcp=false → use CURL_THRESHOLD     (0.6)
const FLEX_BONES = {
  idx_mcp: { bone: 'index_01R_017',  dip: null,             isMcp: true  },
  idx_pcp: { bone: 'index_02R_018',  dip: 'index_03R_019',  isMcp: false },
  mid_mcp: { bone: 'middle_01R_025', dip: null,             isMcp: true  },
  mid_pcp: { bone: 'middle_02R_026', dip: 'middle_03R_027', isMcp: false },
  rng_mcp: { bone: 'ring_01R_033',   dip: null,             isMcp: true  },
  rng_pcp: { bone: 'ring_02R_034',   dip: 'ring_03R_035',   isMcp: false },
  pky_mcp: { bone: 'pinky_01R_041',  dip: null,             isMcp: true  },
  pky_pcp: { bone: 'pinky_02R_042',  dip: 'pinky_03R_043',  isMcp: false },
};

// ─── IK bone tables ───────────────────────────────────────────────────────────
//
// FRONT pads (CH0–3): thumb aims at an interpolated world position along the
//   target finger.  3 bones cover MCP → PIP → DIP.
//   PAD_FRONT0=index, FRONT1=middle, FRONT2=ring, FRONT3=pinky.
//
// Front pad zones → IK target:
//   z=0 "Bottom"     → MCP (knuckle base)
//   z=1 "Lower-Mid"  → 50% MCP→PIP
//   z=2 "Upper-Mid"  → PIP
//   z=3 "Tip"        → 50% PIP→DIP
//   z=4 "Touch"      → DIP (fingertip)
const FRONT_IK_BONES = {
  FRONT0: ['index_01R_017',  'index_02R_018',  'index_03R_019' ],
  FRONT1: ['middle_01R_025', 'middle_02R_026', 'middle_03R_027'],
  FRONT2: ['ring_01R_033',   'ring_02R_034',   'ring_03R_035'  ],
  FRONT3: ['pinky_01R_041',  'pinky_02R_042',  'pinky_03R_043' ],
};

// SIDE pads: thumb aims at a bone on the contacted finger.
//   Side zone semantics (firmware SIDE_ZONE_DEFAULTS = {4000, 1800, 800}):
//     z=0 "Side-High"     ADC~4000 → near fingertip (DIP area)
//     z=1 "Side-Mid"      ADC~1800 → mid finger (PIP area)
//     z=2 "Two-Fingers"   ADC~800  → near knuckle (MCP area) [low R → close pose]
//
//   SIDE9=index, SIDE6=middle, SIDE7=ring, SIDE8=pinky
const SIDE_IK_BONES = {
  SIDE9: { 0: 'index_03R_019',  1: 'index_02R_018',  2: 'index_01R_017'  },
  SIDE6: { 0: 'middle_03R_027', 1: 'middle_02R_026', 2: 'middle_01R_025' },
  SIDE7: { 0: 'ring_03R_035',   1: 'ring_02R_034',   2: 'ring_01R_033'   },
  SIDE8: { 0: 'pinky_03R_043',  1: 'pinky_02R_042',  2: 'pinky_01R_041'  },
};

// ─── Pad key sets ─────────────────────────────────────────────────────────────
// Pad naming from firmware (PAD_ prefix stripped in resolvePadState):
//   FRONT0..3  → front of index/middle/ring/pinky  (thumb IK target)
//   SIDE9      → index side pad
//   SIDE6      → middle side pad
//   SIDE7      → ring side pad
//   SIDE8      → pinky side pad
//   TOP / UNUSED5 / TEST* → ignored
const SIDE_PAD_KEYS  = new Set(['SIDE6', 'SIDE7', 'SIDE8', 'SIDE9']);
const FRONT_PAD_KEYS = new Set(['FRONT0', 'FRONT1', 'FRONT2', 'FRONT3']);

// ─── Pad state resolver ───────────────────────────────────────────────────────
function resolvePadState(pads) {
  let thumbCh = null, thumbZ = null;
  const fingerClosePairs = [];
  if (!Array.isArray(pads)) return { thumbCh, thumbZ, fingerClosePairs };

  for (const pad of pads) {
    if (pad.z === -1) continue;                 // sensor inactive
    const ch = pad.n.replace('PAD_', '');

    if (SIDE_PAD_KEYS.has(ch)) {
      // Low r (≤ R_THRESHOLD) → two-finger firm press → adduction/close pose
      // High r               → thumb reaching sideways → thumb IK
      if (pad.r <= R_THRESHOLD) {
        fingerClosePairs.push({ ch, z: pad.z });
      } else {
        thumbCh = ch; thumbZ = pad.z;
      }
    } else if (FRONT_PAD_KEYS.has(ch)) {
      thumbCh = ch; thumbZ = pad.z;             // front pad: always thumb IK
    }
    // TOP, UNUSED5, TEST10-15 → intentionally ignored
  }
  return { thumbCh, thumbZ, fingerClosePairs };
}

// ─── IK target: world position along / beside a finger ───────────────────────
// Writes the target position into _out (no heap allocation).
//
// FRONT pads — 5 zones, z=0(MCP)…z=4(DIP):
//   z=0  → MCP bone world pos
//   z=1  → lerp(MCP, PIP, 0.5)
//   z=2  → PIP bone world pos
//   z=3  → lerp(PIP, DIP, 0.5)
//   z=4  → DIP bone world pos
//
// SIDE pads — 3 zones, mapped by SIDE_IK_BONES.
function computeIKTarget(nodes, ch, z, _out, _pA, _pB, _pC) {
  // ── Side pads ──────────────────────────────────────────────────────────────
  if (SIDE_IK_BONES[ch]) {
    const boneName = SIDE_IK_BONES[ch][z];
    if (!boneName || !nodes[boneName]) return false;
    nodes[boneName].getWorldPosition(_out);
    return true;
  }

  // ── Front pads ─────────────────────────────────────────────────────────────
  const bones = FRONT_IK_BONES[ch];
  if (!bones) return false;
  const [mcpName, pipName, dipName] = bones;
  if (!nodes[mcpName] || !nodes[pipName] || !nodes[dipName]) return false;

  nodes[mcpName].getWorldPosition(_pA); // MCP
  nodes[pipName].getWorldPosition(_pB); // PIP
  nodes[dipName].getWorldPosition(_pC); // DIP

  switch (z) {
    case 0: _out.copy(_pA); break;                      // Bottom → MCP
    case 1: _out.lerpVectors(_pA, _pB, 0.5); break;    // Lower-Mid → ½ MCP→PIP
    case 2: _out.copy(_pB); break;                      // Upper-Mid → PIP
    case 3: _out.lerpVectors(_pB, _pC, 0.5); break;    // Tip → ½ PIP→DIP
    case 4: _out.copy(_pC); break;                      // Touch → DIP
    default: return false;
  }
  return true;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function HandModel({ sensorData, ...props }) {
  const group            = useRef();
  const { scene }        = useGLTF('/rigged_hand.glb');
  const clone            = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);

  // Pre-allocated scratch — zero heap pressure per frame
  const _pA      = useMemo(() => new THREE.Vector3(), []);
  const _pB      = useMemo(() => new THREE.Vector3(), []);
  const _pC      = useMemo(() => new THREE.Vector3(), []);
  const _ikTgt   = useMemo(() => new THREE.Vector3(), []);
  const _thumbP  = useMemo(() => new THREE.Vector3(), []);
  const _parentQ = useMemo(() => new THREE.Quaternion(), []);
  const _ikQ     = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    if (!nodes) return;

    const flex = sensorData?.flex ?? {};
    const pads = sensorData?.pads ?? [];

    // ── 1. All bones start at REST ──────────────────────────────────────────
    const targets = { ...REST_Q };

    // ── 2. Flex bending ─────────────────────────────────────────────────────
    // Keys match exactly what the ESP broadcasts: idx_mcp, idx_pcp, etc.
    Object.entries(FLEX_BONES).forEach(([key, { bone, dip, isMcp }]) => {
      const threshold = isMcp ? CURL_THRESHOLD_MCP : CURL_THRESHOLD;
      if ((flex[key]?.curl ?? 0) > threshold) {
        targets[bone] = CURL_Q[bone];
        if (dip) targets[dip] = CURL_Q[dip];
      }
    });

    // ── 3. Pad state ────────────────────────────────────────────────────────
    const { thumbCh, thumbZ, fingerClosePairs } = resolvePadState(pads);

    // Zone-aware finger adduction:
    //   z=0 "Side-High" → light touch  → subtle adduction (index 0 of ADDUCT_Q)
    //   z=1 "Side-Mid"  → medium touch → moderate adduction (index 1)
    //   z=2 "Two-Fingers" (already filtered to fingerClosePairs by r-gate)
    //                   → full adduction (index 2)
    fingerClosePairs.forEach(({ ch, z }) => {
      const level = Math.min(z, 2); // clamp to 0-2

      if (ch === 'SIDE9') {
        // Index-side: index tilts toward middle
        targets.index_01R_017 = ADDUCT_Q.SIDE9_primary[level];
      } else if (ch === 'SIDE6') {
        // Middle-side: middle tilts toward index
        targets.middle_01R_025 = ADDUCT_Q.SIDE6_primary[level];
      } else if (ch === 'SIDE7') {
        // Ring-side: ring tilts toward middle
        targets.ring_01R_033 = ADDUCT_Q.SIDE7_primary[level];
      } else if (ch === 'SIDE8') {
        // Pinky-side: pinky tilts toward ring
        targets.pinky_01R_041 = ADDUCT_Q.SIDE8_primary[level];
      }
    });

    // ── 4. Slerp all non-thumb bones ────────────────────────────────────────
    Object.entries(targets).forEach(([bone, tgt]) => {
      if (bone === 'thumb_01R_08' || bone === 'thumb_02R_09') return;
      nodes[bone]?.quaternion.slerp(tgt, LERP_SPEED);
    });

    // ── 5. Thumb IK ─────────────────────────────────────────────────────────
    const thumb1 = nodes['thumb_01R_08'];
    const thumb2 = nodes['thumb_02R_09'];
    if (!thumb1 || !thumb2) return;

    if (thumbCh !== null && thumbZ !== null) {
      const ok = computeIKTarget(nodes, thumbCh, thumbZ, _ikTgt, _pA, _pB, _pC);

      if (ok) {
        // World direction: thumb base → contact point
        thumb1.getWorldPosition(_thumbP);
        _ikTgt.sub(_thumbP).normalize();

        // Bring into thumb1's parent local space
        thumb1.parent.getWorldQuaternion(_parentQ);
        _parentQ.invert();
        _ikTgt.applyQuaternion(_parentQ);

        // Quaternion that rotates BONE_FORWARD onto the local direction
        _ikQ.setFromUnitVectors(BONE_FORWARD, _ikTgt);
        thumb1.quaternion.slerp(_ikQ, LERP_SPEED);
        // thumb2 stays near rest, naturally extending toward the target
        thumb2.quaternion.slerp(REST_Q['thumb_02R_09'], LERP_SPEED);
      } else {
        thumb1.quaternion.slerp(REST_Q['thumb_01R_08'], LERP_SPEED);
        thumb2.quaternion.slerp(REST_Q['thumb_02R_09'], LERP_SPEED);
      }
    } else {
      thumb1.quaternion.slerp(REST_Q['thumb_01R_08'], LERP_SPEED);
      thumb2.quaternion.slerp(REST_Q['thumb_02R_09'], LERP_SPEED);
    }
  });

  return (
    <group ref={group} {...props} position={[0, -1.5, 0]} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]} scale={0.015}>
          <group name="f02ee8bcd0644bfa96313f17aa2cca59fbx" rotation={[Math.PI / 2, 0, 0]}>
            <group name="RootNode">
              <group name="Armature" rotation={[-Math.PI / 2, 0, 0]} scale={100}>
                <primitive object={nodes._rootJoint} />
                <skinnedMesh
                  name="Object_14"
                  geometry={nodes.Object_14.geometry}
                  material={materials.lambert1}
                  skeleton={nodes.Object_14.skeleton}
                />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

useGLTF.preload('/rigged_hand.glb');