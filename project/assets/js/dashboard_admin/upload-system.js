import { auth, db } from "../firebase-config.js";

import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    deleteDoc,
    getDoc,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

//import { safeReload } from "./archive-table.js";
//import { loadDashboardStats } from "./dashboard-stats.js";
import { loadFolderDropdown } from "./archive-table.js";

const DRIVE_API = "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec";

let deleteQueue = [];
let deleteTimeout = null;
let logQueue = [];
let logTimeout = null;
let lastWriteTime = 0;
let isCreatingFolder = false;
let folderCache = {};
window.localFilesCache = window.localFilesCache || [];

// ===============================
// GLOBAL WRITE QUEUE (ANTI LIMIT)
// ===============================
let writeQueue = [];
let isProcessing = false;


async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (writeQueue.length > 0) {
        const job = writeQueue.shift();
        await job();

    }

    isProcessing = false;
}

export function queueWrite(fn) {

    if (writeQueue.length > 50) {
        console.warn("Queue overload, ditolak sementara");
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        writeQueue.push(async () => {
            const result = await fn();
            resolve(result);
        });
        processQueue();
    });

}

async function safeWrite(callback) {
    const MIN_DELAY = 600;

    const now = Date.now();
    const diff = now - lastWriteTime;

    if (diff < MIN_DELAY) {
        await new Promise(res => setTimeout(res, MIN_DELAY - diff));
    }

    try {
        const result = await callback();
        lastWriteTime = Date.now();
        return result;
    } catch (err) {
        console.error("Write error, retrying...", err);

        await new Promise(res => setTimeout(res, 4000));
        const result = await callback();

        lastWriteTime = Date.now();
        return result;
    }
}

function addLog(action, fileName = "-", status = "success") {

    const user = auth.currentUser;
    if (!user) return;

    queueWrite(() =>
        safeWrite(() =>
            addDoc(collection(db, "activityLogs"), {
                uid: user.uid,
                userEmail: user.email || "-",
                action: action,
                fileName: fileName,
                status: status,
                timestamp: serverTimestamp()
            })
        )
    );
}

