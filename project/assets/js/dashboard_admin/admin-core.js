import { auth, db } from "../firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===============================
// LOGOUT SYSTEM
// ===============================

const logoutBtn = document.getElementById("logoutBtn");
const logoutModal = document.getElementById("logoutModal");
const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");

// buka modal logout
logoutBtn?.addEventListener("click", () => {

    logoutModal?.classList.remove("hidden");

});

// tombol YA → logout
confirmLogoutBtn?.addEventListener("click", async () => {

    try {

        logoutModal?.classList.add("hidden");

        await signOut(auth);

        window.location.href = "../index.html";

    } catch (error) {

        console.error("Logout error:", error);

    }

});

// tombol TIDAK → tutup modal
cancelLogoutBtn?.addEventListener("click", () => {

    logoutModal?.classList.add("hidden");

});

import { doc, getDoc }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { loadArchiveData } from "./archive-table.js";
import { setupUpload, setupDeleteArchive } from "./upload-system.js";
import { setupAccessSave } from "./access-system.js";
import { loadActivityLogs } from "./logs-system.js";
import { loadDashboardStats, generateFilterOptions } from "./dashboard-stats.js";

// ===============================
// LOADING CONTROL
// ===============================
function hideLoading() {


    const loader = document.getElementById("loadingOverlay");

    if (loader) {
        loader.classList.add("hidden");
    }


}

// ===============================
// EMERGENCY FALLBACK
// ===============================
setTimeout(() => {


    const loader = document.getElementById("loadingOverlay");

    if (loader && !loader.classList.contains("hidden")) {

        console.warn("Emergency fallback: hiding loading overlay");
        loader.classList.add("hidden");

    }


}, 4000);

// ===============================
// OPEN UPLOAD MODAL
// ===============================
function setupUploadModal() {

    const newArchiveBtn = document.getElementById("newArchiveBtn");
    const uploadModal = document.getElementById("uploadModal");

    if (!newArchiveBtn || !uploadModal) return;

    newArchiveBtn.addEventListener("click", () => {

        uploadModal.classList.remove("hidden");

    });


}

// ===============================
// AUTH CHECK
// ===============================
onAuthStateChanged(auth, async (user) => {


    try {

        // ===============================
        // USER NOT LOGGED IN
        // ===============================
        if (!user) {

            window.location.href = "../index.html";
            return;

        }

        // ===============================
        // CHECK ROLE
        // ===============================
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {

            window.location.href = "../index.html";
            return;

        }

        const userData = userSnap.data();
        const role = userData.role?.toLowerCase();

        // ===============================
        // TOP BAR PROFILE
        // ===============================

        const profileBtn = document.getElementById("profileBtn");
        const profileNameTop = document.getElementById("profileNameTop");

        if (profileBtn) {

            const displayName = userData?.name || user.email || "Admin";

            const parts = displayName.trim().split(" ");

            let initial = parts.length > 1
                ? parts[0][0] + parts[1][0]
                : parts[0][0];

            profileBtn.textContent = initial.toUpperCase();

        }

        if (profileNameTop) {

            profileNameTop.textContent = userData?.name || "Admin";

        }

        if (role !== "admin") {

            window.location.href = "../index.html";
            return;

        }


        // ===============================
        // SET ADMIN INFO
        // ===============================
        const nameEl = document.getElementById("adminName");
        const emailEl = document.getElementById("adminEmail");

        if (nameEl) nameEl.innerText = userData.name || "Administrator";
        if (emailEl) emailEl.innerText = userData.email || user.email;


        // ===============================
        // LOAD DASHBOARD DATA
        // ===============================
        await loadArchiveData();

        setTimeout(() => {
            loadDashboardStats();
        }, 300);

        setTimeout(() => {
            loadActivityLogs();
        }, 600);

        setTimeout(() => {
            generateFilterOptions();
        }, 900);

        // ===============================
        // INIT MODULES
        // ===============================
        setupUpload();
        setupAccessSave();
        setupUploadModal();
        setupDeleteArchive();

        setupBackup();
        setupSearch();


        // ===============================
        // HIDE LOADING
        // ===============================
        hideLoading();


    } catch (err) {

        console.error("Dashboard initialization error:", err);

        hideLoading();

        const modal = document.getElementById("errorModal");
        const msg = document.getElementById("errorModalMessage");

        if (msg) msg.innerText = "Terjadi kesalahan saat memuat dashboard";

        if (modal) modal.classList.remove("hidden");

    }


});

