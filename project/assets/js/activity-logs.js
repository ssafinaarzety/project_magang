import { auth, db } from "./firebase-config.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===============================
// DOM ELEMENTS
// ===============================
const tbody = document.getElementById("activityLogTable");
const table = document.getElementById("activityLogTable");
const filter = document.getElementById("logFilter");

let allLogs = [];
let filteredLogs = [];
let currentPage = 1;
const PAGE_SIZE = 15;
const FETCH_SIZE = 200;

let currentUserUID = null;
let currentUserRole = null;

function getTableColspan() {
    return currentUserRole === "pegawai" ? 3 : 5;
}

function getLogDateString(log) {
    const date = log.timestamp?.toDate ? log.timestamp.toDate() : null;
    return date ? date.toLocaleString("id-ID") : "-";
}

function getPegawaiDetailsText(log) {
    if (log.action === "login") return "User login to Dashboard";
    if (log.action === "access") return "File accessed from Dashboard";
    return log.action || "-";
}

function applyRoleTableLayout() {
    const tableHeadRow = document.querySelector("table thead tr");
    if (!tableHeadRow) return;

    if (currentUserRole === "pegawai") {
        tableHeadRow.innerHTML = `
            <th class="px-6 py-3 font-semibold text-gray-600">Access Date/Time</th>
            <th class="px-6 py-3 font-semibold text-gray-600">File Name</th>
            <th class="px-6 py-3 font-semibold text-gray-600">Details</th>
        `;
    } else {
        tableHeadRow.innerHTML = `
            <th class="px-6 py-3 font-semibold text-gray-600">Timestamp</th>
            <th class="px-6 py-3 font-semibold text-gray-600">User</th>
            <th class="px-6 py-3 font-semibold text-gray-600">Action</th>
            <th class="px-6 py-3 font-semibold text-gray-600">File</th>
            <th class="px-6 py-3 font-semibold text-gray-600 text-right">Status</th>
        `;
    }
}

function applyRolePageBehavior() {
    const viewParam = new URLSearchParams(window.location.search).get("view");

    if (viewParam === "pegawai" && currentUserRole !== "pegawai") {
        window.location.href = "dashboard-admin.html";
        return;
    }

    applyRoleTableLayout();
}

