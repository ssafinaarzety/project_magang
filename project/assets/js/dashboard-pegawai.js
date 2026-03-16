import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    Timestamp,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===============================
// LOADING OVERLAY FUNCTIONS
// ===============================
function showLoading() {
    const loader = document.getElementById("loadingOverlay");
    if (loader) {
        loader.classList.remove("hidden");
    }
}

function hideLoading() {
    const loader = document.getElementById("loadingOverlay");
    if (loader) {
        loader.classList.add("hidden");
    }
}

// ===============================
// EMERGENCY FALLBACK - Auto hide overlay after 4 seconds
// ===============================
setTimeout(() => {
    const loader = document.getElementById("loadingOverlay");
    if (loader && !loader.classList.contains("hidden")) {
        console.warn("Emergency fallback: Force hiding loading overlay");
        loader.classList.add("hidden");
    }
}, 4000);

// ===============================
// GLOBAL ERROR HANDLERS
// ===============================
window.addEventListener("error", (event) => {
    console.error("Global error:", event.error);
    hideLoading();
});

window.addEventListener("unhandledrejection", (event) => {
    console.error("Promise error:", event.reason);
    hideLoading();
});

// ===============================
// GLOBAL DATA STATE
// ===============================

let allArchives = [];        // semua data dari firestore
let filteredArchives = [];   // data setelah filter
let allActivityLogs = [];    // semua activity logs user
let lastAccessedArchive = null;  // archive yang terakhir diakses

let currentUserUID = null;

let currentPage = 1;
const rowsPerPage = 10;


function getPreviewUrl(filePath) {

    return "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId="
        + filePath;

}

// ===============================
// AUTH CHECK
// ===============================
onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    try {

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.log("User data not found");
            return;
        }

        const userData = userSnap.data();

        if (userData.role !== "pegawai") {
            console.log("Not pegawai");
            return;
        }

        currentUserUID = user.uid;

        // ===============================
        // LOGIN SESSION CONTROL
        // ===============================

        const loginSession = sessionStorage.getItem("loginRecorded");

        if (!loginSession) {

            await logLogin(user.uid, user.email);

            sessionStorage.setItem("loginRecorded", "true");

        }

        // Load profile ke sidebar
        loadUserProfile(userData);
        setupProfileRedirect();
        loadArchives();

    } catch (error) {
        console.error("Auth error:", error);
    }

});


// ===============================
// LOG LOGIN EVENT
// ===============================
async function logLogin(uid, email) {
    try {
        const loginEntry = {
            uid: uid,
            userEmail: email,
            action: "login_pegawai",
            fileName: "-",
            fileId: "-",
            status: "success",
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "activityLogs"), loginEntry);
        console.log("Login event recorded successfully");

    } catch (error) {
        console.error("Error recording login event:", error);
    }
}


// ===============================
// LOAD USER PROFILE
// ===============================
function loadUserProfile(userData) {

    const nameEl = document.getElementById("pegawaiName");
    const roleEl = document.getElementById("pegawaiRole");
    const avatarEl = document.getElementById("pegawaiAvatar");

    const email = userData.email || auth.currentUser?.email || "user@email.com";

    if (nameEl) nameEl.textContent = email;

    if (roleEl) roleEl.textContent = "Pegawai";

    if (avatarEl) {

        const initial = email.charAt(0).toUpperCase();
        avatarEl.textContent = initial;

    }

}

// ===============================
// LOAD ARSIP
// ===============================
async function loadArchives() {

    showLoading();

    try {

        const q = query(
            collection(db, "files"),
            where("allowedUsers", "array-contains", currentUserUID)
        );

        const snapshot = await getDocs(q);

        allArchives = [];

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            allArchives.push({
                id: docSnap.id,
                ...data
            });

        });

        filteredArchives = [...allArchives];

        populateFilters(allArchives);

        renderTable();
        renderPagination();

        await Promise.all([
            calculateStatistics(),
            loadActivityLogs(),
            loadActivityChart(),
            loadActivitySummary(),
            loadTopAccessedFiles()
        ]);

    } catch (err) {

        console.error("Load archive error:", err);

        const tableBody = document.getElementById("pegawaiTableBody");

        if (tableBody) {
            tableBody.innerHTML = `
<tr>
<td colspan="5" class="px-6 py-6 text-center text-red-500">
Gagal memuat data arsip
</td>
</tr>
`;
        }

    }

    hideLoading();

}

