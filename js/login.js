import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { auth, db } from "./firebase.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");
const loader = document.getElementById("loader");
const btnText = document.getElementById("btnText");

function setLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle("is-loading", isLoading);
  btnText.textContent = isLoading ? "Signing in…" : "Sign in";
  loader.classList.toggle("hidden", !isLoading);
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  errorMsg.classList.add("hidden");

  if (!email || !password) {
    showError("Please fill in both fields.");
    return;
  }

  setLoading(true);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const snapshot = await get(ref(db, "users/" + user.uid));

    if (!snapshot.exists()) {
      throw new Error("User data not found");
    }

    const data = snapshot.val();

    if (data.role !== "admin") {
      throw new Error("This account does not have admin access");
    }

    if (data.status !== "active") {
      throw new Error("This admin account is not active");
    }

    window.location.href = "dashboard.html";
  } catch (error) {
    let message = "Login failed. Please try again.";

    if (error.message.includes("auth/invalid-credential")) {
      message = "Invalid email or password.";
    } else if (error.message.includes("auth/user-not-found")) {
      message = "No account found with that email.";
    } else if (error.message.includes("auth/too-many-requests")) {
      message = "Too many attempts. Please wait and try again.";
    } else if (
      error.message === "User data not found" ||
      error.message === "This account does not have admin access" ||
      error.message === "This admin account is not active"
    ) {
      message = error.message;
    }

    showError(message);
    setLoading(false);
  }
});