function isValidSpreadsheetLink(link) {
    if (!link) return false;

    try {
        const parsed = new URL(link);

        if (parsed.hostname !== "docs.google.com") return false;

        const regex = /^\/spreadsheets\/d\/[a-zA-Z0-9_-]+/;

        return regex.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function showSuccess(message) {
    const modal = document.getElementById("successModal");
    const msg = document.getElementById("successModalMessage");

    if (msg) msg.innerText = message;
    if (modal) modal.classList.remove("hidden");

    setTimeout(() => {
        modal?.classList.add("hidden");
    }, 2000);
}

function showError(message) {
    const modal = document.getElementById("errorModal");
    const msg = document.getElementById("errorModalMessage");

    if (msg) msg.innerText = message;
    if (modal) modal.classList.remove("hidden");

    setTimeout(() => {
        modal?.classList.add("hidden");
    }, 2500);
}

export function setupUpload() {
    const btn = document.getElementById("saveArchiveBtn");
    if (!btn) return;

    const dropzone = document.getElementById("uploadFileDropzone");
    const fileInput = document.getElementById("uploadFileInput");
    const fileInfo = document.getElementById("uploadFileInfo");
    const clearBtn = document.getElementById("uploadFileClearBtn");

    if (clearBtn && fileInput && fileInfo) {
        clearBtn.addEventListener("click", () => {
            fileInput.value = "";
            fileInfo.textContent = "Belum ada file dipilih";
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("border-blue-500");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("border-blue-500");
        });

        dropzone.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropzone.classList.remove("border-blue-500");

            const files = e.dataTransfer.files;

            if (!files || files.length === 0) return;

            if (fileInfo) {
                fileInfo.textContent = `${files.length} file dipilih`;
            }

            await handleAutoUpload(files);
        });

        fileInput.addEventListener("change", async () => {
            const files = fileInput.files;

            if (!files || files.length === 0) return;

            if (fileInfo) {
                fileInfo.textContent = `${files.length} file dipilih`;
            }
        });
    }

    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("saveArchiveBtn");
    if (newBtn) {
        newBtn.addEventListener("click", uploadHandler);
    }

    document.getElementById("deleteSelectedBtn")
        ?.addEventListener("click", () => {
            const selectedFiles = window.selectedFiles;

            if (!selectedFiles || selectedFiles.size === 0) {
                showError("Pilih file dulu!");
                return;
            }

            document.getElementById("deleteFileName").innerText =
                `${selectedFiles.size} file`;

            document.getElementById("deleteModal")
                ?.classList.remove("hidden");
        });

    document.getElementById("newArchiveBtn")
        ?.addEventListener("click", async () => {

            document.getElementById("uploadModal")
                ?.classList.remove("hidden");

            await loadFolderDropdown();

            const folderSelect = document.getElementById("folderSelect");
            const kategoriDisplay = document.getElementById("kategoriDisplay");

            if (folderSelect && kategoriDisplay) {

                const updateKategori = () => {
                    const selectedOption = folderSelect.options[folderSelect.selectedIndex];
                    kategoriDisplay.value = selectedOption?.textContent?.trim() || "";
                };

                folderSelect.onchange = updateKategori;

                updateKategori();
            }

            if (folderSelect && window.currentFolderId) {
                folderSelect.value = window.currentFolderId;
            }
        });

    document.getElementById("undoBtn")
        ?.addEventListener("click", () => {
            clearTimeout(deleteTimeout);

            document.querySelectorAll("[data-id]").forEach(card => {
                card.classList.remove("opacity-50", "pointer-events-none");

                const label = card.querySelector(".text-red-500");
                if (label) label.remove();
            });

            deleteQueue = [];
            window.selectedFiles?.clear();

            document.querySelectorAll(".select-checkbox").forEach(cb => {
                cb.checked = false;
            });

            document.getElementById("undoBar")?.classList.add("hidden");
            document.getElementById("deleteProgressBox")?.classList.add("hidden");

            showSuccess("Delete dibatalkan");
        });

    setupEditArchive();
}

