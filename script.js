document.addEventListener("DOMContentLoaded", () => {
  // ================================
  // Firebase configuration
  // ================================
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
  const db = firebase.firestore();
  const auth = firebase.auth();

  // ================================
  // DOM elements
  // ================================
  const loginPage = document.getElementById("loginPage");
  const chatPage = document.getElementById("chatPage");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const meLabel = document.getElementById("meLabel");
  const meEmail = document.getElementById("meEmail");
  const usersList = document.getElementById("usersList");
  const messagesDiv = document.getElementById("messages");
  const msgInput = document.getElementById("msgInput");
  const sendBtn = document.getElementById("sendBtn");

  // ================================
  // Variables
  // ================================
  let currentUser = null;
  let activeChatId = null;
  let messagesRef = null;

  // ================================
  // Login button click
  // ================================
  loginBtn.onclick = async function () {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }

    try {
      // Sign in or register
      let userCredential;
      try {
        userCredential = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        // If user doesn’t exist, register
        userCredential = await auth.createUserWithEmailAndPassword(email, password);
      }

      currentUser = userCredential.user;

      // Save/update user in Firestore
      await db.collection("users").doc(currentUser.uid).set({
        email: currentUser.email,
        lastActive: Date.now()
      });

      // Update UI
      meLabel.textContent = currentUser.email.split("@")[0]; // show name part
      meEmail.textContent = currentUser.email;
      loginPage.style.display = "none";
      chatPage.style.display = "block";

      // Load contacts
      loadUsers();
    } catch (err) {
      console.error("Login error:", err);
      alert("Failed to sign in/register.");
    }
  };

  // ================================
  // Logout button click
  // ================================
  logoutBtn.onclick = async function () {
    if (currentUser) {
      await db.collection("users").doc(currentUser.uid).update({
        lastActive: Date.now()
      });
    }
    await auth.signOut();

    currentUser = null;
    activeChatId = null;
    messagesRef = null;

    emailInput.value = "";
    passwordInput.value = "";
    meLabel.textContent = "";
    meEmail.textContent = "";
    loginPage.style.display = "block";
    chatPage.style.display = "none";
    messagesDiv.innerHTML = "";
    usersList.innerHTML = "";
  };

  // ================================
  // Load users list (Contacts)
  // ================================
  function loadUsers() {
    db.collection("users").onSnapshot(snapshot => {
      usersList.innerHTML = "";

      snapshot.forEach(doc => {
        const user = doc.data();
        if (user.email === currentUser.email) return;

        const li = document.createElement("li");
        li.dataset.uid = doc.id;
        li.dataset.email = user.email;
        li.style.cursor = "pointer";

        const textSpan = document.createElement("span");
        textSpan.textContent = user.email;
        li.appendChild(textSpan);

        // Online/Offline dot
        const dot = document.createElement("span");
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const now = Date.now();
        const ONLINE_TIMEOUT = 45000;
        const isOnline = user.lastActive && (now - user.lastActive < ONLINE_TIMEOUT);
        dot.style.backgroundColor = isOnline ? "#4CAF50" : "#999";
        li.appendChild(dot);

        li.onclick = () => {
          startChat(user, doc.id);
        };

        usersList.appendChild(li);
      });

      if (usersList.innerHTML === "") {
        const li = document.createElement("li");
        li.textContent = "No other users online";
        li.style.color = "#999";
        usersList.appendChild(li);
      }
    });
  }

  // ================================
  // Start chat with selected user
  // ================================
  function startChat(user, uid) {
    activeChatId = [currentUser.uid, uid].sort().join("_");
    messagesRef = db.collection("chats").doc(activeChatId).collection("messages");
    loadMessages();
  }

  // ================================
  // Send message
  // ================================
  sendBtn.onclick = function () {
    if (!currentUser || !messagesRef) {
      alert("Select a contact to chat with first.");
      return;
    }

    const text = msgInput.value.trim();
    if (text === "") return;

    messagesRef.add({
      senderEmail: currentUser.email,
      text: text,
      time: Date.now()
    });

    msgInput.value = "";
  };

  // ================================
  // Load messages
  // ================================
  function loadMessages() {
    messagesRef.orderBy("time").onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";

      snapshot.forEach(doc => {
        const data = doc.data();
        const msgBox = document.createElement("div");
        msgBox.style.marginBottom = "12px";
        msgBox.style.maxWidth = "70%";
        msgBox.style.padding = "8px 12px";
        msgBox.style.borderRadius = "10px";

        if (data.senderEmail === currentUser.email) {
          msgBox.style.backgroundColor = "#4CAF50";
          msgBox.style.color = "#fff";
          msgBox.style.marginLeft = "auto";
        } else {
          msgBox.style.backgroundColor = "#e0e0e0";
          msgBox.style.color = "#000";
          msgBox.style.marginRight = "auto";
        }

        const header = document.createElement("div");
        header.textContent = data.senderEmail;
        header.style.fontSize = "12px";
        header.style.color = "#666";
        header.style.marginBottom = "2px";

        const textLine = document.createElement("div");
        textLine.textContent = data.text;
        textLine.style.fontSize = "16px";

        const timeLine = document.createElement("div");
        const d = new Date(data.time);
        timeLine.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        timeLine.style.fontSize = "11px";
        timeLine.style.color = "#999";

        msgBox.appendChild(header);
        msgBox.appendChild(textLine);
        msgBox.appendChild(timeLine);

        messagesDiv.appendChild(msgBox);
      });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }
});
