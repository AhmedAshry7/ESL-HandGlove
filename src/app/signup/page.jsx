"use client";
import Image from "next/image";
import logo from "../assets/logo.png";
import { useState } from "react";
import hide from "../assets/hide.png";
import show from "../assets/show.png";

export default function SignupPage() {
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
      e.preventDefault();
      console.log("Signup attempted with:", { userName, email, password });
/*    e.preventDefault();
      setError("");
      setIsLoading(true);

      try {
        const res = await fetch("http://localhost:5000/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userName, email, password }),
        });

        if (!res.ok) {
          setError("Invalid Email or password");
          setPassword("");
          setUsername("");
          setIsLoading(false);
          return;
        }

        const data = await res.json();

        localStorage.setItem("token", data.token);

        router.push("/");
      } catch (err) {
        setError("Connection error. Please try again.");
        setIsLoading(false);
      } */
    };


  return (
    <div style={styles.page}>
      <div style={styles.leftPanel}>
        <div style={styles.formCard}>
          <div style={styles.formTop}>
            <h1 style={styles.heading}>Create account</h1>
            <p style={styles.subtitle}>Slogan</p>
          </div>

          <form style={styles.form} onSubmit={handleSignup}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                placeholder="yourname"
                style={styles.input}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onFocus={e => Object.assign(e.target.style, styles.inputFocus)}
                onBlur={e => Object.assign(e.target.style, { borderColor: '#e2e8f0', boxShadow: 'none' })}
                required
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={e => Object.assign(e.target.style, styles.inputFocus)}
                onBlur={e => Object.assign(e.target.style, { borderColor: '#e2e8f0', boxShadow: 'none' })}
                required
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Password</label>
               <div style={styles.inputWrapper}>
                <input
                    type={showPass ? "text" : "password"}
                    placeholder="password"
                    style={styles.inputPass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={e => Object.assign(e.target.style, { borderColor: '#e2e8f0', boxShadow: 'none' })}
                    required
                  />
                <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={styles.togglePassword}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    <img 
                      src={showPass ? show.src : hide.src} 
                      alt={showPass ? "Hide" : "Show"} 
                      width="20" 
                      height="20" 
                      style={{opacity: 0.6}}
                    />
                  </button>
                </div>
            </div>

            <div style={styles.terms}>
              <input type="checkbox" id="agree" style={{ accentColor: '#0f3460', marginTop: '2px' }} required/>
              <label htmlFor="agree" style={styles.termsLabel}>
                I agree to the <a href="#" style={styles.termsLink}>Terms</a> and{' '}
                <a href="#" style={styles.termsLink}>Privacy Policy</a>
              </label>
            </div>

            <button
              type="submit"
              style={styles.btn}
              onMouseEnter={e => Object.assign(e.target.style, styles.btnHover)}
              onMouseLeave={e => Object.assign(e.target.style, { background: '#1a1a2e', transform: 'translateY(0)' })}
            >
              Create Account →
            </button>
          </form>

          <p style={styles.switchText}>
            Already have an account?{' '}
            <a href="/login" style={styles.switchLink}>Sign in</a>
          </p>
        </div>
      </div>

      <div style={styles.rightPanel}>
        <div style={styles.brandArea}>
          <div style={styles.logo}><Image src={logo} alt="Logo" width="300" height="300" /></div>
        </div>
        <div style={styles.decorCircle1} />
        <div style={styles.decorCircle2} />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        input::placeholder { color: #a0aec0; }
        input:focus { outline: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: "'DM Sans', sans-serif",
  },
  leftPanel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f7f8fc',
    padding: '40px 20px',
  },
  formCard: {
    background: '#ffffff',
    borderRadius: '24px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 40px rgba(0,0,0,0.06)',
    animation: 'fadeUp 0.5s ease forwards',
  },
  formTop: {
    marginBottom: '36px',
  },
  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '30px',
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: '6px',
  },
  subheading: {
    color: '#7a8499',
    fontSize: '14px',
    fontWeight: 300,
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
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    justifyContent: 'space-between',
    background: '#fafbfc',
    borderRadius: 12,
    border: '1.5px solid #e2e8f0',
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
  inputPass:{
    border: 'none',
    fontSize: '14px',
    color: '#1a202c',
    width: '280px',
    height: '25px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
  terms: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
  },
  termsLabel: {
    fontSize: '13px',
    color: '#7a8499',
    lineHeight: '1.5',
  },
  termsLink: {
    color: '#e2b96f',
    textDecoration: 'none',
    fontWeight: 500,
  },
  btn: {
    padding: '14px',
    background: '#1a1a2e',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '0.5px',
    transition: 'background 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  btnHover: {
    background: '#0f3460',
    transform: 'translateY(-1px)',
  },
  togglePassword:{
    boxSizing: 'border-box',
    margin: 0,
    backgroundColor: 'transparent',
    padding: 0,
    border: 'none',
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    backgroundColor: "#fef2f2",
    border: "2px solid #fecaca",
    borderRadius: "12px",
    color: "#991b1b",
    fontSize: "0.875rem",
    fontWeight: 500,
    marginBottom: "20px",
    animation: "fadeInUp 0.3s ease-out",
  },
  switchText: {
    marginTop: '28px',
    textAlign: 'center',
    fontSize: '13.5px',
    color: '#7a8499',
  },
  switchLink: {
    color: '#e2b96f',
    fontWeight: 600,
    textDecoration: 'none',
  },
  rightPanel: {
    width: '42%',
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  brandArea: {
    textAlign: 'center',
    zIndex: 2,
    position: 'relative',
  },
  logo: {
    fontSize: '48px',
    color: '#e2b96f',
    marginBottom: '12px',
    display: 'block',
  },
  brandName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '36px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '1px',
  },
  tagline: {
    marginTop: '10px',
    color: '#a0b0c8',
    fontSize: '15px',
    fontWeight: 300,
    letterSpacing: '0.5px',
    marginBottom: '32px',
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'left',
    marginTop: '8px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  featureCheck: {
    color: '#e2b96f',
    fontWeight: 700,
    fontSize: '15px',
  },
  featureText: {
    color: '#c8d6e8',
    fontSize: '14px',
    fontWeight: 300,
  },
  decorCircle1: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    borderRadius: '50%',
    border: '1.5px solid rgba(226,185,111,0.15)',
    top: '-60px',
    right: '-80px',
  },
  decorCircle2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    border: '1px solid rgba(226,185,111,0.08)',
    bottom: '-120px',
    left: '-100px',
  },
};
