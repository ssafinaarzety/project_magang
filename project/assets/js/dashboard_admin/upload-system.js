import { auth, db } from "../firebase-config.js";
const DRIVE_API =
    "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec";

import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    deleteDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { loadArchiveData } from "./archive-table.js";
import { loadDashboardStats } from "./dashboard-stats.js";

// ===============================
// VALIDASI LINK SPREADSHEET
// ===============================
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

// ===============================
// MODAL SUCCESS
// ===============================
export function showSuccess(message) {
    const modal = document.getElementById("successModal");
    const msg = document.getElementById("successModalMessage");

    if (msg) msg.innerText = message;
    if (modal) modal.classList.remove("hidden");

    setTimeout(() => {
        modal?.classList.add("hidden");
    }, 2000);
}

// ===============================
// MODAL ERROR
// ===============================
function showError(message) {


    const modal = document.getElementById("errorModal");
    const msg = document.getElementById("errorModalMessage");

    if (msg) msg.innerText = message;
    if (modal) modal.classList.remove("hidden");


}

// ===============================
// SETUP UPLOAD SYSTEM
// ===============================
export function setupUpload() {

    const btn = document.getElementById("saveArchiveBtn");
    if (!btn) return;

    const dropzone = document.getElementById("uploadFileDropzone");
    const fileInput = document.getElementById("uploadFileInput");
    const fileInfo = document.getElementById("uploadFileInfo");


    // ===============================
    // DRAG & DROP
    // ===============================
    if (dropzone && fileInput) {

        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("border-blue-500");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("border-blue-500");
        });

        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("border-blue-500");

            const file = e.dataTransfer.files[0];

            if (file) {
                fileInput.files = e.dataTransfer.files;
                if (fileInfo) fileInfo.textContent = file.name;
            }

        });

        fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (file && fileInfo) fileInfo.textContent = file.name;
        });

    }


    // ===============================
    // PREVENT DOUBLE CLICK
    // ===============================
    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById("saveArchiveBtn");


    // ===============================
    // CLICK UPLOAD
    // ===============================
    newBtn.addEventListener("click", async () => {

        try {

            const judul = document.getElementById("judul")?.value.trim();
            const kategori = document.getElementById("kategori")?.value.trim();
            const tahun = document.getElementById("tahun")?.value;
            const link = document.getElementById("link")?.value.trim();

            const file = fileInput?.files[0];

            let driveFileId = "";

            if (file) {

                // ambil folderId dari firestore
                const folderRef = doc(db, "driveFolders", kategori.toLowerCase());
                const folderSnap = await getDoc(folderRef);

                if (!folderSnap.exists()) {
                    showError("Folder Drive tidak ditemukan");
                    return;
                }

                const folderId = folderSnap.data().folderId;

                console.log("Uploading to folder:", folderId);

                const base64 = await fileToBase64(file);

                // ===============================
                // CREATE FORM DATA
                // ===============================
                const formData = new FormData();

                formData.append("fileName", file.name);
                formData.append("mimeType", file.type);
                formData.append("fileData", base64);
                formData.append("folderId", folderId);

                // ===============================
                // SEND TO APPS SCRIPT
                // ===============================
                const res = await fetch(DRIVE_API, {
                    method: "POST",
                    body: new URLSearchParams({
                        fileName: file.name,
                        mimeType: file.type,
                        fileData: base64,
                        folderId: folderId
                    })
                });

                const data = await res.json();

                console.log("Drive response:", data);

                if (!data.success) {
                    showError("Upload ke Google Drive gagal");
                    return;
                }

                driveFileId = data.fileId;

            }


            if (!judul || !kategori || !tahun) {
                showError("Judul, kategori, dan tahun wajib diisi");
                return;
            }

            if (!link && !file) {
                showError("Masukkan link spreadsheet atau upload file");
                return;
            }

            if (tahun < 1900 || tahun > 2100) {
                showError("Tahun tidak valid");
                return;
            }

            if (link && !isValidSpreadsheetLink(link)) {
                showError("Link spreadsheet tidak valid");
                return;
            }


            const user = auth.currentUser;

            if (!user) {
                showError("User tidak ditemukan");
                return;
            }


            document.getElementById("uploadModal")?.classList.add("hidden");


            // ===============================
            // SAVE FIRESTORE
            // ===============================
            await addDoc(collection(db, "files"), {

                nama: judul,
                kategori: kategori.toLowerCase(),
                tanggal: tahun + "-01-01",

                createdBy: user.uid,
                allowedUsers: [user.uid],

                createdAt: serverTimestamp(),

                spreadsheetLink: link || "",
                sourceType: file ? "file" : "link",

                filePath: driveFileId,
                fileName: file ? file.name : "",
                fileType: file ? file.type : ""

            });


            // ===============================
            // ACTIVITY LOG
            // ===============================
            await addDoc(collection(db, "activityLogs"), {

                uid: user.uid,
                userEmail: user.email,
                action: "upload",
                fileName: judul,
                status: "success",
                timestamp: serverTimestamp()

            });


            // ===============================
            // RESET FORM
            // ===============================
            document.getElementById("judul").value = "";
            document.getElementById("kategori").value = "";
            document.getElementById("tahun").value = "";
            document.getElementById("link").value = "";

            if (fileInput) fileInput.value = "";
            if (fileInfo) fileInfo.textContent = "Belum ada file dipilih";


            await Promise.all([
                loadArchiveData(),
                loadDashboardStats()
            ]);


            showSuccess("Arsip berhasil diupload");


        } catch (err) {

            console.error("Upload error:", err);
            showError("Upload gagal");

        }

    });


}

// ===============================
// DELETE SYSTEM
// ===============================
export function setupDeleteArchive() {

    const btn = document.getElementById("confirmDeleteBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {

        try {

            const fileId = document.getElementById("deleteFileId")?.value;

            if (!fileId) {
                showError("File tidak ditemukan");
                return;
            }

            await deleteDoc(doc(db, "files", fileId));

            document.getElementById("deleteModal")?.classList.add("hidden");

            await Promise.all([
                loadArchiveData(),
                loadDashboardStats()
            ]);

            showSuccess("Arsip berhasil dihapus");

        } catch (err) {

            console.error("Delete error:", err);
            showError("Gagal menghapus arsip");

        }

    });


}

// ===============================
// OPEN DELETE MODAL
// ===============================
export function openDeleteModal(fileId, fileName) {


    const modal = document.getElementById("deleteModal");
    const idInput = document.getElementById("deleteFileId");
    const nameEl = document.getElementById("deleteFileName");

    if (idInput) idInput.value = fileId;
    if (nameEl) nameEl.innerText = fileName;

    if (modal) modal.classList.remove("hidden");

}

// ===============================
// CONVERT FILE TO BASE64
// ===============================
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