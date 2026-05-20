"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────
const LERP_SPEED     = 0.18;
const CURL_THRESHOLD = 0.6;
const CURL_THRESHOLD_MCP = 0.4;
const R_THRESHOLD    = 900;

// ⚠ If the thumb still swings the wrong way, try (1,0,0) or (0,0,1)
const BONE_FORWARD = new THREE.Vector3(0, 1, 0);

const eq = (x, y, z) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

// ─── Rest pose ────────────────────────────────────────────────────────────────
const REST_Q = {
  index_01R_017:  eq(-0.2, 0,  0.2),
  index_02R_018:  eq(0,    0,     0),
  index_03R_019:  eq(0,    0,     0),
  middle_01R_025: eq(0,    0,     0.2),
  middle_02R_026: eq(0,    0,     0),
  middle_03R_027: eq(0,    0,     0),
  ring_01R_033:   eq(0.2,    0,     0.2),
  ring_02R_034:   eq(0,    0,     0),
  ring_03R_035:   eq(0,    0,     0),
  pinky_01R_041:  eq(0.4,    0,     0),
  pinky_02R_042:  eq(0,    0,     0),
  pinky_03R_043:  eq(0,    0,     0),
  thumb_01R_08:   eq(0,    0,     -1),
  thumb_02R_09:   eq(0,    0,     -0.5),
};

// ─── Full-curl pose ───────────────────────────────────────────────────────────
// FIX: was eq(-1.3, spread, 0) — X-axis caused sideways bending.
//      Now uses Z-axis (local flexion toward palm).
// ⚠ If fingers still bend the wrong way, flip -1.3 → +1.3 (and -1.4, -0.7)
const CURL_Q = {
  index_01R_017:  eq(0,    0,     1.3),
  middle_01R_025: eq(0,    0,     1.3),
  ring_01R_033:   eq(0,    0,     1.3),
  pinky_01R_041:  eq(0,    0,     1.3),
  index_02R_018:  eq(0,    0,     1.4),
  middle_02R_026: eq(0,    0,     1.4),
  ring_02R_034:   eq(0,    0,     1.4),
  pinky_02R_042:  eq(0,    0,     1.4),
  index_03R_019:  eq(0,    0,     1.4),   // DIP auto-follows PIP
  middle_03R_027: eq(0,    0,     1.4),
  ring_03R_035:   eq(0,    0,     1.4),
  pinky_03R_043:  eq(0,    0,     1.4),
};

const TOUCH_Q ={
  index_01R_017: eq(-0.6, 0, 0.2),
  ring_01R_033: eq(0.6, 0, 0.2),
  pinky_01R_041:  eq(0.8, 0, 0)
};

// ─── Finger-close pose ────────────────────────────────────────────────────────
// CH4 r≤900 → index + middle side-by-side (MCP spread → 0)
// CH5 r≤900 → middle + ring side-by-side
const CLOSE_Q = {
  CH4: { index_01R_017: eq(-0.6, 0, 0), middle_01R_025: eq(0, 0, 0) },
  CH5: { middle_01R_025: eq(0, 0, 0), ring_01R_033: eq(0.6, 0, 0)  },
};

// ─── Flex → bone mapping ──────────────────────────────────────────────────────
const FLEX_BONES = {
  flex8:  { bone: 'index_02R_018',  dip: 'index_03R_019'  },
  flex9:  { bone: 'index_01R_017',  dip: null             },
  flex10: { bone: 'middle_02R_026', dip: 'middle_03R_027' },
  flex11: { bone: 'middle_01R_025', dip: null             },
  flex12: { bone: 'ring_02R_034',   dip: 'ring_03R_035'   },
  flex13: { bone: 'ring_01R_033',   dip: null             },
  flex14: { bone: 'pinky_02R_042',  dip: 'pinky_03R_043'  },
  flex15: { bone: 'pinky_01R_041',  dip: null             },
};

// ─── IK bone tables ───────────────────────────────────────────────────────────
// Front pads (CH0-CH3): 3 bones per finger used for z-level interpolation.
// The thumb tip is aimed at a LIVE-interpolated world position between them —
// this automatically handles any curl state on the target finger.
const FRONT_IK_BONES = {
  CH0: ['index_01R_017',  'index_02R_018',  'index_03R_019' ],
  CH1: ['middle_01R_025', 'middle_02R_026', 'middle_03R_027'],
  CH2: ['ring_01R_033',   'ring_02R_034',   'ring_03R_035'  ],
  CH3: ['pinky_01R_041',  'pinky_02R_042',  'pinky_03R_043' ],
};
// Side pads (CH4-CH5): a distinct bone per z level.
const SIDE_IK_BONES = {
  CH4: { 0: 'index_02R_018', 2: 'index_03R_019', 3: 'middle_02R_026', 4: 'middle_03R_027' },
  CH5: { 0: 'ring_02R_034',  2: 'ring_03R_035',  3: 'pinky_02R_042',  4: 'pinky_03R_043'  },
};

