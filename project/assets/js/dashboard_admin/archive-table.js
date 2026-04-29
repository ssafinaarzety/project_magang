import { db } from "../firebase-config.js";
import { showSuccess } from "./upload-system.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    updateDoc,
    deleteDoc,
    doc,
    where,
    getDoc,
    startAfter,
    writeBatch
}
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { openAccessModal, setupAccessSave } from "./access-system.js";

import { loadDashboardStats } from "./dashboard-stats.js";
import { queueWrite } from "./upload-system.js";

const PAGE_SIZE = 10;
let userCache = {};
window.currentFolderId = null;
window.folderPath = [];
window.selectedFiles = new Set();
window.selectedFilesData = {};
let isDeleteMode = false;

// ===============================
// SAFE RELOAD (ANTI SPAM READ)
// ===============================
let isReloading = false;

export async function safeReload() {
    if (isReloading) return;

    isReloading = true;

    await loadArchiveData();

    setTimeout(() => {
        isReloading = false;
    }, 2000);
}

function getThumbnail(fileId) {

    if (!fileId) return null;

    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;

}

function getFileIcon(type = "") {

    type = type.toLowerCase();

    if (type.includes("pdf")) {
        return { icon: "picture_as_pdf", color: "text-red-500" };
    }

    if (type.includes("xls") || type.includes("csv")) {
        return { icon: "table_chart", color: "text-green-500" };
    }

    if (type.includes("sheet")) {
        return { icon: "grid_on", color: "text-blue-500" };
    }

    return { icon: "folder", color: "text-yellow-500" };

}

function formatFileType(type = "") {

    type = type.toLowerCase();

    if (type.includes("pdf")) return "PDF";
    if (type.includes("xls") || type.includes("sheet")) return "XLS";
    if (type.includes("csv")) return "CSV";

    return "FILE";
}

function renderUserAvatars(users = []) {

    const max = 3;

    if (!users || users.length === 0) {

        return `<span class="text-xs text-slate-400">Private</span>`;

    }

    const colors = [
        "bg-blue-500",
        "bg-purple-500",
        "bg-green-500",
        "bg-pink-500",
        "bg-orange-500"
    ];

    const avatars = users.slice(0, max).map((u, i) => {

        const color = colors[i % colors.length];

        return `
            <div class="w-8 h-8 rounded-full ${color} text-white flex items-center justify-center text-xs font-semibold border-2 border-white shadow">
            ${u[0]?.toUpperCase() || "U"}
            </div>
            `;

    }).join("");

    const extra = users.length > max
        ? `<div class="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-xs">+${users.length - max}</div>`
        : "";

    return `<div class="flex -space-x-2">${avatars}${extra}</div>`;

}


export function showArchiveSkeleton() {

    const container = document.getElementById("archiveContainer");

    if (!container) return;

    container.innerHTML = "";

    for (let i = 0; i < 6; i++) {

        const skeleton = document.createElement("div");

        skeleton.className = "animate-pulse bg-white dark:bg-[#1a2634] border border-slate-200 dark:border-slate-700 rounded-xl p-5";

        skeleton.innerHTML = `
            <div class="h-6 bg-slate-200 rounded w-3/4 mb-3"></div>
            <div class="h-4 bg-slate-200 rounded w-1/2"></div>
            `;

        container.appendChild(skeleton);

    }

}