// ===============================
// RENDER TABLE
// ===============================

function renderTable() {

    const tableBody = document.getElementById("pegawaiTableBody");

    tableBody.innerHTML = "";

    if (filteredArchives.length === 0) {
        tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="px-6 py-6 text-center text-slate-500">
                Tidak ada arsip
            </td>
        </tr>
        `;
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const pageData = filteredArchives.slice(start, end);
    let rows = "";

    pageData.forEach((item, index) => {

        rows += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">

            <td class="px-6 py-4">${start + index + 1}</td>

            <td class="px-6 py-4 font-medium text-slate-800 dark:text-white">
            ${item.nama || item.name || "Untitled File"}
            </td>

            <td class="px-6 py-4 text-slate-500">
            ${item.tanggal ? item.tanggal.split("-")[0] : "-"}
            </td>

            <td class="px-6 py-4">
            <span class="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
            ${item.kategori || "-"}
            </span>
            </td>

            <td class="px-6 py-4 text-right">

            <button 
            onclick="handleArchiveAccess('${item.id}', '${(item.nama || '-').replace(/'/g, "\\'")}')"
            class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition">

            <span class="material-icons-outlined text-sm">open_in_new</span>
            Buka

            </button>

            </td>

            </tr>
            `;

    });

    tableBody.innerHTML = rows;


}


// ===============================
// POPULATE FILTER
// ===============================

function populateFilters(archives) {

    const yearSelect = document.getElementById("yearSelect");
    const categorySelect = document.getElementById("categorySelect");

    const years = new Set();
    const categories = new Set();

    archives.forEach(item => {

        if (item.tanggal) {

            const year = item.tanggal.split("-")[0];
            years.add(year);

        }

        if (item.kategori) {
            categories.add(item.kategori);
        }

    });

    // reset dropdown
    yearSelect.innerHTML = `<option value="all">Semua Tahun</option>`;
    categorySelect.innerHTML = `<option value="all">Semua Kategori</option>`;

    // isi tahun
    [...years].sort((a, b) => b - a).forEach(year => {

        const option = document.createElement("option");

        option.value = year;
        option.textContent = year;

        yearSelect.appendChild(option);

    });

    // isi kategori
    [...categories].forEach(cat => {

        const option = document.createElement("option");

        option.value = cat;
        option.textContent = cat;

        categorySelect.appendChild(option);

    });

}

// ===============================
// APPLY FILTER
// ===============================

function applyFilters() {

    const search = document.getElementById("searchInput").value.toLowerCase();
    const year = document.getElementById("yearSelect").value;
    const category = document.getElementById("categorySelect").value;

    filteredArchives = allArchives.filter(item => {

        const matchSearch =
            (item.nama || item.name || "").toLowerCase().includes(search);

        const fileYear = item.tanggal ? item.tanggal.split("-")[0] : null;

        const matchYear =
            year === "all" || fileYear == year;

        const matchCategory =
            category === "all" ||
            (item.kategori || "").toLowerCase() === category.toLowerCase();

        return matchSearch && matchYear && matchCategory;

    });

    currentPage = 1;

    renderTable();
    renderPagination();

}

// ===============================
// FILTER EVENTS
// ===============================

document.addEventListener("DOMContentLoaded", () => {

    const searchInput = document.getElementById("searchInput");
    const yearSelect = document.getElementById("yearSelect");
    const categorySelect = document.getElementById("categorySelect");

    if (searchInput) searchInput.addEventListener("input", applyFilters);
    if (yearSelect) yearSelect.addEventListener("change", applyFilters);
    if (categorySelect) categorySelect.addEventListener("change", applyFilters);

});

// ===============================
// PAGINATION
// ===============================

