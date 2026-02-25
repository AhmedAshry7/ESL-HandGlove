"use client";
import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { HandModel } from "../components/HandModel";
import Image from "next/image";
import logo from "../assets/logo.png";
import {useRouter} from "next/navigation";

const mockUser = { name: "Ahmed Ashry", initials: "AA" };

export default function GloveCapture() {
  const router = useRouter();
  const [recordings, setRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [trimRange, setTrimRange] = useState([0, 100]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // null | 'success' | 'error'
  const socketRef = useRef(null);
  const dropdownRef = useRef(null);

  // Change this line in your useEffect in app/page.js
  useEffect(() => {
    // REPLACE '192.168.X.X' with the actual IP from the Serial Monitor
    const GLOVE_IP = "192.168.0.71"; // Example IP
    socketRef.current = new WebSocket(`ws://${GLOVE_IP}:81`);
    
    socketRef.current.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data);
        
        // The ESP32 sends: { "fingers": { "index": { "pitch": 25.4, ... }, ... } }
        if (rawData.fingers) {
          setCurrentFrame(rawData.fingers); // We save just the fingers object
          
          if (isRecording) {
            setRecordings((prev) => [...prev, rawData.fingers]);
          }
        }
      } catch (err) {
        console.error("Error parsing glove data:", err);
      }
    };

    return () => socketRef.current.close();
  }, [isRecording]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSave = () => {
    const startIdx = Math.floor((trimRange[0] / 100) * recordings.length);
    const endIdx = Math.floor((trimRange[1] / 100) * recordings.length);
    const cleanedData = recordings.slice(startIdx, endIdx);
    console.log("Saving Cleaned Data:", cleanedData);
    setUploadStatus('success');
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const frameCount = recordings.length;
  const duration = (frameCount / 60).toFixed(1); // rough estimate at 60fps

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .rec-dot { animation: pulse 1.2s ease-in-out infinite; }
        .start-btn:hover { background: #b91c1c !important; transform: translateY(-1px); }
        .stop-btn:hover { background: #374151 !important; transform: translateY(-1px); }
        .upload-btn:hover { background: #0f3460 !important; transform: translateY(-1px); }
        .logout-item:hover { background: rgba(220,38,38,0.08) !important; color: #ef4444 !important; }
        .dd-item:hover { background: rgba(255,255,255,0.05) !important; }

        /* Custom range slider */
        input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px; background: #2d3748; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #e2b96f; border: 2px solid #1a1a2e; cursor: pointer; transition: transform 0.15s; }
        input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #e2b96f; border: 2px solid #1a1a2e; cursor: pointer; }
      `}</style>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navBrand}>
          <div ><Image src={logo} alt="Logo" width="50" height="50" /></div>
          <span style={s.navName}>صوتك</span>
          <span style={s.navDivider}>|</span>
          <span style={s.navSub}>Glove Studio</span>
        </div>

        <div style={s.navRight} ref={dropdownRef}>
          <button style={s.userPill} onClick={() => setDropdownOpen(o => !o)}>
            <div style={s.avatar}>{mockUser.initials}</div>
            <span style={s.userName}>{mockUser.name}</span>
            <span style={s.chevron}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {dropdownOpen && (
            <div style={s.dropdown}>
              <div style={s.ddHeader}>
                <div style={{ ...s.avatar, width: 36, height: 36, fontSize: 13 }}>{mockUser.initials}</div>
                <div>
                  <div style={s.ddName}>{mockUser.name}</div>
                  <div style={s.ddEmail}>alex@example.com</div>
                </div>
              </div>
              <div style={s.ddDivider} />
              <button onClick={() => router.push("/")} className="dd-item" style={s.ddItem}>Home</button>
              <div style={s.ddDivider} />
              <button onClick={() => router.push("/models")} className="dd-item" style={s.ddItem}>Models</button>
              <div style={s.ddDivider} />
              <button onClick={() => router.push("/login")} className="logout-item" style={{ ...s.ddItem, color: '#ef4444' }}>Sign out →</button>
            </div>
          )}
        </div>
      </nav>

      {/* BODY */}
      <div style={s.body}>

        {/* Left: 3D canvas + controls */}
        <div style={s.leftCol}>

          {/* Page title row */}
          <div style={s.titleRow}>
            <div>
              <h1 style={s.title}>Glove Data Studio</h1>
              <p style={s.subtitle}>Capture and upload hand gesture sequences</p>
            </div>
            {isRecording && (
              <div style={s.recBadge}>
                <span className="rec-dot" style={s.recDot} />
                REC · {frameCount} frames
              </div>
            )}
          </div>

          {/* 3D Viewport */}
          <div style={s.viewport}>
            <div style={s.viewportLabel}>3D Preview</div>
            <Canvas camera={{ position: [0, 0, 5] }} style={{ width: '100%', height: '100%' }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} />
              <HandModel sensorData={currentFrame} />
            </Canvas>
            {!currentFrame && (
              <div style={s.viewportOverlay}>
                <div style={s.viewportIcon}>🧤</div>
                <p style={s.viewportHint}>Waiting for glove connection…</p>
              </div>
            )}
          </div>

          {/* Recording controls */}
          <div style={s.controlRow}>
            <button
              className="start-btn"
              style={{ ...s.btn, ...s.startBtn, ...(isRecording ? s.startBtnActive : {}) }}
              onClick={() => { setRecordings([]); setIsRecording(true); }}
            >
              <span style={s.btnIcon}>●</span> Start Recording
            </button>
            <button
              className="stop-btn"
              style={{ ...s.btn, ...s.stopBtn }}
              onClick={() => setIsRecording(false)}
              disabled={!isRecording}
            >
              <span style={s.btnIcon}>■</span> Stop
            </button>
          </div>
        </div>

        {/* Right: stats + trim + upload */}
        <div style={s.rightCol}>

          {/* Stats cards */}
          <div style={s.statsGrid}>
            {[
              { label: 'Frames', value: frameCount },
              { label: 'Duration', value: `${duration}s` },
              { label: 'Trim Start', value: `${trimRange[0]}%` },
              { label: 'Trim End', value: `${trimRange[1]}%` },
            ].map(stat => (
              <div key={stat.label} style={s.statCard}>
                <div style={s.statValue}>{stat.value}</div>
                <div style={s.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Trim panel */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>Trim Sequence</h3>
              <p style={s.panelSub}>Adjust start and end percentage</p>
            </div>

            <div style={s.sliderGroup}>
              <div style={s.sliderRow}>
                <label style={s.sliderLabel}>Start</label>
                <span style={s.sliderVal}>{trimRange[0]}%</span>
              </div>
              <input
                type="range" min="0" max="100"
                value={trimRange[0]}
                style={{ width: '100%' }}
                onChange={(e) => setTrimRange([parseInt(e.target.value), trimRange[1]])}
              />
            </div>

            <div style={s.sliderGroup}>
              <div style={s.sliderRow}>
                <label style={s.sliderLabel}>End</label>
                <span style={s.sliderVal}>{trimRange[1]}%</span>
              </div>
              <input
                type="range" min="0" max="100"
                value={trimRange[1]}
                style={{ width: '100%' }}
                onChange={(e) => setTrimRange([trimRange[0], parseInt(e.target.value)])}
              />
            </div>

            {/* Preview bar */}
            <div style={s.trimBar}>
              <div style={{
                ...s.trimFill,
                left: `${trimRange[0]}%`,
                width: `${trimRange[1] - trimRange[0]}%`,
              }} />
            </div>
            <p style={s.trimNote}>
              {Math.max(0, Math.floor(((trimRange[1] - trimRange[0]) / 100) * frameCount))} frames selected
            </p>
          </div>

          {/* Upload */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>Upload to Database</h3>
              <p style={s.panelSub}>Save the trimmed sequence</p>
            </div>

            <button
              className="upload-btn"
              style={s.uploadBtn}
              onClick={handleSave}
              disabled={frameCount === 0}
            >
              {uploadStatus === 'success' ? '✓ Uploaded!' : 'Upload to Database →'}
            </button>

            {uploadStatus === 'success' && (
              <div style={s.successBanner}>
                Sequence saved successfully to the database.
              </div>
            )}

            {frameCount === 0 && (
              <p style={s.disabledNote}>Record a sequence first before uploading.</p>
            )}
          </div>

          {/* Sensor live readout */}
          {currentFrame && (
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>Live Sensor Data</h3>
              </div>
              <div style={s.sensorGrid}>
                {Object.entries(currentFrame).map(([key, fingerObj]) => (
                  <div key={key} style={{...s.sensorRow, flexDirection: 'column', alignItems: 'flex-start', gap: '2px', marginBottom: '8px'}}>
                    <span style={{...s.sensorKey, fontWeight: 'bold', color: '#fff'}}>{key}</span>
                    
                    {/* Show Pitch or W-Quaternion as a representative number for the bar */}
                    <div style={s.sensorRow}>
                      <div style={s.sensorBarBg}>
                        <div style={{ 
                          ...s.sensorBarFill, 
                          width: `${Math.abs(fingerObj.pitch || fingerObj.qw || 0)}%` 
                        }} />
                      </div>
                      <span style={s.sensorVal}>
                        {/* Displaying just the pitch or first quaternion value so it doesn't crash */}
                        {fingerObj.pitch !== undefined ? fingerObj.pitch.toFixed(1) : fingerObj.qw?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Styles ── */
const s = {
  page: {
    minHeight: '100vh',
    background: '#0d0f1a',
    fontFamily: "'DM Sans', sans-serif",
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
  },

  /* NAV */
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    height: '60px',
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    backdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '10px' },
  navLogo: { color: '#e2b96f', fontSize: '18px' },
  navName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '0.5px',
  },
  navDivider: { color: 'rgba(255,255,255,0.15)', fontSize: '16px' },
  navSub: { fontSize: '13px', color: '#a0aec0', fontWeight: 300 },
  navRight: { position: 'relative' },

  userPill: {
    display: 'flex', alignItems: 'center', gap: '9px',
    padding: '5px 12px 5px 5px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '100px', cursor: 'pointer', transition: 'border-color 0.2s',
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0f3460, #e2b96f)',
    color: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', flexShrink: 0,
  },
  userName: { fontSize: '13px', fontWeight: 500, color: '#e2e8f0' },
  chevron: { fontSize: '10px', color: '#a0aec0' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    background: '#1a1f35', borderRadius: '16px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
    minWidth: '200px', overflow: 'hidden',
    animation: 'slideDown 0.15s ease', zIndex: 100,
  },
  ddHeader: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 16px', background: 'rgba(255,255,255,0.03)',
  },
  ddName: { fontSize: '13px', fontWeight: 500, color: '#e2e8f0' },
  ddEmail: { fontSize: '11px', color: '#718096' },
  ddDivider: { height: '1px', background: 'rgba(255,255,255,0.06)' },
  ddItem: {
    display: 'block', width: '100%', padding: '10px 16px',
    background: 'transparent', border: 'none', textAlign: 'left',
    fontSize: '13px', color: '#a0aec0', cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },

  /* BODY */
  body: {
    flex: 1, display: 'flex', gap: '24px',
    padding: '28px', maxWidth: '1400px', margin: '0 auto', width: '100%',
  },

  leftCol: { flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 },
  rightCol: { width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' },

  titleRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px', fontWeight: 600, color: '#ffffff', marginBottom: '4px',
  },
  subtitle: { fontSize: '13px', color: '#718096', fontWeight: 300 },

  recBadge: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 14px', borderRadius: '100px',
    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
    color: '#ef4444', fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.5px',
  },
  recDot: { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' },

  /* VIEWPORT */
  viewport: {
    flex: 1, minHeight: '380px',
    background: 'linear-gradient(145deg, #0a0c18, #111827)',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.06)',
    position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)',
  },
  viewportLabel: {
    position: 'absolute', top: 14, left: 18, zIndex: 2,
    fontSize: '11px', fontWeight: 500, color: '#4a5568',
    letterSpacing: '1px', textTransform: 'uppercase',
  },
  viewportOverlay: {
    position: 'absolute', inset: 0, display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },
  viewportIcon: { fontSize: '40px', marginBottom: '12px', opacity: 0.3 },
  viewportHint: { fontSize: '13px', color: '#4a5568' },

  /* CONTROLS */
  controlRow: { display: 'flex', gap: '12px' },
  btn: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 22px', borderRadius: '12px',
    border: 'none', fontSize: '14px', fontWeight: 500,
    cursor: 'pointer', transition: 'background 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  btnIcon: { fontSize: '10px' },
  startBtn: { background: '#dc2626', color: '#fff' },
  startBtnActive: { background: '#b91c1c' },
  stopBtn: { background: '#1f2937', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' },

  /* STATS */
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  statCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', padding: '14px 16px',
  },
  statValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px', fontWeight: 600, color: '#e2b96f', marginBottom: '2px',
  },
  statLabel: { fontSize: '11px', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.8px' },

  /* PANEL */
  panel: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '18px', padding: '20px',
  },
  panelHeader: { marginBottom: '18px' },
  panelTitle: { fontSize: '14px', fontWeight: 500, color: '#e2e8f0', marginBottom: '3px' },
  panelSub: { fontSize: '12px', color: '#718096', fontWeight: 300 },

  /* SLIDERS */
  sliderGroup: { marginBottom: '18px' },
  sliderRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  sliderLabel: { fontSize: '12px', color: '#a0aec0' },
  sliderVal: { fontSize: '12px', color: '#e2b96f', fontWeight: 500 },

  /* TRIM BAR */
  trimBar: {
    height: '6px', background: '#1a1f35',
    borderRadius: '6px', position: 'relative', overflow: 'hidden',
    marginTop: '4px',
  },
  trimFill: {
    position: 'absolute', height: '100%',
    background: 'linear-gradient(90deg, #0f3460, #e2b96f)',
    borderRadius: '6px',
  },
  trimNote: { fontSize: '11px', color: '#4a5568', marginTop: '8px' },

  /* UPLOAD */
  uploadBtn: {
    width: '100%', padding: '13px',
    background: '#1a1a2e',
    color: '#e2b96f',
    border: '1px solid rgba(226,185,111,0.25)',
    borderRadius: '12px',
    fontSize: '14px', fontWeight: 500,
    cursor: 'pointer', transition: 'background 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.3px',
  },
  successBanner: {
    marginTop: '12px', padding: '10px 14px',
    background: 'rgba(5,150,105,0.12)',
    border: '1px solid rgba(5,150,105,0.25)',
    borderRadius: '10px', fontSize: '12.5px', color: '#34d399',
  },
  disabledNote: { marginTop: '10px', fontSize: '11.5px', color: '#4a5568' },

  /* SENSOR */
  sensorGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sensorRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  sensorKey: { fontSize: '11.5px', color: '#718096', width: '50px', textTransform: 'capitalize' },
  sensorBarBg: { flex: 1, height: '4px', background: '#1a1f35', borderRadius: '4px', overflow: 'hidden' },
  sensorBarFill: { height: '100%', background: 'linear-gradient(90deg, #0f3460, #e2b96f)', borderRadius: '4px', transition: 'width 0.2s' },
  sensorVal: { fontSize: '11px', color: '#e2b96f', width: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
