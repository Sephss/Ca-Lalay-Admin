import {
  ref,
  onValue,
  push,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { db } from "./firebase.js";

// ================= STATE =================
let activityLogs = [];
let logFilter = "all"; // "all" | "APPROVED_SHOP" | "REJECTED_SHOP"
let logSearchValue = "";
let logPage = 1;

const LOG_PAGE_SIZE = 10;

// ================= ELEMENTS =================
const logTableBody = document.getElementById("activityLogTableBody");
const logEmptyState = document.getElementById("activityLogEmptyState");
const logSearchInput = document.getElementById("logSearchInput");
const printLogBtn = document.getElementById("printLogBtn");
const filterCards = document.querySelectorAll("#activityLogView .filter-card");

// Date-range modal (shown before printing)
const dateRangeModal = document.getElementById("logDateRangeModal");
const dateRangeError = document.getElementById("logDateRangeError");
const startDateInput = document.getElementById("logStartDate");
const endDateInput = document.getElementById("logEndDate");
const dateRangeCancelBtn = document.getElementById("logDateRangeCancelBtn");
const dateRangeConfirmBtn = document.getElementById("logDateRangeConfirmBtn");

// ================= HELPERS =================
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

function formatDateShort(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function actionBadge(action) {
  if (action === "APPROVED_SHOP") {
    return `<span class="badge badge-active">APPROVED</span>`;
  }
  if (action === "REJECTED_SHOP") {
    return `<span class="badge badge-rejected">REJECTED</span>`;
  }
  return `<span class="badge badge-default">${action || "UNKNOWN"}</span>`;
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}

function renderPaginationControls(totalItems, page, totalPages) {
  const wrap = document.getElementById("logPagination");
  const info = document.getElementById("logPageInfo");
  const prevBtn = document.getElementById("logPrevBtn");
  const nextBtn = document.getElementById("logNextBtn");

  if (!wrap || !info || !prevBtn || !nextBtn) return;

  if (totalItems === 0) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
  info.textContent = `Page ${page} of ${totalPages}`;
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
}

// ================= WRITE (called from dashboard.js) =================
export async function logActivity(action, { shopUid, shopName, reason }) {
  try {
    await push(ref(db, "activityLogs"), {
      action,
      shopUid: shopUid || null,
      shopName: shopName || "—",
      reason: reason || "—",
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

// ================= FILTER / SEARCH =================
window.setLogFilter = (val) => {
  logFilter = val;
  logPage = 1;

  filterCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.filter === val);
  });

  renderActivityLog();
};

if (logSearchInput) {
  logSearchInput.addEventListener("input", (e) => {
    logSearchValue = e.target.value.toLowerCase();
    logPage = 1;
    renderActivityLog();
  });
}

function getFilteredLogs() {
  return activityLogs.filter((log) => {
    if (logFilter !== "all" && log.action !== logFilter) return false;

    const match =
      (log.shopName || "").toLowerCase().includes(logSearchValue) ||
      (log.reason || "").toLowerCase().includes(logSearchValue);

    return match;
  });
}

// ================= COUNTS =================
function updateLogCounts() {
  const all = activityLogs.length;
  const approved = activityLogs.filter(
    (l) => l.action === "APPROVED_SHOP",
  ).length;
  const rejected = activityLogs.filter(
    (l) => l.action === "REJECTED_SHOP",
  ).length;

  const allEl = document.getElementById("logCountAllValue");
  const approvedEl = document.getElementById("logCountApprovedValue");
  const rejectedEl = document.getElementById("logCountRejectedValue");

  if (allEl) allEl.textContent = all;
  if (approvedEl) approvedEl.textContent = approved;
  if (rejectedEl) rejectedEl.textContent = rejected;
}

// ================= RENDER =================
function renderActivityLog() {
  if (!logTableBody) return;

  const rows = getFilteredLogs();
  const { pageItems, totalPages, safePage } = paginate(
    rows,
    logPage,
    LOG_PAGE_SIZE,
  );
  logPage = safePage;

  logTableBody.innerHTML = pageItems
    .map(
      (log) => `
        <tr>
          <td>${formatDate(log.timestamp) || "—"}</td>
          <td>${actionBadge(log.action)}</td>
          <td>${log.shopName || "—"}</td>
          <td>${log.reason || "—"}</td>
        </tr>
      `,
    )
    .join("");

  if (logEmptyState) {
    logEmptyState.classList.toggle("hidden", rows.length !== 0);
  }

  updateLogCounts();
  renderPaginationControls(rows.length, safePage, totalPages);
}

window.logPrevPage = () => {
  logPage = Math.max(1, logPage - 1);
  renderActivityLog();
};

window.logNextPage = () => {
  logPage += 1;
  renderActivityLog();
};

// ================= LOAD DATA (live) =================
function loadActivityLogs() {
  onValue(ref(db, "activityLogs"), (snapshot) => {
    const logs = [];

    snapshot.forEach((child) => {
      logs.push({ id: child.key, ...child.val() });
    });

    logs.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    activityLogs = logs;
    renderActivityLog();
  });
}

loadActivityLogs();

// ================= PRINT =================
function buildPrintHtml(rows, rangeLabel) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Activity Log</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p.meta { color: #666; margin-top: 0; margin-bottom: 20px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 13px; }
          th { background: #f4f4f4; }
          .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
          .tag-approved { background: #e3f5ea; color: #1c7a45; }
          .tag-rejected { background: #fbe6e4; color: #c23636; }
        </style>
      </head>
      <body>
        <h1>Activity Log</h1>
        <p class="meta">
          Generated ${new Date().toLocaleString()} — ${rows.length} record(s)${rangeLabel ? ` — ${rangeLabel}` : ""}
        </p>
        <table>
          <thead>
            <tr><th>Date &amp; Time</th><th>Action</th><th>Shop</th><th>Reason</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
                  <tr>
                    <td>${formatDate(r.timestamp) || "—"}</td>
                    <td><span class="tag ${r.action === "APPROVED_SHOP" ? "tag-approved" : "tag-rejected"}">${r.action === "APPROVED_SHOP" ? "Approved" : "Rejected"}</span></td>
                    <td>${r.shopName || "—"}</td>
                    <td>${r.reason || "—"}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function runPrint(rows, rangeLabel) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;

  win.document.write(buildPrintHtml(rows, rangeLabel));
  win.document.close();
  win.focus();
  win.print();
}

// ---- Date range modal ----
function openDateRangeModal() {
  if (!dateRangeModal) return;

  startDateInput.value = "";
  endDateInput.value = "";
  dateRangeError.classList.add("hidden");

  dateRangeModal.classList.remove("hidden");
  requestAnimationFrame(() => dateRangeModal.classList.add("is-open"));
}

function closeDateRangeModal() {
  if (!dateRangeModal) return;

  dateRangeModal.classList.remove("is-open");
  setTimeout(() => dateRangeModal.classList.add("hidden"), 200);
}

if (printLogBtn) {
  printLogBtn.addEventListener("click", openDateRangeModal);
}

if (dateRangeCancelBtn) {
  dateRangeCancelBtn.addEventListener("click", closeDateRangeModal);
}

if (dateRangeModal) {
  dateRangeModal.addEventListener("click", (e) => {
    if (e.target === dateRangeModal) closeDateRangeModal();
  });
}

if (dateRangeConfirmBtn) {
  dateRangeConfirmBtn.addEventListener("click", () => {
    const startVal = startDateInput.value;
    const endVal = endDateInput.value;

    let startTs = null;
    let endTs = null;

    if (startVal) startTs = new Date(`${startVal}T00:00:00`).getTime();
    if (endVal) endTs = new Date(`${endVal}T23:59:59.999`).getTime();

    if (startTs && endTs && startTs > endTs) {
      dateRangeError.textContent = "Start date must be before the end date.";
      dateRangeError.classList.remove("hidden");
      return;
    }

    const rows = getFilteredLogs().filter((log) => {
      const ts = Number(log.timestamp);
      if (startTs && ts < startTs) return false;
      if (endTs && ts > endTs) return false;
      return true;
    });

    let rangeLabel = "";
    if (startTs && endTs) {
      rangeLabel = `${formatDateShort(startTs)} to ${formatDateShort(endTs)}`;
    } else if (startTs) {
      rangeLabel = `From ${formatDateShort(startTs)}`;
    } else if (endTs) {
      rangeLabel = `Up to ${formatDateShort(endTs)}`;
    }

    closeDateRangeModal();
    runPrint(rows, rangeLabel);
  });
}
