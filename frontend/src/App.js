// Import React state so we can store data like page, clips, errors, etc.
import { useState } from "react";

function App() {
  // This stores what page the user is currently on
  const [page, setPage] = useState("home");

  // This stores the YouTube link the user pastes
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // This stores the user's name
  const [username, setUsername] = useState("");

  // This tells the app if the video is currently processing
  const [loading, setLoading] = useState(false);

  // This stores the generated clips from the backend
  const [clips, setClips] = useState([]);

  // This stores error messages shown to the user
  const [errorMessage, setErrorMessage] = useState("");

  // This stores saved clips in the browser
  const [savedClips, setSavedClips] = useState(() => {
    const stored = localStorage.getItem("savedClips");
    return stored ? JSON.parse(stored) : [];
  });

  // This stores which caption version is currently shown
  const [captionVersions, setCaptionVersions] = useState({});

  // This stores how many times the user has clicked redo caption
  const [redoCounts, setRedoCounts] = useState({});

  // This checks the YouTube link before moving to the signup page
  const goToSignup = async () => {
    setErrorMessage("");

    if (!youtubeUrl.trim()) {
      setErrorMessage("Please paste a YouTube link first.");
      return;
    }

    try {
      const response = await fetch("http://127.0.0.1:8000/check-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          youtube_url: youtubeUrl
        })
      });

      const data = await response.json();

      if (data.error) {
        setErrorMessage(data.error);
        return;
      }

      setPage("signup");

    } catch (error) {
      console.error(error);
      setErrorMessage("Could not check the video. Make sure your backend is running.");
    }
  };

  // This creates an account for now and moves user to confirmation page
  const createAccount = () => {
    if (!username.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }

    setErrorMessage("");
    setPage("confirm");
  };

  // This sends the YouTube link to the backend for processing
  const processVideo = async () => {
    setLoading(true);
    setErrorMessage("");
    setPage("processing");
    setClips([]);
    setCaptionVersions({});
    setRedoCounts({});

    try {
      const response = await fetch("http://127.0.0.1:8000/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          youtube_url: youtubeUrl
        })
      });

      const data = await response.json();

      if (data.error) {
        if (data.duration_minutes) {
          setErrorMessage(
            `This video is too big: ${data.duration_minutes} minutes. Please use a video that is 5 minutes or less.`
          );
        } else {
          setErrorMessage(data.error);
        }

        setPage("home");
      } else {
        setClips(data.created_clips || []);
        setPage("results");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Something went wrong. Make sure your backend is running.");
      setPage("home");
    }

    setLoading(false);
  };

  // This changes the caption text when user clicks redo caption
  const getCaptionText = (clip, index) => {
    const version = captionVersions[index] || 0;
    const original = clip.caption_text || "No speech detected in this clip.";

    if (version === 0) return original;
    if (version === 1) return `🔥 ${original}`;
    if (version === 2) return `Watch this moment: ${original}`;
    if (version === 3) return original.length > 80 ? `${original.slice(0, 80)}...` : original;

    return original;
  };

  // This lets the user redo the caption 3 times only
  const redoCaption = (index) => {
    const currentCount = redoCounts[index] || 0;

    if (currentCount >= 3) {
      alert("You have used all 3 caption redo attempts for this clip.");
      return;
    }

    setRedoCounts({
      ...redoCounts,
      [index]: currentCount + 1
    });

    setCaptionVersions({
      ...captionVersions,
      [index]: currentCount + 1
    });
  };

  // This saves generated clips to My Clips
  const saveClips = () => {
    const clipsToSave = clips.map((clip, index) => ({
      ...clip,
      saved_caption: getCaptionText(clip, index),
      saved_at: new Date().toLocaleString()
    }));

    // Save only 10 clips max because of storage limits
    const updatedSavedClips = [...clipsToSave, ...savedClips].slice(0, 10);

    setSavedClips(updatedSavedClips);
    localStorage.setItem("savedClips", JSON.stringify(updatedSavedClips));

    alert("Clips saved! You can view them in My Clips.");
    setPage("myclips");
  };

  // This clears all saved clips
  const clearSavedClips = () => {
    setSavedClips([]);
    localStorage.removeItem("savedClips");
  };

  // This downloads the clip to the user's laptop
  const downloadClip = (clip) => {
    const link = document.createElement("a");
    link.href = clip.clip_url;
    link.download = "emotion_clip.mp4";
    link.click();
  };

  // This downloads the clip and opens YouTube Studio
  const openYouTubeUpload = (clip) => {
    downloadClip(clip);
    window.open("https://studio.youtube.com", "_blank");
  };

  // This downloads the clip and opens TikTok upload page
  const openTikTokUpload = (clip) => {
    downloadClip(clip);
    window.open("https://www.tiktok.com/upload", "_blank");
  };

  // This downloads the clip and opens Instagram
  const openInstagramUpload = (clip) => {
    downloadClip(clip);
    window.open("https://www.instagram.com", "_blank");
  };

  // These are the navigation buttons at the top right
  const NavButtons = () => (
    <div style={styles.nav}>
      <button onClick={() => setPage("home")} style={styles.navButton}>Home</button>
      <button onClick={() => setPage("myclips")} style={styles.navButton}>My Clips</button>
      <button onClick={() => setPage("uploads")} style={styles.navButton}>Uploads</button>
    </div>
  );

  return (
    <div style={styles.app}>
      <style>
        {`
          @keyframes glowPulse {
            0% { box-shadow: 0 0 12px #00e5ff; }
            50% { box-shadow: 0 0 45px #00e5ff; }
            100% { box-shadow: 0 0 12px #00e5ff; }
          }

          @keyframes floatUp {
            0% { transform: translateY(25px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }

          @keyframes spinGlow {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .animated-card {
            animation: floatUp 0.7s ease-in-out, glowPulse 3s infinite;
          }

          .glow-button:hover {
            transform: scale(1.05);
            box-shadow: 0 0 35px #00e5ff;
          }

          .neon-input:focus {
            box-shadow: 0 0 35px #00e5ff;
          }
        `}
      </style>

      <NavButtons />

      {/* Home page */}
      {page === "home" && (
        <div style={styles.card} className="animated-card">
          <h1 style={styles.title}>🎬 Emotion Clips Generator</h1>
          <p style={styles.subtitle}>
            Paste a YouTube link and turn emotional moments into short clips.
          </p>

          {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}

          <input
            className="neon-input"
            type="text"
            placeholder="Paste YouTube link here..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            style={styles.input}
          />

          <button className="glow-button" onClick={goToSignup} style={styles.mainButton}>
            Continue
          </button>
        </div>
      )}

      {/* Signup page */}
      {page === "signup" && (
        <div style={styles.card} className="animated-card">
          <h1 style={styles.title}>Create Account</h1>
          <p style={styles.subtitle}>Create a quick account before generating clips.</p>

          {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}

          <input
            className="neon-input"
            type="text"
            placeholder="Enter your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />

          <input
            className="neon-input"
            type="email"
            placeholder="Enter your email..."
            style={styles.input}
          />

          <input
            className="neon-input"
            type="password"
            placeholder="Create password..."
            style={styles.input}
          />

          <button className="glow-button" onClick={createAccount} style={styles.mainButton}>
            Create Account
          </button>
        </div>
      )}

      {/* Confirm page */}
      {page === "confirm" && (
        <div style={styles.card} className="animated-card">
          <h1 style={styles.title}>Continue?</h1>

          <p style={styles.subtitle}>
            Hi {username}, do you want to continue with this YouTube link?
          </p>

          <div style={styles.linkBox}>{youtubeUrl}</div>

          <button className="glow-button" onClick={processVideo} style={styles.mainButton}>
            Yes, Generate Clips
          </button>

          <button onClick={() => setPage("home")} style={styles.backButton}>
            No, Change Link
          </button>
        </div>
      )}

      {/* Processing page */}
      {page === "processing" && (
        <div style={styles.card} className="animated-card">
          <h1 style={styles.title}>Processing Video</h1>

          <div style={styles.spinner}></div>

          <p style={styles.subtitle}>
            Downloading video, detecting visible face emotions, creating vertical clips, and generating captions...
          </p>

          {loading && <p style={styles.smallText}>This may take 1–3 minutes.</p>}
        </div>
      )}

      {/* Results page */}
      {page === "results" && (
        <div style={styles.resultsPage}>
          <h1 style={styles.title}>Your Generated Clips</h1>

          <div style={styles.clipsGrid}>
            {clips.map((clip, index) => (
              <div key={index} style={styles.clipCard} className="animated-card">
                <h2 style={styles.clipTitle}>{clip.emotion.toUpperCase()} CLIP</h2>

                <video width="280" controls style={styles.video}>
                  <source src={clip.clip_url} type="video/mp4" />
                </video>

                <div style={styles.captionBox}>
                  <p style={styles.captionTitle}>Caption</p>
                  <p style={styles.captionText}>{getCaptionText(clip, index)}</p>

                  <button onClick={() => redoCaption(index)} style={styles.redoButton}>
                    Redo Caption ({3 - (redoCounts[index] || 0)} left)
                  </button>
                </div>

                <div>
                  <button onClick={() => openYouTubeUpload(clip)} style={styles.youtubeButton}>
                    YouTube Shorts
                  </button>

                  <button onClick={() => openTikTokUpload(clip)} style={styles.tiktokButton}>
                    TikTok
                  </button>

                  <button onClick={() => openInstagramUpload(clip)} style={styles.instagramButton}>
                    Instagram Reels
                  </button>
                </div>
              </div>
            ))}
          </div>

          {clips.length > 0 && (
            <button onClick={saveClips} style={styles.saveButton}>
              Save Clips
            </button>
          )}
        </div>
      )}

      {/* My Clips page */}
      {page === "myclips" && (
        <div style={styles.resultsPage}>
          <h1 style={styles.title}>My Clips</h1>

          <p style={styles.subtitle}>Saved clips are limited to 10 for storage reasons.</p>

          {savedClips.length === 0 && (
            <div style={styles.card} className="animated-card">
              <p style={styles.subtitle}>No saved clips yet.</p>
            </div>
          )}

          {savedClips.length > 0 && (
            <>
              <button onClick={clearSavedClips} style={styles.backButton}>
                Clear Saved Clips
              </button>

              <div style={styles.clipsGrid}>
                {savedClips.map((clip, index) => (
                  <div key={index} style={styles.clipCard} className="animated-card">
                    <h2 style={styles.clipTitle}>{clip.emotion.toUpperCase()} SAVED CLIP</h2>

                    <video width="280" controls style={styles.video}>
                      <source src={clip.clip_url} type="video/mp4" />
                    </video>

                    <div style={styles.captionBox}>
                      <p style={styles.captionTitle}>Saved Caption</p>
                      <p style={styles.captionText}>{clip.saved_caption}</p>
                      <p style={styles.smallText}>Saved: {clip.saved_at}</p>
                    </div>

                    <div>
                      <button onClick={() => openYouTubeUpload(clip)} style={styles.youtubeButton}>
                        YouTube Shorts
                      </button>

                      <button onClick={() => openTikTokUpload(clip)} style={styles.tiktokButton}>
                        TikTok
                      </button>

                      <button onClick={() => openInstagramUpload(clip)} style={styles.instagramButton}>
                        Instagram Reels
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Uploads page */}
      {page === "uploads" && (
        <div style={styles.card} className="animated-card">
          <h1 style={styles.title}>Uploads</h1>
          <p style={styles.subtitle}>
            These buttons download your clip and open the upload page.
          </p>

          <button onClick={() => window.open("https://studio.youtube.com", "_blank")} style={styles.bigYoutubeButton}>
            ▶ YouTube Shorts
          </button>

          <button onClick={() => window.open("https://www.tiktok.com/upload", "_blank")} style={styles.bigTiktokButton}>
            ♪ TikTok
          </button>

          <button onClick={() => window.open("https://www.instagram.com", "_blank")} style={styles.bigInstagramButton}>
            ◎ Instagram Reels
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #001f2b, #000000 55%)",
    color: "#00e5ff",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "30px",
    textAlign: "center",
    position: "relative"
  },

  nav: {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 1000,
    display: "flex",
    gap: "10px"
  },

  navButton: {
    padding: "10px 16px",
    backgroundColor: "#000",
    color: "#00e5ff",
    border: "1px solid #00e5ff",
    borderRadius: "10px",
    cursor: "pointer",
    boxShadow: "0 0 12px #00e5ff",
    fontWeight: "bold"
  },

  card: {
    width: "92%",
    maxWidth: "850px",
    minHeight: "420px",
    border: "2px solid #00e5ff",
    borderRadius: "24px",
    padding: "55px",
    backgroundColor: "rgba(0, 0, 0, 0.88)",
    boxShadow: "0 0 35px #00e5ff"
  },

  title: {
    fontSize: "46px",
    color: "#00e5ff",
    textShadow: "0 0 25px #00e5ff",
    marginBottom: "12px"
  },

  subtitle: {
    color: "#b8f7ff",
    fontSize: "19px",
    marginBottom: "28px"
  },

  input: {
    width: "90%",
    padding: "16px",
    margin: "12px",
    borderRadius: "12px",
    border: "2px solid #00e5ff",
    backgroundColor: "#000",
    color: "#00e5ff",
    outline: "none",
    fontSize: "17px",
    boxShadow: "0 0 18px #00e5ff"
  },

  mainButton: {
    marginTop: "22px",
    padding: "15px 34px",
    backgroundColor: "#00e5ff",
    color: "#000",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "17px",
    boxShadow: "0 0 24px #00e5ff",
    transition: "0.3s"
  },

  backButton: {
    marginTop: "15px",
    marginLeft: "10px",
    padding: "12px 25px",
    backgroundColor: "#000",
    color: "#00e5ff",
    border: "1px solid #00e5ff",
    borderRadius: "10px",
    cursor: "pointer",
    boxShadow: "0 0 10px #00e5ff"
  },

  errorBox: {
    width: "90%",
    margin: "0 auto 18px auto",
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid #ff4d4d",
    backgroundColor: "rgba(255, 0, 0, 0.12)",
    color: "#ffb3b3",
    boxShadow: "0 0 14px #ff4d4d",
    fontWeight: "bold"
  },

  saveButton: {
    marginTop: "35px",
    marginBottom: "40px",
    padding: "16px 40px",
    backgroundColor: "#00e5ff",
    color: "#000",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "18px",
    boxShadow: "0 0 30px #00e5ff"
  },

  linkBox: {
    border: "1px solid #00e5ff",
    padding: "15px",
    borderRadius: "10px",
    color: "#ffffff",
    backgroundColor: "#00141a",
    marginBottom: "20px",
    wordBreak: "break-word",
    boxShadow: "0 0 14px #00e5ff"
  },

  spinner: {
    width: "75px",
    height: "75px",
    margin: "35px auto",
    border: "6px solid #003b4a",
    borderTop: "6px solid #00e5ff",
    borderRadius: "50%",
    animation: "spinGlow 1s linear infinite",
    boxShadow: "0 0 24px #00e5ff"
  },

  smallText: {
    color: "#ffffff",
    fontSize: "13px"
  },

  resultsPage: {
    width: "100%",
    minHeight: "100vh",
    paddingTop: "80px"
  },

  clipsGrid: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "28px",
    marginTop: "30px"
  },

  clipCard: {
    width: "350px",
    border: "2px solid #00e5ff",
    borderRadius: "20px",
    padding: "22px",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    boxShadow: "0 0 24px #00e5ff"
  },

  clipTitle: {
    color: "#00e5ff",
    textShadow: "0 0 12px #00e5ff"
  },

  video: {
    borderRadius: "15px",
    boxShadow: "0 0 16px #00e5ff"
  },

  captionBox: {
    marginTop: "18px",
    padding: "16px",
    border: "1px solid #00e5ff",
    borderRadius: "14px",
    backgroundColor: "#00141a",
    boxShadow: "0 0 15px #00e5ff"
  },

  captionTitle: {
    color: "#ffffff",
    fontWeight: "bold",
    marginTop: "0"
  },

  captionText: {
    color: "#b8f7ff",
    fontSize: "14px"
  },

  redoButton: {
    marginTop: "10px",
    padding: "8px 14px",
    backgroundColor: "#000",
    color: "#00e5ff",
    border: "1px solid #00e5ff",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "0 0 8px #00e5ff"
  },

  youtubeButton: {
    margin: "5px",
    padding: "9px 12px",
    background: "linear-gradient(135deg, #ff0000, #8b0000)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold"
  },

  tiktokButton: {
    margin: "5px",
    padding: "9px 12px",
    background: "linear-gradient(135deg, #00f2ea, #ff0050)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold"
  },

  instagramButton: {
    margin: "5px",
    padding: "9px 12px",
    background: "linear-gradient(135deg, #feda75, #d62976, #962fbf, #4f5bd5)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold"
  },

  bigYoutubeButton: {
    width: "90%",
    padding: "18px",
    margin: "12px",
    background: "linear-gradient(135deg, #ff0000, #8b0000)",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "18px",
    boxShadow: "0 0 20px #ff0000"
  },

  bigTiktokButton: {
    width: "90%",
    padding: "18px",
    margin: "12px",
    background: "linear-gradient(135deg, #00f2ea, #ff0050)",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "18px",
    boxShadow: "0 0 20px #00f2ea"
  },

  bigInstagramButton: {
    width: "90%",
    padding: "18px",
    margin: "12px",
    background: "linear-gradient(135deg, #feda75, #d62976, #962fbf, #4f5bd5)",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "18px",
    boxShadow: "0 0 20px #d62976"
  }
};

export default App;