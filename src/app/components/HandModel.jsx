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

    const applyQuaternion = (nodeName, fingerKey) => {
      const data = sensorData[fingerKey];
      if (nodes[nodeName] && data && data.qw !== undefined) {
        // Apply the quaternion rotation (w, x, y, z)
        nodes[nodeName].quaternion.set(data.qx, data.qy, data.qz, data.qw);
      }
    };

    applyQuaternion('index_01R_017', 'index');
    applyQuaternion('middle_01R_025', 'middle');
    applyQuaternion('ring_01R_033', 'ring');
    applyQuaternion('pinky_01R_041', 'pinky');
    applyQuaternion('thumb_01R_08', 'thumb');
    // ... repeat for others
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
