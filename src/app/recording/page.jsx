"use client";
import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { HandModel } from "../components/HandModel";
import Image from "next/image";
import logo from "../assets/logo.png";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// ─── Tiny reusable 3-D scene wrapper ─────────────────────────────────────────
function Scene({ sensorData }) {
  return (
    <Canvas camera={{ position: [-7, 0, 5], fov: 35 }} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={4} />
      <pointLight position={[10, 10, 10]} intensity={1.2} />
      <pointLight position={[-10, -5, -10]} intensity={0.4} color="#e2b96f" />
      <HandModel sensorData={sensorData} />
    </Canvas>
  );
}

// ─── Recording modal ──────────────────────────────────────────────────────────
function RecordingModal({
  signLabel,
  isRecording,
  frames,
  trimRange,
  setTrimRange,
  onStop,
  onDiscard,
  onSave,
  currentFrame,
  calibrate,
}) {
  const frameCount = frames.length;
  const duration   = (frameCount / 60).toFixed(1);
  const trimStart  = trimRange[0];
  const trimEnd    = trimRange[1];
  const trimmedCount = Math.max(0, Math.floor(((trimEnd - trimStart) / 100) * frameCount));

  // Playback of recorded frames when stopped
  const [playbackFrame, setPlaybackFrame] = useState(null);
  const playbackRef = useRef(null);

  useEffect(() => {
    if (!isRecording && frames.length > 0) {
      // Loop playback over trimmed range
      let idx = Math.floor((trimStart / 100) * frames.length);
      const endIdx = Math.floor((trimEnd / 100) * frames.length);
      playbackRef.current = setInterval(() => {
        setPlaybackFrame(frames[idx]);
        idx++;
        if (idx >= endIdx) idx = Math.floor((trimStart / 100) * frames.length);
      }, 1000 / 30); // 30fps playback
    }
    return () => clearInterval(playbackRef.current);
  }, [isRecording, frames, trimStart, trimEnd]);

  const displayFrame = isRecording ? currentFrame : playbackFrame;

  return (
    <div style={rm.overlay}>
      <style>
        {`.close-btn:hover { background: #2e2e51 !important; }`}
      </style>
      <div style={rm.modal}>
        {/* Header */}
        <div style={rm.header}>
          <div style={rm.headerLeft}>
            <div style={rm.signChip}>
              <span style={rm.signChipIcon}>✋</span>
              <span style={rm.signChipText}>{signLabel}</span>
            </div>
            {isRecording
              ? <div style={rm.recBadge}><span className="rec-dot" style={rm.recDot} /> REC · {frameCount} frames</div>
              : <div style={rm.playBadge}>▶ Playback loop · {frameCount} frames captured</div>
            }
          </div>
          <div style={rm.headerRight}>
            <span style={rm.durationLabel}>{duration}s</span>
            <button
              className="close-btn"
              style={s.closeBtn}
              onClick={onDiscard}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div style={rm.viewport}>
          <div style={rm.vpLabel}>
            {isRecording ? 'LIVE CAPTURE' : 'PLAYBACK PREVIEW'}
          </div>
          <Scene sensorData={displayFrame} />
          {!displayFrame && (
            <div style={rm.vpOverlay}>
              <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }}>🧤</div>
              <p style={{ fontSize: 13, color: '#4a5568' }}>Waiting for glove connection…</p>
            </div>
          )}
        </div>

        {/* Bottom controls — changes depending on state */}
        {isRecording ? (
          <div style={rm.controls}>
            <div style={rm.controlHint}>Perform the sign now — recording in progress</div>
            <button className="stop-modal-btn" style={rm.stopBtn} onClick={onStop}>
              ■ Stop Recording
            </button>
          </div>
        ) : (
          <div style={rm.trimSection}>
            {/* Trim sliders */}
            <div style={rm.trimHeader}>
              <h3 style={rm.trimTitle}>Trim Sign</h3>
              <span style={rm.trimMeta}>{trimmedCount} frames selected</span>
            </div>

            <div style={rm.sliders}>
              <div style={rm.sliderGroup}>
                <div style={rm.sliderRow}>
                  <label style={rm.sliderLabel}>Start</label>
                  <span style={rm.sliderVal}>{trimStart}%</span>
                </div>
                <input type="range" min="0" max="100" value={trimStart} style={{ width: '100%' }}
                  onChange={e => setTrimRange([parseInt(e.target.value), trimEnd])} />
              </div>
              <div style={rm.sliderGroup}>
                <div style={rm.sliderRow}>
                  <label style={rm.sliderLabel}>End</label>
                  <span style={rm.sliderVal}>{trimEnd}%</span>
                </div>
                <input type="range" min="0" max="100" value={trimEnd} style={{ width: '100%' }}
                  onChange={e => setTrimRange([trimStart, parseInt(e.target.value)])} />
              </div>

              {/* Visual trim bar */}
              <div style={rm.trimBar}>
                <div style={{ ...rm.trimFill, left: `${trimStart}%`, width: `${trimEnd - trimStart}%` }} />
              </div>
            </div>

            <div style={rm.actionRow}>
              <button className="discard-btn" style={rm.discardBtn} onClick={onDiscard}>
                ✕ Discard
              </button>
              <button className="save-sign-btn" style={rm.saveSignBtn} onClick={onSave}>
                ✓ Save Sign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GloveCapture() {
  const router = useRouter();

  // WebSocket & live frame
  const socketRef    = useRef(null);
  const [currentFrame, setCurrentFrame] = useState(null);

  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [loading, setLoading] =useState(false);
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001/api';
  // Calibration ref – set to true to trigger reset inside HandModel
  const calibrateRef = useRef(false);

  // Recording state
  const [isRecording, setIsRecording]     = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const isRecordingRef = useRef(false); // mirrors state for use inside WS closure

  // Modal state
  const [modalOpen, setModalOpen]     = useState(false);
  const [signLabel, setSignLabel]     = useState('');
  const [signInput, setSignInput]     = useState('');
  const [trimRange, setTrimRange]     = useState([0, 100]);

  // Saved signs (one submission = many signs)
  const [signs, setSigns]             = useState([]); // [{label, frames, trimStart, trimEnd}]
  const [downloadStatus, setDownloadStatus] = useState(null);

  // Nav dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef  = useRef(null);

  // Stats
  const frameCount = recordedFrames.length;
  const duration   = (frameCount / 60).toFixed(1);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // We connect to the bridge. 
    // The moment this connection opens, the bridge pings the ESP32 for us.ws://
    const ESP_IP = "172.20.104.242";
    const WS_PORT = "82"; // Ensure this matches your WS_PORT in C++
    socketRef.current = new WebSocket(`ws://${ESP_IP}:${WS_PORT}`);
    
    socketRef.current.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        console.log("Received WS data:", raw);
        if (raw.flex || raw.pads) {
          const frame = { flex: raw.flex ?? {}, pads: raw.pads ?? [] };
          setCurrentFrame(frame);
          if (isRecordingRef.current) {
            setRecordedFrames(prev => [...prev, frame]);
          }
        }
      } catch (err) {
        console.error("Data parse error:", err);
      }
    };

    return () => socketRef.current?.close();
  }, []);

  // Keep ref in sync with state
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // ── Dropdown outside click ─────────────────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
      async function init() {
        setLoading(true);

        // Get user
        const { data: { user } } = await supabase.auth.getUser();
        setUserEmail(user.email);
        setUserId(user.id);
        console.log("Authenticated user:", user);
        const userRes = await fetch(`${backendUrl}/profile/info?userId=${user.id}`);
        const userData = await userRes.json();
        setUser(userData[0]);
        console.log("Profile info:", userData);

        setLoading(false);
      }

      init();
    }, []);

  // ── Recording flow ─────────────────────────────────────────────────────────
  const handleStartRecording = () => {
    if (!signInput.trim()) return;
    setSignLabel(signInput.trim());
    setRecordedFrames([]);
    setTrimRange([0, 100]);
    setIsRecording(true);
    setModalOpen(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // Modal stays open for trim/review
  };

  const handleDiscardSign = () => {
    setModalOpen(false);
    setIsRecording(false);
    setRecordedFrames([]);
    setSignInput('');
  };

  const handleSaveSign = () => {
    const startIdx = Math.floor((trimRange[0] / 100) * recordedFrames.length);
    const endIdx   = Math.floor((trimRange[1] / 100) * recordedFrames.length);
    const trimmedFrames = recordedFrames.slice(startIdx, endIdx);

    setSigns(prev => [...prev, {
      label: signLabel,
      frames: trimmedFrames,
      trimStart: trimRange[0],
      trimEnd: trimRange[1],
    }]);

    setModalOpen(false);
    setIsRecording(false);
    setRecordedFrames([]);
    setSignInput('');
  };
const handleDownload = () => {
  if (signs.length === 0) return;

  try {
    // 1. Convert the signs object/array to a JSON string
    // The arguments (null, 2) add pretty-printing (indentation)
    const jsonString = JSON.stringify(signs, null, 2);

    // 2. Create a Blob with the JSON data
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 3. Create an object URL for the Blob
    const url = URL.createObjectURL(blob);

    // 4. Create a temporary anchor element
    const link = document.createElement('a');
    link.href = url;
    link.download = 'signs-data.json'; // The filename for the user

    // 5. Append to body, click it, and remove it
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 6. Clean up the URL object to free up memory
    URL.revokeObjectURL(url);

    // Update your existing UI states
    console.log("download submission:", signs);
    setDownloadStatus('success');
    setTimeout(() => setDownloadStatus(null), 3000);
    setSigns([]);

  } catch (error) {
    console.error("Download failed:", error);
    setDownloadStatus('error');
  }
};

  const handleRemoveSign = (idx) => {
    setSigns(prev => prev.filter((_, i) => i !== idx));
  };
if (loading) return (<div style={s.page}>
                        <style>{`        
                          .loader-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100vw;
                            height: 100vh;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            background: linear-gradient(135deg, #1a1a2e, #0f3460); /* Color1 */
                            z-index: 9999; /* Ensures it stays on top */
                          }

                          .main-spinner {
                            width: 50px;
                            height: 50px;
                            border: 5px solid rgba(226, 185, 111, 0.2); /* Faded Color2 */
                            border-radius: 50%;
                            border-top-color: #e2b96f; /* Solid Color2 */
                            animation: spin 1s linear infinite;
                          }

                          @keyframes spin { 
                            to { transform: rotate(360deg); } 
                          }
                        `}
                        </style>
                        <div className="loader-overlay">
                          <div className="main-spinner"></div>
                        </div>
                      </div>);

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .rec-dot { animation: pulse 1.2s ease-in-out infinite; }
        .start-btn:hover     { background:#b91c1c !important; transform:translateY(-1px); }
        .calib-btn:hover     { background:rgba(226,185,111,0.15) !important; transform:translateY(-1px); }
        .upload-btn:hover    { background:#0f3460 !important; transform:translateY(-1px); }
        .stop-modal-btn:hover{ background:#991b1b !important; transform:translateY(-1px); }
        .save-sign-btn:hover { background:#047857 !important; transform:translateY(-1px); }
        .discard-btn:hover   { background:rgba(239,68,68,0.15) !important; color:#ef4444 !important; }
        .logout-item:hover   { background:rgba(220,38,38,0.08) !important; color:#ef4444 !important; }
        .dd-item:hover       { background:rgba(255,255,255,0.05) !important; }
        .sign-tag:hover .remove-sign { opacity:1 !important; }
        input[type=range] { -webkit-appearance:none; appearance:none; height:4px; border-radius:4px; background:#2d3748; outline:none; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:#e2b96f; border:2px solid #1a1a2e; cursor:pointer; transition:transform 0.15s; }
        input[type=range]::-webkit-slider-thumb:hover { transform:scale(1.2); }
        input[type=range]::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:#e2b96f; border:2px solid #1a1a2e; cursor:pointer; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={s.nav}>
        <div style={s.navBrand}>
          <Image src={logo} alt="Logo" width={44} height={44} style={{ borderRadius: 8 }} />
          <span style={s.navName}>صوتك</span>
          <span style={s.navDivider}>|</span>
          <span style={s.navSub}>Glove Studio</span>
        </div>
        <div style={s.navRight} ref={dropdownRef}>
          <button style={s.userPill} onClick={() => setDropdownOpen(o => !o)}>
            <div style={s.avatar}>{user?.initials}</div>
            <span style={s.userName}>{user?.username}</span>
            <span style={s.chevron}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>
          {dropdownOpen && (
            <div style={s.dropdown}>
              <div style={s.ddHeader}>
                <div style={{ ...s.avatar, width: 36, height: 36, fontSize: 13 }}>{user?.initials}</div>
                <div>
                  <div style={s.ddName}>{user?.username}</div>
                  <div style={s.ddEmail}>{userEmail}</div>
                </div>
              </div>
              <div style={s.ddDivider} />
              <button onClick={() => router.push("/")} className="dd-item" style={s.ddItem}>Home</button>
              <button onClick={() => router.push("/models")} className="dd-item" style={s.ddItem}>Models</button>
              <div style={s.ddDivider} />
              <button onClick={() => router.push("/login")} className="logout-item" style={{ ...s.ddItem, color: '#ef4444' }}>Sign out →</button>
            </div>
          )}
        </div>
      </nav>

      {/* ── BODY ── */}
      <div style={s.body}>

        {/* ── LEFT COL ── */}
        <div style={s.leftCol}>
          <div style={s.titleRow}>
            <div>
              <h1 style={s.title}>Glove Data Studio</h1>
              <p style={s.subtitle}>Capture hand gesture sequences for your submission</p>
            </div>
          </div>

          {/* Live 3-D preview */}
          <div style={s.viewport}>
            <div style={s.viewportLabel}>LIVE PREVIEW</div>
            <Scene sensorData={currentFrame} />
            {!currentFrame && (
              <div style={s.viewportOverlay}>
                <div style={s.viewportIcon}>🧤</div>
                <p style={s.viewportHint}>Waiting for glove connection…</p>
              </div>
            )}
          </div>

          {/* Calibrate button */}
          <div style={s.controlRow}>
            <button
              className="calib-btn"
              style={s.calibBtn}
              onClick={() => { calibrateRef.current = true; }}
            >
              ⟳ Calibrate
            </button>
            {currentFrame && (
              <div style={s.connectedBadge}>
                <span style={s.connDot} /> Connected
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COL ── */}
        <div style={s.rightCol}>

          {/* Sign recorder panel */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>Record a Sign</h3>
              <p style={s.panelSub}>Type the label, then start recording</p>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Sign label</label>
              <input
                type="text"
                placeholder='e.g. "hello"'
                value={signInput}
                onChange={e => setSignInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStartRecording()}
                style={s.input}
                onFocus={e => Object.assign(e.target.style, s.inputFocus)}
                onBlur={e => Object.assign(e.target.style, { borderColor: 'rgba(255,255,255,0.10)', boxShadow: 'none' })}
              />
            </div>

            <button
              className="start-btn"
              style={{ ...s.startBtn, opacity: signInput.trim() ? 1 : 0.45 }}
              onClick={handleStartRecording}
              disabled={!signInput.trim()}
            >
              <span style={{ fontSize: 10 }}>●</span> Start Recording
            </button>
          </div>

          {/* Signs collected */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>Recorded Signs</h3>
              <p style={s.panelSub}>{signs.length} sign{signs.length !== 1 ? 's' : ''} in this submission</p>
            </div>

            {signs.length === 0 ? (
              <div style={s.emptySignsBox}>
                <span style={s.emptySignsIcon}>✋</span>
                <p style={s.emptySignsText}>No signs yet — record your first one</p>
              </div>
            ) : (
              <div style={s.signsList}>
                {signs.map((sign, idx) => (
                  <div key={idx} className="sign-tag" style={s.signTag}>
                    <div style={s.signTagLeft}>
                      <span style={s.signTagIndex}>{idx + 1}</span>
                      <div>
                        <div style={s.signTagLabel}>{sign.label}</div>
                        <div style={s.signTagMeta}>
                          {sign.frames.length} frames · {(sign.frames.length / 60).toFixed(1)}s
                        </div>
                      </div>
                    </div>
                    <button
                      className="remove-sign"
                      style={s.removeSign}
                      onClick={() => handleRemoveSign(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Download submission */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>Download Submission</h3>
              <p style={s.panelSub}>Download all recorded signs as a JSON file</p>
            </div>

            <button
              className="upload-btn"
              style={{ ...s.uploadBtn, opacity: signs.length > 0 ? 1 : 0.4 }}
              onClick={handleDownload}
              disabled={signs.length === 0}
            >
              {downloadStatus === 'success' ? '✓ Downloaded!' : `Download ${signs.length} Sign${signs.length !== 1 ? 's' : ''} →`}
            </button>

            {downloadStatus === 'success' && (
              <div style={s.successBanner}>
                Submission downloaded successfully.
              </div>
            )}
            {signs.length === 0 && (
              <p style={s.disabledNote}>Add at least one sign before downloading.</p>
            )}
          </div>

          {/* Live sensor readout */}
          {currentFrame && (
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>Live Sensor Data</h3>
              </div>
              <div style={s.sensorGrid}>
                {Object.entries(currentFrame).map(([key, fingerObj]) => (
                  <div key={key} style={{ ...s.sensorRow, flexDirection: 'column', alignItems: 'flex-start', gap: 2, marginBottom: 8 }}>
                    <span style={{ ...s.sensorKey, fontWeight: 600, color: '#e2b96f', textTransform: 'capitalize' }}>{key}</span>
                    <div style={s.sensorRow}>
                      <div style={s.sensorBarBg}>
                        <div style={{ ...s.sensorBarFill, width: `${Math.min(100, Math.abs(fingerObj.pitch || fingerObj.qw || 0))}%` }} />
                      </div>
                      <span style={s.sensorVal}>
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

      {/* ── RECORDING MODAL ── */}
      {modalOpen && (
        <RecordingModal
          signLabel={signLabel}
          isRecording={isRecording}
          frames={recordedFrames}
          trimRange={trimRange}
          setTrimRange={setTrimRange}
          onStop={handleStopRecording}
          onDiscard={handleDiscardSign}
          onSave={handleSaveSign}
          currentFrame={currentFrame}
          calibrate={calibrateRef}
        />
      )}
    </div>
  );
}

// ─── Page styles ─────────────────────────────────────────────────────────────
const s = {
  page: { minHeight: '100vh', background: '#0d0f1a', fontFamily: "'DM Sans', sans-serif", color: '#e2e8f0', display: 'flex', flexDirection: 'column' },

  nav: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', height:60, background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.07)', backdropFilter:'blur(12px)', position:'sticky', top:0, zIndex:20 },
  navBrand: { display:'flex', alignItems:'center', gap:10 },
  navName: { fontFamily:"'Playfair Display', serif", fontSize:18, fontWeight:600, color:'#ffffff', letterSpacing:'0.5px' },
  navDivider: { color:'rgba(255,255,255,0.15)', fontSize:16 },
  navSub: { fontSize:13, color:'#a0aec0', fontWeight:300 },
  navRight: { position:'relative' },
  userPill: { display:'flex', alignItems:'center', gap:9, padding:'5px 12px 5px 5px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:100, cursor:'pointer' },
  avatar: { width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg, #0f3460, #e2b96f)', color:'#1a1a2e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, letterSpacing:'0.5px', flexShrink:0 },
  userName: { fontSize:13, fontWeight:500, color:'#e2e8f0' },
  chevron: { fontSize:10, color:'#a0aec0' },
  dropdown: { position:'absolute', top:'calc(100% + 8px)', right:0, background:'#1a1f35', borderRadius:16, boxShadow:'0 16px 48px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', minWidth:200, overflow:'hidden', animation:'slideDown 0.15s ease', zIndex:100 },
  ddHeader: { display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'rgba(255,255,255,0.03)' },
  ddName: { fontSize:13, fontWeight:500, color:'#e2e8f0' },
  ddEmail: { fontSize:11, color:'#718096' },
  ddDivider: { height:1, background:'rgba(255,255,255,0.06)' },
  ddItem: { display:'block', width:'100%', padding:'10px 16px', background:'transparent', border:'none', textAlign:'left', fontSize:13, color:'#a0aec0', cursor:'pointer', transition:'background 0.15s', fontFamily:"'DM Sans', sans-serif" },

  body: { flex:1, display:'flex', gap:24, padding:28, maxWidth:1400, margin:'0 auto', width:'100%' },
  leftCol: { flex:1, display:'flex', flexDirection:'column', gap:20, minWidth:0 },
  rightCol: { width:340, flexShrink:0, display:'flex', flexDirection:'column', gap:16 },

  titleRow: { display:'flex', justifyContent:'space-between', alignItems:'flex-start' },
  title: { fontFamily:"'Playfair Display', serif", fontSize:26, fontWeight:600, color:'#ffffff', marginBottom:4 },
  subtitle: { fontSize:13, color:'#718096', fontWeight:300 },

  viewport: { flex:1, minHeight:400, background:'linear-gradient(145deg, #0a0c18, #111827)', borderRadius:20, border:'1px solid rgba(255,255,255,0.06)', boxShadow:'inset 0 0 60px rgba(0,0,0,0.4)' },
  viewportLabel: { position:'absolute', top:14, left:18, zIndex:2, fontSize:11, fontWeight:500, color:'#4a5568', letterSpacing:'1px', textTransform:'uppercase' },
  viewportOverlay: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  viewportIcon: { fontSize:40, marginBottom:12, opacity:0.3 },
  viewportHint: { fontSize:13, color:'#4a5568' },

  controlRow: { display:'flex', gap:12, alignItems:'center' },
  calibBtn: { display:'flex', alignItems:'center', gap:8, padding:'11px 20px', background:'rgba(226,185,111,0.08)', color:'#e2b96f', border:'1px solid rgba(226,185,111,0.25)', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.2s, transform 0.15s', fontFamily:"'DM Sans', sans-serif" },
  connectedBadge: { display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#34d399' },
  connDot: { width:8, height:8, borderRadius:'50%', background:'#34d399', display:'inline-block' },

  panel: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:20 },
  panelHeader: { marginBottom:16 },
  panelTitle: { fontSize:14, fontWeight:500, color:'#e2e8f0', marginBottom:3 },
  panelSub: { fontSize:12, color:'#718096', fontWeight:300 },

  fieldGroup: { display:'flex', flexDirection:'column', gap:8, marginBottom:14 },
  label: { fontSize:12, color:'#a0aec0', fontWeight:500 },
  input: { padding:'11px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.10)', background:'rgba(255,255,255,0.04)', color:'#e2e8f0', fontSize:14, fontFamily:"'DM Sans', sans-serif", transition:'border-color 0.2s, box-shadow 0.2s' },
  inputFocus: { borderColor:'rgba(226,185,111,0.5)', boxShadow:'0 0 0 3px rgba(226,185,111,0.08)' },
  startBtn: { width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.2s, transform 0.15s', fontFamily:"'DM Sans', sans-serif" },

  emptySignsBox: { display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 12px', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed rgba(255,255,255,0.08)' },
  emptySignsIcon: { fontSize:28, opacity:0.3, marginBottom:8 },
  emptySignsText: { fontSize:12, color:'#4a5568', textAlign:'center' },

  signsList: { display:'flex', flexDirection:'column', gap:8 },
  signTag: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.04)', borderRadius:10, border:'1px solid rgba(255,255,255,0.07)', transition:'border-color 0.2s' },
  signTagLeft: { display:'flex', alignItems:'center', gap:10 },
  signTagIndex: { width:22, height:22, borderRadius:'50%', background:'rgba(226,185,111,0.15)', color:'#e2b96f', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 },
  signTagLabel: { fontSize:13.5, fontWeight:500, color:'#e2e8f0' },
  signTagMeta: { fontSize:11, color:'#718096', marginTop:1 },
  removeSign: { padding:'4px 8px', background:'transparent', border:'none', color:'#ef4444', cursor:'pointer', fontSize:12, opacity:0, transition:'opacity 0.2s', borderRadius:6 },

  uploadBtn: { width:'100%', padding:13, background:'#1a1a2e', color:'#e2b96f', border:'1px solid rgba(226,185,111,0.25)', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.2s, transform 0.15s', fontFamily:"'DM Sans', sans-serif", letterSpacing:'0.3px' },
  successBanner: { marginTop:12, padding:'10px 14px', background:'rgba(5,150,105,0.12)', border:'1px solid rgba(5,150,105,0.25)', borderRadius:10, fontSize:12.5, color:'#34d399' },
  disabledNote: { marginTop:10, fontSize:11.5, color:'#4a5568' },
  closeBtn: {
    width: 34, height: 34, borderRadius: '50%',
    border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: '13px', color: '#7a8499',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.2s', flexShrink: 0,
  },
  sensorGrid: { display:'flex', flexDirection:'column', gap:6 },
  sensorRow: { display:'flex', alignItems:'center', gap:10 },
  sensorKey: { fontSize:11.5, color:'#718096', width:50 },
  sensorBarBg: { flex:1, height:4, background:'#1a1f35', borderRadius:4, overflow:'hidden' },
  sensorBarFill: { height:'100%', background:'linear-gradient(90deg, #0f3460, #e2b96f)', borderRadius:4, transition:'width 0.2s' },
  sensorVal: { fontSize:11, color:'#e2b96f', width:34, textAlign:'right' },
};

// ─── Modal styles ─────────────────────────────────────────────────────────────
const rm = {
  overlay: { position:'fixed', inset:0, background:'rgba(5,7,18,0.85)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, animation:'fadeIn 0.2s ease', padding:24 },
  modal: { background:'#0d1020', border:'1px solid rgba(255,255,255,0.08)', borderRadius:24, width:'100%', maxWidth:900, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,0.7)', animation:'slideUp 0.3s ease' },

  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 24px', background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 },
  headerLeft: { display:'flex', alignItems:'center', gap:14 },
  headerRight: {display: 'flex'},
  signChip: { display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'rgba(226,185,111,0.10)', border:'1px solid rgba(226,185,111,0.25)', borderRadius:100 },
  signChipIcon: { fontSize:16 },
  signChipText: { fontSize:14, fontWeight:600, color:'#e2b96f' },
  recBadge: { display:'flex', alignItems:'center', gap:8, padding:'5px 12px', borderRadius:100, background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444', fontSize:12, fontWeight:500 },
  recDot: { width:8, height:8, borderRadius:'50%', background:'#ef4444', display:'inline-block' },
  playBadge: { fontSize:12, color:'#34d399', padding:'5px 12px', background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.20)', borderRadius:100 },
  durationLabel: { fontSize:13, color:'#718096',display: 'flex', alignItems: 'center', marginRight: '10px' },

  viewport: { position: 'relative', width: '100%',height: '380px', background: 'linear-gradient(145deg, #0a0c18, #111827)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column'},
  vpLabel: { position:'absolute', top:12, left:16, zIndex:2, fontSize:10, color:'#4a5568', letterSpacing:'1.5px', textTransform:'uppercase' },
  vpOverlay: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' },

  controls: { padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.02)', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 },
  controlHint: { fontSize:13, color:'#4a5568' },
  stopBtn: { display:'flex', alignItems:'center', gap:8, padding:'12px 28px', background:'#dc2626', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.2s, transform 0.15s', fontFamily:"'DM Sans', sans-serif" },

  trimSection: { padding:'18px 24px', background:'rgba(255,255,255,0.02)', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 },
  trimHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  trimTitle: { fontSize:14, fontWeight:500, color:'#e2e8f0' },
  trimMeta: { fontSize:12, color:'#718096' },
  sliders: { marginBottom:16 },
  sliderGroup: { marginBottom:12 },
  sliderRow: { display:'flex', justifyContent:'space-between', marginBottom:6 },
  sliderLabel: { fontSize:12, color:'#a0aec0' },
  sliderVal: { fontSize:12, color:'#e2b96f', fontWeight:500 },
  trimBar: { height:6, background:'#1a1f35', borderRadius:6, overflow:'hidden', marginTop:4 },
  trimFill: { position:'absolute', height:'100%', background:'linear-gradient(90deg, #0f3460, #e2b96f)', borderRadius:6 },

  actionRow: { display:'flex', gap:12, justifyContent:'flex-end' },
  discardBtn: { padding:'11px 22px', background:'rgba(239,68,68,0.06)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.20)', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.15s, color 0.15s', fontFamily:"'DM Sans', sans-serif" },
  saveSignBtn: { padding:'11px 28px', background:'#059669', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.2s, transform 0.15s', fontFamily:"'DM Sans', sans-serif" },
};
