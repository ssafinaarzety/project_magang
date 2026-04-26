import { db, auth } from "../firebase-config.js";

import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { setArchiveData, handleArchiveAccess } from "./pegawai-preview.js";
import {
    calculateStatistics,
    loadActivityChart,
    loadActivitySummary,
    loadRecentFiles,
    loadActivityLogs
} from "./pegawai-activity.js";

window.handleArchiveAccess = handleArchiveAccess;

// ===============================
// STATE
// ===============================
let allArchives = [];
let filteredArchives = [];
let usersCache = {};
let currentPage = 1;
const rowsPerPage = 10;
let viewMode = "grid";
let currentFolderId = null;
let folderPath = [];
let folderCache = {}
let archiveCache = {};
let activityLoaded = false;


async function loadUsers() {

    const cached = sessionStorage.getItem("usersCache");

    if (cached) {
        usersCache = JSON.parse(cached);
        return;
    }

    const snapshot = await getDocs(collection(db, "users"));

    snapshot.forEach(doc => {
        usersCache[doc.id] = doc.data();
    });

    sessionStorage.setItem("usersCache", JSON.stringify(usersCache));
}
// ===============================
// LOAD ARCHIVES
// ===============================
export async function loadArchives(uid) {

    showLoading();

    const cacheKey = currentFolderId || "root";

    if (archiveCache[cacheKey]) {

        allArchives = archiveCache[cacheKey];
        filteredArchives = [...allArchives];

        setArchiveData(allArchives);
        populateFilters(allArchives);
        document.getElementById("yearSelect").value = "all";
        document.getElementById("categorySelect").value = "all";

        calculateStatistics(allArchives);

        if (!activityLoaded) {
            loadActivitySummary(uid);
            activityLoaded = true;
        }

        renderArchiveGrid();
        renderPagination();
        renderBreadcrumb();
        loadFolderButtons();

        hideLoading();
        return;
    }

    try {

        if (Object.keys(usersCache).length === 0) {
            await loadUsers();
        }

        let q;

        if (currentFolderId === null) {

            q = query(
                collection(db, "files"),
                where("allowedUsers", "array-contains", uid),
                orderBy("tanggal", "desc"),
                limit(30)
            );

        } else {

            q = query(
                collection(db, "files"),
                where("allowedUsers", "array-contains", uid),
                where("folderId", "==", currentFolderId),
                orderBy("tanggal", "desc"),
                limit(30)
            );

        }

        const snapshot = await getDocs(q);

        // ===============================
        // FILES
        // ===============================
        const files = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        archiveCache[cacheKey] = files;

        // ===============================
        // FOLDERS
        // ===============================

        allArchives = [...files];
        filteredArchives = [...allArchives];

        setArchiveData(allArchives);
        populateFilters(allArchives);

        calculateStatistics(allArchives);

        if (!activityLoaded) {
            loadActivitySummary(uid);
            activityLoaded = true;
        }

        renderArchiveGrid();
        renderPagination();

        renderBreadcrumb();
        loadFolderButtons();

    } catch (err) {

        console.error("Load archive error:", err);

    }

    hideLoading();
}

// ===============================
// EXPORT UNTUK CORE
// ===============================
export function getAllArchives() {
    return allArchives;
}

