import { db } from "./firebase-config.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// ===============================
// DOM ELEMENTS
// ===============================
const tbody = document.getElementById("activityLogTable");
const table = document.getElementById("activityLogTable");
const filter = document.getElementById("logFilter");

let allLogs = [];


// ===============================
// LOAD LOGS FROM FIRESTORE
// ===============================

async function loadAllLogs() {

    if (!table) return;

    table.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-6 text-gray-400">
                Loading activity logs...
            </td>
        </tr>
    `;

    try {

        const q = query(
            collection(db, "activityLogs"),
            orderBy("timestamp", "desc"),
            limit(10)
        );

        const snapshot = await getDocs(q);

        allLogs = [];

        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            
            // Filter: hanya simpan logs admin yang memiliki userEmail dan action
            if (log.userEmail && log.action) {
                allLogs.push(log);
            }
        });

        renderLogs(allLogs);

    } catch (err) {

        console.error("Error loading logs:", err);

        table.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-6 text-red-500">
                    Gagal memuat activity logs
                </td>
            </tr>
        `;

    }

}


// ===============================
// RENDER TABLE
// ===============================

function renderLogs(data) {

    if (!table) return;

    table.innerHTML = "";

    if (data.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-6 text-gray-400">
                    Tidak ada activity logs
                </td>
            </tr>
        `;

        return;

    }

    data.forEach(log => {

        const date = log.timestamp?.toDate();

        const row = document.createElement("tr");

        row.innerHTML = `
            <td class="px-4 py-3">
                ${date ? date.toLocaleString("id-ID") : "-"}
            </td>

            <td class="px-4 py-3">
                ${log.userEmail || "-"}
            </td>

            <td class="px-4 py-3 capitalize">
                ${log.action || "-"}
            </td>

            <td class="px-4 py-3">
                ${log.fileName || "-"}
            </td>

            <td class="px-4 py-3 text-green-600">
                ${log.status || "success"}
            </td>
        `;

        table.appendChild(row);

    });

}


// ===============================
// FILTER LOGS
// ===============================

if (filter) {

    filter.addEventListener("change", (e) => {

        const action = e.target.value;

        if (action === "all") {

            renderLogs(allLogs);

        } else {

            const filtered = allLogs.filter(log => log.action === action);

            renderLogs(filtered);

        }

    });

}


// ===============================
// EXPORT CSV
// ===============================

function exportLogs() {

    if (allLogs.length === 0) return;

    let csv = "Timestamp,User,Action,File,Status\n";

    allLogs.forEach(log => {

        const date = log.timestamp?.toDate();

        csv += `"${date?.toLocaleString("id-ID") || "-"}","${log.userEmail || "-"}","${log.action || "-"}","${log.fileName || "-"}","${log.status || "-"}"\n`;

    });

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "activity_logs.csv";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

}

window.exportLogs = exportLogs;


// ===============================
// INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {

    loadAllLogs();

});