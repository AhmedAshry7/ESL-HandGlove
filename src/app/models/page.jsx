"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import logo from "../assets/logo.png";
import {useRouter} from "next/navigation";


const mockUser = { name: "Ahmed Ashry", initials: "AA" };

export default function ModelsPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [modelName, setModelName] = useState("");
  const modelsTemp = [{id:1, name:"ESL.0",language:"Arabic"}, {id:2, name:"ESL.2.1",language:"English"}, {id:3, name:"ESL.3",language:"French"}];
  const [models, setModels] = useState(modelsTemp);
  const [selectedLang, setSelectedLang] = useState("");
  const [pickleFile, setPickleFile] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [trainFiles, setTrainFiles] = useState(null);
  const [trainModelName, setTrainModelName] = useState(""); // Keeping for consistency/logic

  const handleTrainSubmit = () => {
    if (!trainModelName.trim() || !trainFiles || trainFiles.length === 0) {
      alert("Please provide a model name and select a training data folder.");
      return;
    }

    // In the future, this is where you'd send the files to your Python script
    console.log(`Training "${trainModelName}" with ${trainFiles.length} files.`);
    
    const newModel = {
      id: Date.now(),
      name: trainModelName.trim(),
      language: "Custom",
      status: "Training...", // Useful to show a different state in the list
      fileCount: trainFiles.length
    };

    setModels((prev) => [...prev, newModel]);
    
    // Cleanup
    setTrainModelName("");
    setTrainFiles(null);
    setShowTrainModal(false);
  };

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
    // Validation: Ensure all fields are filled
    if (!modelName.trim() || !selectedLang || !pickleFile) {
      alert("Please provide a name, select a language, and upload a file.");
      return;
    }

    const newModel = {
      id: Date.now(), // Unique key for React
      name: modelName.trim(),
      language: selectedLang,
      fileName: pickleFile.name, // Storing the name for display
    };

    setModels((prev) => [...prev, newModel]);

    // Reset all fields and close
    setModelName("");
    setSelectedLang("");
    setPickleFile(null);
    setShowModal(false);
  };
  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #f7f8fc; }
        input::placeholder { color: #a0aec0; }
        input:focus { outline: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .lang-card { animation: fadeUp 0.4s ease both; transition: 0.2s ease; }
        .lang-card:nth-child(2) { animation-delay: 0.07s; }
        .lang-card:nth-child(3) { animation-delay: 0.14s; }
        .add-data-btn:hover { background: #047857 !important; }
        .add-lang-btn:hover { background: #0f3460 !important; transform: translateY(-1px); }
        .save-btn:hover { background: #0f3460 !important; }
        .logout-item:hover { background: #fff5f5 !important; color: #c0392b !important; }
        .dropdown-item:hover { background: #f7f8fc !important; }
        .delete-data-btn:hover { background: #ba1a08 !important; }
        .close-btn:hover { background: #f0f0f0 !important; }
      `}</style>

      <nav style={s.nav}>
        <div style={s.navBrand}>
          <div ><Image src={logo} alt="Logo" width="50" height="50" /></div>
          <span style={s.navName}>صوتك</span>
        </div>

        <div style={s.userArea} ref={dropdownRef}>
          <button style={s.userPill} onClick={() => setDropdownOpen(o => !o)}>
            <div style={s.avatar}>{mockUser.initials}</div>
            <span style={s.userName}>{mockUser.name}</span>
            <span style={{ color: '#a0aec0', fontSize: '11px', marginLeft: '4px' }}>
              {dropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {dropdownOpen && (
            <div style={s.dropdown}>
              <div style={s.dropdownHeader}>
                <div style={{ ...s.avatar, width: '36px', height: '36px', fontSize: '13px' }}>{mockUser.initials}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a2e' }}>{mockUser.name}</div>
                  <div style={{ fontSize: '11px', color: '#a0aec0' }}>alex@example.com</div>
                </div>
              </div>
              <div style={s.dropdownDivider} />
              <button onClick={() => router.push("/")} className="dropdown-item" style={s.dropdownItem}>Home</button>
              <div style={s.dropdownDivider} />
              <button onClick={() => router.push("/login")} className="logout-item" style={{ ...s.dropdownItem, color: '#e74c3c' }}>
                Sign out →
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={s.main}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>Models</h1>
            <p style={s.pageSubtitle}>{models.length} Models configured</p>
          </div>
          <div>            
            <button
              className="add-lang-btn"
              style={s.addBtn}
              onClick={() => setShowModal(true)}
            >
              + Upload Model
            </button>
            <button
              className="add-lang-btn"
              style={s.addBtn}
              onClick={() => setShowTrainModal(true)}
            >
              + Train new Model
            </button>
          </div>
        </div>

        <div style={s.grid}>
          {models.map((model, i) => (
            <div key={model.id || `${model.name}-${i}`} className="lang-card" style={{ ...s.card, ...s.cardHover }}>
              <div style={s.cardAccent} />
              <div style={s.cardIcon}>
                {model.name ? model.name.charAt(0) : "M"} 
              </div>
              <h2 style={s.cardTitle}>{model.name}</h2>
              <p style={s.cardMeta}>{model.language}</p>
              <div style={s.cardButtons}>
                <button onClick={(e) => { e.stopPropagation(); router.push(`/models/${model.name}`); }} className="add-data-btn" style={s.addDataBtn}>
                  Fine tune
                </button>
                <button
                    className="delete-data-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(model.name);
                    }}
                    style={s.deleteBtn}
                  >
                    Delete
                  </button>
                </div>
            </div>
          ))}
        </div>
      </main>

      {/* MODAL */}
      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={s.modalTitle}>Upload Model</h2>
                <p style={s.modalSub}>Configure your model details and upload the pickle file.</p>
              </div>
              <button style={s.closeBtn} onClick={() => {setModelName(""); setSelectedLang(""); setPickleFile(null); setShowModal(false);}}>✕</button>
            </div>

            <form style={s.form} onSubmit={e => e.preventDefault()}>
              {/* Model Name */}
              <div style={s.fieldGroup}>
                <label style={s.label}>Model Name</label>
                <input
                  placeholder="e.g. Arabic-v1"
                  value={modelName}
                  onChange={e => setModelName(e.target.value)}
                  style={s.input}
                />
              </div>

              {/* Language Selection */}
              <div style={s.fieldGroup}>
                <label style={s.label}>Language</label>
                <select 
                  value={selectedLang} 
                  onChange={e => setSelectedLang(e.target.value)}
                  style={{...s.input, appearance: 'none', background: '#fff'}}
                >
                  <option value="" disabled>Select a language</option>
                  <option value="Arabic">Arabic</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  {/* Add more options as needed */}
                </select>
              </div>

              {/* File Upload */}
              <div style={s.fieldGroup}>
                <label style={s.label}>Pickle File (.pkl)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="file"
                    accept=".pkl,.pickle"
                    onChange={(e) => setPickleFile(e.target.files)}
                    style={{
                      ...s.input,
                      paddingTop: '8px',
                      cursor: 'pointer'
                    }}
                  />
                </div>
                {pickleFile && (
                  <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                    ✓ Selected: {pickleFile.name}
                  </p>
                )}
              </div>

              <button
                className="save-btn"
                style={{
                  ...s.saveBtn,
                  opacity: (!modelName.trim() || !selectedLang || !pickleFile) ? 0.6 : 1,
                  cursor: (!modelName.trim() || !selectedLang || !pickleFile) ? 'not-allowed' : 'pointer'
                }}
                onClick={handleSave}
                disabled={!modelName.trim() || !selectedLang || !pickleFile}
              >
                Upload & Save
              </button>
            </form>
          </div>
        </div>
      )}
      {/* TRAINING MODAL */}
      {showTrainModal && (
        <div style={s.overlay} onClick={() => setShowTrainModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={s.modalTitle}>Train New Model</h2>
                <p style={s.modalSub}>Select the directory containing your labeled training data.</p>
              </div>
              <button style={s.closeBtn} onClick={() => {setModelName(""); setShowTrainModal(false);}}>✕</button>
            </div>

            <form style={s.form} onSubmit={e => e.preventDefault()}>
              {/* Model Name */}
              <div style={s.fieldGroup}>
                <label style={s.label}>Model Name</label>
                <input
                  placeholder="e.g. Arabic-Sign-v1"
                  value={modelName}
                  onChange={e => setModelName(e.target.value)}
                  style={s.input}
                />
              </div>

              {/* Folder Upload */}
              <div style={s.fieldGroup}>
                <label style={s.label}>Training Data Directory</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="file"
                    /* These three attributes enable folder selection */
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={(e) => setTrainFiles(e.target.files)}
                    style={{
                      ...s.input,
                      paddingTop: '8px',
                      cursor: 'pointer'
                    }}
                  />
                </div>
                {trainFiles && (
                  <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                    ✓ Folder linked: {trainFiles.length} files detected
                  </p>
                )}
              </div>

              <button
                className="save-btn"
                style={{
                  ...s.saveBtn,
                  // Updated validation check
                  opacity: (!modelName.trim() || !trainFiles) ? 0.6 : 1,
                  cursor: (!modelName.trim() || !trainFiles) ? 'not-allowed' : 'pointer',
                  backgroundColor: '#6366f1' // Different color to distinguish "Train" from "Save"
                }}
                onClick={handleTrainSubmit}
                disabled={!modelName.trim() || !trainFiles}
              >
                Start Training
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#f7f8fc',
    fontFamily: "'DM Sans', sans-serif",
  },

  /* NAV */
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '64px',
    background: '#ffffff',
    borderBottom: '1px solid #edf0f7',
    boxShadow: '0 1px 12px rgba(0,0,0,0.04)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  navBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logo: {
    fontSize: '48px',
    color: '#e2b96f',
    marginBottom: '12px',
    display: 'block',
  },
  navName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '30px',
    fontWeight: 700,
    color: '#06066a',
    letterSpacing: '0.5px',
  },

  /* USER PILL */
  userArea: {
    position: 'relative',
  },
  userPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 14px 6px 6px',
    background: '#f7f8fc',
    border: '1.5px solid #edf0f7',
    borderRadius: '100px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
    color: '#e2b96f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  userName: {
    fontSize: '13.5px',
    fontWeight: 500,
    color: '#1a1a2e',
  },

  /* DROPDOWN */
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
    border: '1px solid #edf0f7',
    minWidth: '200px',
    overflow: 'hidden',
    animation: 'fadeIn 0.15s ease',
    zIndex: 100,
  },
  dropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    background: '#fafbfc',
  },
  dropdownDivider: {
    height: '1px',
    background: '#edf0f7',
    margin: '0',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '11px 16px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    fontSize: '13.5px',
    color: '#4a5568',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  card: {
  cursor: 'pointer',
  transition: '0.2s ease',
  },

  cardHover: {
    transform: 'translateY(-4px)',
  },

  deleteBtn: {
    backgroundColor: "#dc2626",
    color: "white",
    border: "none",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: 'background 0.2s, transform 0.15s',
  },

  cardButtons: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginTop: "12px"
  },


  /* MAIN */
  main: {
    padding: '40px 40px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: '32px',
  },
  pageTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '32px',
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: '4px',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: '#a0aec0',
    fontWeight: 300,
  },
  addBtn: {
    padding: '12px 22px',
    background: '#1a1a2e',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '0.3px',
    transition: 'background 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
    margin:'20px',
  },

  /* GRID */
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
  },
  card: {
    background: '#ffffff',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
    position: 'relative',
    overflow: 'hidden',
    border: '1px solid #edf0f7',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'linear-gradient(90deg, #1a1a2e, #e2b96f)',
  },
  cardIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
    color: '#e2b96f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '16px',
    fontFamily: "'Playfair Display', serif",
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '20px',
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: '6px',
  },
  cardMeta: {
    fontSize: '12.5px',
    color: '#a0aec0',
    fontWeight: 300,
    marginBottom: '20px',
  },
  addDataBtn: {
    padding: '10px 18px',
    background: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13.5px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },

  /* MODAL */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,10,20,0.45)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    background: '#ffffff',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '400px',
    padding: '32px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    animation: 'slideUp 0.3s ease',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '28px',
  },
  modalTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: '4px',
  },
  modalSub: {
    fontSize: '13px',
    color: '#a0aec0',
    fontWeight: 300,
  },
  closeBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: 'none',
    background: '#f7f8fc',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#7a8499',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#4a5568',
    letterSpacing: '0.3px',
  },
  input: {
    padding: '13px 16px',
    borderRadius: '12px',
    border: '1.5px solid #e2e8f0',
    fontSize: '14px',
    color: '#1a202c',
    background: '#fafbfc',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
  inputFocus: {
    borderColor: '#0f3460',
    boxShadow: '0 0 0 3px rgba(15,52,96,0.08)',
  },
  saveBtn: {
    padding: '14px',
    background: '#1a1a2e',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14.5px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
};
