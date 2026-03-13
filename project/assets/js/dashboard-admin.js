import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===============================
// LOADING OVERLAY MANAGEMENT
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

import {
    collection,
    getDocs,
    getDoc,
    query,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    orderBy,
    limit,
    where,
    startAfter,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let selectedFileId = null;
let selectedAccessUsers = [];
let lastVisibleDoc = null;
let currentFilters = {};
let currentPageData = [];
let searchTimeout = null;
let currentPage = 1;
let selectedUploadFiles = [];
let selectedEditFiles = [];
let activeEditItem = null;
const PAGE_SIZE = 10;
const ACCEPTED_FILE_EXTENSIONS = ["xlsx", "csv", "pdf"];

// ===============================
// AMBIL FOLDER GOOGLE DRIVE DARI FIRESTORE
// ===============================
async function getDriveFolderId(kategori) {

    kategori = kategori.trim().toLowerCase();

    const folderRef = doc(db, "driveFolders", kategori);
    const folderSnap = await getDoc(folderRef);

    if (!folderSnap.exists()) {
        throw new Error("Folder mapping tidak ditemukan: " + kategori);
    }

    const data = folderSnap.data();

    console.log("Data Firestore:", data);

    const folderId = data.folderId;   // ambil dari Firestore

    console.log("FolderId:", folderId);

    return folderId;                  // kembalikan nilai

}

function isValidSpreadsheetLink(link) {
    if (!link) return false;

    try {
        const parsed = new URL(link);

        if (parsed.hostname !== "docs.google.com") return false;

        const spreadsheetPath = /^\/spreadsheets\/d\/[a-zA-Z0-9_-]+(\/.*)?$/;
        return spreadsheetPath.test(parsed.pathname);

    } catch {
        return false;
    }
}

function getFileExtension(fileName = "") {
    const parts = fileName.toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isAllowedArchiveFile(file) {
    if (!file) return false;
    return ACCEPTED_FILE_EXTENSIONS.includes(getFileExtension(file.name));
}

function sanitizeFileName(fileName = "file") {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toTitleCaseCategory(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
}

function isFileArchive(item) {
    return item?.sourceType === "file" || !!item?.fileUrl;
}

function getArchiveOpenLabel(item) {
    return isFileArchive(item) ? "⬇ Unduh" : "📄 Buka";
}

function getArchiveOpenUrl(item) {
    if (isFileArchive(item)) return item.fileUrl || "";
    return item.spreadsheetLink || item.driveFileId || "";
}

async function uploadArchiveFile(file, kategori) {

    // 1. Ambil folderId dulu
    const folderId = await getDriveFolderId(kategori);

    console.log("Kategori:", kategori);
    console.log("FolderId:", folderId);


    // 2. Baru proses file
    const reader = new FileReader();

    return new Promise((resolve, reject) => {

        reader.onload = async function () {

            try {

                const base64 = reader.result.split(",")[1];

                console.log("FolderId yang dikirim:", folderId);

                // 3. Baru kirim ke Apps Script
                const response = await fetch(
                    "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            folderId: folderId,
                            fileName: file.name,
                            mimeType: file.type,
                            fileData: base64
                        })
                    });

                const result = await response.json();

                console.log("Apps Script result:", result);

                resolve(result);

            } catch (err) {
                reject(err);
            }

        };

        reader.readAsDataURL(file);

    });

}

async function downloadArchiveToLocal(item) {

    const url = item?.fileUrl;

    if (!url) {
        alert("File arsip tidak ditemukan");
        return;
    }

    try {

        const a = document.createElement("a");

        a.href = url;
        a.target = "_blank";
        a.download = item.fileName || "arsip";

        document.body.appendChild(a);
        a.click();
        a.remove();

    } catch (error) {

        console.error("Download error:", error);
        alert("Gagal membuka file arsip");

    }
}

function updateFileFieldInfo(infoId, file) {
    const infoEl = document.getElementById(infoId);
    if (!infoEl) return;

    if (!file) {
        infoEl.textContent = "Belum ada file dipilih (.xlsx, .csv, atau .pdf)";
        return;
    }

    infoEl.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
}

function setInlineError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
}

function setButtonDisabledState(buttonId, disabled) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    if (disabled) {
        btn.setAttribute("disabled", "true");
        btn.classList.add("opacity-50", "cursor-not-allowed");
        return;
    }

    btn.removeAttribute("disabled");
    btn.classList.remove("opacity-50", "cursor-not-allowed");
}

function isValidYearValue(year) {
    const value = Number(year);
    return Number.isInteger(value) && value >= 1900 && value <= 2100;
}

function evaluateUploadFormState() {
    const judul = document.getElementById("judul")?.value.trim() || "";
    const kategori = document.getElementById("kategori")?.value.trim() || "";
    const tahun = document.getElementById("tahun")?.value || "";
    const link = document.getElementById("link")?.value.trim() || "";
    const hasFile = selectedUploadFiles.length > 0;
    const hasLink = !!link;
    const validLink = hasLink && isValidSpreadsheetLink(link);

    setInlineError("uploadLinkError", hasLink && !validLink ? "Link spreadsheet tidak valid. Gunakan URL Google Sheets yang benar." : "");
    setInlineError("uploadSourceError", !hasFile && !hasLink ? "Isi link spreadsheet yang valid atau upload file (.xlsx, .csv, atau .pdf)." : "");

    const canSave =
        !!judul &&
        !!kategori &&
        isValidYearValue(tahun) &&
        (hasFile || validLink);

    setButtonDisabledState("saveArchiveBtn", !canSave);
    return canSave;
}