function renderArchiveGrid() {

    const container = document.getElementById("archiveContainer");
    const archiveCount = document.getElementById("archiveCount");

    if (!container) return;

    if (viewMode === "list") {
        renderArchiveList();
        return;
    }

    container.className =
        "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6";

    if (archiveCount) {
        archiveCount.textContent = filteredArchives.length + " Files";
    }

    container.innerHTML = "";

    if (filteredArchives.length === 0) {
        container.innerHTML = `<p class="text-slate-400">Tidak ada arsip</p>`;
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredArchives.slice(start, end);

    pageData.forEach(item => {

        // ===============================
        // FILE (BIARKAN PUNYA KAMU)
        // ===============================
        const year = item.tanggal?.split("-")[0] || "-";
        const fileTypeInfo = getFileTypeInfo(item.fileType);
        const thumbnail = getThumbnail(item.filePath);
        const avatars = renderAccessProfiles(item.allowedUsers || []);

        const card = `
    <div class="rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-md hover:shadow-2xl transition-all duration-300 flex flex-col">

        <div class="h-40 bg-slate-100 relative flex items-center justify-center rounded-t-3xl overflow-hidden">

            ${thumbnail ? `
                <img src="${thumbnail}" class="w-full h-full object-cover"/>
            ` : `
                <span class="text-4xl font-bold text-slate-400">
                    ${fileTypeInfo.label}
                </span>
            `}

            <div class="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full bg-white text-slate-700 shadow">
                ${fileTypeInfo.label}
            </div>

        </div>

        <div class="p-4 flex flex-col flex-1">
            <h3 class="text-base font-bold text-slate-800 truncate">
                ${item.nama || "Untitled File"}
            </h3>

            <p class="text-sm text-slate-500 mt-1">
                ${item.kategori || "File"} • ${year}
            </p>
        </div>

        <div class="flex items-center justify-between px-4 pb-4 mt-auto">

            <div class="flex -space-x-2">
                ${avatars}
            </div>

            <button
                onclick="handleArchiveAccess('${item.id}', '${(item.nama || "").replace(/'/g, "\\'")}')"
                class="px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">

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
    <div class="grid grid-cols-12 px-6 py-3 text-xs font-bold text-slate-500 uppercase border-b">

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
        const avatars = renderAccessProfiles(item.allowedUsers || []);

        const row = `
<div class="grid grid-cols-12 items-center px-6 py-4 bg-white/70 backdrop-blur rounded-xl border hover:bg-white transition overflow-visible">
            <div class="col-span-5 flex items-center gap-3">
                <span class="material-symbols-outlined text-slate-500">description</span>
                <span class="text-base font-semibold text-slate-800 truncate">
                    ${item.nama || "Untitled File"}
                </span>
            </div>

            <div class="col-span-2 text-sm text-slate-700 font-medium">
                ${item.kategori || "File"}
            </div>

            <div class="col-span-1 text-sm text-slate-600">
                ${year}
            </div>

            <!-- AVATAR -->
            <div class="col-span-3 flex items-center">
                <div class="flex -space-x-2">
                    ${avatars}
                </div>
            </div>

            <!-- BUTTON -->
            <div class="col-span-1 flex justify-end">
                <button
                    onclick="handleArchiveAccess('${item.id}','${(item.nama || "-").replace(/'/g, "\\'")}')"
                    class="px-3 py-1 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">

                    Open

                </button>
            </div>

        </div>
        `;

        container.innerHTML += row;

    });
}

// ===============================
// FILTER
// ===============================
function populateFilters(data) {

    const yearSelect = document.getElementById("yearSelect");
    const categorySelect = document.getElementById("categorySelect");

    if (!yearSelect || !categorySelect) return;

    const years = new Set();
    const categories = new Set();

    data.forEach(item => {
        if (item.tanggal) years.add(item.tanggal.split("-")[0]);
        if (item.kategori) categories.add(item.kategori);
    });

    yearSelect.innerHTML = `<option value="all">Semua Tahun</option>`;
    categorySelect.innerHTML = `<option value="all">Semua Kategori</option>`;

    [...years].forEach(y => {
        yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
    });

    [...categories].forEach(c => {
        categorySelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

// ===============================
// APPLY FILTER
// ===============================
function applyFilters() {

    const search = document.getElementById("searchInput")?.value.toLowerCase() || "";
    const year = document.getElementById("yearSelect")?.value;
    const category = document.getElementById("categorySelect")?.value;

    filteredArchives = allArchives.filter(item => {

        const matchSearch = (item.nama || "").toLowerCase().includes(search);
        const fileYear = item.tanggal?.split("-")[0];

        const matchYear = year === "all" || fileYear == year;

        const matchCategory =
            category === "all" ||
            (item.kategori || "").toLowerCase() === category?.toLowerCase();

        return matchSearch && matchYear && matchCategory;

    });

    currentPage = 1;

    renderArchiveGrid();
    renderPagination();
}

// ===============================
// EVENTS
// ===============================
document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("searchInput")?.addEventListener("input", applyFilters);
    document.getElementById("yearSelect")?.addEventListener("change", applyFilters);
    document.getElementById("categorySelect")?.addEventListener("change", applyFilters);

    const gridBtn = document.getElementById("gridViewBtn");
    const listBtn = document.getElementById("listViewBtn");
    if (gridBtn && listBtn) {

        gridBtn.onclick = () => {

            viewMode = "grid";

            gridBtn.classList.add("bg-white", "shadow");
            listBtn.classList.remove("bg-white", "shadow");

            renderArchiveGrid();
        };

        listBtn.onclick = () => {

            viewMode = "list";

            listBtn.classList.add("bg-white", "shadow");
            gridBtn.classList.remove("bg-white", "shadow");

            renderArchiveGrid();
        };

    }

});

// ===============================
// PAGINATION
// ===============================
function renderPagination() {

    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = "";

    const totalPages = Math.ceil(filteredArchives.length / rowsPerPage);

    for (let i = 1; i <= totalPages; i++) {

        const btn = document.createElement("button");

        btn.textContent = i;

        btn.onclick = () => {
            currentPage = i;
            renderArchiveGrid();
            renderPagination();
        };

        container.appendChild(btn);

    }
}

// ===============================
// LOADING
// ===============================
function showLoading() {
    document.getElementById("loadingOverlay")?.classList.remove("hidden");
}

function hideLoading() {
    document.getElementById("loadingOverlay")?.classList.add("hidden");
}

function getFileTypeInfo(fileType) {
    if (!fileType) return { label: "FILE" };

    fileType = fileType.toLowerCase();

    if (fileType.includes("pdf")) return { label: "PDF" };
    if (fileType.includes("xls")) return { label: "XLS" };
    if (fileType.includes("img")) return { label: "IMG" };

    return { label: "FILE" };
}

function getThumbnail(fileId) {
    if (!fileId) return null;
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
}

function renderAccessProfiles(users = []) {

    if (!users || users.length === 0) {
        return `<span class="text-xs text-slate-400">Private</span>`;
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

        const user = usersCache?.[uid];
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

    const extra = users.length > maxVisible
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

async function renderBreadcrumb() {

    const container = document.getElementById("breadcrumb");
    if (!container) return;

    let html = `
        <div onclick="openFolder(null)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-full 
                   bg-gradient-to-r from-blue-500 to-indigo-500 
                   text-white text-xs font-semibold cursor-pointer shadow-sm">
            Home
        </div>
    `;

    try {

        const promises = folderPath.map(id => getDoc(doc(db, "folders", id)));
        const snaps = await Promise.all(promises);

        snaps.forEach((snap, i) => {

            if (!snap.exists()) return;

            const data = snap.data();

            html += `
                <span class="text-slate-400">›</span>

                <div onclick="goToBreadcrumb(${i})"
                    class="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer
                           bg-white border border-slate-200 shadow-sm
                           hover:bg-primary hover:text-white transition">

                    ${data.name}

                </div>
            `;
        });

    } catch (err) {
        console.error("Breadcrumb error:", err);
    }

    container.innerHTML = html;
}


window.openFolder = function (folderId) {

    if (folderId === null) {
        folderPath = [];
    } else {
        if (!folderPath.includes(folderId)) {
            folderPath.push(folderId);
        }
    }

    currentFolderId = folderId;

    renderBreadcrumb();

    const uid = auth.currentUser.uid;
    loadArchives(uid);
};

window.goToBreadcrumb = function (index) {

    folderPath = folderPath.slice(0, index + 1);

    currentFolderId = folderPath[index];

    renderBreadcrumb();

    const uid = auth.currentUser.uid;
    loadArchives(uid);
};

function loadArchivesByFolder() {

    if (!currentFolderId) {
        filteredArchives = [...allArchives];

    } else {
        filteredArchives = allArchives.filter(
            item => item.folderId === currentFolderId
        );
    }

    renderArchiveGrid();
    renderPagination();
}

async function loadFolderButtons() {

    const cacheKey = currentFolderId || "root";

    const container = document.getElementById("folderButtons");
    if (!container) return;

    if (folderCache[cacheKey]) {
        container.innerHTML = folderCache[cacheKey];
        return;
    }
    if (!container) return;

    let html = `<div class="flex flex-wrap gap-3">`;

    // ROOT
    html += `
    <div onclick="openFolder(null)"
        class="px-4 py-2 rounded-full cursor-pointer
        ${currentFolderId === null
            ? "bg-blue-600 text-white"
            : "bg-white text-slate-700"}
        ">
        Semua File
    </div>
    `;

    let q;

    if (currentFolderId === null) {
        q = query(
            collection(db, "folders"),
            where("parentId", "==", null)
        );
    } else {
        q = query(
            collection(db, "folders"),
            where("parentId", "==", currentFolderId)
        );
    }

    const snap = await getDocs(q);

    snap.forEach(docSnap => {

        const data = docSnap.data();

        html += `
        <div onclick="openFolder('${docSnap.id}')"
            class="px-4 py-2 rounded-full cursor-pointer bg-white hover:bg-blue-50">

            ${data.name}

        </div>
        `;
    });

    html += `</div>`;

    container.innerHTML = html;
    folderCache[cacheKey] = html;
}

// ===============================
// VIEW SWITCH (FIX ERROR)
// ===============================
window.setGridView = function () {

    viewMode = "grid";

    const slider = document.getElementById("viewSlider");
    if (slider) slider.style.left = "4px";

    document.getElementById("gridBtn")?.classList.add("text-primary");
    document.getElementById("listBtn")?.classList.remove("text-primary");

    renderArchiveGrid();
};

window.setListView = function () {

    viewMode = "list";

    const slider = document.getElementById("viewSlider");
    if (slider) slider.style.left = "50%";

    document.getElementById("listBtn")?.classList.add("text-primary");
    document.getElementById("gridBtn")?.classList.remove("text-primary");

    renderArchiveList();
};