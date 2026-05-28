"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

const LERP_SPEED = 0.18;

// Map your sequential 16 ESP hall-effect quaternions to the matching bones in hand_gesture_1.glb
const FINGER_BONES_MAP = [
  "mixamorigThumb1", "mixamorigThumb2", "mixamorigThumb3",
  "mixamorigIndex1", "mixamorigIndex2", "mixamorigIndex3",
  "mixamorigMiddle1", "mixamorigMiddle2", "mixamorigMiddle3",
  "mixamorigRing1", "mixamorigRing2", "mixamorigRing3",
  "mixamorigPinky1", "mixamorigPinky2", "mixamorigPinky3", "mixamorigPinky4"
];

function applyBoneQuaternion(node, quaternionArray, isLeftHand) {
  if (!node || !quaternionArray || quaternionArray.length < 4) return;

  let [x, y, z, w] = quaternionArray;

  // Mirroring correction for quaternion orientation across the X plane
  if (isLeftHand) {
    x = -x;
    w = -w;
  }

  const targetQ = new THREE.Quaternion(x, y, z, w).normalize();
  node.quaternion.slerp(targetQ, LERP_SPEED);
}

// ─── Single Arm/Hand Core Component ───────────────────────────────────────────
export function SingleArmModel({ sensorData, isLeftHand, ...props }) {
  const group = useRef();
  
  // Load the new GLB file uploaded by user
  const { scene } = useGLTF('/hand_gesture_1.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);

  // Correct mesh materials if mirrored so they do not render inside-out
  useMemo(() => {
    if (isLeftHand) {
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.side = THREE.DoubleSide; 
        }
      });
    }
  }, [clone, isLeftHand]);

  useFrame(() => {
    if (!nodes) return;

    // --- 1. Orient the Major Arm IMUs ---
    if (sensorData?.upperArm) {
      applyBoneQuaternion(nodes.mixamorigLeftUpArm || nodes.mixamorigRightUpArm, sensorData.upperArm, isLeftHand);
    }
    if (sensorData?.forearm) {
      applyBoneQuaternion(nodes.mixamorigLeftForeArm || nodes.mixamorigRightForeArm, sensorData.forearm, isLeftHand);
    }
    if (sensorData?.palm) {
      applyBoneQuaternion(nodes.mixamorigLeftHand || nodes.mixamorigRightHand, sensorData.palm, isLeftHand);
    }

    // --- 2. Orient Finger Hall Effect Sensors ---
    if (Array.isArray(sensorData?.fingers)) {
      sensorData.fingers.forEach((qArray, index) => {
        const boneName = FINGER_BONES_MAP[index];
        if (boneName && nodes[boneName]) {
          applyBoneQuaternion(nodes[boneName], qArray, isLeftHand);
        }
      });
    }
  });

  // Safe selection of root bone structures present in hand_gesture_1.glb
  const rootBone = nodes.mixamorigHips || nodes.RootNode || clone;

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={rootBone} />
    </group>
  );
}

// ─── Main Orchestrator Wrapper Component ──────────────────────────────────────
export function ArmModel({ leftHandSensorData, rightHandSensorData }) {
  return (
    <group>
      {/* Right Hand / Arm (Brought inward to x = 0.55, dropped down to y = -0.1) */}
      <SingleArmModel 
        sensorData={rightHandSensorData} 
        isLeftHand={false} 
        position={[0, -1, 0]} 
        rotation={[0, 0, 0]}
        scale={[0.012, 0.012, 0.012]} 
      />

      {/* Left Hand / Arm (Brought inward to x = -0.55, dropped down to y = -0.1) */}
      <SingleArmModel 
        sensorData={leftHandSensorData} 
        isLeftHand={true} 
        position={[0, -1, 0]} 
        rotation={[0, 0, 0]}
        scale={[-0.012, 0.012, 0.012]} 
      />
    </group>
  );
}

useGLTF.preload('/hand_gesture_1.glb');