function evaluateEditFormState() {
    const judul = document.getElementById("editJudul")?.value.trim() || "";
    const kategori = document.getElementById("editKategori")?.value.trim() || "";
    const tahun = document.getElementById("editTahun")?.value || "";
    const link = document.getElementById("editLink")?.value.trim() || "";
    const hasNewFile = selectedEditFiles.length > 0;
    const hasLink = !!link;
    const validLink = hasLink && isValidSpreadsheetLink(link);
    const currentIsFile = isFileArchive(activeEditItem);

    setInlineError("editLinkError", hasLink && !validLink ? "Link spreadsheet tidak valid. Gunakan URL Google Sheets yang benar." : "");
    setInlineError("editSourceError", !hasNewFile && !hasLink && !currentIsFile ? "Isi link spreadsheet yang valid atau upload file (.xlsx, .csv, atau .pdf)." : "");

    const canSave =
        !!judul &&
        !!kategori &&
        isValidYearValue(tahun) &&
        (hasNewFile || validLink || currentIsFile);

    setButtonDisabledState("editModalSaveBtn", !canSave);
    return canSave;
}

function setupFormRealtimeValidation() {
    const uploadFieldIds = ["judul", "kategori", "tahun", "link"];
    uploadFieldIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", evaluateUploadFormState);
        el.addEventListener("change", evaluateUploadFormState);
    });

    const editFieldIds = ["editJudul", "editKategori", "editTahun", "editLink"];
    editFieldIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", evaluateEditFormState);
        el.addEventListener("change", evaluateEditFormState);
    });

    evaluateUploadFormState();
    evaluateEditFormState();
}

function bindFileDropzone({ dropzoneId, inputId, infoId, clearId, onFileSelected }) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const clearBtn = document.getElementById(clearId);

    if (!dropzone || !input) return;

    const setFile = (file) => {
        if (!file) {
            onFileSelected([]);
            updateFileFieldInfo(infoId, null);
            return;
        }

        if (!isAllowedArchiveFile(file)) {
            alert("Format file harus .xlsx, .csv, atau .pdf");
            input.value = "";
            return;
        }

        onFileSelected(file ? [file] : []);
        updateFileFieldInfo(infoId, file);
    };

    input.addEventListener("change", (event) => {

        const files = [...event.target.files];

        if (!files.length) return;

        onFileSelected(files);

        updateFileFieldInfo(infoId, files[0]);

    });

    dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("ring-2", "ring-primary");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("ring-2", "ring-primary");
    });

    dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("ring-2", "ring-primary");
        const droppedFiles = [...event.dataTransfer.files].filter(isAllowedArchiveFile);

        if (!droppedFiles.length) {
            alert("Format file harus .xlsx, .csv, atau .pdf");
            return;
        }

        onFileSelected(droppedFiles);
        updateFileFieldInfo(infoId, droppedFiles[0]);
    });

    clearBtn?.addEventListener("click", () => {
        input.value = "";
        setFile(null);
    });
}

function setupFileDropzones() {
    bindFileDropzone({
        dropzoneId: "uploadFileDropzone",
        inputId: "uploadFileInput",
        infoId: "uploadFileInfo",
        clearId: "uploadFileClearBtn",
        onFileSelected: (files) => {
            selectedUploadFiles = files;
            evaluateUploadFormState();
        }
    });

    bindFileDropzone({
        dropzoneId: "editFileDropzone",
        inputId: "editFileInput",
        infoId: "editFileInfo",
        clearId: "editFileClearBtn",
        onFileSelected: (files) => {
            selectedEditFiles = files;
            evaluateEditFormState();
        }
    });
}

// ===============================
// AUTH CHECK (ROLE BASED)
// ===============================
onAuthStateChanged(auth, async (user) => {
    try {
        if (!user) {
            window.location.href = "../index.html";
            return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            window.location.href = "../index.html";
            return;
        }

        const data = userSnap.data();
        const role = data.role?.toLowerCase();

        // ===============================
        // RECORD LOGIN ACTIVITY (ADMIN)
        // ===============================
        if (!sessionStorage.getItem("loginRecorded")) {

            await addDoc(collection(db, "activityLogs"), {
                uid: user.uid,
                userEmail: user.email,
                action: "login_admin",
                fileName: "-",
                status: "success",
                timestamp: serverTimestamp()
            });

            sessionStorage.setItem("loginRecorded", "true");
        }

        // tampilkan profil admin
        const nameEl = document.getElementById("adminName");
        if (nameEl) nameEl.innerText = data.name || "Administrator";
        const emailEl = document.getElementById("adminEmail");
        if (emailEl) emailEl.innerText = data.email || user.email;

        if (role !== "admin") {
            window.location.href = "../index.html";
            return;
        }

        try {
            await Promise.all([
                loadArchiveData(),
                generateFilterOptions(),
                loadDashboardStats(),
                loadActivityLogs()
            ]);
        } catch (error) {
            console.error("Initialization error:", error);
        }

        setupUpload();
        setupLogout();
        setupFilters();
        setupAccessSave();
        setupAddUserButton();
        setupEditModalSave();
        setupDeleteModal();
        setupFileDropzones();
        setupFormRealtimeValidation();
        hideLoading();

    } catch (err) {
        console.error("Auth error:", err);
        hideLoading();
        window.location.href = "../index.html";
    }
});


