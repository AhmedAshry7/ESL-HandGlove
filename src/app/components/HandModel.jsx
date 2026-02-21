"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';

export function HandModel({ sensorData, ...props }) {
  const group = useRef();
  const { scene } = useGLTF('/rigged_hand.glb');

  // Clone so mutations don't affect the cache
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);

  useFrame(() => {
    if (!sensorData || !nodes) return;

    // Maps sensor value (0–1023) → rotation in radians (0 to –1.5 rad ≈ 90°)
    const getRot = (val) => (val * -1.5) / 1023;

    // Index
    if (nodes.index_01R_017) {
      nodes.index_01R_017.rotation.z = getRot(sensorData.index);
      if (nodes.index_02R_018) nodes.index_02R_018.rotation.z = getRot(sensorData.index) * 0.5;
    }

    // Middle
    if (nodes.middle_01R_025) {
      nodes.middle_01R_025.rotation.z = getRot(sensorData.middle);
      if (nodes.middle_02R_026) nodes.middle_02R_026.rotation.z = getRot(sensorData.middle) * 0.5;
    }

    // Thumb
    if (nodes.thumb_01R_08) {
      nodes.thumb_01R_08.rotation.z = getRot(sensorData.thumb);
    }

    // Ring
    if (nodes.ring_01R_033) {
      nodes.ring_01R_033.rotation.z = getRot(sensorData.ring);
      if (nodes.ring_02R_034) nodes.ring_02R_034.rotation.z = getRot(sensorData.ring) * 0.5;
    }

    // Pinky
    if (nodes.pinky_01R_041) {
      nodes.pinky_01R_041.rotation.z = getRot(sensorData.pinky);
      if (nodes.pinky_02R_042) nodes.pinky_02R_042.rotation.z = getRot(sensorData.pinky) * 0.5;
    }
  });

  return (
    <group ref={group} {...props} dispose={null}>
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
