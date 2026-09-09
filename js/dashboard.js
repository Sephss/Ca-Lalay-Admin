import {
  ref,
  onValue,
  update,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, db } from "./firebase.js";

// ================= STATE =================
let currentView = "shop"; // "shop" | "customers"
let shopFilter = "all";
let shopSearchValue = "";
let customerSearchValue = "";
let allUsers = [];

const SHOP_ROLES = ["shop_owner", "freelancer"];
const CUSTOMER_ROLE = "customer";

// ================= ELEMENTS =================
const tableBody = document.getElementById("tableBody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const customerTableBody = document.getElementById("customerTableBody");
const customerEmptyState = document.getElementById("customerEmptyState");
const customerSearchInput = document.getElementById("customerSearchInput");

const shopView = document.getElementById("shopView");
const customersView = document.getElementById("customersView");
const topbarTitle = document.getElementById("topbarTitle");
const topbarSub = document.getElementById("topbarSub");
const navPendingBadge = document.getElementById("navPendingBadge");

const panelOverlay = document.getElementById("panelOverlay");
const panel = document.getElementById("detailPanel");
const panelBody = document.getElementById("panelBody");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const reasonModal = document.getElementById("reasonModal");
const reasonModalTitle = document.getElementById("reasonModalTitle");
const reasonInput = document.getElementById("reasonInput");
const reasonError = document.getElementById("reasonError");
const reasonCancelBtn = document.getElementById("reasonCancelBtn");
const reasonConfirmBtn = document.getElementById("reasonConfirmBtn");
const confirmModal = document.getElementById("confirmModal");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmConfirmBtn = document.getElementById("confirmConfirmBtn");

const navItems = document.querySelectorAll(".nav-item");
const filterCards = document.querySelectorAll(".filter-card");

const VIEW_COPY = {
  shop: {
    title: "Shop management",
    sub: "Review and manage shop owner and freelancer accounts.",
  },
  customers: {
    title: "Customers",
    sub: "Browse and search registered customers.",
  },
};

// ================= NAV (sidebar view switch) =================
window.setView = (view) => {
  currentView = view;

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === view);
  });

  shopView.classList.toggle("hidden", view !== "shop");
  customersView.classList.toggle("hidden", view !== "customers");

  topbarTitle.textContent = VIEW_COPY[view].title;
  topbarSub.textContent = VIEW_COPY[view].sub;
};

// ================= SHOP FILTER (pending / active / suspended / rejected) =================
window.setShopFilter = (val) => {
  shopFilter = val;

  filterCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.filter === val);
  });

  render();
};

// ================= SEARCH =================
searchInput.addEventListener("input", (e) => {
  shopSearchValue = e.target.value.toLowerCase();
  render();
});

customerSearchInput.addEventListener("input", (e) => {
  customerSearchValue = e.target.value.toLowerCase();
  renderCustomers();
});

