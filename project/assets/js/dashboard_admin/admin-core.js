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
import { setupUpload } from "./upload-system.js";
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
        await Promise.all([

            loadArchiveData(),
            loadDashboardStats(),
            loadActivityLogs(),
            generateFilterOptions()

        ]);


        // ===============================
        // INIT MODULES
        // ===============================
        setupUpload();
        setupAccessSave();
        setupUploadModal();

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
import { getDocs, collection }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function setupBackup() {

    const backupBtn = document.getElementById("backupBtn");

    if (!backupBtn) return;

    backupBtn.addEventListener("click", async () => {

        try {

            const snapshot = await getDocs(collection(db, "files"));

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
