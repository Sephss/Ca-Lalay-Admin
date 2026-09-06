// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBugfMI7VuXxdV-m7-qTooJk_nKhLwuZ4E",
  authDomain: "ca-lalay.firebaseapp.com",
  databaseURL: "https://ca-lalay-default-rtdb.firebaseio.com",
  projectId: "ca-lalay",
  storageBucket: "ca-lalay.firebasestorage.app",
  messagingSenderId: "368445074449",
  appId: "1:368445074449:web:aeb9761f6a8aaf2e0395b0",
  measurementId: "G-V42WTC4LKL",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
