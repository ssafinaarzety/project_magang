import { db, auth } from "../firebase-config.js";

import {
    collection,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { loadArchiveData } from "./archive-table.js";

let selectedFileId = null;
let selectedAccessUsers = [];

// ===============================
// OPEN ACCESS MODAL
// ===============================
export async function openAccessModal(fileId, allowedUsers = []) {

    selectedFileId = fileId;
    selectedAccessUsers = Array.isArray(allowedUsers) ? [...allowedUsers] : [];

    const listContainer = document.getElementById("accessUserList");

    if (!listContainer) return;

    listContainer.innerHTML = `
            <div class="text-center text-slate-400 py-4">
            Loading users...
            </div>
            `;

    try {

        const snapshot = await getDocs(collection(db, "users"));

        listContainer.innerHTML = "";

        if (snapshot.empty) {

            listContainer.innerHTML =
                "<div class='text-center text-slate-400 py-4'>Tidak ada user</div>";

            return;

        }

        snapshot.forEach(docSnap => {

            const uid = docSnap.id;
            const user = docSnap.data();

            const isActive = selectedAccessUsers.includes(uid);

            const div = document.createElement("div");

            div.dataset.email = user.email || "";
            div.dataset.name = user.name || "";

            div.className =
                "flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition";

            div.innerHTML = `

                <div class="flex items-center justify-between w-full">

                    <div>
                        <p class="text-sm font-medium text-slate-700">
                        ${user.name || user.email?.split("@")[0] || "User"}
                        </p>

                        <p class="text-xs text-slate-400">
                        ${user.email || "-"}
                        </p>
                    </div>

                    ${isActive
                    ? `<button class="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-lg">
                            Remove
                        </button>`
                    : `<button class="px-3 py-1 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-lg">
                            Add
                        </button>`
                }

                </div>

                `;

            div.addEventListener("click", () => {

                toggleUserAccess(uid);

                openAccessModal(selectedFileId, selectedAccessUsers);

            });

            listContainer.appendChild(div);

        });

    } catch (err) {

        console.error("Load users error:", err);

        listContainer.innerHTML =
            "<div class='text-center text-red-500 py-4'>Gagal memuat user</div>";

    }
    // ===============================
    // SEARCH USER
    // ===============================

    const searchInput = document.getElementById("accessUserSearch");

    if (searchInput) {

        searchInput.oninput = () => {

            const keyword = searchInput.value.toLowerCase();

            const rows = document.querySelectorAll("#accessUserList > div");

            rows.forEach(row => {

                const email = row.dataset.email.toLowerCase();
                const name = row.dataset.name.toLowerCase();

                if (
                    email.includes(keyword) ||
                    name.includes(keyword)
                ) {
                    row.style.display = "flex";
                } else {
                    row.style.display = "none";
                }

            });

        };

    }
    document
        .getElementById("accessModal")
        ?.classList.remove("hidden");

}

window.openAccessModal = openAccessModal;

// ===============================
// TOGGLE ACCESS USER
// ===============================
export function toggleUserAccess(uid) {

    if (selectedAccessUsers.includes(uid)) {

        selectedAccessUsers =
            selectedAccessUsers.filter(id => id !== uid);

    } else {

        selectedAccessUsers.push(uid);

    }

}

// ===============================
// SAVE ACCESS
// ===============================
export function setupAccessSave() {

    const btn = document.getElementById("accessModalSaveBtn");

    if (!btn) return;

    // cegah event double
    btn.replaceWith(btn.cloneNode(true));

    const newBtn = document.getElementById("accessModalSaveBtn");

    newBtn.addEventListener("click", async () => {

        if (!selectedFileId) {

            alert("File tidak ditemukan");

            return;

        }

        try {

            const user = auth.currentUser;

            if (!user) {

                alert("User tidak ditemukan");

                return;

            }

            const fileRef = doc(db, "files", selectedFileId);

            await updateDoc(fileRef, {
                allowedUsers: selectedAccessUsers,
                updatedAt: serverTimestamp()
            });


            // ambil nama file untuk log
            const fileSnap = await getDoc(fileRef);

            const fileData = fileSnap.data();


            // ===============================
            // ACTIVITY LOG
            // ===============================
            await addDoc(collection(db, "activityLogs"), {

                uid: user.uid,
                userEmail: user.email,
                action: "manage_access",
                fileName: fileData?.nama || "-",
                fileId: selectedFileId,
                status: "success",
                timestamp: serverTimestamp()

            });


            // tutup modal
            document
                .getElementById("accessModal")
                ?.classList.add("hidden");


            // reset state
            selectedFileId = null;
            selectedAccessUsers = [];


            // reload table
            await loadArchiveData();

        } catch (err) {

            console.error("Access update error:", err);

            alert("Gagal mengupdate hak akses");

        }

    });

}