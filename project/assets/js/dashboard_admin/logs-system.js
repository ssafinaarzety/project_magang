import { db } from "../firebase-config.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    limit
}
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";



// ===============================
// LOAD ACTIVITY LOGS
// ===============================
export async function loadActivityLogs() {

    const tableBody = document.querySelector("#activityLogBody");

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
        <td colspan="5" class="text-center text-slate-400 py-4 animate-pulse">
        Loading activity...
        </td>
        </tr>
        `;

    try {

        const q = query(
            collection(db, "activityLogs"),
            orderBy("timestamp", "desc"),
            limit(5)
        );

        const snapshot = await getDocs(q);

        tableBody.innerHTML = "";

        if (snapshot.empty) {

            tableBody.innerHTML =
                "<tr><td colspan='5' class='text-center text-slate-400 py-4'>Belum ada aktivitas</td></tr>";

            return;

        }

        snapshot.forEach(docSnap => {

            const log = docSnap.data();

            const userLabel = log.userEmail || log.uid || "unknown";

            let date = "-";

            if (log.timestamp) {
                date = log.timestamp.toDate().toLocaleString("id-ID");
            }

            const item = document.createElement("div");

            item.className = `
                flex items-center gap-4
                p-4
                bg-white/60
                rounded-xl
                border border-slate-200
                hover:shadow-sm
                transition
                `;

            const avatar = `
                <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                ${(userLabel[0] || "U").toUpperCase()}
                </div>
                `;

            let actionLabel = "Activity";

            if (log.action === "login") actionLabel = "User login";
            if (log.action === "access") actionLabel = "Access file";
            if (log.action === "upload") actionLabel = "Upload file";
            if (log.action === "delete") actionLabel = "Delete file";
            if (log.action === "edit") actionLabel = "Edit file";
            if (log.action === "manage_access") actionLabel = "Manage access";
            if (log.action === "remove_access") actionLabel = "Remove access";

            item.innerHTML = `

                ${avatar}

                <div class="flex-1">
                <div class="text-sm font-semibold text-slate-700">
                ${actionLabel}
                </div>

                <div class="text-sm text-slate-600">
                ${log.fileName || ""}
                </div>

                <div class="text-xs text-slate-500">
                ${userLabel} • ${date}
                </div>

                </div>

                <div class="text-xs font-semibold text-green-600">
                ${log.status || "success"}
                </div>

                `;

            tableBody.appendChild(item);

        });

    } catch (err) {

        console.error("Load activity logs error:", err);

        tableBody.innerHTML =
            "<tr><td colspan='5' class='text-center text-red-500 py-4'>Gagal memuat aktivitas</td></tr>";

    }

}


// ===============================
// EXPORT LOG CSV
// ===============================
export async function exportLogs() {

    try {

        const snapshot = await getDocs(
            query(
                collection(db, "activityLogs"),
                orderBy("timestamp", "desc"),
                limit(500)
            )
        );

        let csv = "Timestamp,User,Action,File,Status\n";

        snapshot.forEach(doc => {

            const log = doc.data();

            let date = "-";

            if (log.timestamp) {

                try {
                    date = log.timestamp.toDate().toLocaleString("id-ID");
                } catch {
                    date = "-";
                }

            }

            csv += `"${date}","${log.userEmail || "-"}","${log.action || "-"}","${log.fileName || "-"}","${log.status || "-"}"\n`;

        });

        const blob = new Blob([csv], { type: "text/csv" });

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");

        a.href = url;
        a.download = "activity_logs.csv";
        a.click();

        URL.revokeObjectURL(url);

    } catch (err) {

        console.error("Export logs error:", err);

        alert("Gagal export log");

    }

}

// ===============================
// GLOBAL EXPORT (HTML BUTTON)
// ===============================
window.exportLogs = exportLogs;