// ===============================
// LOAD FILES
// ===============================
async function loadArchiveData(filters = {}, reset = true) {
    const tableBody = document.querySelector("#archiveTable tbody");
    if (!tableBody) return;

    if (reset) {
        tableBody.innerHTML = `
            <tr>
            <td colspan="6" class="px-6 py-6 text-center text-slate-400 animate-pulse">
            Loading data arsip...
            </td>
            </tr>
            `;
        lastVisibleDoc = null;
        const nextBtn = document.getElementById("nextPageBtn");
        nextBtn?.removeAttribute("disabled");
    }

    let constraints = [
        orderBy("tanggal", "desc"),
        limit(PAGE_SIZE)
    ];

    if (filters.year) {
        constraints.push(
            where("tanggal", ">=", filters.year + "-01-01"),
            where("tanggal", "<=", filters.year + "-12-31")
        );
    }

    if (filters.category) {
        constraints.push(
            where("kategori", "==", filters.category)
        );
    }

    let q;

    if (!reset && lastVisibleDoc) {
        q = query(
            collection(db, "files"),
            ...constraints,
            startAfter(lastVisibleDoc)
        );
    } else {
        q = query(
            collection(db, "files"),
            ...constraints
        );
    }

    let snapshot;

    try {
        snapshot = await getDocs(q);
    } catch (error) {
        console.error("Firestore Query Error:", error);
        tableBody.innerHTML =
            "<tr><td colspan='6' class='px-6 py-4 text-center text-red-500'>Terjadi kesalahan mengambil data</td></tr>";
        return;
    }

    console.log("QUERY RESULT SIZE:", snapshot.size);

    // ===== HITUNG TOTAL DATA (SERVER SIDE) =====
    const totalEl = document.getElementById("totalArsip");

    if (totalEl && reset) {
        try {
            const countSnapshot = await getCountFromServer(
                query(collection(db, "files"))
            );
            totalEl.textContent = countSnapshot.data().count;
        } catch (error) {
            console.error("Count error:", error);
        }
    }

    if (snapshot.empty) {
        if (reset) {
            tableBody.innerHTML =
                "<tr><td colspan='6' class='px-6 py-4 text-center'>Tidak ada data</td></tr>";
        }

        const nextBtn = document.getElementById("nextPageBtn");
        nextBtn?.setAttribute("disabled", "true");

        return;
    }

    const nextBtn = document.getElementById("nextPageBtn");

    if (snapshot.size < PAGE_SIZE) {
        nextBtn?.setAttribute("disabled", "true");
    } else {
        nextBtn?.removeAttribute("disabled");
    }

    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

    const pageData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
    }));

    currentPageData = pageData;
    const info = document.getElementById("tableInfo");

    if (info) {
        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = start + pageData.length - 1;

        const totalEl = document.getElementById("totalArsip");
        const total = totalEl ? totalEl.innerText : end;

        info.innerText = `Showing ${start} to ${end} of ${total} results`;
    }

    renderTable(pageData, reset);
}

// ===============================
// RENDER TABLE
// ===============================
function renderTable(data, reset = true) {

    const tableBody = document.querySelector("#archiveTable tbody");
    if (!tableBody) return;

    if (reset) {
        tableBody.innerHTML = "";
    }

    if (data.length === 0 && reset) {
        tableBody.innerHTML =
            "<tr><td colspan='6' class='px-6 py-4 text-center'>Data tidak ditemukan</td></tr>";
        return;
    }

    if (reset) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    let no = tableBody.querySelectorAll("tr").length + 1;

    data.forEach(item => {

        let tahun = "-";

        if (item.tanggal) {
            tahun = item.tanggal.split("-")[0];
        } else if (item.year) {
            tahun = item.year;
        }

        const row = document.createElement("tr");
        row.className = "fade-row hover:bg-slate-50 transition";
        row.innerHTML = `
            <td class="px-6 py-4">${no}</td>
            <td class="px-6 py-4 font-medium">${item.nama || item.name || item.Judul || "-"}</td>
            <td class="px-6 py-4">${tahun}</td>
            <td class="px-6 py-4">${item.kategori || "-"}</td>
            <td class="px-6 py-4">${renderAccessUsers(item.allowedUsers)}</td>
                <td class="px-6 py-4">

                <div class="flex flex-wrap gap-2 justify-end">

                <button class="edit-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition">

                ✏️ Edit

                </button>

                <button class="delete-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition">

                🗑 Hapus

                </button>

                <button class="manage-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition">

                👥 Access

                </button>

                <button class="open-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition ${getArchiveOpenUrl(item) ? "" : "opacity-50 cursor-not-allowed"}">
                ${getArchiveOpenLabel(item)}
                </button>

                </div>
            </td>
        `;

        tableBody.appendChild(row);

        // ===============================
        // MANAGE ACCESS
        // ===============================
        row.querySelector(".manage-btn").addEventListener("click", () => {

            selectedFileId = item.id;
            selectedAccessUsers = item.allowedUsers ? [...item.allowedUsers] : [];
            openAccessModal();

        });


        // ===============================
        // DELETE FILE
        // ===============================
        row.querySelector(".delete-btn")?.addEventListener("click", () => {
            document.getElementById("deleteFileId").value = item.id;
            document.getElementById("deleteFilePath").value = item.filePath || "";
            document.getElementById("deleteFileName").textContent = item.nama || item.name || item.Judul || "arsip";
            document.getElementById("deleteModal").classList.remove("hidden");
        });


        // ===============================
        // EDIT FILE
        // ===============================
        row.querySelector(".edit-btn")?.addEventListener("click", () => {
            activeEditItem = item;
            document.getElementById("editFileId").value = item.id;
            document.getElementById("editJudul").value = item.nama || item.name || item.Judul || "";

            let tahun = "-";
            if (item.tanggal) {
                tahun = item.tanggal.split("-")[0];
            } else if (item.year) {
                tahun = item.year;
            }
            document.getElementById("editTahun").value = tahun;

            const kategoriValue = toTitleCaseCategory(item.kategori || "");
            document.getElementById("editKategori").value = kategoriValue;
            document.getElementById("editLink").value = item.spreadsheetLink || item.driveFileId || "";

            selectedEditFiles = [];
            const editInput = document.getElementById("editFileInput");
            if (editInput) editInput.value = "";
            updateFileFieldInfo("editFileInfo", null);
            if (isFileArchive(item) && item.fileName) {
                const editFileInfo = document.getElementById("editFileInfo");
                if (editFileInfo) editFileInfo.textContent = `File saat ini: ${item.fileName}`;
            }

            evaluateEditFormState();

            document.getElementById("editModal").classList.remove("hidden");
        });

        row.querySelector(".open-btn")?.addEventListener("click", async () => {

            const openUrl = getArchiveOpenUrl(item);
            if (!openUrl) return;

            await addDoc(collection(db, "activityLogs"), {
                uid: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                action: "open_file",
                fileName: item.nama || item.name || item.Judul || "-",
                status: "success",
                timestamp: serverTimestamp()
            });

            if (isFileArchive(item)) {
                await downloadArchiveToLocal(item);
                return;
            }

            window.open(openUrl, "_blank");

        });

        no++;

    });

}