async function uploadHandler() {

    if (window.lastUploadTime && Date.now() - window.lastUploadTime < 5000) {
        showError("Tunggu 5 detik sebelum upload lagi");
        return;
    }
    window.lastUploadTime = Date.now();

    if (window.isUploading) {
        showError("Upload masih berjalan...");
        return;
    }
    window.isUploading = true;

    const btn = document.getElementById("saveArchiveBtn");
    if (btn) btn.disabled = true;

    const progressBox = document.getElementById("uploadProgressBox");
    progressBox?.classList.remove("hidden");

    if (progressBox) {
        progressBox.innerHTML = `
            <div class="flex items-center gap-2 text-sm text-blue-600">
                <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                Mengupload arsip...
            </div>
        `;
    }

    try {
        const judul = document.getElementById("judul")?.value.trim();

        let kategori = "umum";
        const folderSelect = document.getElementById("folderSelect");

        if (folderSelect && folderSelect.value) {
            const selectedOption = folderSelect.options[folderSelect.selectedIndex];
            const folderName = selectedOption?.textContent?.trim();

            if (folderName) {
                kategori = folderName.toLowerCase();
            }
        }

        let tahun = parseInt(document.getElementById("tahun")?.value);

        if (!tahun) {
            tahun = new Date().getFullYear();
        }
        const link = document.getElementById("link")?.value.trim();

        let selectedFolderId =
            window.currentFolderId ||
            document.getElementById("folderSelect")?.value ||
            "1uVhMkEfUQSdThilW6QDJeR2mqdLhkysy";

        if (!selectedFolderId) {
            showError("Pilih folder dulu!");
            return;
        }

        if (!selectedFolderId) {
            showError("Pilih folder dulu!");
            progressBox?.classList.add("hidden");
            return;
        }

        const files = document.getElementById("uploadFileInput")?.files;

        if (files && files.length > 3) {
            showError("Max 3 file (mode aman)");
            progressBox?.classList.add("hidden");
            return;
        }

        if (files && files.length > 0) {
        } else if (!link) {
            showError("Masukkan link spreadsheet atau upload file");
            progressBox?.classList.add("hidden");
            return;
        }

        if (tahun < 1900 || tahun > 2100) {
            showError("Tahun tidak valid");
            progressBox?.classList.add("hidden");
            return;
        }

        if (link && !isValidSpreadsheetLink(link)) {
            showError("Link spreadsheet tidak valid");
            progressBox?.classList.add("hidden");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            showError("User tidak ditemukan");
            progressBox?.classList.add("hidden");
            return;
        }

        await new Promise(res => setTimeout(res, 300));

        // ================= FILE UPLOAD =================
        if (files && files.length > 0) {

            let folderData;

            if (folderCache[selectedFolderId]) {
                folderData = folderCache[selectedFolderId];
            } else {
                const snap = await getDoc(doc(db, "folders", selectedFolderId));
                if (!snap.exists()) {
                    showError("Folder tidak ditemukan");
                    return;
                }
                folderData = snap.data();
                folderCache[selectedFolderId] = folderData;
            }

            if (!folderData.driveFolderId) {
                showError("Folder belum terhubung ke Drive");
                return;
            }

            const folderId = folderData.driveFolderId;

            for (const file of files) {

                try {

                    if (!file) continue;

                    if (progressBox) {
                        progressBox.innerHTML = `
                            <div class="flex items-center gap-2 text-sm text-blue-600">
                                <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                                Uploading: ${file.name}
                            </div>
                        `;
                    }

                    const base64 = await fileToBase64(file);

                    let data = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {

                            const res = await fetch(DRIVE_API, {
                                method: "POST",
                                body: new URLSearchParams({
                                    fileName: file.name,
                                    mimeType: file.type,
                                    fileData: base64,
                                    folderId: folderId
                                })
                            });

                            if (!res.ok) throw new Error("HTTP error");

                            const result = await res.json();

                            if (!result.success) throw new Error("Drive gagal");

                            data = result;
                            break;

                        } catch (err) {
                            console.warn(`Retry ${attempt + 1} gagal untuk ${file.name}`);

                            if (attempt === 2) {
                                console.error("Final gagal:", file.name);
                                continue;
                            }

                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }

                    if (!data) continue;

                    await queueWrite(() =>
                        safeWrite(() =>
                            addDoc(collection(db, "files"), {
                                nama: file.name,
                                kategori: kategori.toLowerCase(),
                                tanggal: tahun + "-01-01",
                                folderId: selectedFolderId,
                                createdBy: user.uid,
                                allowedUsers: [user.uid],
                                createdAt: serverTimestamp(),
                                spreadsheetLink: "",
                                sourceType: "file",
                                filePath: data.fileId,
                                fileName: file.name,
                                fileType: file.type
                            })
                        )
                    );

                    addLog("upload", file.name);

                    window.localFilesCache.unshift({
                        nama: file.name,
                        kategori: kategori.toLowerCase(),
                        tanggal: tahun + "-01-01",
                        folderId: selectedFolderId,
                        fileName: file.name,
                        fileType: file.type
                    });

                } catch (err) {
                    console.error("Error file:", file.name, err);
                    continue;
                }

                await new Promise(res => setTimeout(res, 500));
            }
        }

        // ================= LINK =================
        else if (link) {

            await queueWrite(() =>
                safeWrite(() =>
                    addDoc(collection(db, "files"), {
                        nama: judul,
                        kategori: kategori.toLowerCase(),
                        tanggal: tahun + "-01-01",
                        folderId: selectedFolderId,
                        createdBy: user.uid,
                        allowedUsers: [user.uid],
                        createdAt: serverTimestamp(),
                        spreadsheetLink: link,
                        sourceType: "link",
                        filePath: "",
                        fileName: "",
                        fileType: ""
                    })
                )
            );

            addLog("upload", judul);
        }

        //addLogToQueue({
        //uid: user.uid,
        //serEmail: user.email,
        //action: "upload",
        //fileName: judul,
        //ileId: "-",
        //  status: "success"
        //});

        // RESET FORM
        document.getElementById("judul").value = "";
        document.getElementById("tahun").value = "";
        document.getElementById("link").value = "";

        const fileInput = document.getElementById("uploadFileInput");
        const fileInfo = document.getElementById("uploadFileInfo");

        if (fileInput) fileInput.value = "";
        if (fileInfo) fileInfo.textContent = "Belum ada file dipilih";

        if (progressBox) {
            progressBox.innerHTML = `
                <div class="text-green-600 text-sm font-semibold">
                    Upload selesai ✅
                </div>
            `;
        }

        await new Promise(res => setTimeout(res, 1500));

        //await safeReload();

        //setTimeout(() => {
        //    loadDashboardStats();
        // }, 500);

        if (window.renderArchiveGrid) {
            window.renderArchiveGrid(window.localFilesCache);
        }

        if (window.calculateStatistics) {
            window.calculateStatistics(window.localFilesCache);
        }

        setTimeout(() => {
            progressBox?.classList.add("hidden");
        }, 1000);

        document.getElementById("uploadModal")?.classList.add("hidden");

        showSuccess("Arsip berhasil diupload");

    } catch (err) {
        console.error("Upload error:", err);
        showError("Upload gagal");
        progressBox?.classList.add("hidden");

    } finally {
        window.isUploading = false;
        if (btn) btn.disabled = false;
    }
}

