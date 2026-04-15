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
    doc
}
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { openAccessModal, setupAccessSave } from "./access-system.js";

const PAGE_SIZE = 10;
let userCache = {};

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
        <div class="col-span-3 text-center text-slate-400 py-10">
        Tidak ada arsip
        </div>
        `;

        return;

    }

    data.forEach(item => {

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

        card.className =
            "group bg-white/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-200 border border-white/70 hover:border-primary/30 flex flex-col h-full";

        card.innerHTML = `
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
        ${renderAccessProfiles(item.allowedUsers || [])}
        </div>

        <div class="flex items-center gap-2.5">

        <button class="preview-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[19px]">visibility</span>
        </button>

        <button class="edit-btn text-slate-500 hover:text-primary transition">
        <span class="material-symbols-outlined text-[19px]">edit</span>
        </button>

        <button class="delete-btn text-slate-500 hover:text-red-500 transition">
        <span class="material-symbols-outlined text-[19px]">delete</span>
        </button>

        </div>

        </div>

        </div>
        `;
        container.appendChild(card);

        setupRowEvents(card, item);

    });

}

export function renderList(data) {

    const container = document.getElementById("archiveContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!data.length) {
        container.innerHTML = `
        <div class="text-center text-slate-400 py-10">
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
        <div class="col-span-1 text-right">Open</div>

    </div>
    `;

    data.forEach(item => {

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

                <div class="flex -space-x-2 access-btn cursor-pointer hover:scale-105 transition">
            ${renderAccessProfiles(item.allowedUsers || [])}
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

    });

}

// ===============================
// ACCESS USER RENDER
// ===============================

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

        const email = userCache[uid] || "unknown";
        const initial = email.charAt(0).toUpperCase();

        const color = colors[i % colors.length];

        return `
            <div
            title="${email}"
            class="w-9 h-9 rounded-full ${color}
            text-white text-sm font-semibold
            flex items-center justify-center
            border-2 border-white shadow
            hover:scale-110 transition cursor-pointer">

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
    row.querySelector(".preview-btn")
        ?.addEventListener("click", () => {

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

        });


    // ===============================
    // OPEN FILE
    // ===============================
    row.querySelector(".open-btn")
        ?.addEventListener("click", () => {

            let url = "";

            if (item.spreadsheetLink) {

                const fileId = item.spreadsheetLink
                    .split("/d/")[1]
                    ?.split("/")[0];

                url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

            }

            else if (item.filePath) {

                url =
                    "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec?action=preview&fileId="
                    + item.filePath;

            }

            if (!url) {
                alert("File tidak tersedia");
                return;
            }

            window.open(url, "_blank");

        });


    // ===============================
    // ACCESS
    // ===============================
    row.querySelector(".access-btn")
        ?.addEventListener("click", () => {

            openAccessModal(item.id, item.allowedUsers || []);

        });


    // ===============================
    // DELETE
    // ===============================
    row.querySelector(".delete-btn")
        ?.addEventListener("click", () => {

            document.getElementById("deleteFileId").value = item.id;

            document.getElementById("deleteFileName")
                .textContent = item.nama || "-";

            document.getElementById("deleteFilePath")
                .value = item.filePath || "";

            document
                .getElementById("deleteModal")
                ?.classList.remove("hidden");

        });


    // ===============================
    // EDIT
    // ===============================
    row.querySelector(".edit-btn")
        ?.addEventListener("click", () => {

            document.getElementById("editFileId").value = item.id;

            document.getElementById("editJudul")
                .value = item.nama || "";

            document.getElementById("editKategori")
                .value = (item.kategori || "").toLowerCase();

            document.getElementById("editLink")
                .value = item.spreadsheetLink || "";

            document.getElementById("editTahun")
                .value = item.tanggal?.split("-")[0] || "";

            document
                .getElementById("editModal")
                ?.classList.remove("hidden");

        });
}

window.allArchives = [];
let currentView = "grid";
let isLoadingArchives = false;

export async function loadArchiveData() {

    if (isLoadingArchives) return;

    isLoadingArchives = true;

    try {

        // LOAD USER CACHE (hanya sekali)
        if (Object.keys(userCache).length === 0) {

            const userSnap = await getDocs(collection(db, "users"));

            userSnap.forEach(doc => {

                const data = doc.data();
                userCache[doc.id] = data.email || "unknown";

            });

        }

        const q = query(
            collection(db, "files"),
            orderBy("tanggal", "desc"),
            limit(50)
        );
        const snapshot = await getDocs(q);

        window.allArchives = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderTable(window.allArchives);

    } catch (err) {

        console.error("loadArchiveData error:", err);

    } finally {

        isLoadingArchives = false;

    }

}

// ===============================
// SEARCH ARCHIVE
// ===============================
window.addEventListener("DOMContentLoaded", () => {

    const searchInput = document.getElementById("archiveSearch");

    if (!searchInput) return;

    searchInput.addEventListener("input", () => {

        const keyword = searchInput.value.toLowerCase();

        const filtered = allArchives.filter(file =>
            (file.nama || "").toLowerCase().includes(keyword) ||
            (file.kategori || "").toLowerCase().includes(keyword)
        );

        if (currentView === "grid") {
            renderTable(filtered);
        } else {
            renderList(filtered);
        }

    });

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

// ===============================
// SAVE EDIT ARCHIVE
// ===============================

document.getElementById("editModalSaveBtn")
    ?.addEventListener("click", async () => {

        const id = document.getElementById("editFileId").value;

        const nama = document.getElementById("editJudul").value;
        const kategori = document.getElementById("editKategori").value;
        const link = document.getElementById("editLink").value;
        const tahun = document.getElementById("editTahun").value;

        try {

            await updateDoc(doc(db, "files", id), {
                nama: nama,
                kategori: kategori,
                spreadsheetLink: link,
                tanggal: tahun + "-01-01"
            });

            // tutup modal
            document.getElementById("editModal").classList.add("hidden");

            // reload data dashboard
            loadArchiveData();
            setTimeout(() => {
                loadDashboardStats();
            }, 300);

            // tampilkan notifikasi sukses
            showSuccess("Perubahan berhasil disimpan");

        } catch (error) {

            console.error("Update error:", error);

        }

    });