// ===============================
// RENDER ACCESS COUNT
// ===============================
function renderAccessUsers(allowedUsers) {

    if (!allowedUsers || allowedUsers.length === 0) {
        return `<span class="text-xs text-gray-500">Private</span>`;
    }

    return `<span class="text-xs text-indigo-600">
        ${allowedUsers.length} User
    </span>`;
}


// ===============================
// UPLOAD FILE METADATA
// ===============================
function setupUpload() {

    const saveBtn = document.getElementById("saveArchiveBtn");
    if (!saveBtn) return;

    saveBtn.replaceWith(saveBtn.cloneNode(true));
    const newSaveBtn = document.getElementById("saveArchiveBtn");

    newSaveBtn.addEventListener("click", async () => {

        const progressBox = document.getElementById("uploadProgressBox");
        if (progressBox) progressBox.classList.remove("hidden");

        try {

            if (!evaluateUploadFormState()) {
                alert("Data belum valid. Periksa kembali link/file dan field wajib.");
                return;
            }

            const judul = document.getElementById("judul").value.trim();
            const kategori = document.getElementById("kategori").value.toLowerCase();
            console.log("Kategori yang dikirim:", kategori);
            const tahun = document.getElementById("tahun").value;
            const link = document.getElementById("link").value.trim();
            const hasLink = !!link;
            const hasFile = selectedUploadFiles.length > 0;

            if (!judul || !kategori || !tahun) {
                alert("Semua field wajib diisi");
                return;
            }

            if (!hasLink && !hasFile) {
                alert("Isi link spreadsheet atau upload file (.xlsx, .csv, atau .pdf)");
                return;
            }

            if (hasLink && !isValidSpreadsheetLink(link)) {
                alert("Link spreadsheet tidak valid. Gunakan format Google Sheets yang benar.");
                return;
            }

            if (tahun < 1900 || tahun > 2100) {
                alert("Tahun tidak valid");
                return;
            }

            const user = auth.currentUser;

            if (selectedUploadFiles.length > 0) {

                for (const file of selectedUploadFiles) {

                    const filePayload = await uploadArchiveFile(file, kategori);

                    const newArchivePayload = {
                        nama: judul,
                        kategori: kategori,
                        tanggal: new Date().toISOString().split("T")[0],
                        createdBy: user.uid,
                        allowedUsers: [user.uid],
                        createdAt: serverTimestamp(),

                        spreadsheetLink: "",
                        driveFileId: filePayload.fileId || "",
                        sourceType: "file",

                        fileUrl: filePayload.url || "",
                        filePath: filePayload.fileId || "",
                        fileName: file.name,
                        fileType: file.type
                    };

                    const newDoc = await addDoc(collection(db, "files"), newArchivePayload);

                    await addDoc(collection(db, "activityLogs"), {
                        uid: user.uid,
                        userEmail: user.email,
                        action: "upload",
                        fileName: file.name,
                        status: "success",
                        fileId: newDoc.id,
                        timestamp: serverTimestamp()
                    });

                }

            }

            await loadArchiveData(currentFilters, true);
            await loadDashboardStats();

            document.getElementById("uploadModal").classList.add("hidden");
            document.getElementById("judul").value = "";
            document.getElementById("kategori").value = "";
            document.getElementById("tahun").value = "";
            document.getElementById("link").value = "";
            const uploadInput = document.getElementById("uploadFileInput");
            if (uploadInput) uploadInput.value = "";
            selectedUploadFiles = [];
            updateFileFieldInfo("uploadFileInfo", null);
            showToast("Upload berhasil");

        } catch (err) {
            console.error("Upload error:", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);

            let errorMsg = "Upload gagal. Periksa kembali data dan coba lagi.";

            if (err.code === "permission-denied") {
                errorMsg = "Permission denied. Pastikan Anda login sebagai admin dan Firestore rules mengizinkan create file.";
            } else if (err.code === "unauthenticated") {
                errorMsg = "Anda tidak authenticated. Silakan login kembali.";
            } else if (err.message?.includes("storage")) {
                errorMsg = "Gagal upload file ke storage. Periksa ukuran file dan koneksi.";
            }

            alert(errorMsg);
        } finally {
            if (progressBox) progressBox.classList.add("hidden");
        }
    });

}

