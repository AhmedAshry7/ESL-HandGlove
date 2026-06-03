import React, { memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ArmModel } from "../../../components/ArmModel";

export const Scene = memo(function Scene({ combinedRigRef, targetLeftEnabled = false, targetRightEnabled = true }) {
  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0, 1.2, 3], fov: 45 }}>
        <color attach="background" args={['#0a0c18']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} color="#e2b96f" />
        <gridHelper args={[10, 20, '#ffffff', '#ffffff']} position={[0, 0, 0]} material-opacity={0.05} material-transparent />

        <ArmModel
          rigDataRef={combinedRigRef}
          leftEnabled={targetLeftEnabled}
          rightEnabled={targetRightEnabled}
        />
      </Canvas>
    </div>
  );
});