function renderPagination() {

    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(filteredArchives.length / rowsPerPage));

    for (let i = 1; i <= totalPages; i++) {

        const btn = document.createElement("button");

        btn.textContent = i;

        btn.className = `
        px-3 py-1 border rounded text-sm
        ${i === currentPage ? "bg-primary text-white" : "bg-white"}
        `;

        btn.onclick = () => {

            currentPage = i;

            renderTable();
            renderPagination();

        };

        container.appendChild(btn);

    }

}
// ===============================
// CALCULATE STATISTICS
// ===============================

async function calculateStatistics() {
    // 1. Total Arsip
    const totalArsip = allArchives.length;
    const totalArsipEl = document.getElementById("totalArsipStat");
    if (totalArsipEl) {
        totalArsipEl.textContent = totalArsip;
    }

    // 2. Kategori Terbanyak
    const categoryCount = {};
    allArchives.forEach(item => {
        const cat = item.kategori || "Unknown";
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
    const topCategoryEl = document.getElementById("topCategoryStat");
    if (topCategoryEl) {
        topCategoryEl.textContent = topCategory ? topCategory[0] : "-";
    }

    // 3. Get Last Accessed Archive from activity logs
    try {
        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", currentUserUID),
            orderBy("timestamp", "desc"),
            limit(1)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {

            const lastLog = snapshot.docs[0].data();

            lastAccessedArchive = {
                fileId: lastLog.fileId,
                nama: lastLog.fileName,
                lastAccessTime: lastLog.timestamp
            };

        }
    } catch (error) {
        console.error("Error fetching last accessed archive:", error);
    }

    // Update UI untuk last accessed
    const lastAccessedEl = document.getElementById("lastAccessedStat");
    const lastAccessedTimeEl = document.getElementById("lastAccessedTime");

    if (lastAccessedArchive) {
        if (lastAccessedEl) {
            lastAccessedEl.textContent = lastAccessedArchive.nama || "-";
        }

        if (lastAccessedTimeEl && lastAccessedArchive.lastAccessTime) {
            const date = lastAccessedArchive.lastAccessTime?.toDate ?
                new Date(lastAccessedArchive.lastAccessTime.toDate()) :
                new Date(lastAccessedArchive.lastAccessTime);
            const timeString = date.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            lastAccessedTimeEl.textContent = timeString;
        }
    } else {
        if (lastAccessedEl) lastAccessedEl.textContent = "-";
        if (lastAccessedTimeEl) lastAccessedTimeEl.textContent = "-";
    }
}

// ===============================
// LOG ACCESS - SAVE TO ACTIVITY LOGS
// ===============================

async function logAccess(fileId, fileName) {

    try {

        const userRef = doc(db, "users", currentUserUID);
        const userSnap = await getDoc(userRef);
        const userEmail = userSnap.exists() ? userSnap.data().email : "unknown";

        const logEntry = {
            uid: currentUserUID,
            userEmail: userEmail,
            action: "access",
            fileName: fileName,
            fileId: fileId,
            status: "success",
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "activityLogs"), logEntry);

        console.log("Access logged successfully");

        if (userSnap.exists()) {

            const lastAccessedData = {
                fileId: fileId,
                fileName: fileName,
                lastAccessTime: Timestamp.now()
            };

            lastAccessedArchive = lastAccessedData;

            await calculateStatistics();

        }

    } catch (error) {

        console.error("Error logging access:", error);

    }

}

async function increaseFileAccessCount(fileId) {

    try {

        const fileRef = doc(db, "files", fileId);
        const fileSnap = await getDoc(fileRef);

        if (fileSnap.exists()) {

            const data = fileSnap.data();
            const currentCount = data.accessCount || 0;

            await updateDoc(fileRef, {
                accessCount: currentCount + 1
            });

        }

    } catch (err) {

        console.error("Access count error:", err);

    }

}

// ===============================
// LOAD TOP ACCESSED FILES
// ===============================

async function loadTopAccessedFiles() {

    try {

        const q = query(
            collection(db, "files"),
            where("allowedUsers", "array-contains", currentUserUID)
        );

        const snapshot = await getDocs(q);

        const container = document.getElementById("topAccessedFiles");

        if (!container) return;

        container.innerHTML = "";

        if (snapshot.empty) {

            container.innerHTML = `
            <p class="text-sm text-slate-500">
                No accessed files yet
            </p>
            `;

            return;

        }

        let files = [];

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            files.push({
                id: docSnap.id,
                ...data
            });

        });

        // sort berdasarkan accessCount
        files.sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));

        const topFiles = files.slice(0, 5);

        topFiles.forEach(data => {

            const row = `
            <div class="flex justify-between items-center py-2 border-b">

                <div class="flex items-center gap-2">

                    <span class="material-icons-outlined text-slate-500">
                        description
                    </span>

                    <span class="text-sm font-medium text-slate-700 dark:text-slate-200">
                        ${data.nama || "Untitled"}
                    </span>

                </div>

                <span class="text-xs text-slate-500">
                    ${data.accessCount || 0}x
                </span>

            </div>
            `;

            container.innerHTML += row;

        });

    } catch (err) {

        console.error("Top accessed error:", err);

    }

}