// ===============================
// ACTIVITY LOGS
// ===============================
async function loadActivityLogs() {
    const tableBody = document.querySelector("#activityLogBody");
    if (!tableBody) return;

    try {
        tableBody.innerHTML = "";

        const validLogs = [];
        let cursorDoc = null;
        const FETCH_SIZE = 25;

        // Keep fetching in chunks until we have 10 valid rows or data is exhausted.
        while (validLogs.length < 10) {
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

            snapshot.forEach(docSnap => {
                if (validLogs.length >= 10) return;

                const log = docSnap.data();

                // Samakan filter dengan halaman full log.
                if (!log.userEmail || !log.action) {
                    return;
                }

                validLogs.push(log);
            });

            cursorDoc = snapshot.docs[snapshot.docs.length - 1] || null;

            if (snapshot.size < FETCH_SIZE) {
                break;
            }
        }

        if (validLogs.length === 0) {
            tableBody.innerHTML =
                "<tr><td colspan='5' class='px-6 py-4 text-center text-slate-400'>Belum ada aktivitas</td></tr>";
            return;
        }

        validLogs.forEach(log => {
            const date = log.timestamp?.toDate
                ? log.timestamp.toDate()
                : null;

            const row = document.createElement("tr");

            row.innerHTML = `
                <td class="px-6 py-3">${date ? date.toLocaleString("id-ID") : "-"}</td>
                <td class="px-6 py-3">${log.userEmail || "-"}</td>
                <td class="px-6 py-3">${log.action || "-"}</td>
                <td class="px-6 py-3">${log.fileName || "-"}</td>
                <td class="px-6 py-3 text-green-600">${log.status || "Success"}</td>
            `;

            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Activity logs error:", error);
        const tableBody = document.querySelector("#activityLogBody");
        if (tableBody) {
            tableBody.innerHTML =
                "<tr><td colspan='5' class='px-6 py-4 text-center text-red-500'>Gagal memuat aktivitas</td></tr>";
        }
    }
}

// ===============================
// ACCESS MANAGEMENT
// ===============================
async function openAccessModal() {

    const listContainer = document.getElementById("accessUserList");
    listContainer.innerHTML = "";

    const snapshot = await getDocs(collection(db, "users"));

    snapshot.forEach(docSnap => {

        const uid = docSnap.id;
        const user = docSnap.data();

        const isActive = selectedAccessUsers.includes(uid);

        const div = document.createElement("div");
        div.className =
            "flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition";

        div.innerHTML = `
        <div>
        <p class="text-sm font-medium">${user.name}</p>
        <p class="text-xs text-slate-500">${user.email}</p>
        </div>

        ${isActive
                ? `<span class="text-green-600 text-sm font-semibold">✔</span>`
                : `<span class="text-slate-400 text-sm">+</span>`}
        `;

        div.addEventListener("click", () => {
            toggleUserAccess(uid);
            openAccessModal();
        });

        listContainer.appendChild(div);
    });

    document.getElementById("accessModal").classList.remove("hidden");
}

function toggleUserAccess(uid) {

    if (selectedAccessUsers.includes(uid)) {
        selectedAccessUsers =
            selectedAccessUsers.filter(id => id !== uid);
        console.log("Access removed:", uid);
    } else {
        selectedAccessUsers.push(uid);
        console.log("Access added:", uid);
    }
}

function setupAccessSave() {

    const btn = document.getElementById("accessModalSaveBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {

        if (!selectedFileId) {
            alert("No file selected");
            return;
        }

        try {
            // Validasi data sebelum update
            if (!Array.isArray(selectedAccessUsers)) {
                console.error("Invalid selectedAccessUsers:", selectedAccessUsers);
                alert("Error: Invalid access users data. Please try again.");
                return;
            }

            console.log("Updating file permissions:", {
                fileId: selectedFileId,
                allowedUsers: selectedAccessUsers,
                currentUser: auth.currentUser?.uid
            });

            // Update document dengan error handling lebih baik
            const fileRef = doc(db, "files", selectedFileId);

            // Cek apakah document ada sebelum update
            const fileSnap = await getDoc(fileRef);
            if (!fileSnap.exists()) {
                alert("File not found");
                return;
            }

            // Update dengan explicit field
            await updateDoc(fileRef, {
                allowedUsers: selectedAccessUsers,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser.uid
            });

            // ambil nama file
            const fileData = fileSnap.data();

            // buat log activity
            await addDoc(collection(db, "activityLogs"), {
                uid: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                action: "manage_access",
                fileName: fileData.nama || "-",
                fileId: selectedFileId,
                status: "success",
                timestamp: serverTimestamp()
            });

            document.getElementById("accessModal").classList.add("hidden");
            showSuccessModal("Hak akses berhasil diperbarui");
            await loadArchiveData(currentFilters, true);

        } catch (error) {
            console.error("Access save error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);

            let errorMsg = "Gagal mengupdate hak akses";

            if (error.code === "permission-denied") {
                errorMsg = "Permission denied. Pastikan Anda login sebagai admin dan Firestore rules mengizinkan operasi ini.";
            } else if (error.code === "not-found") {
                errorMsg = "File tidak ditemukan";
            }

            alert(errorMsg);
        }
    });
}

// ===============================
// EDIT MODAL SAVE
// ===============================
function setupEditModalSave() {
    const btn = document.getElementById("editModalSaveBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        if (!evaluateEditFormState()) {
            alert("Data belum valid. Periksa kembali link/file dan field wajib.");
            return;
        }

        const fileId = document.getElementById("editFileId").value;
        const judul = document.getElementById("editJudul").value.trim();
        const kategori = document.getElementById("editKategori").value.trim().toLowerCase();
        const tahun = document.getElementById("editTahun").value;
        const link = document.getElementById("editLink").value.trim();
        const hasLink = !!link;
        const hasNewFile = selectedEditFiles.length > 0;

        if (!judul || !kategori || !tahun) {
            alert("Semua field wajib diisi");
            return;
        }

        if (hasLink && !isValidSpreadsheetLink(link)) {
            alert("Link spreadsheet tidak valid. Gunakan format Google Sheets yang benar.");
            return;
        }

        const currentIsFile = isFileArchive(activeEditItem);
        if (!hasLink && !hasNewFile && !currentIsFile) {
            alert("Isi link spreadsheet atau upload file .xlsx, .csv, atau .pdf");
            return;
        }

        if (tahun < 1900 || tahun > 2100) {
            alert("Tahun tidak valid");
            return;
        }

        try {
            const updatePayload = {
                nama: judul,
                kategori: kategori,
                tanggal: tahun + "-01-01",
                spreadsheetLink: hasLink ? link : "",
                driveFileId: hasLink ? link : ""
            };

            if (hasNewFile) {


                // hapus file lama di drive
                if (activeEditItem?.filePath) {

                    await fetch("https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec", {
                        method: "POST",
                        body: JSON.stringify({
                            action: "delete",
                            fileId: activeEditItem.filePath
                        })
                    });

                }

                const file = selectedEditFiles[0];

                const uploadedFile = await uploadArchiveFile(file, kategori);

                updatePayload.fileUrl = uploadedFile.fileUrl || uploadedFile.url || "";
                updatePayload.filePath = uploadedFile.filePath || uploadedFile.fileId || "";
                updatePayload.fileName = uploadedFile.fileName || file.name;
                updatePayload.fileType = uploadedFile.fileType || file.type;

            } else if (hasLink) {

                updatePayload.sourceType = "link";
                updatePayload.fileUrl = "";
                updatePayload.filePath = "";
                updatePayload.fileName = "";
                updatePayload.fileType = "";
            }

            await updateDoc(doc(db, "files", fileId), updatePayload);

            await addDoc(collection(db, "activityLogs"), {
                uid: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                action: "edit",
                fileName: judul,
                status: "success",
                fileId: fileId,
                timestamp: serverTimestamp()
            });

            document.getElementById("editModal").classList.add("hidden");
            const editFileInput = document.getElementById("editFileInput");
            if (editFileInput) editFileInput.value = "";
            selectedEditFiles = [];
            activeEditItem = null;
            updateFileFieldInfo("editFileInfo", null);
            showSuccessModal("Arsip berhasil diperbarui");
            await loadArchiveData(currentFilters, true);
            await loadDashboardStats();

        } catch (err) {
            console.error("Edit error:", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);

            let errorMsg = "Gagal mengedit arsip. Periksa kembali data dan coba lagi.";

            if (err.code === "permission-denied") {
                errorMsg = "Permission denied. Pastikan Anda login sebagai admin dan Firestore rules mengizinkan update file.";
            } else if (err.code === "not-found") {
                errorMsg = "File tidak ditemukan";
            } else if (err.message?.includes("storage")) {
                errorMsg = "Gagal upload file ke storage. Periksa ukuran file dan koneksi.";
            }

            alert(errorMsg);
        }
    });
}

