import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { auth, db } from "./firebase.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const snapshot = await get(ref(db, "users/" + user.uid));

  if (!snapshot.exists()) {
    window.location.href = "index.html";
    return;
  }

  const data = snapshot.val();

  if (data.role !== "admin") {
    window.location.href = "index.html";
  }
});
