import {
  ref,
  onValue,
  update,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, db } from "./firebase.js";

// ================= STATE =================
let currentView = "overview"; // "overview" | "shop" | "customers"
let shopFilter = "all";
let shopSearchValue = "";
let customerSearchValue = "";
let signupRange = "daily"; // "daily" | "weekly"
let allUsers = [];

let signupsChartInstance = null;
let statusChartInstance = null;
let pipelineChartInstance = null;

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
const overviewView = document.getElementById("overviewView");
const topbarTitle = document.getElementById("topbarTitle");
const topbarSub = document.getElementById("topbarSub");
const navPendingBadge = document.getElementById("navPendingBadge");
const agingAlert = document.getElementById("agingAlert");
const agingList = document.getElementById("agingList");
const activityFeed = document.getElementById("activityFeed");

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
  overview: {
    title: "Overview",
    sub: "A snapshot of signups, approvals, and account health.",
  },
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

  overviewView.classList.toggle("hidden", view !== "overview");
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

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts) {
  const d = new Date(ts);
  const diff = d.getDate() - d.getDay(); // Sunday as start of week
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Builds an ordered list of time buckets ending today, for chart x-axes.
function buildBuckets(range) {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range === "daily") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      buckets.push({
        key: d.getTime(),
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
    }
  } else {
    const currentWeekStart = startOfWeek(today.getTime());
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() - i * 7);
      buckets.push({
        key: d.getTime(),
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
    }
  }

  return buckets;
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
    renderOverview();
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

// ================= OVERVIEW: DATA HELPERS =================
function computeSignupsSeries(range) {
  const buckets = buildBuckets(range);
  const shopCounts = new Array(buckets.length).fill(0);
  const customerCounts = new Array(buckets.length).fill(0);
  const bucketFn = range === "daily" ? startOfDay : startOfWeek;

  allUsers.forEach((u) => {
    const ts = Number(u.timestamp);
    if (!ts || Number.isNaN(ts)) return;

    const bucketKey = bucketFn(ts);
    const idx = buckets.findIndex((b) => b.key === bucketKey);
    if (idx === -1) return;

    if (SHOP_ROLES.includes(u.role)) shopCounts[idx]++;
    else if (u.role === CUSTOMER_ROLE) customerCounts[idx]++;
  });

  return { labels: buckets.map((b) => b.label), shopCounts, customerCounts };
}

// Weekly approved-vs-rejected throughput for the pipeline chart (last 12 weeks).
function computePipelineSeries() {
  const buckets = buildBuckets("weekly");
  const approvedCounts = new Array(buckets.length).fill(0);
  const rejectedCounts = new Array(buckets.length).fill(0);

  allUsers
    .filter((u) => SHOP_ROLES.includes(u.role))
    .forEach((u) => {
      if (u.dateApproved) {
        const idx = buckets.findIndex(
          (b) => b.key === startOfWeek(Number(u.dateApproved)),
        );
        if (idx !== -1) approvedCounts[idx]++;
      }
      if (u.dateRejected) {
        const idx = buckets.findIndex(
          (b) => b.key === startOfWeek(Number(u.dateRejected)),
        );
        if (idx !== -1) rejectedCounts[idx]++;
      }
    });

  return {
    labels: buckets.map((b) => b.label),
    approvedCounts,
    rejectedCounts,
  };
}

function computeAvgApprovalTime() {
  const approved = allUsers.filter(
    (u) => SHOP_ROLES.includes(u.role) && u.dateApproved && u.timestamp,
  );
  if (approved.length === 0) return null;

  const totalMs = approved.reduce(
    (sum, u) => sum + (Number(u.dateApproved) - Number(u.timestamp)),
    0,
  );
  return totalMs / approved.length;
}

function computeAgingPending() {
  const now = Date.now();

  return allUsers
    .filter(
      (u) =>
        SHOP_ROLES.includes(u.role) && u.status === "pending" && u.timestamp,
    )
    .map((u) => ({ ...u, waitingMs: now - Number(u.timestamp) }))
    .filter((u) => u.waitingMs > 48 * 60 * 60 * 1000)
    .sort((a, b) => b.waitingMs - a.waitingMs);
}

function computeRecentActivity() {
  const events = [];

  allUsers.forEach((u) => {
    if (u.timestamp) {
      const label = SHOP_ROLES.includes(u.role)
        ? `New ${u.role === "shop_owner" ? "shop" : "freelancer"} signup — ${u.shopName || u.email || "—"}`
        : u.role === CUSTOMER_ROLE
          ? `New customer signup — ${customerName(u) !== "—" ? customerName(u) : u.email || "—"}`
          : null;

      if (label)
        events.push({ type: "signup", ts: Number(u.timestamp), text: label });
    }

    if (SHOP_ROLES.includes(u.role) && u.dateApproved) {
      events.push({
        type: "approved",
        ts: Number(u.dateApproved),
        text: `Approved — ${u.shopName || u.email || "—"}`,
      });
    }

    if (SHOP_ROLES.includes(u.role) && u.dateRejected) {
      events.push({
        type: "rejected",
        ts: Number(u.dateRejected),
        text: `Rejected — ${u.shopName || u.email || "—"}`,
      });
    }
  });

  return events
    .filter((e) => !Number.isNaN(e.ts))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);
}