// ===============================
// AUTH CHECK AND ROLE DETECTION
// ===============================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    currentUserUID = user.uid;

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            window.location.href = "../index.html";
            return;
        }

        currentUserRole = userSnap.data().role?.toLowerCase() || "pegawai";
        applyRolePageBehavior();
        await loadAllLogs();
    } catch (error) {
        console.error("Error fetching user role:", error);
        table.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-6 text-red-500">
                    Gagal memuat data pengguna
                </td>
            </tr>
        `;
    }
});


// ===============================
// LOAD LOGS FROM FIRESTORE
// ===============================
async function loadAllLogs() {

    if (!table) return;

    table.innerHTML = `
        <tr>
            <td colspan="${getTableColspan()}" class="text-center py-6 text-gray-400">
                Loading activity logs...
            </td>
        </tr>
    `;

    try {

        const fetchedLogs = [];
        let cursorDoc = null;

        // Fetch all activity logs in chunks, newest first.
        while (true) {
            const constraints = [
                orderBy("timestamp", "desc"),
                limit(FETCH_SIZE)
            ];

            if (cursorDoc) {
                constraints.push(startAfter(cursorDoc));
            }

            const q = query(collection(db, "activityLogs"), ...constraints);
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                break;
            }

            snapshot.forEach((docSnap) => {
                const log = docSnap.data();

                // Filter based on user role
                // Admin: see all logs | Pegawai: see only their own logs
                if (log.userEmail && log.action) {
                    if (currentUserRole === "pegawai") {
                        if (log.uid === currentUserUID) {
                            fetchedLogs.push(log);
                        }
                    } else {
                        fetchedLogs.push(log);
                    }
                }
            });

            cursorDoc = snapshot.docs[snapshot.docs.length - 1] || null;

            if (snapshot.size < FETCH_SIZE) {
                break;
            }
        }

        allLogs = fetchedLogs;
        applyCurrentFilter(true);

    } catch (err) {

        console.error("Error loading logs:", err);

        table.innerHTML = `
            <tr>
                <td colspan="${getTableColspan()}" class="text-center py-6 text-red-500">
                    Gagal memuat activity logs
                </td>
            </tr>
        `;

    }

}


// ===============================
// RENDER TABLE
// ===============================

function renderLogs(data, reset = true) {

    if (!table) return;

    if (reset) {
        table.innerHTML = "";
    }

    if (data.length === 0 && reset) {

        table.innerHTML = `
            <tr>
                <td colspan="${getTableColspan()}" class="text-center py-6 text-gray-400">
                    Tidak ada activity logs
                </td>
            </tr>
        `;

        return;

    }

    data.forEach(log => {

        const dateText = getLogDateString(log);

        const row = document.createElement("tr");

        if (currentUserRole === "pegawai") {
            row.innerHTML = `
                <td class="px-4 py-3">
                    ${dateText}
                </td>

                <td class="px-4 py-3">
                    ${log.fileName || "-"}
                </td>

                <td class="px-4 py-3 text-slate-500">
                    ${getPegawaiDetailsText(log)}
                </td>
            `;
        } else {
            row.innerHTML = `
                <td class="px-4 py-3">
                    ${dateText}
                </td>

                <td class="px-4 py-3">
                    ${log.userEmail || "-"}
                </td>

                <td class="px-4 py-3 capitalize">
                    ${log.action || "-"}
                </td>

                <td class="px-4 py-3">
                    ${log.fileName || "-"}
                </td>

                <td class="px-4 py-3 text-green-600">
                    ${log.status || "success"}
                </td>
            `;
        }

        table.appendChild(row);

    });

}


function applyCurrentFilter(resetPage = false) {
    const action = filter?.value || "all";

    if (action === "all") {
        filteredLogs = [...allLogs];
    } else {
        filteredLogs = allLogs.filter((log) => log.action === action);
    }

    if (resetPage) {
        currentPage = 1;
    }

    renderCurrentPage();
}


function renderCurrentPage() {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageLogs = filteredLogs.slice(startIndex, endIndex);

    renderLogs(pageLogs, true);
    updatePaginationButtons();
    updateLogCount(startIndex, pageLogs.length);
}


// ===============================
// PAGINATION HELPERS
// ===============================

function updatePaginationButtons() {
    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    const pageInfo = document.getElementById("pageInfo");
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.classList.toggle("opacity-50", currentPage <= 1);
        prevBtn.classList.toggle("cursor-not-allowed", currentPage <= 1);
    }

    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.classList.toggle("opacity-50", currentPage >= totalPages);
        nextBtn.classList.toggle("cursor-not-allowed", currentPage >= totalPages);
    }

    if (pageInfo) {
        pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages}`;
    }
}

function updateLogCount(startIndex = 0, pageCount = 0) {
    const logCount = document.getElementById("logCount");
    if (logCount) {
        if (filteredLogs.length === 0) {
            logCount.textContent = "Tidak ada log yang sesuai";
            return;
        }

        const from = startIndex + 1;
        const to = startIndex + pageCount;
        logCount.textContent = `Menampilkan ${from}-${to} dari ${filteredLogs.length} log`;
    }
}

async function loadNextPage() {
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
    if (currentPage >= totalPages) return;

    currentPage += 1;
    renderCurrentPage();
}

async function loadPrevPage() {
    if (currentPage <= 1) return;

    currentPage -= 1;
    renderCurrentPage();
}

window.loadNextPage = loadNextPage;
window.loadPrevPage = loadPrevPage;


// ===============================
// FILTER LOGS
// ===============================

if (filter) {

    filter.addEventListener("change", (e) => {
        if (!e?.target) return;
        applyCurrentFilter(true);

    });

}


// ===============================
// EXPORT CSV
// ===============================

function exportLogs() {

    if (allLogs.length === 0) return;

    let csv = currentUserRole === "pegawai"
        ? "Access Date/Time,File Name,Details\n"
        : "Timestamp,User,Action,File,Status\n";

    allLogs.forEach(log => {

        const date = getLogDateString(log);

        if (currentUserRole === "pegawai") {
            csv += `"${date}","${log.fileName || "-"}","${getPegawaiDetailsText(log)}"\n`;
        } else {
            csv += `"${date}","${log.userEmail || "-"}","${log.action || "-"}","${log.fileName || "-"}","${log.status || "-"}"\n`;
        }

    });

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "activity_logs.csv";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

}

window.exportLogs = exportLogs;