async function updateLastActive() {

    try {

        const user = auth.currentUser;

        if (!user) return;

        await updateDoc(doc(db, "users", user.uid), {
            lastActive: serverTimestamp()
        });

    } catch (err) {

        console.error("Last active update error:", err);

    }

}

// ===============================
// LOAD ACTIVITY LOGS
// ===============================

async function loadActivityLogs() {
    try {
        const logsBody = document.getElementById("activityLogsBody");
        if (!logsBody) return;

        // Query activity logs terbaru untuk user saat ini
        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", currentUserUID),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        const snapshot = await getDocs(q);

        // Filter hanya logs milik user saat ini (hanya akses mereka sendiri)
        const userLogs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            userLogs.push(data);
        });

        renderRecentActivity(userLogs);

        if (userLogs.length === 0) {
            logsBody.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-6 text-center text-slate-500">
                    No activity logs yet
                </td>
            </tr>
            `;
            return;
        }

        // Limit to 10 most recent logs
        const displayLogs = userLogs.slice(0, 4);

        logsBody.innerHTML = "";

        displayLogs.forEach((log) => {
            const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            const dateString = date.toLocaleString('id-ID', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const row = `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <td class="px-6 py-4 text-sm font-medium text-slate-800 dark:text-white">
                    ${dateString}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800 dark:text-white">
                    ${log.fileName || "-"}
                </td>
                <td class="px-6 py-4 text-sm text-slate-500">
                    ${log.action === "login_pegawai" ? "User login to Dashboard" : "File accessed from Dashboard"}
                </td>
            </tr>
            `;

            logsBody.innerHTML += row;
        });

    } catch (error) {
        console.error("Error loading activity logs:", error);
    }
}

function renderRecentActivity(userLogs) {

    const container = document.getElementById("recentActivity");

    if (!container) return;

    container.innerHTML = "";

    const recent = userLogs.slice(0, 4);

    recent.forEach(log => {

        const row = `
        <div class="flex justify-between py-2 border-b">

            <span class="text-sm text-slate-700 dark:text-slate-200">
                ${log.fileName || "Login"}
            </span>

            <span class="text-xs text-slate-500">
                ${log.action === "login_pegawai" ? "Login" : "Open"}
            </span>

        </div>
        `;

        container.innerHTML += row;

    });

}

// ===============================
// HANDLE ARCHIVE ACCESS
// ===============================

async function handleArchiveAccess(fileId, fileName) {
    // Log the access and wait for it to complete
    await logAccess(fileId, fileName);
    await increaseFileAccessCount(fileId);
    await updateLastActive();

    // Refresh activity logs after access is logged
    await loadActivityLogs();

    // Find the archive and open it
    const archive = allArchives.find(a => a.id === fileId);

    if (!archive) return;

    // ===============================
    // FILE GOOGLE DRIVE
    // ===============================
    if (archive.filePath) {

        const previewUrl =
            `https://drive.google.com/file/d/${archive.filePath}/preview`;

        openPreview(previewUrl);

        return;

    }

    // ===============================
    // GOOGLE SPREADSHEET
    // ===============================
    if (archive.spreadsheetLink) {

        const previewUrl = archive.spreadsheetLink.replace("/edit", "/preview");

        openPreview(previewUrl);

        return;

    }

}

