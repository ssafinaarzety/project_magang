import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const pageRoot = document.body;
const requiredRole = pageRoot.dataset.requiredRole;

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value || "-";
    }
}

function getInitial(name = "Pegawai") {
    return name.trim().charAt(0).toUpperCase() || "P";
}

function setAvatar(name) {
    const avatar = document.getElementById("profileAvatar");
    if (avatar) {
        const avatarImg = avatar.querySelector("img");
        if (avatarImg) {
            avatarImg.alt = `${name} profile picture`;
        } else {
            avatar.textContent = getInitial(name);
        }
    }

    const sidebarAvatar = document.getElementById("profileAvatarSidebar");
    if (sidebarAvatar) {
        const sidebarAvatarImg = sidebarAvatar.querySelector("img");
        if (sidebarAvatarImg) {
            sidebarAvatarImg.alt = `${name} profile picture`;
        } else {
            sidebarAvatar.textContent = getInitial(name);
        }
    }
}

function getRoleLabel(role = "") {
    const normalized = role.toLowerCase();
    if (normalized === "admin") return "Administrator";
    if (normalized === "pegawai") return "Pegawai";
    return role || "Unknown";
}

function setupActions(role) {
    const backBtn = document.getElementById("backToDashboardBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.href = role === "admin" ? "dashboard-admin.html" : "dashboard-pegawai.html";
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await signOut(auth);
                window.location.href = "../index.html";
            } catch (error) {
                console.error("Logout error:", error);
                alert("Gagal logout. Silakan coba lagi.");
            }
        });
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            window.location.href = "../index.html";
            return;
        }

        const userData = userSnap.data();
        const role = (userData.role || "").toLowerCase();

        if (requiredRole && role !== requiredRole) {
            window.location.href = "../index.html";
            return;
        }

        const displayName = userData.role || user.displayName || "-";
        const displayEmail = userData.email || user.email || "-";
        const roleLabel = getRoleLabel(role);
        const joinedAt = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("id-ID") : "-";
        const lastLogin = user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString("id-ID") : "-";

        if (displayName === "admin") {
            setText("profileName", "Administrator");
            setText("profileNameSidebar", "Administrator");
        } else if (displayName === "pegawai") {
            setText("profileName", "Pegawai");
            setText("profileNameSidebar", "Pegawai");
        }

        setText("profileEmailHero", displayEmail);
        setText("profileEmail", displayEmail);
        setText("profileEmailSidebar", displayEmail);
        setText("profileRole", roleLabel);
        setText("profileUid", user.uid);
        setText("profileJoined", joinedAt);
        setText("profileLastLogin", lastLogin);
        setText("profileDepartment", userData.department || "Belum diisi");
        setText("profilePhone", userData.phone || "Belum diisi");

        setAvatar(displayName);
        setupActions(role);
    } catch (error) {
        console.error("Profile page error:", error);
        alert("Gagal memuat data profil.");
    }
});