// ─── Pad state resolver ───────────────────────────────────────────────────────
function resolvePadState(pads) {
  let thumbCh = null, thumbZ = null;
  const fingerClosePairs = [];
  if (!Array.isArray(pads)) return { thumbCh, thumbZ, fingerClosePairs };

  for (const pad of pads) {
    const ch = pad.n.replace('PAD_', '');
    if (ch === 'CH6' || pad.z === -1) continue;

    if (ch === 'CH4' || ch === 'CH5') {
      // r-gate applies to ALL z values on side pads
      if (pad.r <= R_THRESHOLD) {
        fingerClosePairs.push({ ch, z: pad.z });
      } else {
        thumbCh = ch; thumbZ = pad.z;
      }
    } else {
      thumbCh = ch; thumbZ = pad.z; // front pad: always thumb
    }
  }
  return { thumbCh, thumbZ, fingerClosePairs };
}

// ─── IK target: interpolated world position along a finger ───────────────────
// Writes into _out; uses _pA/_pB/_pC as scratch (no heap allocation).
//
//   z=1 → at MCP (knuckle / base)
//   z=2 → 70% of the way from MCP to PIP
//   z=3 → 30% of the way from PIP to DIP
//   z=4 → 85% of the way from PIP to DIP (near fingertip)
//
// Because we read live world positions every frame, this stays correct even
// when the target finger is mid-curl.
function computeIKTarget(nodes, ch, z, _out, _pA, _pB, _pC) {
  if (SIDE_IK_BONES[ch]) {
    const bone = SIDE_IK_BONES[ch][z];
    if (!bone || !nodes[bone]) return false;
    nodes[bone].getWorldPosition(_out);
    return true;
  }

  const bones = FRONT_IK_BONES[ch];
  if (!bones) return false;
  const [mcpName, pipName, dipName] = bones;
  if (!nodes[mcpName] || !nodes[pipName] || !nodes[dipName]) return false;

  nodes[mcpName].getWorldPosition(_pA);
  nodes[pipName].getWorldPosition(_pB);
  nodes[dipName].getWorldPosition(_pC);

  switch (z) {
    case 4:  _out.copy(_pA); break; // MCP
    case 3:  _out.copy(_pB); break; // toward PIP
    case 2:  _out.copy(_pC); break; // just past PIP
    case 0:  _out.copy(_pC); break; // near DIP / tip
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
  const _pA      = useMemo(() => new THREE.Vector3(), []);  // MCP world pos
  const _pB      = useMemo(() => new THREE.Vector3(), []);  // PIP world pos
  const _pC      = useMemo(() => new THREE.Vector3(), []);  // DIP world pos
  const _ikTgt   = useMemo(() => new THREE.Vector3(), []);  // interpolated target
  const _thumbP  = useMemo(() => new THREE.Vector3(), []);  // thumb base pos
  const _parentQ = useMemo(() => new THREE.Quaternion(), []);
  const _ikQ     = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    if (!nodes) return;

    const flex = sensorData?.flex ?? {};
    const pads = sensorData?.pads ?? [];

    // ── 1. All bones start at REST ────────────────────────────────────────
    const targets = { ...REST_Q };

    // ── 2. Flex bending ───────────────────────────────────────────────────
    Object.entries(FLEX_BONES).forEach(([key, { bone, dip }]) => {
      // Extract the number from the string (e.g., "flex9" -> 9)
      const flexId = parseInt(key.replace('flex', ''), 10);
      
      // Choose threshold: Odd numbers use MCP threshold, Even use standard
      const threshold = (flexId % 2 !== 0) ? CURL_THRESHOLD_MCP : CURL_THRESHOLD;

      if ((flex[key]?.curl ?? 0) > threshold) {
        targets[bone] = CURL_Q[bone];
        if (dip) targets[dip] = CURL_Q[dip];
      }
    });
    // ── 3. Pad state ──────────────────────────────────────────────────────
    const { thumbCh, thumbZ, fingerClosePairs } = resolvePadState(pads);

    fingerClosePairs.forEach(({ ch, z }) => {
      // Logic for CH4: Index Finger
      if (ch === 'CH4' && (z === 3 || z === 4)) {
        targets.index_01R_017 = TOUCH_Q.index_01R_017;
      } 
      
      // Logic for CH5: Ring or Pinky Finger
      else if (ch === 'CH5') {
        if (z === 0 || z === 2) {
          targets.ring_01R_033 = TOUCH_Q.ring_01R_033;
        } else if (z === 3 || z === 4) {
          targets.pinky_01R_041 = TOUCH_Q.pinky_01R_041;
        }
      }
    });

    // ── 4. Slerp all non-thumb bones ──────────────────────────────────────
    Object.entries(targets).forEach(([bone, tgt]) => {
      if (bone === 'thumb_01R_08' || bone === 'thumb_02R_09') return;
      nodes[bone]?.quaternion.slerp(tgt, LERP_SPEED);
    });

    // ── 5. Thumb IK ───────────────────────────────────────────────────────
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