// ===============================
// DELETE MODAL CONFIRM
// ===============================
function setupDeleteModal() {
    const btn = document.getElementById("confirmDeleteBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const fileId = document.getElementById("deleteFileId").value;
        const fileName = document.getElementById("deleteFileName").textContent;
        const filePath = document.getElementById("deleteFilePath").value;

        try {

            await fetch("https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec", {
                method: "POST",
                body: JSON.stringify({
                    action: "delete",
                    fileId: filePath
                })
            });

            await deleteDoc(doc(db, "files", fileId));

            await addDoc(collection(db, "activityLogs"), {
                uid: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                action: "delete",
                fileName: fileName,
                status: "success",
                fileId: fileId,
                timestamp: serverTimestamp()
            });

            document.getElementById("deleteModal").classList.add("hidden");
            showSuccessModal("Arsip berhasil dihapus");
            await loadArchiveData(currentFilters, true);
            await loadDashboardStats();

        } catch (err) {
            console.error("Delete error:", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);

            let errorMsg = "Gagal menghapus arsip. Periksa kembali dan coba lagi.";

            if (err.code === "permission-denied") {
                errorMsg = "Permission denied. Pastikan Anda login sebagai admin dan Firestore rules mengizinkan delete file.";
            } else if (err.code === "not-found") {
                errorMsg = "File tidak ditemukan";
            }

            alert(errorMsg);
        }
    });
}

