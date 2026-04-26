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
import { loadActivityChart } from "./dashboard_pegawai/loadActivityChart.js";

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
let viewMode = "grid";

export let currentUserUID = null;

let currentPage = 1;
const rowsPerPage = 10;
let currentEditingFileId = null;
let autoSaveTimer = null;
let usersCache = {};

function getPreviewUrl(fileId) {

    return "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId=" + fileId;

}

// ===============================
// AUTH CHECK
// ===============================
onAuthStateChanged(auth, async (user) => {

    console.log("UID LOGIN:", user.uid);

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
        await loadUsers();
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

    // ===============================
    // TOP BAR AVATAR
    // ===============================

    const profileBtn = document.getElementById("profileBtn");
    const profileNameTop = document.getElementById("profileNameTop");

    const name = userData.nama || userData.name || userData.email || "User";

    if (profileBtn) {

        const parts = name.trim().split(" ");

        let initial = parts.length > 1
            ? parts[0][0] + parts[1][0]
            : parts[0][0];

        profileBtn.textContent = initial.toUpperCase();
    }

    if (profileNameTop) {
        profileNameTop.textContent = name;
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

        renderArchiveGrid();
        renderPagination();

        await Promise.all([
            calculateStatistics(),
            loadActivityLogs(),
            loadActivityChart(),
            loadActivitySummary(),
            loadRecentFiles()
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

function getFileTypeInfo(fileType) {

    if (!fileType) return { icon: "description", color: "text-slate-500", label: "FILE" };

    fileType = fileType.toLowerCase();

    if (fileType.includes("pdf")) {
        return { icon: "picture_as_pdf", color: "text-red-500", label: "PDF" };
    }

    if (fileType.includes("excel") || fileType.includes("sheet")) {
        return { icon: "table_view", color: "text-green-600", label: "XLS" };
    }

    return { icon: "description", color: "text-slate-500", label: "FILE" };
}

function getThumbnail(fileId) {

    if (!fileId) return null;

    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

}

function renderAccessProfiles(users = []) {

    if (!users || users.length === 0) {
        return `
        <span class="text-xs text-slate-400 font-medium">
        Private
        </span>
        `;
    }

    const maxVisible = 3;

    const colors = [
        "bg-blue-500",
        "bg-purple-500",
        "bg-green-500",
        "bg-pink-500",
        "bg-orange-500"
    ];

    const avatars = users.slice(0, maxVisible).map((uid, i) => {

        const user = usersCache[uid];
        const email = user?.email || "unknown";
        const initial = email.charAt(0).toUpperCase();

        const color = colors[i % colors.length];

        return `
        <div class="relative group">

            <div
            title="${email}"
            class="w-9 h-9 rounded-full ${color}
            text-white text-sm font-semibold
            flex items-center justify-center
            border-2 border-white shadow
            hover:scale-110 transition cursor-pointer">

            ${initial}
            </div>

        </div>
        `;

    }).join("");

    const extra =
        users.length > maxVisible
            ? `
        <div
        class="w-9 h-9 rounded-full bg-slate-200
        text-slate-600 text-xs font-semibold
        flex items-center justify-center
        border-2 border-white">

        +${users.length - maxVisible}

        </div>
        `
            : "";

    return `
    <div class="flex items-center -space-x-2">
        ${avatars}
        ${extra}
    </div>
    `;
}

function renderArchiveGrid() {

    const container = document.getElementById("archiveContainer");
    const archiveCount = document.getElementById("archiveCount");

    if (!container) return;

    // jika mode list → render list
    if (viewMode === "list") {
        renderArchiveList();
        return;
    }

    // reset class grid (supaya balik normal setelah list)
    container.className =
        "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 transition-all duration-300";

    // update jumlah file
    if (archiveCount) {
        archiveCount.textContent = filteredArchives.length + " Files";
    }

    container.innerHTML = "";

    if (filteredArchives.length === 0) {

        container.innerHTML = `
        <div class="text-slate-400 text-sm">
        Tidak ada arsip
        </div>
        `;

        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const pageData = filteredArchives.slice(start, end);

    pageData.forEach(item => {

        const year = item.tanggal ? item.tanggal.split("-")[0] : "-";
        const fileTypeInfo = getFileTypeInfo(item.fileType);
        const thumbnail = getThumbnail(item.filePath);

        // ambil uploader dari users cache
        const users = item.allowedUsers || [];

        const avatars = renderAccessProfiles(users);

        const extra = users.length > 3 ? `
            <div class="text-xs text-slate-500 ml-1">
            +${users.length - 3}
            </div>` : "";

        const card = `

                <div class="glass-panel rounded-3xl border border-white/70 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col">

                    <div class="h-36 bg-slate-100 relative flex items-center justify-center overflow-hidden">

                    ${thumbnail ? `
                    <img src="${thumbnail}" loading="lazy" class="w-full h-full object-cover"/>
                    ` : `
                    <span class="material-symbols-outlined text-5xl ${fileTypeInfo.color}">
                    ${fileTypeInfo.icon}
                    </span>
                    `}

                    <div class="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full bg-white/90 text-slate-700 shadow">
                    ${fileTypeInfo.label}
                    </div>

                    </div>

                    <div class="p-4 flex flex-col flex-1">

                    <h5 class="text-lg font-bold text-slate-800 truncate">
                    ${item.nama || "Untitled File"}
                    </h5>

                    <div class="text-sm text-slate-500 mt-1 uppercase tracking-wider font-medium">
                    ${item.kategori || "File"} • ${year}
                    </div>

                    </div>

                    <div class="px-6 py-3 border-t border-white/40 flex items-center justify-between">
                    <div class="flex items-center -space-x-2 ml-1">
                    ${avatars}
                    ${extra}
                    </div>

                    <button
                    onclick="handleArchiveAccess('${item.id}','${(item.nama || "-").replace(/'/g, "\\'")}')"
                    class="px-4 py-1.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition">

                    Open

                    </button>

                    </div>

                </div>
                `;

        container.innerHTML += card;

    });

}

function renderArchiveList() {

    const container = document.getElementById("archiveContainer");

    if (!container) return;

    container.className = "flex flex-col gap-2";

    container.innerHTML = `

    <div class="grid grid-cols-12 px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">

        <div class="col-span-5">Name</div>
        <div class="col-span-2">Category</div>
        <div class="col-span-1">Year</div>
        <div class="col-span-3">User Access</div>
        <div class="col-span-1 text-right">Open</div>

    </div>

    `;

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const pageData = filteredArchives.slice(start, end);

    pageData.forEach(item => {

        const year = item.tanggal ? item.tanggal.split("-")[0] : "-";

        const users = item.allowedUsers || [];

        const avatars = renderAccessProfiles(users);

        const extra = users.length > 3 ? `
        <div class="text-xs text-slate-500 ml-1">
        +${users.length - 3}
        </div>` : "";

        const row = `

        <div class="grid grid-cols-12 items-center px-6 py-4 bg-white/70 backdrop-blur rounded-xl hover:bg-white transition border border-white/40">

            <div class="col-span-5 flex items-center gap-3">

                <span class="material-symbols-outlined text-slate-500">
                description
                </span>

                <span class="text-base font-semibold text-slate-800 truncate">
                ${item.nama || "Untitled File"}
                </span>

            </div>

            <div class="col-span-2 text-base text-slate-700 font-semibold">                
            ${item.kategori || "File"}
            </div>

            <div class="col-span-1 text-base text-slate-600 font-medium">                
            ${year}
            </div>

            <div class="col-span-3 flex items-center -space-x-2">

                ${avatars}
                ${extra}

            </div>

            <div class="col-span-1 flex justify-end">

               <button
                onclick="handleArchiveAccess('${item.id}','${(item.nama || "-").replace(/'/g, "\\'")}')"
                class="px-4 py-1.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition">

                Open

                </button>

            </div>

        </div>

        `;

        container.innerHTML += row;

    });

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

    renderArchiveGrid();
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

    const gridBtn = document.getElementById("gridViewBtn");
    const listBtn = document.getElementById("listViewBtn");

    if (gridBtn && listBtn) {

        gridBtn.addEventListener("click", () => {

            viewMode = "grid";

            gridBtn.classList.add("bg-white", "shadow");
            listBtn.classList.remove("bg-white", "shadow");

            renderArchiveGrid();

        });

        listBtn.addEventListener("click", () => {

            viewMode = "list";

            listBtn.classList.add("bg-white", "shadow");
            gridBtn.classList.remove("bg-white", "shadow");

            renderArchiveGrid();

        });

    }

});

// ===============================
// PAGINATION
// ===============================

function renderPagination() {

    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(filteredArchives.length / rowsPerPage));

    // PREVIOUS BUTTON
    const prevBtn = document.createElement("button");

    prevBtn.innerHTML = "‹";

    prevBtn.className = `
    px-4 py-2 rounded-xl text-sm font-semibold
    bg-white/60 hover:bg-white border
    `;

    prevBtn.disabled = currentPage === 1;

    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderArchiveGrid();
            renderPagination();
        }
    };

    container.appendChild(prevBtn);

    // PAGE NUMBERS
    for (let i = 1; i <= totalPages; i++) {

        const btn = document.createElement("button");

        btn.textContent = i;

        btn.className = `
        px-4 py-2 rounded-xl text-sm font-semibold transition
        ${i === currentPage
                ? "bg-primary text-white shadow-md"
                : "bg-white/60 hover:bg-white border"}
        `;

        btn.onclick = () => {

            currentPage = i;

            renderArchiveGrid();
            renderPagination();

        };

        container.appendChild(btn);

    }

    // NEXT BUTTON
    const nextBtn = document.createElement("button");

    nextBtn.innerHTML = "›";

    nextBtn.className = `
    px-4 py-2 rounded-xl text-sm font-semibold
    bg-white/60 hover:bg-white border
    `;

    nextBtn.disabled = currentPage === totalPages;

    nextBtn.onclick = () => {

        if (currentPage < totalPages) {

            currentPage++;

            renderArchiveGrid();
            renderPagination();

        }

    };

    container.appendChild(nextBtn);

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

async function loadRecentFiles() {

    try {

        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", currentUserUID),
            where("action", "==", "access"),
            orderBy("timestamp", "desc"),
            limit(5)
        );

        const snapshot = await getDocs(q);

        const container = document.getElementById("recentFiles");

        if (!container) return;

        container.innerHTML = "";

        if (snapshot.empty) {

            container.innerHTML = `
            <p class="text-sm text-slate-500">
                No recent files
            </p>
            `;

            return;
        }

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            const row = `
            <div class="flex justify-between py-2 border-b">

                <span class="text-sm text-slate-700">
                    ${data.fileName || "Untitled"}
                </span>

                <span class="text-xs text-slate-400">
                    Opened
                </span>

            </div>
            `;

            container.innerHTML += row;

        });

    } catch (err) {

        console.error("Recent files error:", err);

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
        const displayLogs = userLogs.slice(0, 10);

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
                <td class="px-4 py-3 text-xs text-slate-700">                    
                ${dateString}
                </td>   
                <td class="px-4 py-3 text-xs text-slate-700">                    
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

function handleArchiveAccess(fileId, fileName) {

    // logging jalan di background (tidak blocking preview)
    logAccess(fileId, fileName);
    increaseFileAccessCount(fileId);
    updateLastActive();
    loadActivityLogs();

    const archive = allArchives.find(a => a.id === fileId);
    if (!archive) return;

    let url = "";

    // ===============================
    // FILE UPLOAD
    // ===============================
    if (archive.filePath) {

        const fileId = archive.filePath;
        const type = (archive.fileType || "").toLowerCase();

        // PDF
        if (type.includes("pdf")) {

            url = `https://docs.google.com/viewer?embedded=true&url=https://drive.google.com/uc?id=${fileId}`;

        }

        // IMAGE
        else if (
            type.includes("png") ||
            type.includes("jpg") ||
            type.includes("jpeg")
        ) {

            url = `https://drive.google.com/uc?id=${fileId}`;

        }

        // EXCEL (🔥 GANTI TOTAL DI SINI)
        else if (
            type.includes("xls") ||
            type.includes("xlsx") ||
            type.includes("csv")
        ) {

            // 🔥 PALING MIRIP GOOGLE SHEETS
            url = `https://docs.google.com/gview?embedded=true&url=https://drive.google.com/uc?id=${fileId}`;

        }

        // fallback
        else {

            url =
                "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId="
                + fileId;

        }

    }

    // ===============================
    // GOOGLE SPREADSHEET LINK
    // ===============================
    else if (archive.spreadsheetLink) {

        const sheetId = archive.spreadsheetLink
            .split("/d/")[1]
            ?.split("/")[0];

        // 🔥 FULL seperti gambar kamu
        url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    }

    if (!url) {
        alert("File tidak tersedia");
        return;
    }

    const frame = document.getElementById("previewFrame");

    if (frame) frame.src = url;

    openPreview();
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

        const todayEl = document.getElementById("todayActivity");
        const totalEl = document.getElementById("totalLogs");
        const mostActiveEl = document.getElementById("mostActiveDay");

        if (todayEl) todayEl.textContent = todayCount;
        if (totalEl) totalEl.textContent = totalLogs;
        if (mostActiveEl) mostActiveEl.textContent = mostActiveDay;

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

const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

if (confirmLogoutBtn) {

    confirmLogoutBtn.addEventListener("click", async () => {
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

    document.addEventListener(event, () => {

        resetIdleTimer();

        updateLastActive();

    });

});

// mulai timer saat halaman dibuka
resetIdleTimer();

function openPreview() {

    const modal = document.getElementById("previewModal");

    if (!modal) return;

    modal.classList.remove("hidden");

    updateLastActive();

}

async function loadExcelEditor(fileId) {

    const url =
        `https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=download&fileId=${fileId}`;

    const response = await fetch(url);

    const base64Data = (await response.text()).trim();

    // bersihkan prefix data URL jika ada
    let cleanBase64 = base64Data
        .replace(/^data:.*;base64,/, "")
        .replace(/\s/g, "")
        .replace(/[\r\n]+/g, "");

    // decode base64 dengan aman
    let binary;

    try {

        binary = atob(cleanBase64);

    } catch (err) {

        console.error("Base64 decode failed:", err);
        alert("File preview gagal dimuat");
        return;

    }

    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    const workbook = XLSX.read(bytes, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    renderExcelTable(json);

}

function renderExcelTable(data) {

    const table = document.getElementById("excelEditor");
    const loading = document.getElementById("previewLoading");

    if (!table) return;

    // sembunyikan loading
    if (loading) loading.style.display = "none";

    // tampilkan tabel
    table.classList.remove("hidden");

    table.innerHTML = "";

    data.forEach((row) => {

        const tr = document.createElement("tr");

        row.forEach((cell) => {

            const td = document.createElement("td");

            td.contentEditable = true;

            td.className =
                "border px-3 py-2 min-w-[120px] focus:bg-yellow-100 outline-none";

            td.innerText = cell ?? "";

            // AUTO SAVE TRIGGER
            td.addEventListener("input", () => {

                clearTimeout(autoSaveTimer);

                autoSaveTimer = setTimeout(() => {

                    console.log("Auto saving...");
                    saveExcel();

                }, 3000); // 3 detik

            });

            tr.appendChild(td);

        });

        table.appendChild(tr);

    });

}

async function saveExcel() {

    const status = document.getElementById("saveStatus");
    status.textContent = "Saving...";

    try {

        const table = document.getElementById("excelEditor");

        let data = [];

        table.querySelectorAll("tr").forEach(tr => {

            let row = [];

            tr.querySelectorAll("td").forEach(td => {
                row.push(td.innerText);
            });

            data.push(row);

        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

        const file = XLSX.write(wb, {
            bookType: "xlsx",
            type: "base64"
        });

        await fetch(
            "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec",
            {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify({
                    action: "update",
                    fileId: currentEditingFileId,
                    fileData: file
                })
            }
        );

        status.textContent = "Saved";

    } catch (err) {

        console.error(err);
        status.textContent = "Error saving";

    }

}

document.addEventListener("DOMContentLoaded", () => {

    const saveBtn = document.getElementById("saveSpreadsheetBtn");

    if (saveBtn) {

        saveBtn.onclick = saveExcel;

    }

});

function closePreview() {

    const modal = document.getElementById("previewModal");
    const table = document.getElementById("excelEditor");

    if (!modal) return;

    if (table) table.innerHTML = "";

    modal.classList.add("hidden");
}

window.openPreview = openPreview;
window.closePreview = closePreview;

// ===============================
// HEARTBEAT - UPDATE LAST ACTIVE
// ===============================

// update lastActive setiap 5 menit
setInterval(() => {

    updateLastActive();

}, 5 * 60 * 1000);

// ===============================
// UPDATE LAST ACTIVE SAAT TAB DITUTUP
// ===============================

window.addEventListener("beforeunload", () => {

    updateLastActive();

});

// ===============================
// UPDATE SAAT TAB TIDAK AKTIF
// ===============================

document.addEventListener("visibilitychange", () => {

    if (document.visibilityState === "hidden") {

        updateLastActive();

    }

});

async function loadUsers() {

    const snapshot = await getDocs(collection(db, "users"));

    snapshot.forEach(doc => {

        usersCache[doc.id] = doc.data();

    });

}