// ===============================
// SEARCH ARCHIVES
// ===============================
function setupSearch() {

    const searchInput = document.getElementById("archiveSearch");

    if (!searchInput) return;

    searchInput.addEventListener("input", () => {

        const keyword = searchInput.value.toLowerCase();

        const cards = document.querySelectorAll("[data-archive-name]");

        cards.forEach(card => {

            const name = (card.dataset.archiveName || "").toLowerCase();
            const category = (card.dataset.archiveCategory || "").toLowerCase();

            const match =
                name.includes(keyword) ||
                category.includes(keyword);

            card.style.display = match ? "flex" : "none";

        });

    });

}

// ===============================
// BACKUP SYSTEM
// ===============================
import { getDocs, collection, query, limit }
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function setupBackup() {

    const backupBtn = document.getElementById("backupBtn");

    if (!backupBtn) return;

    backupBtn.addEventListener("click", async () => {

        try {

            const snapshot = await getDocs(
                query(collection(db, "files"), limit(500))
            );

            let data = [];

            snapshot.forEach(doc => {
                data.push(doc.data());
            });

            const blob = new Blob(
                [JSON.stringify(data, null, 2)],
                { type: "application/json" }
            );

            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");

            a.href = url;
            a.download = "backup_autora.json";
            a.click();

        } catch (err) {

            console.error("Backup error:", err);

        }

    });

}

// ===============================
// NEW ARCHIVE CARD
// ===============================

const newArchiveCard = document.getElementById("newArchiveCard");

if (newArchiveCard) {

    newArchiveCard.addEventListener("click", () => {

        document.getElementById("uploadModal")
            .classList.remove("hidden");

    });

}

// ===============================
// SIDEBAR TOGGLE
// ===============================

const sidebar = document.getElementById("sidebar");
const toggle = document.getElementById("sidebarToggle");

if (toggle && sidebar) {

    toggle.addEventListener("click", () => {

        sidebar.classList.toggle("-ml-72");

    });

}

// ===============================
// SIDEBAR ACTIVE MENU
// ===============================

const navItems = document.querySelectorAll(".nav-item");

navItems.forEach(item => {

    item.addEventListener("click", () => {

        navItems.forEach(i => {
            i.classList.remove("bg-primary-container/10", "text-primary");
        });

        item.classList.add("bg-primary-container/10", "text-primary");

    });

});

// ===============================
// PROFILE REDIRECT
// ===============================

document.getElementById("profileBtn")
    ?.addEventListener("click", () => {

        window.location.href = "profile-admin.html";

    });

// ===============================
// CLOSE SUCCESS MODAL
// ===============================
document.getElementById("successModalCloseBtn")
    ?.addEventListener("click", () => {

        document.getElementById("successModal")
            ?.classList.add("hidden");

    });

// ===============================
// UPDATE LAST ACTIVE
// ===============================

import { updateDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
// SESSION TIMEOUT ADMIN
// ===============================

let idleTimer;
let isSessionTimeoutShown = false;

// admin timeout lebih cepat
const IDLE_LIMIT = 10 * 60 * 1000;

function ensureSessionTimeoutModal() {

    const existing = document.getElementById("sessionTimeoutModal");
    if (existing) return existing;

    const modal = document.createElement("div");

    modal.id = "sessionTimeoutModal";

    modal.className = "hidden fixed inset-0 z-50 flex items-center justify-center";

    modal.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"></div>

    <div class="relative z-10 bg-white rounded-xl p-6 w-[320px] text-center shadow-xl">

        <h3 class="text-lg font-semibold mb-2">
        Session Timeout
        </h3>

        <p class="text-sm text-slate-500 mb-5">
        Tidak ada aktivitas selama 10 menit
        </p>

        <button id="sessionTimeoutConfirmBtn"
        class="w-full py-2 bg-red-600 text-white rounded-lg">

        Login Ulang

        </button>

    </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("sessionTimeoutConfirmBtn")
        ?.addEventListener("click", async () => {

            await signOut(auth);

            window.location.href = "../index.html";

        });

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

    idleTimer = setTimeout(() => {

        showSessionTimeoutModal();

    }, IDLE_LIMIT);

}

["click", "mousemove", "keypress", "scroll", "touchstart"]
    .forEach(event => {

        document.addEventListener(event, () => {

            resetIdleTimer();
            updateLastActive();

        });

    });

resetIdleTimer();

// ===============================
// HEARTBEAT
// ===============================

setInterval(() => {

    updateLastActive();

}, 5 * 60 * 1000);