async function handleAutoUpload(files) {
    if (files.length > 3) {
        showError("Max upload 3 file sekali upload");
        return;
    }

    try {
        showSuccess(`Upload ${files.length} file dimulai...`);
        const progressBox = document.getElementById("multiUploadProgress");
        if (progressBox) {
            progressBox.innerHTML = "";
            progressBox.classList.remove("hidden");
        }

        if (window.isUploading) {
            console.log("Upload masih jalan, tunggu...");
            return;
        }

        window.isUploading = true;

        const user = auth.currentUser;
        if (!user) {
            showError("User tidak ditemukan");
            window.isUploading = false;
            return;
        }

        let selectedFolderId = window.currentFolderId || document.getElementById("folderSelect")?.value || "1uVhMkEfUQSdThilW6QDJeR2mqdLhkysy";

        let folderData;

        if (folderCache[selectedFolderId]) {
            folderData = folderCache[selectedFolderId];
        } else {
            const snap = await getDoc(doc(db, "folders", selectedFolderId));

            if (!snap.exists()) {
                showError("Folder tidak ditemukan");
                return;
            }

            folderData = snap.data();
            folderCache[selectedFolderId] = folderData;
        }

        if (!folderData.driveFolderId) {
            showError("Folder belum terhubung ke Drive");
            return;
        }

        const folderId = folderData.driveFolderId;

        for (const file of files) {
            const item = document.createElement("div");
            item.className = "flex justify-between text-sm bg-slate-100 px-3 py-2 rounded";
            item.innerHTML = `
    <span class="truncate">${file.name}</span>
    <span class="status text-xs text-blue-500 flex items-center gap-1">
        <span class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
        uploading...
    </span>
`;

            progressBox?.appendChild(item);
            const statusEl = item.querySelector(".status");

            try {
                const judul = file.name;
                let kategori = "umum";

                const folderSelect = document.getElementById("folderSelect");

                if (folderSelect && folderSelect.value) {
                    const selectedOption = folderSelect.options[folderSelect.selectedIndex];
                    const folderName = selectedOption?.textContent?.trim();

                    if (folderName) {
                        kategori = folderName.toLowerCase();
                    }
                }
                const tahun = new Date().getFullYear();

                const base64 = await fileToBase64(file);

                const res = await fetch(DRIVE_API, {
                    method: "POST",
                    body: new URLSearchParams({
                        fileName: file.name,
                        mimeType: file.type,
                        fileData: base64,
                        folderId: folderId
                    })
                });

                if (!res.ok) {
                    throw new Error(`Koneksi API Gagal: ${res.status}`);
                }

                const data = await res.json();

                if (!data.success) {
                    if (statusEl) {
                        statusEl.textContent = "gagal ❌";
                        statusEl.classList.replace("text-blue-500", "text-red-500");
                    }
                    continue;
                }

                await queueWrite(() =>
                    safeWrite(() =>
                        addDoc(collection(db, "files"), {
                            nama: judul,
                            kategori: kategori.toLowerCase(),
                            tanggal: tahun + "-01-01",
                            folderId: selectedFolderId,
                            createdBy: user.uid,
                            allowedUsers: [user.uid],
                            createdAt: serverTimestamp(),
                            spreadsheetLink: "",
                            sourceType: "file",
                            filePath: data.fileId,
                            fileName: file.name,
                            fileType: file.type
                        })
                    )
                );

                addLog("upload", file.name);

                window.localFilesCache.unshift({
                    nama: judul,
                    kategori: kategori.toLowerCase(),
                    tanggal: tahun + "-01-01",
                    folderId: selectedFolderId,
                    fileName: file.name,
                    fileType: file.type
                });

                if (statusEl) {
                    statusEl.innerHTML = "selesai ✅";
                    statusEl.classList.replace("text-blue-500", "text-green-500");
                }
            } catch (err) {
                console.error(err);
                if (statusEl) {
                    statusEl.textContent = "error ❌";
                    statusEl.classList.replace("text-blue-500", "text-red-500");
                }
            }

            await new Promise(res => setTimeout(res, 500));
        }

        //await safeReload();

        if (window.renderArchiveGrid) {
            window.renderArchiveGrid(window.localFilesCache);
        }

        if (window.calculateStatistics) {
            window.calculateStatistics(window.localFilesCache);
        }

        showSuccess(`Upload ${files.length} file berhasil`);

        setTimeout(() => {
            if (progressBox) {
                progressBox.classList.add("hidden");
                progressBox.innerHTML = "";
            }
        }, 3000);

        const fileInput = document.getElementById("uploadFileInput");
        const fileInfo = document.getElementById("uploadFileInfo");

        if (fileInput) fileInput.value = "";
        if (fileInfo) fileInfo.textContent = "Belum ada file dipilih";

    } catch (err) {
        console.error(err);
        showError("Upload gagal");
    } finally {
        window.isUploading = false;
    }
}

