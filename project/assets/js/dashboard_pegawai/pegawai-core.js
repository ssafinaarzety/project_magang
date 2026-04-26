import { auth, db } from "../firebase-config.js";

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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// MODULES
import { loadArchives, getAllArchives } from "./pegawai-archive.js";

import {
    loadActivityLogs,
    loadActivitySummary,
    loadRecentFiles,
    calculateStatistics,
    loadActivityChart
} from "./pegawai-activity.js";

// ===============================
// GLOBAL STATE
// ===============================
export let currentUserUID = null;
let usersCache = {};
let isInitialized = false;

// ===============================
// LOADING
// ===============================
function showLoading() {
    document.getElementById("loadingOverlay")?.classList.remove("hidden");
}

function hideLoading() {
    document.getElementById("loadingOverlay")?.classList.add("hidden");
}

// ===============================
// INIT
// ===============================
export function initPegawai() {

    if (isInitialized) return;
    isInitialized = true;

    onAuthStateChanged(auth, async (user) => {

        if (!user) {
            window.location.href = "../index.html";
            return;
        }

        try {

            showLoading();

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                console.error("User tidak ditemukan di Firestore");
                hideLoading();
                return;
            }

            const userData = userSnap.data();

if (userData.role === "admin") {
    window.location.href = "dashboard-admin.html";
    return;
}

if (userData.role !== "pegawai") {
    console.error("User tidak diizinkan:", userData.role);
    hideLoading();
    return;
}

            currentUserUID = user.uid;
            let lastLoginLog = 0;

            async function logLogin(uid, email) {

                const now = Date.now();

                if (now - lastLoginLog < 5000) return;
                lastLoginLog = now;

                try {
                    await addDoc(collection(db, "activityLogs"), {
                        uid,
                        userEmail: email,
                        action: "login_pegawai",
                        fileName: "-",
                        fileId: "-",
                        status: "success",
                        timestamp: serverTimestamp()
                    });
                } catch (err) {
                    console.error("Login log error:", err);
                }
            }

            // login log
            if (!sessionStorage.getItem("loginRecorded")) {
                await logLogin(user.uid, user.email);
                sessionStorage.setItem("loginRecorded", "true");
            }

            loadUserProfile(userData);
            setupProfileRedirect();
            setupLogout();

            await loadUsers();

            // ===============================
            // LOAD DATA (FINAL FIX)
            // ===============================

            await loadArchives(currentUserUID);

            const archives = getAllArchives();

            calculateStatistics(archives || []);

            // 3. load activity (tanpa timeout)
            await loadActivitySummary(currentUserUID);
            await loadActivityLogs(currentUserUID);
            await loadActivityChart(currentUserUID);
            await loadRecentFiles(currentUserUID);

        } catch (err) {
            console.error("Init error:", err);
            hideLoading();
        }

    });
}

// ===============================
// LOGIN LOG
// ===============================
async function logLogin(uid, email) {
    try {
        await addDoc(collection(db, "activityLogs"), {
            uid,
            userEmail: email,
            action: "login_pegawai",
            fileName: "-",
            fileId: "-",
            status: "success",
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Login log error:", err);
    }
}

// ===============================
// USER PROFILE
// ===============================
function loadUserProfile(userData) {

    const email = userData.email || auth.currentUser?.email;

    const nameEl = document.getElementById("pegawaiName");
    if (nameEl) nameEl.textContent = email;

    const roleEl = document.getElementById("pegawaiRole");
    if (roleEl) roleEl.textContent = "Pegawai";

    const avatar = document.getElementById("pegawaiAvatar");
    if (avatar) avatar.textContent = email.charAt(0).toUpperCase();

    const profileBtn = document.getElementById("profileBtn");
    const name = userData.nama || email;

    if (profileBtn) {
        const parts = name.split(" ");
        const initial = parts.length > 1
            ? parts[0][0] + parts[1][0]
            : parts[0][0];

        profileBtn.textContent = initial.toUpperCase();
    }

    document.getElementById("profileNameTop") &&
        (profileNameTop.textContent = name);
}

// ===============================
function setupProfileRedirect() {

    document.getElementById("profileBtn")?.addEventListener("click", () => {
        window.location.href = "profile-pegawai.html";
    });

    document.getElementById("profileCard")?.addEventListener("click", () => {
        window.location.href = "profile-pegawai.html";
    });
}

// ===============================
async function loadUsers() {

    if (Object.keys(usersCache).length > 0) return;

    const snapshot = await getDocs(collection(db, "users"));

    snapshot.forEach(doc => {
        usersCache[doc.id] = doc.data();
    });
}

// ===============================
export function setupLogout() {

    document.getElementById("confirmLogoutBtn")?.addEventListener("click", async () => {

        try {
            sessionStorage.removeItem("loginRecorded");
            await signOut(auth);
            window.location.href = "../index.html";
        } catch (err) {
            console.error("Logout error:", err);
        }

    });

}