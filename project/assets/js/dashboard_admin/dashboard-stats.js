import { db } from "../firebase-config.js";

import {
    collection,
    getDocs,
    query,
    limit,
    where,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===============================
// LOAD DASHBOARD STATS
// ===============================
export async function loadDashboardStats() {

    try {

        // total files
        const countSnapshot = await getCountFromServer(
            query(collection(db, "files"))
        );

        const totalFiles = countSnapshot.data().count;

        const totalEl = document.getElementById("totalArsip");

        if (totalEl) totalEl.innerText = totalFiles;


        // monthly uploads
        const now = new Date();

        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const monthlySnapshot = await getCountFromServer(
            query(
                collection(db, "files"),
                where("tanggal", ">=", startMonth.toISOString().split("T")[0]),
                where("tanggal", "<=", endMonth.toISOString().split("T")[0])
            )
        );

        const monthlyEl = document.getElementById("monthlyCount");

        if (monthlyEl) monthlyEl.innerText = monthlySnapshot.data().count;


        // top category
        const snapshot = await getDocs(
            query(collection(db, "files"), limit(2000))
        );

        const categoryMap = {};

        snapshot.forEach(doc => {

            const data = doc.data();

            if (data.kategori) {

                categoryMap[data.kategori] =
                    (categoryMap[data.kategori] || 0) + 1;

            }

        });

        let topCategory = "-";
        let max = 0;

        for (const cat in categoryMap) {

            if (categoryMap[cat] > max) {

                max = categoryMap[cat];
                topCategory = cat;

            }

        }

        const topCatEl = document.getElementById("topCategory");

        if (topCatEl) topCatEl.innerText = topCategory;

    } catch (err) {

        console.error("Dashboard stats error:", err);

    }

}

// ===============================
// GENERATE FILTER OPTIONS
// ===============================
export async function generateFilterOptions() {

    const snapshot = await getDocs(
        query(collection(db, "files"), limit(200))
    );

    const yearSet = new Set();
    const categorySet = new Set();

    snapshot.forEach(doc => {

        const data = doc.data();

        if (data.tanggal) {

            yearSet.add(data.tanggal.split("-")[0]);

        }

        if (data.kategori) {

            categorySet.add(data.kategori);

        }

    });

    const yearFilter = document.getElementById("yearFilter");
    const categoryFilter = document.getElementById("categoryFilter");

    if (yearFilter) {

        yearFilter.innerHTML = `<option value="">Semua Tahun</option>`;

        [...yearSet].sort((a, b) => b - a).forEach(year => {

            yearFilter.innerHTML +=
                `<option value="${year}">${year}</option>`;

        });

    }

    if (categoryFilter) {

        categoryFilter.innerHTML = `<option value="">Semua Kategori</option>`;

        [...categorySet].sort().forEach(cat => {

            categoryFilter.innerHTML +=
                `<option value="${cat}">${cat}</option>`;

        });

    }

}

const yearFilter = document.getElementById("yearFilter");
const categoryFilter = document.getElementById("categoryFilter");

function applyFilters() {

    let filtered = [...allArchives];

    if (yearFilter?.value) {

        filtered = filtered.filter(f =>
            f.tanggal?.startsWith(yearFilter.value)
        );

    }

    if (categoryFilter?.value) {

        filtered = filtered.filter(f =>
            f.kategori === categoryFilter.value
        );

    }

    renderTable(filtered);

}

yearFilter?.addEventListener("change", applyFilters);
categoryFilter?.addEventListener("change", applyFilters);