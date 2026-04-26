import { db, auth } from "../firebase-config.js";
import {
    doc,
    getDoc,
    updateDoc,
    addDoc,
    collection,
    serverTimestamp,
    increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DRIVE_API = "https://script.google.com/macros/s/AKfycbwix7V7l8YFdNPOCMOIf5B8utj0fJuwoMuR9AdksFZQu9KAbmZrmTPIpQbvzT2PirKO/exec";

let allArchives = [];
let lastClickTime = 0;
let lastLogTime = 0;
let lastActiveUpdate = 0;

export function setArchiveData(data) {
    allArchives = data;
}

export function handleArchiveAccess(fileId, fileName) {

    const now = Date.now();

    if (now - lastClickTime < 2000) {
        console.log("Blocked spam click");
        return;
    }

    lastClickTime = now;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (!allArchives || allArchives.length === 0) {
        console.warn("Archive belum siap");
        return;
    }

    const archive = allArchives.find(a => a.id === fileId);

    if (!archive) {
        console.warn("File tidak ditemukan:", fileId);
        return;
    }

    Promise.all([
        logAccess(fileId, fileName, uid),
        increaseFileAccessCount(fileId)
    ]).catch(err => console.error("Background error:", err));

    let url = "";

    if (archive.filePath && archive.filePath !== "") {

        const id = archive.filePath;
        const type = (archive.fileType || "").toLowerCase();

        if (type.includes("pdf")) {
            url = `https://docs.google.com/viewer?embedded=true&url=https://drive.google.com/uc?id=${id}`;
        }
        else if (
            type.includes("png") ||
            type.includes("jpg") ||
            type.includes("jpeg")
        ) {
            url = `https://drive.google.com/uc?id=${id}`;
        }
        else if (
            type.includes("xls") ||
            type.includes("xlsx") ||
            type.includes("csv")
        ) {
            url = `https://docs.google.com/gview?embedded=true&url=https://drive.google.com/uc?id=${id}`;
        }
        else {
            url = `${DRIVE_API}?action=preview&fileId=${id}`;
        }

    }

    else if (archive.spreadsheetLink) {

        const sheetId = archive.spreadsheetLink
            .split("/d/")[1]
            ?.split("/")[0];

        url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    }

    if (!url) {
        alert("File tidak tersedia");
        return;
    }

    const frame = document.getElementById("previewFrame");
    if (frame) frame.src = url;

    setTimeout(async () => {
        const activity = await import("./pegawai-activity.js");

        activity.loadActivityLogs(uid);
        activity.loadActivitySummary(uid);
        activity.loadRecentFiles(uid);

    }, 500);

    openPreview();
}

// ===============================
async function logAccess(fileId, fileName, uid) {

    const now = Date.now();

    if (now - lastLogTime < 5000) return;

    lastLogTime = now;

    await addDoc(collection(db, "activityLogs"), {
        uid,
        userEmail: auth.currentUser?.email,
        action: "access",
        fileName,
        fileId,
        status: "success",
        timestamp: serverTimestamp()
    });
}

async function increaseFileAccessCount(fileId) {
    const ref = doc(db, "files", fileId);

    await updateDoc(ref, {
        accessCount: increment(1)
    });
}

async function updateLastActive(uid) {

    const now = Date.now();

    if (now - lastActiveUpdate < 60000) return;

    lastActiveUpdate = now;

    await updateDoc(doc(db, "users", uid), {
        lastActive: serverTimestamp()
    });
}

window.handleArchiveAccess = handleArchiveAccess;

function openPreview() {
    const modal = document.getElementById("previewModal");
    if (!modal) return;

    modal.classList.remove("hidden");

    const uid = auth.currentUser?.uid;
    if (uid) updateLastActive(uid);
}

window.openPreview = openPreview;

function closePreview() {
    const modal = document.getElementById("previewModal");
    if (!modal) return;

    const frame = document.getElementById("previewFrame");
    if (frame) frame.src = "";

    modal.classList.add("hidden");
}

window.closePreview = closePreview;