// ===============================
// RENDER TABLE
// ===============================
export function renderTable(data) {

    const container = document.getElementById("archiveContainer");

    if (!container) return;

    container.innerHTML = "";

    if (!data.length) {

        container.innerHTML = `
    <div class="col-span-full flex items-center justify-center h-[300px] text-slate-400">
        Tidak ada arsip
    </div>
    `;

        return;
    }

    data.forEach(item => {

        window.selectedFilesData[item.id] = item;

        let thumbnail = null;

        if (item.filePath) {
            thumbnail = getThumbnail(item.filePath);
        }

        else if (item.spreadsheetLink) {

            const match = item.spreadsheetLink.match(/\/d\/(.*?)\//);

            if (match && match[1]) {
                thumbnail = getThumbnail(match[1]);
            }

        }

        let tahun = "-";

        if (item.tanggal && typeof item.tanggal === "string") {
            tahun = item.tanggal.split("-")[0];
        }

        const iconData = getFileIcon(item.fileType || "");

        const badge = item.allowedUsers?.length
            ? `<span class="text-sm px-3 py-1 bg-green-100 text-green-600 rounded-full font-medium">Active</span>`
            : `<span class="text-xs px-2 py-1 bg-yellow-100 text-yellow-600 rounded-full">Restricted</span>`;

        const card = document.createElement("div");
        card.setAttribute("draggable", "true"); // bikin bisa di-drag
        card.setAttribute("data-id", item.id);

        card.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("fileId", item.id);

            card.classList.add("opacity-50"); // TAMBAH INI
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("opacity-50"); // TAMBAH INI
        });
        card.className =
            "group bg-white/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-200 border border-white/70 hover:border-primary/30 flex flex-col h-full";

        card.innerHTML = `
        <input type="checkbox" class="select-checkbox hidden absolute top-3 left-3 z-10">
        <div class="h-32 bg-slate-100 relative overflow-hidden flex items-center justify-center">

        ${thumbnail ? `
        <img
        src="${thumbnail}"
        loading="lazy"
        class="w-full h-full object-cover"
        />
        ` : `
        <span class="material-symbols-outlined text-6xl ${iconData.color}">
        ${iconData.icon}
        </span>
        `}

        <span class="absolute top-3 right-3 text-[11px] font-semibold px-2.5 py-1 bg-white/90 rounded-full shadow">
        ${formatFileType(item.fileType)}
        </span>

        </div>

        <div class="p-5 flex flex-col flex-1">

        <h4 class="font-semibold text-slate-800 text-[17px] leading-snug truncate">
        ${item.nama || "-"}
        </h4>

        <p class="text-[15px] text-slate-500 mt-1 mb-4 font-medium tracking-wide">
        ${item.kategori || "Arsip"} • ${tahun}
        </p>

        <div class="mt-auto flex items-center justify-between">

        <div class="flex -space-x-2 access-btn cursor-pointer hover:scale-105 transition">
       ${renderAccessProfiles(item.allowedUsers || [], item.id)}
        </div>

        <div class="flex items-center gap-2.5">

        <button class="preview-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[19px]">visibility</span>
        </button>

        <button class="edit-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[19px]">edit</span>
        </button>

        <button class="delete-btn hidden text-slate-500 hover:text-red-500 transition">
        <span class="material-symbols-outlined text-[19px]">delete</span>
        </button>

        </div>

        </div>

        </div>
        `;
        container.appendChild(card);

        card.querySelectorAll(".access-avatar").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();

                const itemId = el.dataset.id;
                const users = JSON.parse(el.dataset.users || "[]");

                openAccessModal(itemId, users);
            });
        });

        setupRowEvents(card, item);

        card.addEventListener("click", () => {

            //if (!isDeleteMode) return;

            const checkbox = card.querySelector(".select-checkbox");

            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event("change"));
            }

        });

        const checkbox = card.querySelector(".select-checkbox");

        if (checkbox) {

            checkbox.addEventListener("click", e => e.stopPropagation());

            checkbox.addEventListener("change", (e) => {

                if (e.target.checked) {
                    selectedFiles.add(item.id);
                    card.classList.add("ring-2", "ring-blue-400");
                } else {
                    selectedFiles.delete(item.id);
                    card.classList.remove("ring-2", "ring-blue-400");
                }

            });
        }
    });

}