// ===============================
// SUCCESS MODAL
// ===============================
function showSuccessModal(message) {
    document.getElementById("successModalMessage").textContent = message;
    document.getElementById("successModal").classList.remove("hidden");

    document.getElementById("successModalCloseBtn").replaceWith(document.getElementById("successModalCloseBtn").cloneNode(true));
    const closeBtn = document.getElementById("successModalCloseBtn");

    closeBtn.addEventListener("click", () => {
        document.getElementById("successModal").classList.add("hidden");
    });

    setTimeout(() => {
        document.getElementById("successModal").classList.add("hidden");
    }, 3000);
}

// ===============================
// LOGOUT
// ===============================
function setupLogout() {

    const logoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {

            // reset login session
            sessionStorage.removeItem("loginRecorded");

            await signOut(auth);

            window.location.href = "../index.html";
        });
    }
}

// ===============================
// FILTER
// ===============================
function setupFilters() {

    const yearFilter = document.getElementById("yearFilter");
    const categoryFilter = document.getElementById("categoryFilter");

    if (!yearFilter || !categoryFilter) return;

    async function applyFilters() {

        currentPage = 1;

        currentFilters = {
            year: yearFilter.value || null,
            category: categoryFilter.value
                ? categoryFilter.value.toLowerCase()
                : null
        };

        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = "";

        await loadArchiveData(currentFilters, true);
    }

    yearFilter.addEventListener("change", applyFilters);
    categoryFilter.addEventListener("change", applyFilters);

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", () => {

            clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {

                const keyword = searchInput.value.toLowerCase();

                const filtered = currentPageData.filter(item => {

                    const title =
                        (item.nama ||
                            item.name ||
                            item.Judul ||
                            "").toLowerCase();

                    return title.includes(keyword);

                });

                renderTable(filtered, true);

            }, 300);
        });
    }
}

//==============================
//USER BUTTON
//==============================    
function setupAddUserButton() {

    const addBtn = document.getElementById("addUserToAccessBtn");
    const searchInput = document.getElementById("accessUserSearch");

    if (!addBtn || !searchInput) return;

    addBtn.addEventListener("click", async () => {

        const keyword = searchInput.value.trim().toLowerCase();
        if (!keyword) return;

        const snapshot = await getDocs(collection(db, "users"));

        snapshot.forEach(docSnap => {

            const uid = docSnap.id;
            const user = docSnap.data();

            const match =
                user.name?.toLowerCase().includes(keyword) ||
                user.email?.toLowerCase().includes(keyword);

            if (match && !selectedAccessUsers.includes(uid)) {
                selectedAccessUsers.push(uid);
            }
        });

        searchInput.value = "";
        openAccessModal();
    });
}

async function generateFilterOptions() {
    try {
        const snapshot = await getDocs(
            query(collection(db, "files"), limit(100))
        );

        const yearSet = new Set();
        const categorySet = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();

            if (data.tanggal) {
                yearSet.add(data.tanggal.split("-")[0]);
            }

            if (data.kategori) {
                categorySet.add(data.kategori.trim());
            }
        });

        const yearFilter = document.getElementById("yearFilter");
        const categoryFilter = document.getElementById("categoryFilter");

        if (yearFilter) {
            yearFilter.innerHTML = `<option value="">Semua Tahun</option>`;
            [...yearSet].sort((a, b) => b - a).forEach(year => {
                yearFilter.innerHTML += `<option value="${year}">${year}</option>`;
            });
        }

        if (categoryFilter) {
            categoryFilter.innerHTML = `<option value="">Semua Kategori</option>`;
            [...categorySet].sort().forEach(cat => {
                categoryFilter.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
        }
    } catch (error) {
        console.error("Generate filter options error:", error);
    }
}

function showToast(message) {

    const toast = document.createElement("div");

    toast.className =
        "fixed top-5 right-5 bg-green-500 text-white px-4 py-2 rounded shadow z-50";

    toast.innerText = message;

    const container = document.getElementById("toastContainer");

    if (container) {
        container.appendChild(toast);
    } else {
        document.body.appendChild(toast);
    }

    setTimeout(() => {
        toast.remove();
    }, 3000);

}

async function loadDashboardStats() {
    try {
        const countSnapshot = await getCountFromServer(
            query(collection(db, "files"))
        );

        const totalFiles = countSnapshot.data().count;

        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();

        let monthlyCount = 0;
        const categoryMap = {};

        const snapshot = await getDocs(
            query(collection(db, "files"), limit(500))
        );

        const data = [];

        snapshot.forEach(doc => {
            data.push(doc.data());
        });

        data.forEach(item => {
            if (item.tanggal) {
                const d = new Date(item.tanggal + "T00:00:00");

                if (d.getMonth() === month && d.getFullYear() === year) {
                    monthlyCount++;
                }
            }

            if (item.kategori) {
                categoryMap[item.kategori] =
                    (categoryMap[item.kategori] || 0) + 1;
            }
        });

        const monthlyEl = document.getElementById("monthlyCount");
        if (monthlyEl) monthlyEl.innerText = monthlyCount;

        let topCategory = "-";
        let max = 0;

        for (const cat in categoryMap) {
            if (categoryMap[cat] > max) {
                max = categoryMap[cat];
                topCategory = cat;
            }
        }

        const topCatEl = document.getElementById("topCategory");
        if (topCatEl) topCatEl.innerText = topCategory;

    } catch (error) {
        console.error("Dashboard stats error:", error);
        const monthlyEl = document.getElementById("monthlyCount");
        if (monthlyEl) monthlyEl.innerText = "0";
        const topCatEl = document.getElementById("topCategory");
        if (topCatEl) topCatEl.innerText = "-";
    }
}