// ===============================
// OPEN LAST ACCESSED ARCHIVE
// ===============================

function openLastAccessedArchive() {
    if (!lastAccessedArchive || !lastAccessedArchive.fileId) {
        console.log("No last accessed archive found");
        return;
    }

    const archive = allArchives.find(a => a.id === lastAccessedArchive.fileId);
    if (!archive) return;

    if (archive.filePath) {

        window.open(getPreviewUrl(archive.filePath), "_blank");

        return;

    }

    if (archive.spreadsheetLink) {

        window.open(archive.spreadsheetLink, "_blank");

    }
}

// ===============================
// LOAD ACTIVITY CHART
// ===============================

async function loadActivityChart() {

    try {

        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", currentUserUID),
            orderBy("timestamp", "desc"),
            limit(30)
        );

        const snapshot = await getDocs(q);

        const activityPerDay = {};

        // buat 7 hari terakhir
        for (let i = 6; i >= 0; i--) {

            const d = new Date();
            d.setDate(d.getDate() - i);

            const key = d.toISOString().split("T")[0];

            activityPerDay[key] = 0;

        }

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            if (!data.timestamp) return;

            const date = data.timestamp.toDate();

            const key = date.toISOString().split("T")[0];

            if (activityPerDay[key] !== undefined) {

                activityPerDay[key]++;

            }

        });

        const labels = Object.keys(activityPerDay).map(d => {

            const date = new Date(d);

            return date.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short"
            });

        });

        const values = Object.values(activityPerDay);

        renderActivityChart(labels, values);

    } catch (err) {

        console.error("Activity chart error:", err);

    }

}

// ===============================
// RENDER ACTIVITY CHART
// ===============================

function renderActivityChart(labels, data) {

    const canvas = document.getElementById("activityChart");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);

    gradient.addColorStop(0, "rgba(59,130,246,0.4)");
    gradient.addColorStop(1, "rgba(59,130,246,0)");

    new Chart(ctx, {

        type: "line",

        data: {

            labels: labels,

            datasets: [{

                label: "Aktivitas",

                data: data,

                borderColor: "#3b82f6",

                backgroundColor: gradient,

                borderWidth: 3,

                tension: 0.4,

                fill: true,

                pointBackgroundColor: "#3b82f6",

                pointRadius: 4,

                pointHoverRadius: 6

            }]

        },

        options: {

            responsive: true,

            plugins: {
                legend: { display: false }
            },

            scales: {

                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },

                x: {
                    grid: { display: false }
                }

            }

        }

    });

}

// ===============================
// LOAD ACTIVITY SUMMARY
// ===============================

async function loadActivitySummary() {

    try {

        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", currentUserUID)
        );

        const snapshot = await getDocs(q);

        let todayCount = 0;
        let totalLogs = 0;

        const dayCounter = {};

        const today = new Date().toISOString().split("T")[0];

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            if (!data.timestamp) return;

            const date = data.timestamp.toDate();

            const key = date.toISOString().split("T")[0];

            totalLogs++;

            if (key === today) todayCount++;

            dayCounter[key] = (dayCounter[key] || 0) + 1;

        });

        let mostActiveDay = "-";
        let max = 0;

        for (const day in dayCounter) {

            if (dayCounter[day] > max) {

                max = dayCounter[day];
                mostActiveDay = day;

            }

        }

        document.getElementById("todayActivity").textContent = todayCount;
        document.getElementById("totalLogs").textContent = totalLogs;
        document.getElementById("mostActiveDay").textContent = mostActiveDay;

    } catch (err) {

        console.error("Summary error:", err);

    }

}

// ===============================
// LOGOUT
// ===============================

// Expose functions to global scope for HTML onclick handlers
window.handleArchiveAccess = handleArchiveAccess;
window.openLastAccessedArchive = openLastAccessedArchive;