export function renderList(data) {

    const container = document.getElementById("archiveContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!data.length) {

        container.innerHTML = `
    <div class="flex items-center justify-center h-[300px] text-slate-400">
        Tidak ada arsip
    </div>`;

        return;
    }

    // HEADER
    container.innerHTML = `
    <div class="grid grid-cols-12 px-6 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200">
        <div class="col-span-5">Name</div>
        <div class="col-span-2">Category</div>
        <div class="col-span-1">Year</div>
        <div class="col-span-3">User Access</div>
       <div class="col-span-1 flex justify-end">
    Open
</div>
    `;

    data.forEach(item => {

        window.selectedFilesData[item.id] = item;

        const thumbnail = getThumbnail(item.filePath);

        let tahun = "-";
        if (item.tanggal) tahun = item.tanggal.split("-")[0];

        const iconData = getFileIcon(item.fileType || "");

        const row = document.createElement("div");

        row.className =
            "grid grid-cols-12 items-center px-6 py-4 bg-white/70 backdrop-blur rounded-xl hover:bg-white transition border border-white/40";

        row.innerHTML = `

        <div class="col-span-5 flex items-center gap-3">

            <span class="material-symbols-outlined ${iconData.color}">
                ${iconData.icon}
            </span>

            <span class="text-lg font-semibold text-slate-800 truncate">
                ${item.nama || "-"}
            </span>

        </div>

        <div class="col-span-2 text-[15px] text-slate-600 font-medium">
            ${item.kategori || "-"}
        </div>

        <div class="col-span-1 text-[15px] text-slate-500 font-medium">
            ${tahun}
        </div>
<div class="col-span-3 flex items-center">
    <div class="flex -space-x-2 access-btn cursor-pointer hover:scale-105 transition">
        ${renderAccessProfiles(item.allowedUsers || [], item.id)}
    </div>
</div>

        <div class="col-span-1 flex justify-end items-center gap-3">

    <button class="preview-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[22px]">
            visibility
        </span>
    </button>

    <button class="edit-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[22px]">
            edit
        </span>
    </button>

    <button class="delete-btn text-slate-500 hover:text-red-500 transition">
        <span class="material-symbols-outlined text-[22px]">
            delete
        </span>
    </button>

</div>
        `;

        container.appendChild(row);

        setupRowEvents(row, item);

        row.querySelectorAll(".access-avatar").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();

                const itemId = el.dataset.id;
                const users = JSON.parse(el.dataset.users || "[]");

                openAccessModal(itemId, users);
            });
        });

    });

}

// ===============================
// ACCESS USER RENDER
// ===============================

function renderAccessProfiles(users = [], itemId) {

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

        const email = userCache[uid] || "unknown";
        const initial = email.charAt(0).toUpperCase();

        const color = colors[i % colors.length];

        return `
            <div
                title="${email}"
                data-id='${itemId}'
                data-users='${JSON.stringify(users)}'
                class="access-avatar w-9 h-9 rounded-full ${color}
                text-white text-sm font-semibold
                flex items-center justify-center
                border-2 border-white shadow
                hover:scale-110 transition cursor-pointer"
            >
                ${initial}
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

// ===============================
// ROW EVENTS
// ===============================
function setupRowEvents(row, item) {

    console.log("Row events attached:", item.nama);

    // ===============================
    // PREVIEW
    // ===============================
    const previewBtn = row.querySelector(".preview-btn");

    if (previewBtn) {
        previewBtn.onclick = () => {

            let url = "";
            let driveUrl = "";

            // ================= SPREADSHEET LINK =================
            if (item.spreadsheetLink) {

                const fileId = item.spreadsheetLink
                    .split("/d/")[1]
                    ?.split("/")[0];

                url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

                driveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

            }

            // ================= FILE UPLOAD =================
            else if (item.filePath) {

                const fileId = item.filePath;
                const type = (item.fileType || "").toLowerCase();

                driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

                // ===== PDF =====
                if (type.includes("pdf")) {

                    url = `https://drive.google.com/file/d/${fileId}/preview`;

                }

                // ===== IMAGE =====
                else if (
                    type.includes("png") ||
                    type.includes("jpg") ||
                    type.includes("jpeg")
                ) {

                    url = `https://drive.google.com/uc?id=${fileId}`;

                }

                // ===== EXCEL =====
                else if (
                    type.includes("xls") ||
                    type.includes("xlsx") ||
                    type.includes("csv")
                ) {

                    url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

                }

                // ===== FALLBACK =====
                else {

                    url =
                        "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId="
                        + fileId;

                }

            }

            if (!url) {
                alert("File tidak tersedia");
                return;
            }

            const frame = document.getElementById("previewFrame");

            if (frame) frame.src = url;
            const openBtn = document.getElementById("openDriveBtn");

            if (openBtn) {

                openBtn.onclick = () => {

                    if (driveUrl) {
                        window.open(driveUrl, "_blank");
                    }

                };

            }

            document
                .getElementById("previewModal")
                ?.classList.remove("hidden");

        };

    }


    // ===============================
    // OPEN FILE
    // ===============================
    const openBtn = row.querySelector(".open-btn");

    if (openBtn) {
        openBtn.onclick = () => {

            let url = "";

            if (item.spreadsheetLink) {
                const fileId = item.spreadsheetLink.split("/d/")[1]?.split("/")[0];
                url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
            }

            else if (item.filePath) {
                url = "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId=" + item.filePath;
            }

            if (!url) {
                alert("File tidak tersedia");
                return;
            }

            window.open(url, "_blank");
        };
    }

    // ===============================
    // ACCESS
    // ===============================
    // const accessBtn = row.querySelector(".access-btn");

    //if (accessBtn) {
    //  accessBtn.onclick = () => {
    //    openAccessModal(item.id, item.allowedUsers || []);
    // };
    // }

    // ===============================
    // DELETE
    // ===============================
    const deleteBtn = row.querySelector(".delete-btn");

    if (deleteBtn) {
        deleteBtn.onclick = (e) => {

            e.stopPropagation();

            // hanya aktif saat delete mode
            if (!isDeleteMode) return;

            document.getElementById("deleteFileId").value = item.id;

            document.getElementById("deleteFileName").textContent = item.nama || "-";

            document.getElementById("deleteFilePath").value = item.filePath || "";

            document.getElementById("confirmDeleteBtn")?.click();
        };
    }

    // ===============================
    // EDIT
    // ===============================
    const editBtn = row.querySelector(".edit-btn");

    if (editBtn) {
        editBtn.onclick = () => {

            const idInput = document.getElementById("editFileId");
            const judulInput = document.getElementById("editJudul");
            const kategoriDisplay = document.getElementById("editKategoriDisplay");
            const tahunInput = document.getElementById("editTahun");
            const linkInput = document.getElementById("editLink");

            if (!idInput || !judulInput || !tahunInput) {
                alert("Form edit belum lengkap (cek ID input)");
                return;
            }

            idInput.value = item.id;
            judulInput.value = item.nama || "";

            if (kategoriDisplay) {
                kategoriDisplay.value = item.kategori || "";
            }

            linkInput.value = item.spreadsheetLink || "";
            tahunInput.value = item.tanggal?.split("-")[0] || "";

            document.getElementById("editModal")?.classList.remove("hidden");
        };
    }

}

