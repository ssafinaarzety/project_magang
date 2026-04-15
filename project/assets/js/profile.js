import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { sendPasswordResetEmail }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { updateDoc }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


const pageRoot = document.body;
const requiredRole = pageRoot.dataset.requiredRole;

function setText(id, value) {

    const el = document.getElementById(id);

    if (!el) return;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {

        el.value = value || "";

    } else {

        el.textContent = value || "-";

    }

}

function getInitial(name = "Pegawai") {

    const parts = name.trim().split(" ");

    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }

    return (
        parts[0].charAt(0) +
        parts[1].charAt(0)
    ).toUpperCase();
}

function setAvatar(name, photoURL) {

    const avatar = document.getElementById("profileAvatar");

    if (avatar) {

        avatar.innerHTML = "";

        if (photoURL) {

            const img = document.createElement("img");

            img.src = photoURL;
            img.alt = name + " profile picture";
            img.className = "w-full h-full object-cover";

            avatar.appendChild(img);

        } else {

            avatar.textContent = getInitial(name);

        }
    }

    const sidebarAvatar = document.getElementById("profileAvatarSidebar");

    if (sidebarAvatar) {

        sidebarAvatar.innerHTML = "";

        if (photoURL) {

            const img = document.createElement("img");

            img.src = photoURL;
            img.alt = name + " profile picture";
            img.className = "w-full h-full object-cover";

            sidebarAvatar.appendChild(img);

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
    const logoutModal = document.getElementById("logoutModal");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");

    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.href =
                role === "admin"
                    ? "dashboard-admin.html"
                    : "dashboard-pegawai.html";
        });
    }

    // buka modal logout
    logoutBtn?.addEventListener("click", () => {
        logoutModal.classList.remove("hidden");
    });

    // konfirmasi logout
    confirmLogoutBtn?.addEventListener("click", async () => {

        try {

            await signOut(auth);

            window.location.href = "../index.html";

        } catch (error) {

            console.error("Logout error:", error);

        }

    });

    // batal logout
    cancelLogoutBtn?.addEventListener("click", () => {

        logoutModal.classList.add("hidden");

    });

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

        let displayName = userData.nama || userData.name || user.displayName;

        if (!displayName) {
            displayName = role === "admin" ? "Administrator" : "Pegawai";
        }
        const displayEmail = userData.email || user.email || "-";

        // ===============================
        // TOP BAR PROFILE AVATAR
        // ===============================
        const profileBtn = document.getElementById("profileBtn");
        const profileNameTop = document.getElementById("profileNameTop");

        if (profileBtn) {

            const parts = displayName.trim().split(" ");

            let initial = parts.length > 1
                ? parts[0][0] + parts[1][0]
                : parts[0][0];

            profileBtn.textContent = initial.toUpperCase();
        }

        if (profileNameTop) {
            profileNameTop.textContent = displayName;
        }

        const roleLabel = getRoleLabel(role);
        const joinedAt = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("id-ID") : "-";
        const lastLogin = user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString("id-ID") : "-";

        setText("profileName", displayName);
        setText("profileNameSidebar", displayName || "Pegawai");
        setText("profileEmail", displayEmail);
        setText("profileRole", roleLabel);
        setText("profileUID", user.uid);
        setText("profileCreated", joinedAt);
        setText("profileLastLogin", lastLogin);
        setText("profileDepartment", userData.department || "Belum diisi");
        setText("profilePhone", userData.phone || "Belum diisi");
        originalDepartment = userData.department || "";
        originalPhone = userData.phone || "";

        // hitung jumlah file pegawai
        const q = query(
            collection(db, "files"),
            where("uploadedBy", "==", user.uid)
        );

        const snap = await getDocs(q);

        setText("filesCount", snap.size);

        setAvatar(displayName, user.photoURL);
        setupActions(role);
    } catch (error) {
        console.error("Profile page error:", error);
        alert("Gagal memuat data profil.");
    }
});

const resetBtn = document.getElementById("resetPasswordBtn");

resetBtn?.addEventListener("click", async () => {

    try {

        const email = auth.currentUser.email;

        await sendPasswordResetEmail(auth, email);

        openSuccessModal("Email reset password berhasil dikirim.");

    } catch (err) {

        console.error(err);
        alert("Gagal mengirim email reset password");

    }

});

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
    try {

        const user = auth.currentUser;

        await updateDoc(doc(db, "users", user.uid), {

            department: document.getElementById("profileDepartment").value,
            phone: document.getElementById("profilePhone").value

        });

        openSuccessModal("Profile berhasil diperbarui");

    } catch (err) {

        console.error(err);
        openErrorModal("Gagal update profile");

    }

});

const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");

const departmentInput = document.getElementById("profileDepartment");
const phoneInput = document.getElementById("profilePhone");

let originalDepartment = "";
let originalPhone = "";

editBtn?.addEventListener("click", () => {

    departmentInput.disabled = false;
    phoneInput.disabled = false;

    departmentInput.focus();

});

function checkChanges() {

    const changed =
        departmentInput.value !== originalDepartment ||
        phoneInput.value !== originalPhone;

    if (changed) {

        saveBtn.disabled = false;
        saveBtn.classList.remove("bg-slate-300", "cursor-not-allowed");
        saveBtn.classList.add("bg-primary");

    } else {

        saveBtn.disabled = true;
        saveBtn.classList.add("bg-slate-300", "cursor-not-allowed");
        saveBtn.classList.remove("bg-primary");

    }

}

departmentInput?.addEventListener("input", checkChanges);
phoneInput?.addEventListener("input", checkChanges);

window.openSuccessModal = function (message) {

    const modal = document.getElementById("successModal");
    const text = document.getElementById("successMessage");

    text.textContent = message;
    modal.classList.remove("hidden");

}

window.closeSuccessModal = function () {

    document.getElementById("successModal").classList.add("hidden");

}

window.openErrorModal = function (message) {

    document.getElementById("errorMessage").textContent = message;
    document.getElementById("errorModal").classList.remove("hidden");

}

window.closeErrorModal = function () {

    document.getElementById("errorModal").classList.add("hidden");

}
