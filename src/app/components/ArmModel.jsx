"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

const LERP_SPEED = 0.18;

const RIGHT_ARM_BONES = {
  upperArm: "upper_armR_03",
  forearm:  "forearmR001_09",
  hand:     "handR_010",
};
const LEFT_ARM_BONES = {
  upperArm: "upper_armL_07",
  forearm:  "forearmL001_030",
  hand:     "handL_031",
};

const RIGHT_FINGER_BONES = [
  "thumb01R_023",    "thumb02R_024",    "thumb03R_025",
  "f_index01R_027",  "f_index02R_028",  "f_index03R_029",
  "f_middle01R_016", "f_middle02R_017", "f_middle03R_018",
  "f_ring01R_020",   "f_ring02R_021",   "f_ring03R_022",
  "f_pinky01R_012",  "f_pinky02R_013",  "f_pinky03R_014",
  "f_pinky03R_end_053"
];
const LEFT_FINGER_BONES = [
  "thumb01L_048",    "thumb02L_049",    "thumb03L_050",
  "f_index01L_037",  "f_index02L_038",  "f_index03L_039",
  "f_middle01L_045", "f_middle02L_046", "f_middle03L_047",
  "f_ring01L_041",   "f_ring02L_042",   "f_ring03L_043",
  "f_pinky01L_033",  "f_pinky02L_034",  "f_pinky03L_035",
  "f_pinky03L_end_058"
];

// Default human biomechanical wrist limits (degrees)
export const DEFAULT_WRIST_LIMITS = {
  flexion:   80,   // max forward bend (+X)
  extension: 70,   // max backward bend (-X)
  radial:    20,   // max radial deviation (-Y, toward thumb)
  ulnar:     30,   // max ulnar deviation (+Y, toward pinky)
  pronation: 90,   // max rotation one way (+Z)
  supination:90,   // max rotation other way (-Z)
};