window.allArchives = [];
let currentView = "grid";
let isLoadingArchives = false;
let isMoving = false;

// --- TAMBAHAN UNTUK PAGINATION ---
let lastDoc = null;
let hasMoreDocs = true;
const PAGE_LIMIT = 30;

export async function loadArchiveData(isLoadMore = false) {

    console.log(isLoadMore ? "LOAD MORE DATA DIPANGGIL" : "LOAD DATA DIPANGGIL");

    if (isLoadingArchives) return;
    isLoadingArchives = true;

    // Jika bukan load more (misal pindah folder), reset semuanya
    if (!isLoadMore) {
        showArchiveSkeleton();
        window.allArchives = [];
        lastDoc = null;
        hasMoreDocs = true;
    }

    try {

        if (Object.keys(userCache).length === 0) {

            const userSnap = await getDocs(
                query(
                    collection(db, "users"),
                    limit(50)
                )
            );

            userSnap.forEach(doc => {
                const data = doc.data();
                userCache[doc.id] = data.email || "unknown";
            });

        }

        // Siapkan constraints untuk query
        let qConstraints = [];
        if (currentFolderId !== null) {
            qConstraints.push(where("folderId", "==", currentFolderId));
        }

        let q;
        if (isLoadMore && lastDoc) {
            q = query(
                collection(db, "files"),
                ...qConstraints,
                startAfter(lastDoc),
                limit(PAGE_LIMIT)
            );
        } else {
            q = query(
                collection(db, "files"),
                ...qConstraints,
                limit(PAGE_LIMIT)
            );
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            hasMoreDocs = false;
        } else {
            // Simpan doc terakhir untuk pagination berikutnya
            lastDoc = snapshot.docs[snapshot.docs.length - 1];

            const newDocs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Gabungkan data lama dengan yang baru di-load
            window.allArchives = [...window.allArchives, ...newDocs];

            // Kalau data yang ditarik kurang dari limit, berarti sudah habis
            if (snapshot.docs.length < PAGE_LIMIT) {
                hasMoreDocs = false;
            }
        }

        // Render sesuai view saat ini
        if (currentView === "grid") {
            renderTable(window.allArchives);
        } else {
            renderList(window.allArchives);
        }

        // Render tombol Load More jika masih ada data
        renderLoadMoreButton();

    } catch (err) {
        console.error("loadArchiveData error:", err);
    } finally {
        isLoadingArchives = false;
    }
}

