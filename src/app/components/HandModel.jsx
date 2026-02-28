"use client";
import React, { useRef, useMemo } from 'react';
import { useGraph, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

// ─── Default "open & spread" pose ───────────────────────────────────────────
// Tweak the Euler angles here until the rest pose looks how you want it.
const DEFAULT_POSE = {
  index_01R_017:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0.15,  0)),
  index_02R_018:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  index_03R_019:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  middle_01R_025: new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  middle_02R_026: new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  middle_03R_027: new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  ring_01R_033:   new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.10,  0)),
  ring_02R_034:   new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  ring_03R_035:   new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  pinky_01R_041:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.20,  0)),
  pinky_02R_042:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  pinky_03R_043:  new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0)),
  thumb_01R_08:   new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0.40)),
  thumb_02R_09:   new THREE.Quaternion().setFromEuler(new THREE.Euler(0,  0,     0.20)),
};

// Maps WebSocket finger keys → primary bone name
const FINGER_BONE_MAP = {
  index:  'index_01R_017',
  middle: 'middle_01R_025',
  ring:   'ring_01R_033',
  pinky:  'pinky_01R_041',
  thumb:  'thumb_01R_08',
};

// ─── Component ───────────────────────────────────────────────────────────────
// Props:
//   sensorData  – latest delta-quaternion frame  { index: {qw,qx,qy,qz}, … }
//   calibrate   – a React ref; set calibrate.current = true to reset the pose
export function HandModel({ sensorData, calibrate, ...props }) {
  const group = useRef();
  const { scene } = useGLTF('/rigged_hand.glb');
  const clone   = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);

  // Accumulated quaternions per bone – initialised to the default open pose
  const accumulated = useRef({});
  useMemo(() => {
    accumulated.current = Object.fromEntries(
      Object.entries(DEFAULT_POSE).map(([k, q]) => [k, q.clone()])
    );
  }, []);

  const _deltaQ = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    if (!nodes) return;

    // ── Calibrate: reset to default pose ─────────────────────────────────
    if (calibrate?.current) {
      Object.entries(DEFAULT_POSE).forEach(([boneName, defaultQ]) => {
        accumulated.current[boneName] = defaultQ.clone();
      });
      calibrate.current = false;
    }

    // ── Accumulate delta quaternions ──────────────────────────────────────
    if (sensorData) {
      Object.entries(FINGER_BONE_MAP).forEach(([fingerKey, boneName]) => {
        const delta = sensorData[fingerKey];
        if (delta?.qw !== undefined && accumulated.current[boneName]) {
          _deltaQ.set(delta.qx ?? 0, delta.qy ?? 0, delta.qz ?? 0, delta.qw);
          accumulated.current[boneName].multiply(_deltaQ);
        }
      });
    }

    // ── Write to bones ────────────────────────────────────────────────────
    Object.entries(accumulated.current).forEach(([boneName, q]) => {
      if (nodes[boneName]) nodes[boneName].quaternion.copy(q);
    });
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