// ================= OVERVIEW: RENDER =================
function renderKpis() {
  const shopAccounts = allUsers.filter((u) => SHOP_ROLES.includes(u.role));
  const customers = allUsers.filter((u) => u.role === CUSTOMER_ROLE);
  const pending = shopAccounts.filter((u) => u.status === "pending").length;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newSignups = allUsers.filter(
    (u) => Number(u.timestamp) >= weekAgo,
  ).length;

  document.getElementById("kpiShopAccounts").textContent = shopAccounts.length;
  document.getElementById("kpiCustomers").textContent = customers.length;
  document.getElementById("kpiPending").textContent = pending;
  document.getElementById("kpiNewSignups").textContent = newSignups;
}

function renderSignupsChart() {
  const canvas = document.getElementById("signupsChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    canvas.parentElement.innerHTML = `<p class="doc-empty">Charts library failed to load — check your internet connection and refresh.</p>`;
    return;
  }

  const { labels, shopCounts, customerCounts } =
    computeSignupsSeries(signupRange);

  if (signupsChartInstance) {
    signupsChartInstance.data.labels = labels;
    signupsChartInstance.data.datasets[0].data = shopCounts;
    signupsChartInstance.data.datasets[1].data = customerCounts;
    signupsChartInstance.update();
    return;
  }

  signupsChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Shops",
          data: shopCounts,
          borderColor: "#ea5050",
          backgroundColor: "rgba(234, 80, 80, 0.12)",
          tension: 0.3,
          fill: true,
        },
        {
          label: "Customers",
          data: customerCounts,
          borderColor: "#3f3a39",
          backgroundColor: "rgba(63, 58, 57, 0.08)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderStatusChart() {
  const canvas = document.getElementById("statusChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    canvas.parentElement.innerHTML = `<p class="doc-empty">Charts library failed to load — check your internet connection and refresh.</p>`;
    return;
  }

  const shopAccounts = allUsers.filter((u) => SHOP_ROLES.includes(u.role));
  const data = [
    shopAccounts.filter((u) => u.status === "active").length,
    shopAccounts.filter((u) => u.status === "pending").length,
    shopAccounts.filter((u) => u.status === "suspended").length,
    shopAccounts.filter((u) => u.status === "rejected").length,
  ];

  if (statusChartInstance) {
    statusChartInstance.data.datasets[0].data = data;
    statusChartInstance.update();
    return;
  }

  statusChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Active", "Pending", "Suspended", "Rejected"],
      datasets: [
        { data, backgroundColor: ["#1c7a45", "#a6650a", "#b8501f", "#c23636"] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function renderPipelineChart() {
  const canvas = document.getElementById("pipelineChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    canvas.parentElement.innerHTML = `<p class="doc-empty">Charts library failed to load — check your internet connection and refresh.</p>`;
    return;
  }

  const { labels, approvedCounts, rejectedCounts } = computePipelineSeries();

  if (pipelineChartInstance) {
    pipelineChartInstance.data.labels = labels;
    pipelineChartInstance.data.datasets[0].data = approvedCounts;
    pipelineChartInstance.data.datasets[1].data = rejectedCounts;
    pipelineChartInstance.update();
    return;
  }

  pipelineChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Approved", data: approvedCounts, backgroundColor: "#1c7a45" },
        { label: "Rejected", data: rejectedCounts, backgroundColor: "#c23636" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPipelineStats() {
  document.getElementById("avgApprovalTime").textContent = formatDuration(
    computeAvgApprovalTime(),
  );

  const { approvedCounts, rejectedCounts } = computePipelineSeries();
  document.getElementById("approvedCount").textContent = approvedCounts.reduce(
    (a, b) => a + b,
    0,
  );
  document.getElementById("rejectedCount").textContent = rejectedCounts.reduce(
    (a, b) => a + b,
    0,
  );
}

function renderAgingAlert() {
  const aging = computeAgingPending();

  if (aging.length === 0) {
    agingAlert.classList.add("hidden");
    return;
  }

  agingAlert.classList.remove("hidden");
  agingList.innerHTML = aging
    .slice(0, 5)
    .map(
      (u) => `
        <li>
          <span>${u.shopName || u.email || "—"}</span>
          <span class="aging-days">${Math.floor(u.waitingMs / (1000 * 60 * 60 * 24))}d waiting</span>
          <button type="button" class="aging-review" onclick="reviewAccount('${u.id}')">Review</button>
        </li>
      `,
    )
    .join("");
}

function renderActivityFeed() {
  const events = computeRecentActivity();

  if (events.length === 0) {
    activityFeed.innerHTML = `<p class="doc-empty">No recent activity yet.</p>`;
    return;
  }

  const icons = { signup: "＋", approved: "✓", rejected: "✕" };

  activityFeed.innerHTML = events
    .map(
      (ev) => `
        <li class="activity-item activity-${ev.type}">
          <span class="activity-icon">${icons[ev.type]}</span>
          <div>
            <p class="activity-text">${ev.text}</p>
            <span class="activity-time">${timeAgo(ev.ts)}</span>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderOverview() {
  renderKpis();
  renderSignupsChart();
  renderStatusChart();
  renderPipelineStats();
  renderPipelineChart();
  renderAgingAlert();
  renderActivityFeed();
}

window.setSignupRange = (range) => {
  signupRange = range;
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.range === range);
  });
  renderSignupsChart();
};

window.reviewAccount = (id) => {
  const data = allUsers.find((u) => u.id === id);
  if (!data) return;
  setView("shop");
  openPanel(data, id);
};

loadData();

// ================= ACTIONS PER STATUS (shop accounts) =================
function actionButtons(status, id) {
  if (status === "pending") {
    return `
      <button class="action-btn action-approve" onclick="confirmApprove('${id}')">Approve</button>
      <button class="action-btn action-reject" onclick="openRejectModal('${id}')">Reject</button>
    `;
  }

  // ---- Suspend / Activate temporarily disabled ----
  // if (status === "active") {
  //   return `<button class="action-btn action-suspend" onclick="openSuspendModal('${id}')">Suspend</button>`;
  // }
  //
  // if (status === "suspended") {
  //   return `<button class="action-btn action-approve" onclick="activateAccount('${id}')">Activate</button>`;
  // }

  // active, rejected, suspended — no actions for now
  return `<p class="doc-empty">No actions available for this account.</p>`;
}

// ================= ACTIONS PER STATUS (customers) =================
function customerActionButtons(status, id) {
  // ---- Suspend / Activate temporarily disabled ----
  // if (status === "active") {
  //   return `<button class="action-btn action-suspend" onclick="openSuspendModal('${id}')">Suspend</button>`;
  // }
  //
  // if (status === "suspended") {
  //   return `<button class="action-btn action-approve" onclick="activateAccount('${id}')">Activate</button>`;
  // }

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

// ---- Suspend / Activate temporarily disabled ----
// window.activateAccount = async (id) => {
//   const account = allUsers.find((u) => u.id === id);
//
//   await update(ref(db, "users/" + id), {
//     status: "active",
//     suspendedReason: "none",
//   });
//
//   if (account && account.role === "shop_owner") {
//     await setShopServicesStatus(id, "active");
//   }
//
//   closePanel();
// };

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

// ---- Suspend / Activate temporarily disabled ----
// window.openSuspendModal = (id) => {
//   const account = allUsers.find((u) => u.id === id);
//
//   openReasonModal({
//     title: "Suspend account",
//     placeholder: "Explain why this account is being suspended…",
//     confirmLabel: "Suspend account",
//     onConfirm: async (reason) => {
//       await update(ref(db, "users/" + id), {
//         status: "suspended",
//         suspendedReason: reason,
//       });
//
//       if (account && account.role === "shop_owner") {
//         await setShopServicesStatus(id, "inactive");
//       }
//
//       closePanel();
//     },
//   });
// };

// ================= LOGOUT =================
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}