function renderLoadMoreButton() {
    // Hapus tombol yang lama jika ada
    const existingBtn = document.getElementById("loadMoreContainer");
    if (existingBtn) existingBtn.remove();

    if (!hasMoreDocs || window.allArchives.length === 0) return;

    const container = document.getElementById("archiveContainer");
    if (!container) return;

    const loadMoreDiv = document.createElement("div");
    loadMoreDiv.id = "loadMoreContainer";
    // Sesuaikan grid column span agar membentang penuh
    loadMoreDiv.className = currentView === "grid"
        ? "col-span-full flex justify-center mt-6 mb-4"
        : "flex justify-center mt-6 mb-4";

    loadMoreDiv.innerHTML = `
        <button id="loadMoreBtn" class="px-6 py-2.5 bg-white border border-slate-200 text-primary font-semibold text-sm rounded-full shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            Load More Data
            <span class="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
    `;

    // Append ke container parent (buat di luarnya agar tidak berantakan dengan grid list)
    container.parentNode.insertBefore(loadMoreDiv, container.nextSibling);

    document.getElementById("loadMoreBtn").addEventListener("click", () => {
        const btn = document.getElementById("loadMoreBtn");
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">autorenew</span> Loading...`;
        btn.disabled = true;
        loadArchiveData(true); // Panggil mode load more
    });
}
// ===============================
// SERVER-SIDE SEARCH LOGIC 
// ===============================
window.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("archiveSearch");
    if (!searchInput) return;

    let searchTimeout;

    searchInput.oninput = () => {
        const keyword = searchInput.value.trim().toLowerCase();

        // 1. Hapus timer sebelumnya agar tidak ngetik-langsung-cari (biar hemat kuota)
        clearTimeout(searchTimeout);

        // 2. Jika kolom pencarian dihapus (kosong)
        if (!keyword) {
            safeReload();// Balikkan ke tampilan folder semula
            return;
        }

        // 3. Tunggu 500ms setelah berhenti mengetik, baru cari ke database
        searchTimeout = setTimeout(() => {
            if (keyword.length < 3) return; // FIX
            searchArchiveFromServer(keyword);
        }, 500);
    };
});

// ===============================
// FILTER ARCHIVE
// ===============================
function applyFilters() {

    const year = document.getElementById("yearFilter")?.value || "";
    const category = document.getElementById("categoryFilter")?.value || "";

    let filtered = [...allArchives];

    // filter tahun
    if (year) {
        filtered = filtered.filter(file =>
            (file.tanggal || "").startsWith(year)
        );
    }

    // filter kategori
    if (category) {
        filtered = filtered.filter(file =>
            (file.kategori || "").toLowerCase() === category.toLowerCase()
        );
    }

    if (currentView === "grid") {
        renderTable(filtered);
    } else {
        renderList(filtered);
    }
}


// ===============================
// CONNECT FILTER DROPDOWN
// ===============================
document.addEventListener("DOMContentLoaded", () => {

    loadFolderButtons();

    const yearFilter = document.getElementById("yearFilter");
    const categoryFilter = document.getElementById("categoryFilter");

    yearFilter?.addEventListener("change", applyFilters);
    categoryFilter?.addEventListener("change", applyFilters);

});

// ===============================
// VIEW MODE
// ===============================

window.setGridView = function () {

    const container = document.getElementById("archiveContainer");
    if (!container) return;

    currentView = "grid";

    // SLIDER GERAK KE GRID
    const slider = document.getElementById("viewSlider");
    if (slider) slider.style.transform = "translateX(0px)";

    container.className =
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5";

    renderTable(allArchives);

}

window.setListView = function () {

    const container = document.getElementById("archiveContainer");
    if (!container) return;

    currentView = "list";

    // SLIDER GERAK KE LIST
    const slider = document.getElementById("viewSlider");
    if (slider) slider.style.transform = "translateX(70px)";

    container.className = "flex flex-col gap-2";

    renderList(allArchives);

}

function setActiveView(btn) {

    document.querySelectorAll(".view-btn")
        .forEach(b => b.classList.remove("bg-primary", "text-white"));

    btn.classList.add("bg-primary", "text-white");

}

window.moveSlider = function (mode) {

    const slider = document.getElementById("viewSlider");

    if (!slider) return;

    if (mode === "grid") {

        slider.style.transform = "translateX(0px)";

    } else {

        slider.style.transform = "translateX(70px)";

    }

}