export function setupDeleteArchive() {
    let isDeleting = false;

    const btn = document.getElementById("confirmDeleteBtn");
    if (!btn) return;

    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("confirmDeleteBtn");

    newBtn.addEventListener("click", async () => {
        if (isDeleting) return;

        deleteQueue = [];
        clearTimeout(deleteTimeout);

        isDeleting = true;

        const selectedFiles = window.selectedFiles;
        const progressBox = document.getElementById("deleteProgressBox");
        if (progressBox) {
            progressBox.innerHTML = "";
            progressBox.classList.remove("hidden");
        }

        try {
            for (const fileId of selectedFiles) {
                const item = document.createElement("div");
                item.className = "flex justify-between text-sm bg-slate-100 px-3 py-2 rounded";
                progressBox?.appendChild(item);

                try {

                    const data = window.selectedFilesData?.[fileId];

                    if (!data) {
                        item.innerHTML = `<span>data tidak ditemukan</span>`;
                        continue;
                    }

                    item.innerHTML = `
                    <span class="truncate">${data.fileName || data.nama || fileId}</span>
                    <span class="status flex items-center gap-1 text-xs text-blue-500">
                        <span class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                        menghapus...
                    </span>
                `;

                    const statusEl = item.querySelector(".status");

                    deleteQueue.push({
                        id: fileId,
                        data: data
                    });

                    const card = document.querySelector(`[data-id="${fileId}"]`);
                    if (card) {
                        card.classList.add("opacity-50", "pointer-events-none");
                        let oldLabel = card.querySelector(".text-red-500");
                        if (oldLabel) oldLabel.remove();

                        let label = document.createElement("div");
                        label.className = "text-xs text-red-500 mt-1";
                        label.innerText = "Menunggu dihapus... (Undo tersedia)";

                        card.appendChild(label);
                    }

                    if (statusEl) {
                        statusEl.textContent = "menunggu undo (5 detik)";
                        statusEl.classList.replace("text-blue-500", "text-yellow-500");
                    }

                } catch (err) {
                    console.error(err);
                    item.innerHTML = `
                    <span>${fileId}</span>
                    <span class="text-red-500 text-xs">gagal ❌</span>
                `;
                }
            }

            const undoBar = document.getElementById("undoBar");
            const undoText = document.getElementById("undoText");

            if (undoText) undoText.innerText = `${deleteQueue.length} file dihapus`;
            undoBar?.classList.remove("hidden");

            let countdown = 5;

            const interval = setInterval(() => {
                countdown--;

                if (undoText) {
                    undoText.innerText = `${deleteQueue.length} file dihapus (${countdown}s)`;
                }

                if (countdown <= 0) {
                    clearInterval(interval);
                }
            }, 1000);

            deleteTimeout = setTimeout(async () => {
                try {
                    console.log("Eksekusi delete permanen untuk:", deleteQueue);
                    const BATCH_LIMIT = 500;

                    const deletedNames = new Set(deleteQueue.map(d => d.data.nama));

                    for (let i = 0; i < deleteQueue.length; i += BATCH_LIMIT) {
                        const chunk = deleteQueue.slice(i, i + BATCH_LIMIT);
                        const batch = writeBatch(db);

                        for (const item of chunk) {
                            const fileRef = doc(db, "files", item.id);
                            batch.delete(fileRef);

                            if (item.data.filePath) {
                                safeDriveDelete(item.data.filePath);
                            }
                        }

                        await batch.commit();

                        window.localFilesCache = window.localFilesCache.filter(file =>
                            !deletedNames.has(file.nama)
                        );

                        await new Promise(res => setTimeout(res, 1000));
                    }

                    let totalDeleted = deleteQueue.length;
                    addLog("delete", `${totalDeleted} files`);

                    deleteQueue.forEach(item => {
                        const card = document.querySelector(`[data-id="${item.id}"]`);
                        if (card) card.remove();
                    });

                    deleteQueue = [];

                    document.getElementById("undoBar")?.classList.add("hidden");
                    document.getElementById("deleteProgressBox")?.classList.add("hidden");

                    document.getElementById("deleteModal")?.classList.add("hidden");

                    if (window.calculateStatistics) {
                        window.calculateStatistics(window.localFilesCache);
                    }

                    window.selectedFiles?.clear();

                } catch (err) {
                    console.error(err);
                    showError("Gagal hapus file");
                } finally {
                    isDeleting = false;
                }

            }, 5000);

        } catch (err) {
            console.error(err);
            showError("Terjadi kesalahan saat menghapus file");
        }

    });

}

