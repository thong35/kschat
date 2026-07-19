// script.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== Replace with your Firebase config =====
  const firebaseConfig = {
    apiKey: "AIzaSyAHLfu2gN-FRYyyXxnVWCwpKNvibC5s7Sg",
    authDomain: "kschat-8baec.firebaseapp.com",
    projectId: "kschat-8baec",
    storageBucket: "kschat-8baec.firebasestorage.app",
    messagingSenderId: "225091526152",
    appId: "1:225091526152:web:ad9e8a38abef826a1dbbbd",
    measurementId: "G-JC85TDFCPB"
  };
  // =============================================
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // DOM
  const loginPage = document.getElementById("loginPage");
  const chatPage = document.getElementById("chatPage");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const displayNameInput = document.getElementById("displayNameInput");
  const keepSignedIn = document.getElementById("keepSignedIn");
  const meLabel = document.getElementById("meLabel");
  const meEmail = document.getElementById("meEmail");
  const usersList = document.getElementById("usersList");
  const messagesDiv = document.getElementById("messages");
  const msgInput = document.getElementById("msgInput");
  const sendBtn = document.getElementById("sendBtn");
  const attachVoiceBtn = document.getElementById("attachVoiceBtn");
  const attachVideoBtn = document.getElementById("attachVideoBtn");
  const voiceInput = document.getElementById("voiceInput");
  const videoInput = document.getElementById("videoInput");
  const recordBtn = document.getElementById("recordBtn");

  // State
  let currentUser = null;
  let activeChatId = null;
  let messagesRef = null;
  let usersUnsub = null;
  let messagesUnsub = null;
  let hbTimer = null;
  let mediaRecorder = null;
  let recordedChunks = [];

  // Default persistence: LOCAL (keep signed in) unless user unchecks
  async function setPersistence(keep) {
    const p = keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
    try {
      await firebase.auth().setPersistence(p);
    } catch (e) {
      console.warn("Persistence set failed", e);
    }
  }

  // Initialize persistence to checkbox state
  setPersistence(keepSignedIn.checked);

  // Toggle persistence when checkbox changes
  keepSignedIn.addEventListener("change", () => setPersistence(keepSignedIn.checked));

  // Auth state listener
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      // Ensure user doc exists and do not store full email/phone in display name
      const displayName = (user.displayName && user.displayName.trim()) || displayNameInput.value.trim() || safeLocalPart(user.email);
      await db.collection("users").doc(user.uid).set({
        displayName,
        email: user.email,
        lastActive: Date.now()
      }, { merge: true });

      meLabel.textContent = displayName;
      meEmail.textContent = ""; // hide full email in header for privacy
      loginPage.style.display = "none";
      chatPage.style.display = "block";

      startHeartbeat();
      loadUsers();
    } else {
      stopHeartbeat();
      currentUser = null;
      loginPage.style.display = "block";
      chatPage.style.display = "none";
      messagesDiv.innerHTML = "";
      usersList.innerHTML = "";
      meLabel.textContent = "";
      meEmail.textContent = "";
      if (usersUnsub) usersUnsub();
      if (messagesUnsub) messagesUnsub();
    }
  });

  // Sign in / register
  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const displayName = displayNameInput.value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    await setPersistence(keepSignedIn.checked);

    try {
      let cred;
      try {
        cred = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        cred = await auth.createUserWithEmailAndPassword(email, password);
        if (displayName) await cred.user.updateProfile({ displayName });
      }
      // onAuthStateChanged will handle UI
    } catch (err) {
      console.error(err);
      alert("Authentication failed: " + (err.message || err));
    }
  };

  // Logout
  logoutBtn.onclick = async () => {
    if (currentUser) {
      await db.collection("users").doc(currentUser.uid).update({ lastActive: Date.now() }).catch(()=>{});
    }
    await auth.signOut();
  };

  // Heartbeat to mark online
  function startHeartbeat() {
    if (!currentUser) return;
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(() => {
      db.collection("users").doc(currentUser.uid).update({ lastActive: Date.now() }).catch(()=>{});
    }, 5000);
  }
  function stopHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null;
  }

  // Load contacts
  function loadUsers() {
    if (usersUnsub) usersUnsub();
    usersUnsub = db.collection("users").orderBy("displayName").onSnapshot(snapshot => {
      usersList.innerHTML = "";
      snapshot.forEach(doc => {
        const u = doc.data();
        if (!currentUser || doc.id === currentUser.uid) return;

        const li = document.createElement("li");
        li.dataset.uid = doc.id;
        li.className = "";
        li.innerHTML = `
          <div style="font-weight:600">${escapeHtml(u.displayName || safeLocalPart(u.email))}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${isOnline(u.lastActive) ? '#4CAF50' : '#999'}"></span>
          </div>
        `;
        li.onclick = () => {
          Array.from(usersList.children).forEach(c => c.classList.remove("selected"));
          li.classList.add("selected");
          startChat(doc.id, u);
        };
        usersList.appendChild(li);
      });

      if (usersList.children.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No contacts yet";
        li.style.color = "#999";
        usersList.appendChild(li);
      }
    });
  }

  // Helpers
  function safeLocalPart(email) {
    if (!email) return "User";
    return email.split("@")[0].replace(/[^\w.-]/g, "");
  }
  function isOnline(lastActive) {
    const now = Date.now();
    const ONLINE_TIMEOUT = 45000;
    return lastActive && (now - lastActive < ONLINE_TIMEOUT);
  }
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function linkify(text) {
    if (!text) return "";
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;
    return escapeHtml(text).replace(urlRegex, function(url) {
      let href = url;
      if (!href.match(/^https?:\/\//)) href = 'https://' + href;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    });
  }

  // Start chat with selected contact
  function startChat(otherUid, otherUser) {
    if (!currentUser) return;
    activeChatId = [currentUser.uid, otherUid].sort().join("_");
    messagesRef = db.collection("chats").doc(activeChatId).collection("messages");
    if (messagesUnsub) messagesUnsub();
    loadMessages();
  }

  // Send text message
  sendBtn.onclick = async () => {
    if (!currentUser || !messagesRef) {
      alert("Select a contact first.");
      return;
    }
    const text = msgInput.value.trim();
    if (!text) return;
    await messagesRef.add({
      type: "text",
      text,
      senderUid: currentUser.uid,
      senderName: currentUser.displayName || safeLocalPart(currentUser.email),
      time: Date.now()
    });
    msgInput.value = "";
  };

  // Attach buttons
  attachVoiceBtn.onclick = () => voiceInput.click();
  attachVideoBtn.onclick = () => videoInput.click();

  voiceInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser || !messagesRef) return;
    await uploadMediaAndSend(file, "audio");
    voiceInput.value = "";
  });

  videoInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser || !messagesRef) return;
    await uploadMediaAndSend(file, "video");
    videoInput.value = "";
  });

  // Upload media and send message
  async function uploadMediaAndSend(file, mediaType) {
    const id = db.collection("_").doc().id;
    const ext = (file.name.split(".").pop() || "").split("?")[0];
    const path = `media/${activeChatId}/${id}.${ext || (mediaType === 'audio' ? 'webm' : 'mp4')}`;
    const ref = storage.ref().child(path);
    const uploadTask = ref.put(file);
    uploadTask.on("state_changed",
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        console.log("Upload", pct + "%");
      },
      err => {
        console.error("Upload failed", err);
        alert("Upload failed");
      },
      async () => {
        const url = await ref.getDownloadURL();
        await messagesRef.add({
          type: mediaType,
          mediaURL: url,
          mediaName: file.name,
          senderUid: currentUser.uid,
          senderName: currentUser.displayName || safeLocalPart(currentUser.email),
          time: Date.now()
        });
      }
    );
  }

  // Load messages and render
  function loadMessages() {
    messagesDiv.innerHTML = "";
    messagesUnsub = messagesRef.orderBy("time").onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const msgBox = document.createElement("div");
        msgBox.className = "msg " + (m.senderUid === currentUser.uid ? "you" : "friend");

        const header = document.createElement("strong");
        header.textContent = m.senderName || "User";
        msgBox.appendChild(header);

        if (m.type === "text") {
          const textLine = document.createElement("div");
          textLine.innerHTML = linkify(m.text);
          msgBox.appendChild(textLine);
        } else if (m.type === "audio") {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = m.mediaURL;
          audio.style.maxWidth = "100%";
          msgBox.appendChild(audio);
        } else if (m.type === "video") {
          const video = document.createElement("video");
          video.controls = true;
          video.preload = "metadata";
          video.src = m.mediaURL;
          video.style.maxWidth = "100%";
          video.style.borderRadius = "8px";
          msgBox.appendChild(video);
        }

        const timeLine = document.createElement("div");
        const d = new Date(m.time);
        timeLine.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        timeLine.className = "muted";
        timeLine.style.marginTop = "6px";
        msgBox.appendChild(timeLine);

        messagesDiv.appendChild(msgBox);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  // Simple in-browser voice recording (MediaRecorder)
  recordBtn.onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Recording not supported in this browser.");
      return;
    }
    if (!messagesRef) {
      alert("Select a contact first.");
      return;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      recordBtn.textContent = "● Record";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        await uploadMediaAndSend(file, "audio");
      };
      mediaRecorder.start();
      recordBtn.textContent = "⏹ Stop";
    } catch (err) {
      console.error(err);
      alert("Could not start recording.");
    }
  };

  // Update lastActive on unload
  window.addEventListener("beforeunload", async () => {
    if (currentUser) {
      await db.collection("users").doc(currentUser.uid).update({ lastActive: Date.now() }).catch(()=>{});
    }
  });
});