// Default finger limits (degrees)
export const DEFAULT_FINGER_LIMITS = {
  pitchMin: -5,    // slight hyper-extension allowed
  pitchMax: 110,   // max curl
  yawMin:   -25,   // max spread outward
  yawMax:    25,   // max spread inward (when open)
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

const DEG2RAD = Math.PI / 180;

/**
 * Apply biomechanical clamps to a wrist quaternion.
 * Converts to Euler XYZ, clamps each axis, converts back.
 */
function clampWristQuat(quatArray, limits) {
  const [x, y, z, w] = quatArray;
  const q = new THREE.Quaternion(x, y, z, w).normalize();
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  euler.x = clamp(euler.x, -(limits.extension * DEG2RAD), limits.flexion    * DEG2RAD);
  euler.y = clamp(euler.y, -(limits.radial    * DEG2RAD), limits.ulnar      * DEG2RAD);
  euler.z = clamp(euler.z, -(limits.supination* DEG2RAD), limits.pronation  * DEG2RAD);

  const clamped = new THREE.Quaternion().setFromEuler(euler);
  return [clamped.x, clamped.y, clamped.z, clamped.w];
}

/**
 * Apply biomechanical clamps to a finger bone quaternion.
 * Pitch (X) = curl/extend. Yaw (Y) = spread. Z left alone.
 */
function clampFingerQuat(quatArray, limits) {
  const [x, y, z, w] = quatArray;
  const q = new THREE.Quaternion(x, y, z, w).normalize();
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  euler.x = clamp(euler.x, limits.pitchMin * DEG2RAD, limits.pitchMax * DEG2RAD);
  euler.y = clamp(euler.y, limits.yawMin   * DEG2RAD, limits.yawMax   * DEG2RAD);

  const clamped = new THREE.Quaternion().setFromEuler(euler);
  return [clamped.x, clamped.y, clamped.z, clamped.w];
}

function getSpreadRotation(boneName, isLeft) {
  const s = isLeft ? -1 : 1;
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  if (boneName.includes("thumb")) {
    euler.set(0, 0 * s, -0.2 * s);
  } else if (boneName.includes("index")) {
    euler.set(0, 0.15 * s, 0);
  } else if (boneName.includes("middle")) {
    euler.set(0, 0, 0);
  } else if (boneName.includes("ring")) {
    euler.set(0, -0.15 * s, 0);
  } else if (boneName.includes("pinky")) {
    euler.set(0, -0.3 * s, 0);
  }

  return new THREE.Quaternion().setFromEuler(euler);
}

function applyBoneQuaternion(node, quaternionArray) {
  if (!node || !quaternionArray || quaternionArray.length < 4) return;
  const [x, y, z, w] = quaternionArray;
  node.quaternion.slerp(new THREE.Quaternion(x, y, z, w).normalize(), LERP_SPEED);
}

export function CombinedArmRig({
  leftHandSensorData,
  rightHandSensorData,
  restRotationR = [3.15, 2.29, 3.15],
  restRotationL = [3.15, -2.29, 3.15],
  // Biomechanical constraints — pass null/undefined to disable clamping
  wristLimits   = DEFAULT_WRIST_LIMITS,
  fingerLimits  = DEFAULT_FINGER_LIMITS,
  ...props
}) {
  const group = useRef();
  const { scene } = useGLTF('/first_person_hands_rigged.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);

  useFrame(() => {
    if (!nodes) return;

    const RIGHT_REST = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...restRotationR, 'XYZ')
    );
    const LEFT_REST = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...restRotationL, 'XYZ')
    );

    // ── RIGHT HAND WRIST ──────────────────────────────────────
    const rHand = nodes[RIGHT_ARM_BONES.hand];
    if (rHand) {
      if (rightHandSensorData?.palm) {
        const palmQ = wristLimits
          ? clampWristQuat(rightHandSensorData.palm, wristLimits)
          : rightHandSensorData.palm;
        applyBoneQuaternion(rHand, palmQ);
      } else {
        rHand.quaternion.slerp(RIGHT_REST, LERP_SPEED);
      }
    }

    // ── RIGHT FINGER BONES ────────────────────────────────────
    const hasRF = Array.isArray(rightHandSensorData?.fingers) && rightHandSensorData.fingers.length > 0;
    RIGHT_FINGER_BONES.forEach((name, i) => {
      const bone = nodes[name];
      if (!bone) return;
      if (hasRF && rightHandSensorData.fingers[i]) {
        const fq = fingerLimits
          ? clampFingerQuat(rightHandSensorData.fingers[i], fingerLimits)
          : rightHandSensorData.fingers[i];
        applyBoneQuaternion(bone, fq);
      } else {
        bone.quaternion.slerp(getSpreadRotation(name, false), LERP_SPEED);
      }
    });

    // ── LEFT HAND WRIST ───────────────────────────────────────
    const lHand = nodes[LEFT_ARM_BONES.hand];
    if (lHand) {
      if (leftHandSensorData?.palm) {
        const palmQ = wristLimits
          ? clampWristQuat(leftHandSensorData.palm, wristLimits)
          : leftHandSensorData.palm;
        applyBoneQuaternion(lHand, palmQ);
      } else {
        lHand.quaternion.slerp(LEFT_REST, LERP_SPEED);
      }
    }

    // ── LEFT FINGER BONES ─────────────────────────────────────
    const hasLF = Array.isArray(leftHandSensorData?.fingers) && leftHandSensorData.fingers.length > 0;
    LEFT_FINGER_BONES.forEach((name, i) => {
      const bone = nodes[name];
      if (!bone) return;
      if (hasLF && leftHandSensorData.fingers[i]) {
        const fq = fingerLimits
          ? clampFingerQuat(leftHandSensorData.fingers[i], fingerLimits)
          : leftHandSensorData.fingers[i];
        applyBoneQuaternion(bone, fq);
      } else {
        bone.quaternion.slerp(getSpreadRotation(name, true), LERP_SPEED);
      }
    });
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={nodes.RootNode || clone} />
    </group>
  );
}

export function ArmModel({
  leftHandSensorData,
  rightHandSensorData,
  restRotationR,
  restRotationL,
  wristLimits,
  fingerLimits,
}) {
  return (
    <group>
      <CombinedArmRig
        leftHandSensorData={leftHandSensorData}
        rightHandSensorData={rightHandSensorData}
        restRotationR={restRotationR}
        restRotationL={restRotationL}
        wristLimits={wristLimits}
        fingerLimits={fingerLimits}
        position={[0, -0.9, 0]}
        scale={[0.01, 0.01, 0.01]}
      />
    </group>
  );
}

useGLTF.preload('/first_person_hands_rigged.glb');