export function openDeleteModal(fileId, fileName, filePath) {

    const modal = document.getElementById("deleteModal");
    const idInput = document.getElementById("deleteFileId");
    const pathInput = document.getElementById("deleteFilePath");
    const nameEl = document.getElementById("deleteFileName");

    if (idInput) idInput.value = fileId;
    if (pathInput) pathInput.value = filePath || "";
    if (nameEl) nameEl.innerText = fileName;
    if (modal) modal.classList.remove("hidden");
}

async function fileToBase64(file) {

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve(base64);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

async function safeDriveDelete(fileId) {
    try {
        await fetch(DRIVE_API, {
            method: "POST",
            body: new URLSearchParams({
                action: "delete",
                fileId
            })
        });
    } catch (err) {
        console.warn("Retry delete drive...");

        await new Promise(r => setTimeout(r, 3000));

        try {
            await fetch(DRIVE_API, {
                method: "POST",
                body: new URLSearchParams({
                    action: "delete",
                    fileId
                })
            });
        } catch (err2) {
            console.error("Drive delete gagal total:", err2);
        }
    }
}

export async function createFolder(name, parentId) {
    try {
        const ROOT_FOLDER_ID = "1uVhMkEfUQSdThilW6QDJeR2mqdLhkysy";

        let parentDriveId = ROOT_FOLDER_ID;

        if (parentId) {
            const snap = await getDoc(doc(db, "folders", parentId));

            if (!snap.exists()) {
                throw new Error("Parent folder tidak ditemukan");
            }

            parentDriveId = snap.data().driveFolderId;
        }

        const res = await fetch(DRIVE_API, {
            method: "POST",
            body: new URLSearchParams({
                action: "createFolder",
                name: name,
                parentId: parentDriveId || ""
            })
        });

        if (!res.ok) {
            throw new Error(`Koneksi Drive API Gagal: ${res.status}`);
        }

        const data = await res.json();

        if (!data.success || !data.folderId) {
            throw new Error("Gagal membuat folder di Google Drive");
        }

        await queueWrite(() =>
            safeWrite(() =>
                addDoc(collection(db, "folders"), {
                    name: name,
                    parentId: parentId || null,
                    driveFolderId: data.folderId,
                    createdAt: serverTimestamp()
                })
            )
        );

        window.openFolder(window.currentFolderId);

    } catch (err) {
        console.error("Create folder error:", err);
        showError("Gagal membuat folder");
    }
}

window.handleCreateFolder = async function () {
    if (isCreatingFolder) return;
    isCreatingFolder = true;

    try {
        const input = document.getElementById("folderName");
        const name = input?.value;

        if (!name) {
            alert("Nama folder kosong");
            return;
        }

        await createFolder(name, window.currentFolderId);

        if (input) input.value = "";

    } finally {
        isCreatingFolder = false;
    }
};

export function setupEditArchive() {

    const btn = document.getElementById("editModalSaveBtn");
    if (!btn) return;

    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("editModalSaveBtn");

    // ===============================
    // AUTO KATEGORI DARI FOLDER (UI ONLY)
    // ===============================
    const editFolder = document.getElementById("editFolder");
    const kategoriDisplay = document.getElementById("editKategoriDisplay");

    if (editFolder && kategoriDisplay) {

        const updateKategori = () => {
            const selectedOption = editFolder.options[editFolder.selectedIndex];
            kategoriDisplay.value = selectedOption?.textContent?.trim() || "";
        };

        editFolder.onchange = updateKategori;

        updateKategori();
    }

    // ===============================
    // SAVE EDIT
    // ===============================
    newBtn.addEventListener("click", async () => {

        if (window.isSaving) return;
        window.isSaving = true;

        const id = document.getElementById("editFileId")?.value;
        const judul = document.getElementById("editJudul")?.value.trim();

        const oldData = window.selectedFilesData?.[id];

        let kategori = oldData?.kategori || "umum";

        const folderSelect = document.getElementById("editFolder");

        if (folderSelect && folderSelect.value && folderSelect.value !== oldData?.folderId) {
            const selectedOption = folderSelect.options[folderSelect.selectedIndex];
            const folderName = selectedOption?.textContent?.trim();

            if (folderName) {
                kategori = folderName.toLowerCase();
            }
        }

        const tahun = document.getElementById("editTahun")?.value;
        const link = document.getElementById("editLink")?.value.trim();
        const folderRaw = document.getElementById("editFolder")?.value;

        const folder = folderRaw || oldData?.folderId || null;

        if (!id || !judul || !kategori || !tahun) {
            showError("Data belum lengkap!");
            window.isSaving = false;
            return;
        }

        try {

            await queueWrite(() =>
                safeWrite(() =>
                    updateDoc(doc(db, "files", id), {
                        nama: judul,
                        kategori: kategori.toLowerCase(),
                        tanggal: `${tahun}-01-01`,
                        spreadsheetLink: link || "",
                        folderId: folder || null
                    })
                )
            );

            addLog("edit", judul);

            document.getElementById("editModal")?.classList.add("hidden");

            showSuccess("Berhasil update!");

        } catch (err) {
            console.error("Update error:", err);
            showError("Gagal update!");
        } finally {

            setTimeout(() => {
                window.isSaving = false;
            }, 1500);
        }

    });
}