async function loadFolderButtons() {

    const container = document.getElementById("folderButtons");

    if (!container) return;

    const isActiveRoot = currentFolderId === null;

    let html = `
    <div class="flex flex-wrap gap-3 items-center">
    `;

    // ================= ROOT =================
    html += `
    <div 
        onclick="openFolder(null)"
        class="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all duration-200

        ${isActiveRoot
            ? "bg-primary text-white shadow-md"
            : "bg-white/70 text-slate-700 hover:bg-primary/10"
        }">

        <span class="material-symbols-outlined text-[18px]">
            home
        </span>

        <div>
            <p class="text-sm font-semibold leading-none">
                Semua File
            </p>
        </div>

    </div>
    `;

    // ================= LOAD FOLDER =================
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

    snap.forEach(doc => {

        const data = doc.data();
        const isActive = currentFolderId === doc.id;
        html += `
            <div 
                onclick="openFolder('${doc.id}')"
                ondragover="event.preventDefault()" 
                ondrop="handleDrop(event, '${doc.id}')"
                class="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all duration-200

                ${isActive
                ? "bg-primary text-white shadow-md"
                : "bg-white/70 text-slate-700 hover:bg-primary/10"
            }">

                <span class="material-symbols-outlined text-[18px]">
                    folder
                </span>

                <p class="text-sm font-medium flex-1">
                    ${data.name}
                </p>

              <span 
                onclick="event.stopPropagation(); deleteFolder('${doc.id}')"
                class="folder-delete-btn hidden material-symbols-outlined text-red-400 text-[18px] hover:scale-110 transition">
                    delete
                </span>

            </div>
            `;
    });

    html += `</div>`;

    // render SEKALI (anti flicker)
    container.innerHTML = html;
}

window.openFolder = function (folderId) {

    if (folderId === null) {
        window.folderPath = [];
    } else {

        // hindari duplicate
        if (!window.folderPath.includes(folderId)) {
            window.folderPath.push(folderId);
        }
    }

    currentFolderId = folderId;

    renderBreadcrumb();
    loadFolderButtons();
    loadArchiveData();
};

// ===============================
// STEP 3: OPTIMASI BREADCRUMB (Option C)
// ===============================
async function renderBreadcrumb() {
    const container = document.getElementById("breadcrumb");
    if (!container) return;

    let html = `
        <div onclick="openFolder(null)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-full 
                   bg-gradient-to-r from-blue-500 to-indigo-500 
                   text-white text-xs font-semibold cursor-pointer shadow-sm hover:scale-[1.03] transition">
            Home
        </div>
    `;

    try {
        // Promise.all membuat semua request ke Firestore jalan barengan (paralel)
        // Jauh lebih cepat daripada pakai loop await satu-satu
        const folderPromises = window.folderPath.map(id => getDoc(doc(db, "folders", id)));
        const snapshots = await Promise.all(folderPromises);

        snapshots.forEach((snap, i) => {
            if (snap.exists()) {
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
            }
        });
    } catch (err) {
        console.error("Breadcrumb Error:", err);
    }

    container.innerHTML = html;
}

window.goToBreadcrumb = function (index) {

    // potong path
    window.folderPath = window.folderPath.slice(0, index + 1);

    const targetFolderId = window.folderPath[index];

    currentFolderId = targetFolderId;

    renderBreadcrumb();
    loadFolderButtons();
    loadArchiveData();
};

window.handleDrop = async function (e, targetFolderId) {

    if (isMoving) return;
    isMoving = true;

    e.preventDefault();

    const fileId = e.dataTransfer.getData("fileId");
    if (!fileId) return;

    try {

        const fileData = window.selectedFilesData?.[fileId];

        if (!fileData) {
            console.warn("Data tidak ada di cache:", fileId);
            return;
        }

        const folderSnap = await getDoc(doc(db, "folders", targetFolderId));
        const folderData = folderSnap.data();

        const driveFolderId = folderData.driveFolderId;

        console.log("MOVE FILE:", fileData.filePath);
        console.log("TARGET DRIVE FOLDER:", driveFolderId);

        if (fileData.filePath && driveFolderId) {

            const res = await fetch(window.DRIVE_API, {
                method: "POST",
                body: new URLSearchParams({
                    action: "move",
                    fileId: fileData.filePath,
                    folderId: driveFolderId
                })
            });

            const result = await res.text();
            console.log("MOVE RESPONSE:", result);
        }

        await queueWrite(() =>
            updateDoc(doc(db, "files", fileId), {
                folderId: targetFolderId
            })
        );

        showSuccess("File berhasil dipindahkan");

        safeReload();

    } catch (err) {
        console.error("Move error:", err);

    } finally {
        setTimeout(() => {
            isMoving = false;
        }, 800);
    }
};

