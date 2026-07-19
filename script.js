// script.js
document.addEventListener("DOMContentLoaded", () => {
  // Firebase config (keep your keys)
  const firebaseConfig = {
    apiKey: "AIzaSyAHLfu2gN-FRYyyXxnVWCwpKNvibC5s7Sg",
    authDomain: "chat-app-274e3.firebaseapp.com",
    projectId: "chat-app-274e3",
    storageBucket: "chat-app-274e3.firebasestorage.app",
    messagingSenderId: "695289736732",
    appId: "1:695289736732:web:5f38506a9a5eeef3f839d9",
    measurementId: "G-SRLH7JPG9V"
  };

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
  let typingRef = null;

  // Auth state
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      // ensure user doc exists
      const displayName = displayNameInput.value.trim() || user.displayName || user.email.split("@")[0];
      await db.collection("users").doc(user.uid).set({
        displayName: displayName,
        email: user.email,
        lastActive: Date.now()
      }, { merge: true });

      meLabel.textContent = displayName;
      meEmail.textContent = user.email;
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

  // Login / Register
  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const displayName = displayNameInput.value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    try {
      let cred;
      try {
        cred = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        cred = await auth.createUserWithEmailAndPassword(email, password);
        if (displayName) {
          await cred.user.updateProfile({ displayName });
        }
      }
      // onAuthStateChanged will handle UI
    } catch (err) {
      console.error(err);
      alert("Authentication failed.");
    }
  };

  // Logout
  logoutBtn.onclick = async () => {
    if (currentUser) {
      await db.collection("users").doc(currentUser.uid).update({ lastActive: Date.now() });
    }
    await auth.signOut();
  };

  // Heartbeat to mark online
  let hbTimer = null;
  function startHeartbeat() {
    if (!currentUser) return;
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
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.padding = "8px";
        li.style.borderRadius = "6px";
        li.style.cursor = "pointer";
        li.style.marginBottom = "6px";
        li.style.background = "#fafafa";
        li.style.border = "1px solid #eee";

        const left = document.createElement("div");
        left.textContent = u.displayName || u.email.split("@")[0];
        left.style.fontWeight = "600";

        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";

        const dot = document.createElement("span");
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const now = Date.now();
        const ONLINE_TIMEOUT = 45000;
        const isOnline = u.lastActive && (now - u.lastActive < ONLINE_TIMEOUT);
        dot.style.backgroundColor = isOnline ? "#4CAF50" : "#999";

        right.appendChild(dot);

        li.appendChild(left);
        li.appendChild(right);

        li.onclick = () => {
          // highlight
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

  // Start chat
  function startChat(otherUid, otherUser) {
    if (!currentUser) return;
    activeChatId = [currentUser.uid, otherUid].sort().join("_");
    if (messagesUnsub) messagesUnsub();
    messagesRef = db.collection("chats").doc(activeChatId).collection("messages");
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
      senderName: currentUser.displayName || currentUser.email.split("@")[0],
      time: Date.now()
    });
    msgInput.value = "";
  };

  // Attach voice/video buttons
  attachVoiceBtn.onclick = () => voiceInput.click();
  attachVideoBtn.onclick = () => videoInput.click();

  // Handle file selection
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

  // Upload media to Firebase Storage and send message with URL
  async function uploadMediaAndSend(file, mediaType) {
    const id = db.collection("_").doc().id;
    const ext = file.name.split(".").pop();
    const path = `media/${activeChatId}/${id}.${ext}`;
    const ref = storage.ref().child(path);
    const uploadTask = ref.put(file);
    // simple progress UI (console)
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
          senderName: currentUser.displayName || currentUser.email.split("@")[0],
          time: Date.now()
        });
      }
    );
  }

  // Load messages and render (handles text, audio, video)
  function loadMessages() {
    messagesDiv.innerHTML = "";
    messagesUnsub = messagesRef.orderBy("time").onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const msgBox = document.createElement("div");
        msgBox.className = "msg";
        const isMe = m.senderUid === currentUser.uid;
        msgBox.classList.add(isMe ? "you" : "friend");

        const header = document.createElement("strong");
        header.textContent = m.senderName || "Unknown";
        msgBox.appendChild(header);

        if (m.type === "text") {
          const textLine = document.createElement("div");
          textLine.textContent = m.text;
          textLine.style.fontSize = "16px";
          msgBox.appendChild(textLine);
        } else if (m.type === "audio") {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.src = m.mediaURL;
          audio.style.maxWidth = "100%";
          msgBox.appendChild(audio);
        } else if (m.type === "video") {
          const video = document.createElement("video");
          video.controls = true;
          video.src = m.mediaURL;
          video.style.maxWidth = "100%";
          video.style.borderRadius = "8px";
          msgBox.appendChild(video);
        }

        const timeLine = document.createElement("div");
        const d = new Date(m.time);
        timeLine.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        timeLine.style.fontSize = "11px";
        timeLine.style.color = "#999";
        timeLine.style.marginTop = "6px";
        msgBox.appendChild(timeLine);

        messagesDiv.appendChild(msgBox);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  // Optional: simple recording via MediaRecorder (browser support required)
  let mediaRecorder = null;
  let recordedChunks = [];
  recordBtn.onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Recording not supported in this browser.");
      return;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      recordBtn.textContent = "🎤 Record";
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
        // send as voice message
        if (!messagesRef) {
          alert("Select a contact first.");
          return;
        }
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
});;
