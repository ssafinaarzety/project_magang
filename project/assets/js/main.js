import {
    signInWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const loginErrorEl = document.getElementById("login-error");

// Load email & password yang tersimpan
window.addEventListener("load", () => {

    const savedEmail = localStorage.getItem("rememberEmail");
    const savedPassword = localStorage.getItem("rememberPassword");

    if (savedEmail) {
        document.getElementById("email").value = savedEmail;
        document.getElementById("rememberMe").checked = true;
    }

    if (savedPassword) {
        document.getElementById("password").value = savedPassword;
    }

});

// Cek login otomatis
onAuthStateChanged(auth, (user) => {
    const isLoginPage = window.location.pathname.includes("index.html");

    if (user && isLoginPage) {
        redirectByRole(user);
    }
});

window.handleLogin = async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const remember = document.getElementById("rememberMe").checked;

    // Simpan email/password jika dicentang
    if (remember) {
        localStorage.setItem("rememberEmail", email);
    } else {
        localStorage.removeItem("rememberEmail");
    }

    loginErrorEl.classList.add("hidden");
    loginErrorEl.textContent = "";

    if (!email || !password) {
        loginErrorEl.textContent = "Email dan password wajib diisi";
        loginErrorEl.classList.remove("hidden");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await redirectByRole(userCredential.user);
    } catch (error) {
        loginErrorEl.textContent = "Login gagal. Periksa email dan password.";
        loginErrorEl.classList.remove("hidden");
        console.error(error);
    }
};

async function redirectByRole(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            throw new Error("Data user tidak ditemukan");
        }

        const userData = userSnap.data();

        if (userData.role === "admin") {
            window.location.href = "pages/dashboard-admin.html";
        } else if (userData.role === "pegawai") {
            window.location.href = "pages/dashboard-pegawai.html";
        } else {
            throw new Error("Role tidak dikenali");
        }

    } catch (error) {
        console.error(error);
        alert("Gagal menentukan role user");
    }
}