window.deleteFolder = async function (folderId) {

    const q = query(
        collection(db, "files"),
        where("folderId", "==", folderId)
    );

    const snap = await getDocs(q);

    const sub = await getDocs(
        query(collection(db, "folders"), where("parentId", "==", folderId))
    );

    if (!snap.empty || !sub.empty) {
        alert("Folder masih berisi isi!");
        return;
    }

    await queueWrite(() =>
        deleteDoc(doc(db, "folders", folderId))
    );

    showSuccess("Folder berhasil dihapus");

    loadFolderButtons();
    safeReload();
};

// ===============================
// LOAD FOLDER DROPDOWN (FIX)
// ===============================
export async function loadFolderDropdown() {

    const folderSelect = document.getElementById("folderSelect");
    if (!folderSelect) return;

    folderSelect.innerHTML = '<option value="">Pilih Folder</option>';

    try {

        const snapshot = await getDocs(
            query(collection(db, "folders"))
        );

        const seen = new Set();

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            if (seen.has(docSnap.id)) return;
            seen.add(docSnap.id);

            const option = document.createElement("option");

            option.value = docSnap.id;

            const prefix = data.parentId ? "↳ " : "";

            option.textContent = prefix + data.name;

            folderSelect.appendChild(option);
        });

        if (window.currentFolderId) {
            folderSelect.value = window.currentFolderId;
        }

    } catch (err) {
        console.error("Dropdown error:", err);
    }
}

    document.getElementById("bulkDeleteToggle")
        ?.addEventListener("click", () => {

            isDeleteMode = !isDeleteMode;

            // ===============================
            // SHOW / HIDE CHECKBOX
            // ===============================
            document.querySelectorAll(".select-checkbox")
                .forEach(cb => {
                    cb.classList.toggle("hidden", !isDeleteMode);
                });

            // ===============================
            // SHOW / HIDE ICON DELETE
            // ===============================
            document.querySelectorAll(".delete-btn")
                .forEach(btn => {
                    btn.classList.toggle("hidden");
                });

            document.querySelectorAll(".folder-delete-btn")
                .forEach(btn => {
                    btn.classList.toggle("hidden", !isDeleteMode);
                });

            // ===============================
            // SHOW / HIDE BUTTON DELETE SELECTED
            // ===============================
            document.getElementById("deleteSelectedBtn")
                ?.classList.toggle("hidden", !isDeleteMode);

            // ===============================
            // RESET SAAT KELUAR MODE
            // ===============================
            if (!isDeleteMode) {
                selectedFiles.clear();

                document.querySelectorAll("[data-id]").forEach(card => {
                    card.classList.remove("ring-2", "ring-blue-400");

                    const cb = card.querySelector(".select-checkbox");
                    if (cb) cb.checked = false;
                });
            }

        });

    // Fungsi ini yang akan "terbang" ke Firestore mencari data di seluruh database
    async function searchArchiveFromServer(keyword) {
        const container = document.getElementById("archiveContainer");
        if (!container) return;

        // Tampilkan loading skeleton
        showArchiveSkeleton();

        try {
            const archivesRef = collection(db, "files");

            // Query sakti: Mencari yang berawalan dengan keyword
            const q = query(
                archivesRef,
                where("nama", ">=", keyword),
                where("nama", "<=", keyword + "\uf8ff"),
                limit(40) // Kita ambil 40 hasil terbaik
            );

            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sembunyikan tombol Load More saat hasil cari muncul
            const loadMoreBtn = document.getElementById("loadMoreContainer");
            if (loadMoreBtn) loadMoreBtn.style.display = "none";

            // Tampilkan ke layar
            if (currentView === "grid") {
                renderTable(results);
            } else {
                renderList(results);
            }

            if (results.length === 0) {
                container.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400">Data "${keyword}" tidak ditemukan.</div>`;
            }

        } catch (err) {
            console.error("Gagal cari data:", err);
        }
    }