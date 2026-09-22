import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  ref,
  get,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { auth, db } from "./firebase.js";

// ================= ELEMENTS =================

const profileForm = document.getElementById("profileForm");

const profileFirstNameInput = document.getElementById("profileFirstNameInput");

const profileLastNameInput = document.getElementById("profileLastNameInput");

const profileContactInput = document.getElementById("profileContactInput");

const profileEmailInput = document.getElementById("profileEmailInput");

const profileRoleInput = document.getElementById("profileRoleInput");

const saveProfileBtn = document.getElementById("saveProfileBtn");

const profileMessage = document.getElementById("profileMessage");

const changePasswordForm = document.getElementById("changePasswordForm");

const currentPassword = document.getElementById("currentPassword");

const newPassword = document.getElementById("newPassword");

const confirmPassword = document.getElementById("confirmPassword");

const changePasswordBtn = document.getElementById("changePasswordBtn");

const passwordMessage = document.getElementById("passwordMessage");

const logoutBtn = document.getElementById("logoutBtn");

// ================= PROFILE MESSAGE =================

function showProfileMessage(message, type) {
  profileMessage.textContent = message;
  profileMessage.className = `profile-message ${type}`;
}

function hideProfileMessage() {
  profileMessage.textContent = "";
  profileMessage.className = "profile-message hidden";
}

// ================= PASSWORD MESSAGE =================

function showPasswordMessage(message, type) {
  passwordMessage.textContent = message;
  passwordMessage.className = `profile-message ${type}`;
}

function hidePasswordMessage() {
  passwordMessage.textContent = "";
  passwordMessage.className = "profile-message hidden";
}

// ================= ROLE =================

function getRoleLabel(role) {
  if (!role) return "Admin";

  if (role === "admin") {
    return "Admin";
  }

  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// ================= LOAD ADMIN PROFILE =================

async function loadAdminProfile() {
  const user = auth.currentUser;

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      profileFirstNameInput.value = "";
      profileLastNameInput.value = "";
      profileContactInput.value = "";
      profileEmailInput.value = user.email || "";
      profileRoleInput.value = "Admin";

      return;
    }

    const data = snapshot.val();

    profileFirstNameInput.value = data.firstname || "";

    profileLastNameInput.value = data.lastname || "";

    profileContactInput.value = data.contactNum || "";

    // Email comes from Firebase Authentication
    profileEmailInput.value = user.email || "";

    profileRoleInput.value = getRoleLabel(data.role);
  } catch (error) {
    console.error("Failed to load admin profile:", error);

    showProfileMessage("Unable to load your profile information.", "error");
  }
}

// ================= SAVE PROFILE =================

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideProfileMessage();

  const user = auth.currentUser;

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const firstname = profileFirstNameInput.value.trim();

  const lastname = profileLastNameInput.value.trim();

  const contactNum = profileContactInput.value.trim();

  // ================= VALIDATION =================

  if (!firstname || !lastname || !contactNum) {
    showProfileMessage("Please fill in all editable fields.", "error");

    return;
  }

  if (firstname.length < 2) {
    showProfileMessage(
      "First name must contain at least 2 characters.",
      "error",
    );

    return;
  }

  if (lastname.length < 2) {
    showProfileMessage(
      "Last name must contain at least 2 characters.",
      "error",
    );

    return;
  }

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = "Saving...";

  try {
    const userRef = ref(db, `users/${user.uid}`);

    await update(userRef, {
      firstname: firstname,
      lastname: lastname,
      contactNum: contactNum,
    });

    showProfileMessage("Profile information updated successfully.", "success");
  } catch (error) {
    console.error("Profile update failed:", error);

    showProfileMessage(
      "Unable to update your profile. Please try again.",
      "error",
    );
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = "Save Changes";
  }
});

// ================= CHANGE PASSWORD =================

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hidePasswordMessage();

  const user = auth.currentUser;

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const current = currentPassword.value;

  const newPass = newPassword.value;

  const confirmPass = confirmPassword.value;

  if (!current || !newPass || !confirmPass) {
    showPasswordMessage("Please fill in all password fields.", "error");

    return;
  }

  if (newPass.length < 6) {
    showPasswordMessage(
      "The new password must be at least 6 characters.",
      "error",
    );

    return;
  }

  if (newPass !== confirmPass) {
    showPasswordMessage("The new passwords do not match.", "error");

    return;
  }

  if (current === newPass) {
    showPasswordMessage(
      "The new password must be different from your current password.",
      "error",
    );

    return;
  }

  if (!user.email) {
    showPasswordMessage(
      "This account does not have an email address.",
      "error",
    );

    return;
  }

  changePasswordBtn.disabled = true;
  changePasswordBtn.textContent = "Changing...";

  try {
    const credential = EmailAuthProvider.credential(user.email, current);

    await reauthenticateWithCredential(user, credential);

    await updatePassword(user, newPass);

    showPasswordMessage("Password changed successfully.", "success");

    changePasswordForm.reset();
  } catch (error) {
    console.error("Password change failed:", error);

    let message = "Unable to change your password. Please try again.";

    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/wrong-password"
    ) {
      message = "Your current password is incorrect.";
    } else if (error.code === "auth/weak-password") {
      message = "The new password is too weak.";
    } else if (error.code === "auth/too-many-requests") {
      message = "Too many attempts. Please wait a while and try again.";
    } else if (error.code === "auth/network-request-failed") {
      message = "Network error. Please check your internet connection.";
    }

    showPasswordMessage(message, "error");
  } finally {
    changePasswordBtn.disabled = false;
    changePasswordBtn.textContent = "Change Password";
  }
});

// ================= LOGOUT =================

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);

    window.location.href = "index.html";
  });
}

// ================= INITIALIZE =================

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  loadAdminProfile();
});