async function backupData() {

    const snapshot = await getDocs(collection(db, "files"));

    const data = [];

    snapshot.forEach(docSnap => {
        data.push({
            id: docSnap.id,
            ...docSnap.data()
        });
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = `backup_arsip_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

}

async function exportLogs() {

    const snapshot = await getDocs(
        query(collection(db, "activityLogs"), orderBy("timestamp", "desc"))
    );

    let csv = "Timestamp,User,Action,File,Status\n";

    snapshot.forEach(doc => {

        const log = doc.data();
        const date = log.timestamp?.toDate
            ? log.timestamp.toDate()
            : null;

        csv += `"${date?.toLocaleString("id-ID")}","${log.userEmail}","${log.action}","${log.fileName}","${log.status}"\n`;

    });

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "activity_logs.csv";
    a.click();

}

window.exportLogs = exportLogs;

window.backupData = backupData;

// ===============================
// EVENT LISTENERS WITH SAFETY CHECKS
// ===============================
const backupBtn = document.getElementById("backupBtn");
if (backupBtn) {
    backupBtn.addEventListener("click", () => {
        backupData();
    });
}

const nextPageBtn = document.getElementById("nextPageBtn");
if (nextPageBtn) {
    nextPageBtn.addEventListener("click", async () => {
        currentPage++;
        await loadArchiveData(currentFilters, false);
    });
}

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
// EMERGENCY FALLBACK - AUTO HIDE OVERLAY
// ===============================
setTimeout(() => {
    const loader = document.getElementById("loadingOverlay");
    if (loader && !loader.classList.contains("hidden")) {
        console.warn("Emergency fallback: Hiding loading overlay");
        loader.classList.add("hidden");
    }
}, 4000);

// ===============================
// IMPORT CSV MASSAL
// ===============================

async function importCSV(file) {

    try {

        const text = await file.text();
        const rows = text.trim().split(/\r?\n/);

        for (let i = 1; i < rows.length; i++) {

            const cols = rows[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);

            if (!cols || cols.length < 4) continue;

            const judul = cols[0]?.replace(/"/g, "").trim();
            const tahun = cols[1]?.replace(/"/g, "").trim();
            const kategori = cols[2]?.replace(/"/g, "").trim().toLowerCase();
            const link = cols[3]?.replace(/"/g, "").trim();

            if (!judul || !tahun || !kategori || !link) continue;

            const payload = {

                nama: judul,
                kategori: kategori,
                tanggal: tahun + "-01-01",
                createdBy: auth.currentUser.uid,
                allowedUsers: [auth.currentUser.uid],
                createdAt: serverTimestamp(),

                spreadsheetLink: link,
                driveFileId: link,
                sourceType: "link",

                fileUrl: "",
                filePath: "",
                fileName: "",
                fileType: ""

            };

            await addDoc(collection(db, "files"), payload);

            await addDoc(collection(db, "activityLogs"), {

                uid: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                action: "import_csv",
                fileName: judul,
                status: "success",
                timestamp: serverTimestamp()

            });

        }

        alert("Import CSV berhasil");

        await loadArchiveData();
        await loadDashboardStats();

    } catch (err) {

        console.error("Import CSV error:", err);
        alert("Import CSV gagal");

    }

}

// ===============================
// EVENT IMPORT CSV
// ===============================

const importInput = document.getElementById("importCSVInput");

if (importInput) {

    importInput.addEventListener("change", async (e) => {

        const file = e.target.files[0];

        if (!file) return;

        await importCSV(file);

    });

}

function showErrorModal(message) {

    const modal = document.getElementById("errorModal");
    const text = document.getElementById("errorModalMessage");

    text.innerText = message;

    modal.classList.remove("hidden");

}

// ===============================
// SESSION TIMEOUT (15 MENIT)
// ===============================

let idleTimer;
let isSessionTimeoutShown = false;

// 10 menit
const IDLE_LIMIT = 10 * 60 * 1000;

function ensureSessionTimeoutModal() {
    const existing = document.getElementById("sessionTimeoutModal");
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = "sessionTimeoutModal";
    modal.className = "hidden fixed inset-0 z-50 flex items-center justify-center";
    modal.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"></div>
    <div class="relative z-10 w-full max-w-sm mx-4 overflow-hidden rounded-xl bg-white dark:bg-[#1a2634] shadow-2xl ring-1 ring-slate-900/5 transition-all border border-slate-200 dark:border-slate-700">
        <div class="p-6">
            <div class="flex flex-col items-center text-center">
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
                    <span class="material-icons-outlined text-amber-600 dark:text-amber-400 text-2xl">schedule</span>
                </div>
                <h3 class="text-lg font-semibold leading-6 text-slate-900 dark:text-white mb-2">Session Timeout</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Sesi berakhir karena tidak ada aktivitas selama 15 menit.</p>
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

// aktivitas user yang dianggap aktif
["click", "mousemove", "keypress", "scroll", "touchstart"].forEach(event => {

    document.addEventListener(event, resetIdleTimer);

});

// mulai timer saat halaman dibuka
resetIdleTimer();