// ================= STATUS BADGE UI =================
function statusBadge(status) {
  const known = ["active", "pending", "suspended", "rejected"];
  const cls = known.includes(status) ? status : "default";
  const label = status ? status.toUpperCase() : "UNKNOWN";
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function initials(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function formatDate(ts) {
  if (!ts) return null;
  const num = Number(ts);
  if (Number.isNaN(num)) return null;

  return new Date(num).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ================= SHOP ACCOUNT HELPERS =================
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

// Cascades a status ("active" / "inactive") to every service under a shop
// when that shop account is suspended or re-activated.
async function setShopServicesStatus(shopId, status) {
  const snapshot = await get(ref(db, "car_services/" + shopId));
  if (!snapshot.exists()) return;

  const updates = {};
  snapshot.forEach((serviceChild) => {
    updates[`car_services/${shopId}/${serviceChild.key}/status`] = status;
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

// ================= CUSTOMER HELPERS =================
function customerName(data) {
  return `${data.firstname || ""} ${data.lastname || ""}`.trim() || "—";
}

function customerAvatar(data) {
  if (data.imageUrl) {
    return `<img src="${data.imageUrl}" class="avatar-img" alt="">`;
  }
  return `<span class="avatar-fallback">${initials(customerName(data) !== "—" ? customerName(data) : data.email)}</span>`;
}

// ================= LOAD DATA (live) =================
function loadData() {
  onValue(ref(db, "users"), (snapshot) => {
    const users = [];

    snapshot.forEach((child) => {
      users.push({ id: child.key, ...child.val() });
    });

    allUsers = users;
    updateCounts();
    render();
    renderCustomers();
  });
}

function updateCounts() {
  const shopAccounts = allUsers.filter((u) => SHOP_ROLES.includes(u.role));

  const total = shopAccounts.length;
  const pending = shopAccounts.filter((u) => u.status === "pending").length;
  const active = shopAccounts.filter((u) => u.status === "active").length;
  const suspended = shopAccounts.filter((u) => u.status === "suspended").length;
  const rejected = shopAccounts.filter((u) => u.status === "rejected").length;

  document.getElementById("countAllValue").textContent = total;
  document.getElementById("countPendingValue").textContent = pending;
  document.getElementById("countActiveValue").textContent = active;
  document.getElementById("countSuspendedValue").textContent = suspended;
  document.getElementById("countRejectedValue").textContent = rejected;

  navPendingBadge.textContent = pending;
  navPendingBadge.classList.toggle("hidden", pending === 0);
}

// ================= RENDER: SHOP MANAGEMENT TABLE =================
function render() {
  const shopAccounts = allUsers.filter((u) => SHOP_ROLES.includes(u.role));

  const rows = shopAccounts.filter((data) => {
    if (shopFilter !== "all" && data.status !== shopFilter) return false;

    const match =
      (data.shopName || "").toLowerCase().includes(shopSearchValue) ||
      (data.email || "").toLowerCase().includes(shopSearchValue);

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

// ================= RENDER: CUSTOMERS TABLE =================
function renderCustomers() {
  const customers = allUsers.filter((u) => u.role === CUSTOMER_ROLE);

  const rows = customers.filter((data) => {
    const match =
      customerName(data).toLowerCase().includes(customerSearchValue) ||
      (data.email || "").toLowerCase().includes(customerSearchValue);

    return match;
  });

  customerTableBody.innerHTML = rows
    .map(
      (data) => `
        <tr>
          <td>
            <div class="account-cell">
              <span class="avatar">${customerAvatar(data)}</span>
              <div class="account-info">
                <span class="account-name">${customerName(data)}</span>
                <span class="account-email">${data.email || ""}</span>
              </div>
            </div>
          </td>
          <td>${data.contactNum || "—"}</td>
          <td>${statusBadge(data.status)}</td>
          <td class="col-actions">
            <button class="viewBtn" data-customer-id="${data.id}">View</button>
          </td>
        </tr>
      `,
    )
    .join("");

  customerEmptyState.classList.toggle("hidden", rows.length !== 0);
}

loadData();

// ================= ACTIONS PER STATUS (shop accounts) =================
function actionButtons(status, id) {
  if (status === "pending") {
    return `
      <button class="action-btn action-approve" onclick="confirmApprove('${id}')">Approve</button>
      <button class="action-btn action-reject" onclick="openRejectModal('${id}')">Reject</button>
    `;
  }

  if (status === "active") {
    return `<button class="action-btn action-suspend" onclick="openSuspendModal('${id}')">Suspend</button>`;
  }

  if (status === "suspended") {
    return `<button class="action-btn action-approve" onclick="activateAccount('${id}')">Activate</button>`;
  }

  // rejected — no actions
  return `<p class="doc-empty">No actions available for this account.</p>`;
}

// ================= ACTIONS PER STATUS (customers) =================
function customerActionButtons(status, id) {
  if (status === "active") {
    return `<button class="action-btn action-suspend" onclick="openSuspendModal('${id}')">Suspend</button>`;
  }

  if (status === "suspended") {
    return `<button class="action-btn action-approve" onclick="activateAccount('${id}')">Activate</button>`;
  }

  return `<p class="doc-empty">No actions available for this account.</p>`;
}

// ================= DETAIL PANEL: SHOP ACCOUNT =================
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
      <div><dt>Submitted</dt><dd>${formatDate(data.timestamp) || "—"}</dd></div>
      ${
        data.status === "active" && data.dateApproved
          ? `<div><dt>Approved on</dt><dd>${formatDate(data.dateApproved)}</dd></div>`
          : ""
      }
      ${
        data.status === "rejected"
          ? `<div><dt>Rejected on</dt><dd>${formatDate(data.dateRejected) || "—"}</dd></div>
             <div><dt>Reason</dt><dd>${data.rejectedReason || "—"}</dd></div>`
          : ""
      }
      ${
        data.status === "suspended" &&
        data.suspendedReason &&
        data.suspendedReason !== "none"
          ? `<div><dt>Suspended reason</dt><dd>${data.suspendedReason}</dd></div>`
          : ""
      }
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
      ${actionButtons(data.status, id)}
    </div>
  `;

  panelOverlay.classList.remove("hidden");
  requestAnimationFrame(() => panelOverlay.classList.add("is-open"));
}

// ================= DETAIL PANEL: CUSTOMER =================
function openCustomerPanel(data) {
  panelBody.innerHTML = `
    <div class="panel-hero">
      <span class="avatar avatar-lg">${customerAvatar(data)}</span>
      <div>
        <h3>${customerName(data)}</h3>
        ${statusBadge(data.status)}
      </div>
    </div>

    <dl class="detail-list">
      <div><dt>Email</dt><dd>${data.email || "—"}</dd></div>
      <div><dt>Contact</dt><dd>${data.contactNum || "—"}</dd></div>
      <div><dt>Joined</dt><dd>${formatDate(data.timestamp) || "—"}</dd></div>
      ${
        data.status === "suspended" &&
        data.suspendedReason &&
        data.suspendedReason !== "none"
          ? `<div><dt>Suspended reason</dt><dd>${data.suspendedReason}</dd></div>`
          : ""
      }
    </dl>

    <div class="panel-actions">
      ${customerActionButtons(data.status, data.id)}
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

// ================= REASON MODAL (reject / suspend) =================
let reasonSubmitHandler = null;

function openReasonModal({ title, placeholder, confirmLabel, onConfirm }) {
  reasonModalTitle.textContent = title;
  reasonInput.value = "";
  reasonInput.placeholder = placeholder;
  reasonConfirmBtn.textContent = confirmLabel;
  reasonError.classList.add("hidden");
  reasonSubmitHandler = onConfirm;

  reasonModal.classList.remove("hidden");
  requestAnimationFrame(() => reasonModal.classList.add("is-open"));
  reasonInput.focus();
}

function closeReasonModal() {
  reasonModal.classList.remove("is-open");
  setTimeout(() => reasonModal.classList.add("hidden"), 200);
  reasonSubmitHandler = null;
}

reasonCancelBtn.addEventListener("click", closeReasonModal);

reasonModal.addEventListener("click", (e) => {
  if (e.target === reasonModal) closeReasonModal();
});

reasonConfirmBtn.addEventListener("click", async () => {
  const reason = reasonInput.value.trim();

  if (!reason) {
    reasonError.textContent = "Please provide a reason before confirming.";
    reasonError.classList.remove("hidden");
    return;
  }

  if (reasonSubmitHandler) {
    reasonConfirmBtn.disabled = true;
    await reasonSubmitHandler(reason);
    reasonConfirmBtn.disabled = false;
  }

  closeReasonModal();
});

// ================= CONFIRM MODAL (approve, etc.) =================
let confirmSubmitHandler = null;

function openConfirmModal({ title, message, confirmLabel, onConfirm }) {
  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;
  confirmConfirmBtn.textContent = confirmLabel;
  confirmSubmitHandler = onConfirm;

  confirmModal.classList.remove("hidden");
  requestAnimationFrame(() => confirmModal.classList.add("is-open"));
}

function closeConfirmModal() {
  confirmModal.classList.remove("is-open");
  setTimeout(() => confirmModal.classList.add("hidden"), 200);
  confirmSubmitHandler = null;
}

confirmCancelBtn.addEventListener("click", closeConfirmModal);

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});

confirmConfirmBtn.addEventListener("click", async () => {
  if (confirmSubmitHandler) {
    confirmConfirmBtn.disabled = true;
    await confirmSubmitHandler();
    confirmConfirmBtn.disabled = false;
  }

  closeConfirmModal();
});

// ================= GLOBAL CLICK HANDLING =================
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("viewBtn")) {
    if (e.target.dataset.customerId) {
      const data = allUsers.find((u) => u.id === e.target.dataset.customerId);
      if (data) openCustomerPanel(data);
    } else if (e.target.dataset.id) {
      const data = allUsers.find((u) => u.id === e.target.dataset.id);
      if (data) openPanel(data, e.target.dataset.id);
    }
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

// ================= ACCOUNT ACTIONS (shop accounts) =================
window.approveAccount = async (id) => {
  await update(ref(db, "users/" + id), {
    status: "active",
    dateApproved: Date.now().toString(),
  });
  closePanel();
};

window.confirmApprove = (id) => {
  openConfirmModal({
    title: "Approve account",
    message:
      "This will activate the account and make it visible to customers immediately. Continue?",
    confirmLabel: "Yes, approve",
    onConfirm: async () => {
      await approveAccount(id);
    },
  });
};

window.activateAccount = async (id) => {
  const account = allUsers.find((u) => u.id === id);

  await update(ref(db, "users/" + id), {
    status: "active",
    suspendedReason: "none",
  });

  if (account && account.role === "shop_owner") {
    await setShopServicesStatus(id, "active");
  }

  closePanel();
};

window.openRejectModal = (id) => {
  openReasonModal({
    title: "Reject account",
    placeholder: "Explain why this account is being rejected…",
    confirmLabel: "Reject account",
    onConfirm: async (reason) => {
      await update(ref(db, "users/" + id), {
        status: "rejected",
        dateRejected: Date.now().toString(),
        rejectedReason: reason,
      });
      closePanel();
    },
  });
};

window.openSuspendModal = (id) => {
  const account = allUsers.find((u) => u.id === id);

  openReasonModal({
    title: "Suspend account",
    placeholder: "Explain why this account is being suspended…",
    confirmLabel: "Suspend account",
    onConfirm: async (reason) => {
      await update(ref(db, "users/" + id), {
        status: "suspended",
        suspendedReason: reason,
      });

      if (account && account.role === "shop_owner") {
        await setShopServicesStatus(id, "inactive");
      }

      closePanel();
    },
  });
};

// ================= LOGOUT =================
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}
