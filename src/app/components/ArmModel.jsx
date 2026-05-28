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

function getSpreadRotation(boneName, isLeft) {
  const s = isLeft ? -1 : 1;
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  // For this rig's bone orientation:
  // X = curl/extend (negative = extend/open)
  // Y = fan left/right spread between fingers
  // Z = twist (rarely needed)

  if (boneName.includes("thumb")) {
    euler.set(0.4, 0 * s, -0.2 * s);  // extend out + splay away from palm
  } else if (boneName.includes("index")) {
    euler.set(-0.2, 0.15 * s, 0);        // extend + fan outward
  } else if (boneName.includes("middle")) {
    euler.set(-0.2, 0, 0);               // extend straight, center anchor
  } else if (boneName.includes("ring")) {
    euler.set(-0.2, -0.15 * s, 0);       // extend + fan outward other side
  } else if (boneName.includes("pinky")) {
    euler.set(-0.2, -0.3 * s, 0);        // extend + fan far outward
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
  // ↓ NEW: [x, y, z] in radians for each hand's rest pose
  restRotationR = [3.15, 2.29, 3.15],
  restRotationL = [3.15, -2.29, 3.15],
  ...props
}) {
  const group = useRef();
  const { scene } = useGLTF('/first_person_hands_rigged.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);

  // Recompute rest quaternions every frame from the live prop values
  // (cheap — just 2 Euler→Quat conversions per frame)
  useFrame(() => {
    if (!nodes) return;

    const RIGHT_REST = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...restRotationR, 'XYZ')
    );
    const LEFT_REST = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...restRotationL, 'XYZ')
    );

    // ── RIGHT ARM ──────────────────────────────────
    if (rightHandSensorData?.upperArm)
      applyBoneQuaternion(nodes[RIGHT_ARM_BONES.upperArm], rightHandSensorData.upperArm);
    if (rightHandSensorData?.forearm)
      applyBoneQuaternion(nodes[RIGHT_ARM_BONES.forearm], rightHandSensorData.forearm);

    const rHand = nodes[RIGHT_ARM_BONES.hand];
    if (rHand) {
      if (rightHandSensorData?.palm) applyBoneQuaternion(rHand, rightHandSensorData.palm);
      else rHand.quaternion.slerp(RIGHT_REST, LERP_SPEED);
    }

    const hasRF = Array.isArray(rightHandSensorData?.fingers) && rightHandSensorData.fingers.length > 0;
    RIGHT_FINGER_BONES.forEach((name, i) => {
      const bone = nodes[name];
      if (!bone) return;
      if (hasRF && rightHandSensorData.fingers[i]) applyBoneQuaternion(bone, rightHandSensorData.fingers[i]);
      else bone.quaternion.slerp(getSpreadRotation(name, false), LERP_SPEED);
    });

    // ── LEFT ARM ───────────────────────────────────
    if (leftHandSensorData?.upperArm)
      applyBoneQuaternion(nodes[LEFT_ARM_BONES.upperArm], leftHandSensorData.upperArm);
    if (leftHandSensorData?.forearm)
      applyBoneQuaternion(nodes[LEFT_ARM_BONES.forearm], leftHandSensorData.forearm);

    const lHand = nodes[LEFT_ARM_BONES.hand];
    if (lHand) {
      if (leftHandSensorData?.palm) applyBoneQuaternion(lHand, leftHandSensorData.palm);
      else lHand.quaternion.slerp(LEFT_REST, LERP_SPEED);
    }

    const hasLF = Array.isArray(leftHandSensorData?.fingers) && leftHandSensorData.fingers.length > 0;
    LEFT_FINGER_BONES.forEach((name, i) => {
      const bone = nodes[name];
      if (!bone) return;
      if (hasLF && leftHandSensorData.fingers[i]) applyBoneQuaternion(bone, leftHandSensorData.fingers[i]);
      else bone.quaternion.slerp(getSpreadRotation(name, true), LERP_SPEED);
    });
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={nodes.RootNode || clone} />
    </group>
  );
}

export function ArmModel({ leftHandSensorData, rightHandSensorData, restRotationR, restRotationL }) {
  return (
    <group>
      <CombinedArmRig
        leftHandSensorData={leftHandSensorData}
        rightHandSensorData={rightHandSensorData}
        restRotationR={restRotationR}
        restRotationL={restRotationL}
        position={[0, -0.9, 0]}
        scale={[0.01, 0.01, 0.01]}
      />
    </group>
  );
}

useGLTF.preload('/first_person_hands_rigged.glb');