const logoutBtn = document.getElementById("confirmLogoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

        try {

            // reset login session
            sessionStorage.removeItem("loginRecorded");

            await signOut(auth);

            window.location.href = "../index.html";

        } catch (error) {

            console.error("Logout error:", error);

        }

    });

}

// ===============================
// PROFILE BUTTON
// ===============================

function setupProfileRedirect() {

    const profileBtn = document.getElementById("profileBtn");

    if (!profileBtn) return;

    profileBtn.addEventListener("click", () => {

        window.location.href = "profile-pegawai.html";

    });

}

// ===============================
// PROFILE CARD CLICK
// ===============================

const profileCard = document.getElementById("profileCard");

if (profileCard) {

    profileCard.addEventListener("click", () => {

        window.location.href = "profile-pegawai.html";

    });

}

// ===============================
// SESSION TIMEOUT (15 MENIT)
// ===============================

let idleTimer;
let isSessionTimeoutShown = false;

// 15 menit
const IDLE_LIMIT = 15 * 60 * 1000;

function ensureSessionTimeoutModal() {
    const existing = document.getElementById("sessionTimeoutModal");
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = "sessionTimeoutModal";
    modal.className = "hidden fixed inset-0 z-50 flex items-center justify-center";
    modal.innerHTML = `
<div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
<div class="relative z-10 w-full max-w-sm mx-4 overflow-hidden rounded-xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-900/5 transition-all">
    <div class="p-6">
        <div class="flex flex-col items-center text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20 mb-4">
                <span class="material-icons-outlined text-amber-600 dark:text-amber-400 text-2xl">schedule</span>
            </div>
            <h3 class="text-lg font-semibold leading-6 text-slate-900 dark:text-white mb-2">
                Session Timeout
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Sesi berakhir karena tidak ada aktivitas selama 15 menit.
            </p>
            <button
                id="sessionTimeoutConfirmBtn"
                class="inline-flex w-full justify-center rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 transition-colors"
                type="button">
                Login Ulang
            </button>
        </div>
    </div>
</div>
`;

    document.body.appendChild(modal);

    const confirmBtn = document.getElementById("sessionTimeoutConfirmBtn");
    if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
            try {
                sessionStorage.removeItem("loginRecorded");
                await signOut(auth);
            } finally {
                window.location.href = "../index.html";
            }
        });
    }

    return modal;
}

function showSessionTimeoutModal() {
    const modal = ensureSessionTimeoutModal();
    isSessionTimeoutShown = true;
    modal.classList.remove("hidden");
}

function resetIdleTimer() {

    if (isSessionTimeoutShown) return;

    clearTimeout(idleTimer);

    idleTimer = setTimeout(async () => {

        showSessionTimeoutModal();

    }, IDLE_LIMIT);

}

// aktivitas yang dianggap sebagai aktivitas user
["click", "mousemove", "keypress", "scroll", "touchstart"].forEach(event => {

    document.addEventListener(event, resetIdleTimer);

});

// mulai timer saat halaman dibuka
resetIdleTimer();

function openPreview(fileUrl) {

    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");

    if (!modal || !frame) return;

    let previewUrl = fileUrl;

    // GOOGLE SPREADSHEET
    if (fileUrl.includes("docs.google.com/spreadsheets")) {

        const match = fileUrl.match(/\/d\/(.*?)\//);

        if (match) {
            const fileId = match[1];
            previewUrl = `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
        }

    }

    // GOOGLE DRIVE FILE
    else if (fileUrl.includes("drive.google.com")) {

        const match = fileUrl.match(/\/d\/(.*?)\//);

        if (match) {
            const fileId = match[1];
            previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        }

    }

    // FILE BIASA (PDF, Excel, dll)
    else {

        previewUrl =
            `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;

    }

    frame.src = previewUrl;

    modal.classList.remove("hidden");
}

function closePreview() {

    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");

    if (!modal || !frame) return;

    frame.src = "";
    modal.classList.add("hidden");
}

window.openPreview = openPreview;
window.closePreview = closePreview;