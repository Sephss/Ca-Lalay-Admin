import {
  ref,
  onValue,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, db } from "./firebase.js";

// ================= STATE =================
let filter = "all";
let searchValue = "";
let allUsers = [];

// ================= ELEMENTS =================
const tableBody = document.getElementById("tableBody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const panelOverlay = document.getElementById("panelOverlay");
const panel = document.getElementById("detailPanel");
const panelBody = document.getElementById("panelBody");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const navItems = document.querySelectorAll(".nav-item");
const statCounts = {
  all: document.getElementById("countAll"),
  pending: document.getElementById("countPending"),
  active: document.getElementById("countActive"),
  suspended: document.getElementById("countSuspended"),
};

// ================= FILTER (sidebar) =================
window.setFilter = (val) => {
  filter = val;

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.filter === val);
  });

  render();
};

// ================= SEARCH =================
searchInput.addEventListener("input", (e) => {
  searchValue = e.target.value.toLowerCase();
  render();
});

// ================= STATUS BADGE UI =================
function statusBadge(status) {
  const known = ["active", "pending", "suspended", "rejected", "terminated"];
  const cls = known.includes(status) ? status : "default";
  const label = status ? status.toUpperCase() : "UNKNOWN";
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function initials(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function getShopImage(data) {
  const val = data.shopImage;
  if (!val) return null;
  if (typeof val === "string") return val;
  return val.url || val.imageUrl || val.image || null;
}

function avatar(data) {
  const shopImage = getShopImage(data);
  if (shopImage) {
    return `<img src="${shopImage}" class="avatar-img" alt="">`;
  }
  return `<span class="avatar-fallback">${initials(data.shopName || data.email)}</span>`;
}

// ================= LOAD DATA (live) =================
function loadData() {
  onValue(ref(db, "users"), (snapshot) => {
    const users = [];

    snapshot.forEach((child) => {
      const data = child.val();
      if (data.role !== "shop_owner" && data.role !== "freelancer") return;
      users.push({ id: child.key, ...data });
    });

    allUsers = users;
    updateCounts();
    render();
  });
}

function updateCounts() {
  const total = allUsers.length;
  const pending = allUsers.filter((u) => u.status === "pending").length;
  const active = allUsers.filter((u) => u.status === "active").length;
  const suspended = allUsers.filter((u) => u.status === "suspended").length;

  statCounts.all.textContent = total;
  statCounts.pending.textContent = pending;
  statCounts.active.textContent = active;
  statCounts.suspended.textContent = suspended;

  document.getElementById("countAllStat").textContent = total;
  document.getElementById("countPendingStat").textContent = pending;
  document.getElementById("countActiveStat").textContent = active;
  document.getElementById("countSuspendedStat").textContent = suspended;
}

// ================= RENDER TABLE (filter + search) =================
function render() {
  const rows = allUsers.filter((data) => {
    if (filter !== "all" && data.status !== filter) return false;

    const match =
      (data.shopName || "").toLowerCase().includes(searchValue) ||
      (data.email || "").toLowerCase().includes(searchValue);

    return match;
  });

  tableBody.innerHTML = rows
    .map(
      (data) => `
        <tr>
          <td>
            <div class="account-cell">
              <span class="avatar">${avatar(data)}</span>
              <div class="account-info">
                <span class="account-name">${data.shopName || "—"}</span>
                <span class="account-email">${data.email || ""}</span>
              </div>
            </div>
          </td>
          <td><span class="role-pill">${data.role === "shop_owner" ? "Shop owner" : "Freelancer"}</span></td>
          <td>${statusBadge(data.status)}</td>
          <td class="col-actions">
            <button class="viewBtn" data-id="${data.id}">View</button>
          </td>
        </tr>
      `,
    )
    .join("");

  emptyState.classList.toggle("hidden", rows.length !== 0);
}

loadData();

// ================= DETAIL PANEL =================
function openPanel(data, id) {
  panelBody.innerHTML = `
    <div class="panel-hero">
      <span class="avatar avatar-lg">${avatar(data)}</span>
      <div>
        <h3>${data.shopName || "—"}</h3>
        ${statusBadge(data.status)}
      </div>
    </div>

    <dl class="detail-list">
      <div><dt>Email</dt><dd>${data.email || "—"}</dd></div>
      <div><dt>Contact</dt><dd>${data.contactNum || "—"}</dd></div>
      <div><dt>Location</dt><dd>${data.location || "—"}</dd></div>
      <div><dt>Role</dt><dd>${data.role === "shop_owner" ? "Shop owner" : "Freelancer"}</dd></div>
    </dl>

    <div class="doc-section">
      <span class="doc-label">Submitted document</span>
      ${
        data.imageUrl
          ? `<button type="button" class="doc-thumb" data-full="${data.imageUrl}">
               <img src="${data.imageUrl}" alt="Submitted document">
               <span class="doc-thumb-hint">View full image</span>
             </button>`
          : `<p class="doc-empty">No document submitted.</p>`
      }
    </div>

    <div class="panel-actions">
      <button class="action-btn action-approve" onclick="updateStatus('${id}', 'active')">Approve</button>
      <button class="action-btn action-reject" onclick="updateStatus('${id}', 'rejected')">Reject</button>
      <button class="action-btn action-suspend" onclick="updateStatus('${id}', 'suspended')">Suspend</button>
    </div>
  `;

  panelOverlay.classList.remove("hidden");
  requestAnimationFrame(() => panelOverlay.classList.add("is-open"));
}

function closePanel() {
  panelOverlay.classList.remove("is-open");
  setTimeout(() => panelOverlay.classList.add("hidden"), 200);
}

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.remove("hidden");
  requestAnimationFrame(() => lightbox.classList.add("is-open"));
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  setTimeout(() => {
    lightbox.classList.add("hidden");
    lightboxImg.src = "";
  }, 200);
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("viewBtn")) {
    const id = e.target.dataset.id;
    const data = allUsers.find((u) => u.id === id);
    if (data) openPanel(data, id);
  }

  if (e.target.id === "closePanel" || e.target === panelOverlay) {
    closePanel();
  }

  const docThumb = e.target.closest(".doc-thumb");
  if (docThumb) {
    openLightbox(docThumb.dataset.full);
  }

  if (e.target.id === "closeLightbox" || e.target === lightbox) {
    closeLightbox();
  }
});

// ================= UPDATE STATUS =================
window.updateStatus = async (id, status) => {
  await update(ref(db, "users/" + id), { status });
  closePanel();
};

// ================= LOGOUT =================
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}
