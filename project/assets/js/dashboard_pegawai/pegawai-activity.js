import { db } from "../firebase-config.js";

import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { renderActivityChart } from "./renderActivityChart.js";

// ===============================
// STATE
// ===============================
let lastAccessedArchive = null;
let activityCache = null;

// ===============================
// LOAD ACTIVITY LOGS (TABLE)
// ===============================
export async function loadActivityLogs(uid) {

    try {

        const logsBody = document.getElementById("activityLogsBody");
        if (!logsBody) return;

        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", uid),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        const snapshot = await getDocs(q);

        const userLogs = [];

        snapshot.forEach(docSnap => {
            userLogs.push(docSnap.data());
        });

        renderRecentActivity(userLogs);

        if (userLogs.length === 0) {

            logsBody.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-6 text-center text-slate-500">
                    No activity logs yet
                </td>
            </tr>
            `;

            return;
        }

        const displayLogs = userLogs.slice(0, 10);

        logsBody.innerHTML = "";

        displayLogs.forEach((log) => {

            const date = log.timestamp?.toDate
                ? log.timestamp.toDate()
                : new Date(log.timestamp);

            const dateString = date.toLocaleString("id-ID", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });

            logsBody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-xs text-slate-700">
                    ${dateString}
                </td>
                <td class="px-4 py-3 text-xs text-slate-700">
                    ${log.fileName || "-"}
                </td>
                <td class="px-6 py-4 text-sm text-slate-500">
                    ${log.action === "login_pegawai"
                    ? "User login"
                    : "File accessed"}
                </td>
            </tr>
            `;

        });

    } catch (error) {
        console.error("Error loading activity logs:", error);
    }
}

// ===============================
// RECENT ACTIVITY
// ===============================
function renderRecentActivity(userLogs) {

    const container = document.getElementById("recentActivity");
    if (!container) return;

    container.innerHTML = "";

    userLogs.slice(0, 4).forEach(log => {

        container.innerHTML += `
        <div class="flex justify-between py-2 border-b">
            <span class="text-sm">${log.fileName || "Login"}</span>
            <span class="text-xs">
                ${log.action === "login_pegawai" ? "Login" : "Open"}
            </span>
        </div>
        `;
    });
}

// ===============================
// RECENT FILES
// ===============================
export async function loadRecentFiles(uid) {

    try {

        const q = query(
            collection(db, "activityLogs"),
            where("uid", "==", uid),
            where("action", "==", "access"),
            orderBy("timestamp", "desc"),
            limit(5)
        );

        const snapshot = await getDocs(q);

        const container = document.getElementById("recentFiles");
        if (!container) return;

        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<p>No recent files</p>`;
            return;
        }

        snapshot.forEach(docSnap => {

            const data = docSnap.data();

            container.innerHTML += `
            <div class="flex justify-between py-2 border-b">
                <span>${data.fileName || "Untitled"}</span>
                <span class="text-xs">Opened</span>
            </div>
            `;

        });

    } catch (err) {
        console.error("Recent files error:", err);
    }
}

// ===============================
// SUMMARY (FINAL FIX - FILE NAME)
// ===============================
export async function loadActivitySummary(uid) {

    try {

        let todayCount = 0;
        let totalLogs = 0;
        let lastAccess = "-";

        const today = new Date().toISOString().split("T")[0];

        // ===============================
        // CACHE
        // ===============================
        if (activityCache) {

            console.log("pakai cache activity");

            activityCache.forEach(docSnap => {

                const data = docSnap.data();
                if (!data.timestamp) return;

                if (lastAccess === "-" && data.fileName) {
                    lastAccess = data.fileName;
                }

                const date = data.timestamp?.toDate
                    ? data.timestamp.toDate()
                    : new Date();

                const key = date.toISOString().split("T")[0];

                totalLogs++;
                if (key === today) todayCount++;
            });

        } else {

            // ===============================
            // FETCH (1x saja)
            // ===============================
            const snapshot = await getDocs(
                query(
                    collection(db, "activityLogs"),
                    where("uid", "==", uid),
                    orderBy("timestamp", "desc"),
                    limit(20)
                )
            );

            activityCache = snapshot;

            snapshot.forEach(docSnap => {

                const data = docSnap.data();
                if (!data.timestamp) return;

                if (lastAccess === "-" && data.fileName) {
                    lastAccess = data.fileName;
                }

                const date = data.timestamp?.toDate
                    ? data.timestamp.toDate()
                    : new Date();

                const key = date.toISOString().split("T")[0];

                totalLogs++;
                if (key === today) todayCount++;
            });
        }

        // ===============================
        // UPDATE UI
        // ===============================
        const todayEl = document.getElementById("todayActivity");
        const totalEl = document.getElementById("totalLogs");
        const lastEl = document.getElementById("lastAccessedStat");

        if (todayEl) todayEl.textContent = todayCount;
        if (totalEl) totalEl.textContent = totalLogs;
        if (lastEl) lastEl.textContent = lastAccess;

    } catch (err) {
        console.error("Summary error:", err);
    }
}

// ===============================
// STATISTICS
// ===============================
export function calculateStatistics(allArchives) {

    if (!Array.isArray(allArchives)) return;

    const totalArsipEl = document.getElementById("totalArsipStat");

    if (totalArsipEl) {
        totalArsipEl.textContent = allArchives.length;
    }

    const categoryCount = {};

    allArchives.forEach(item => {
const cat = item.category || item.kategori || "Lainnya";
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    let topCategory = "-";
    let max = 0;

    for (const cat in categoryCount) {
        if (categoryCount[cat] > max) {
            max = categoryCount[cat];
            topCategory = cat;
        }
    }

    const el = document.getElementById("topCategoryStat");
    if (el) el.textContent = topCategory;
}

export async function loadActivityChart(uid) {

    try {

        const snapshot = await getDocs(
            query(
                collection(db, "activityLogs"),
                where("uid", "==", uid),
                orderBy("timestamp", "desc"),
                limit(30)
            )
        );

        const activityPerDay = {};

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split("T")[0];
            activityPerDay[key] = 0;
        }

        snapshot.forEach(docSnap => {

            const data = docSnap.data();
            if (!data.timestamp) return;

            const date = data.timestamp.toDate();
            const key = date.toISOString().split("T")[0];

            if (activityPerDay[key] !== undefined) {
                activityPerDay[key]++;
            }

        });

        const labels = Object.keys(activityPerDay).map(d => {
            const date = new Date(d);
            return date.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short"
            });
        });

        const values = Object.values(activityPerDay);

        renderActivityChart(labels, values);

    } catch (err) {
        console.error("Chart error:", err);
    }
}