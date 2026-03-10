import { auth, db } from "./firebase-config.js";

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
updateDoc,
Timestamp,
query,
orderBy,
limit,
serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===============================
// LOADING OVERLAY FUNCTIONS
// ===============================
function showLoading() {
    const loader = document.getElementById("loadingOverlay");
    if (loader) {
        loader.classList.remove("hidden");
    }
}

function hideLoading() {
    const loader = document.getElementById("loadingOverlay");
    if (loader) {
        loader.classList.add("hidden");
    }
}

// ===============================
// EMERGENCY FALLBACK - Auto hide overlay after 4 seconds
// ===============================
setTimeout(() => {
    const loader = document.getElementById("loadingOverlay");
    if (loader && !loader.classList.contains("hidden")) {
        console.warn("Emergency fallback: Force hiding loading overlay");
        loader.classList.add("hidden");
    }
}, 4000);

// ===============================
// GLOBAL ERROR HANDLERS
// ===============================
window.addEventListener("error", (event) => {
    console.error("Global error:", event.error);
    hideLoading();
});

window.addEventListener("unhandledrejection", (event) => {
    console.error("Promise error:", event.reason);
    hideLoading();
});

// ===============================
// GLOBAL DATA STATE
// ===============================

let allArchives = [];        // semua data dari firestore
let filteredArchives = [];   // data setelah filter
let allActivityLogs = [];    // semua activity logs user
let lastAccessedArchive = null;  // archive yang terakhir diakses

let currentUserUID = null;

let currentPage = 1;
const rowsPerPage = 10;

// ===============================
// AUTH CHECK
// ===============================
onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    try {

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.log("User data not found");
            return;
        }

        const userData = userSnap.data();

        if (userData.role !== "pegawai") {
            console.log("Not pegawai");
            return;
        }

        currentUserUID = user.uid;

        // Record login event to activity logs
        await logLogin(user.uid, user.email);

        // Load profile ke sidebar
        loadUserProfile(userData);
        setupProfileRedirect();
        loadArchives();

    } catch (error) {
        console.error("Auth error:", error);
    }

});


// ===============================
// LOG LOGIN EVENT
// ===============================
async function logLogin(uid, email) {
    try {
        const loginEntry = {
            uid: uid,
            userEmail: email,
            action: "login",
            fileName: "-",
            fileId: "-",
            status: "success",
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "activityLogs"), loginEntry);
        console.log("Login event recorded successfully");

    } catch (error) {
        console.error("Error recording login event:", error);
    }
}


// ===============================
// LOAD USER PROFILE
// ===============================
function loadUserProfile(userData){

const nameEl = document.getElementById("pegawaiName");
const roleEl = document.getElementById("pegawaiRole");
const avatarEl = document.getElementById("pegawaiAvatar");

const email = userData.email || auth.currentUser?.email || "user@email.com";

if(nameEl) nameEl.textContent = email;

if(roleEl) roleEl.textContent = "Pegawai";

if(avatarEl){

const initial = email.charAt(0).toUpperCase();
avatarEl.textContent = initial;

}

}

// ===============================
// LOAD ARSIP
// ===============================
async function loadArchives() {

showLoading();

try{

const snapshot = await getDocs(collection(db,"files"));

allArchives = [];

snapshot.forEach(docSnap => {

const data = docSnap.data();
const allowed = data.allowedUsers || [];

if(allowed.includes(currentUserUID)){

allArchives.push({
id: docSnap.id,
...data
});

}

});

filteredArchives = [...allArchives];

populateFilters(allArchives);

renderTable();
renderPagination();

await calculateStatistics();
await loadActivityLogs();

}catch(err){

console.error("Load archive error:",err);

const tableBody = document.getElementById("pegawaiTableBody");

if(tableBody){
tableBody.innerHTML = `
<tr>
<td colspan="5" class="px-6 py-6 text-center text-red-500">
Gagal memuat data arsip
</td>
</tr>
`;
}

}

hideLoading();

}

// ===============================
// RENDER TABLE
// ===============================

function renderTable() {

    const tableBody = document.getElementById("pegawaiTableBody");

    tableBody.innerHTML = "";

    if (filteredArchives.length === 0) {
        tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="px-6 py-6 text-center text-slate-500">
                Tidak ada arsip
            </td>
        </tr>
        `;
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const pageData = filteredArchives.slice(start, end);
        let rows = "";

        pageData.forEach((item, index) => {

            rows += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">

            <td class="px-6 py-4">${start + index + 1}</td>

            <td class="px-6 py-4 font-medium text-slate-800 dark:text-white">
            ${item.nama || item.name || "Untitled File"}
            </td>

            <td class="px-6 py-4 text-slate-500">
            ${item.tanggal ? item.tanggal.split("-")[0] : "-"}
            </td>

            <td class="px-6 py-4">
            <span class="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
            ${item.kategori || "-"}
            </span>
            </td>

            <td class="px-6 py-4 text-right">

            <button 
            onclick="handleArchiveAccess('${item.id}', '${(item.nama || '-').replace(/'/g, "\\'")}')"
            class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition">

            <span class="material-icons-outlined text-sm">open_in_new</span>
            Buka

            </button>

            </td>

            </tr>
            `;

        });

        tableBody.innerHTML = rows;


    }


// ===============================
// POPULATE FILTER
// ===============================

function populateFilters(archives) {

    const yearSelect = document.getElementById("yearSelect");
    const categorySelect = document.getElementById("categorySelect");

    const years = new Set();
    const categories = new Set();

    archives.forEach(item => {

        if (item.tanggal) {

            const year = item.tanggal.split("-")[0];
            years.add(year);

        }

        if (item.kategori) {
            categories.add(item.kategori);
        }

    });

    // reset dropdown
    yearSelect.innerHTML = `<option value="all">Semua Tahun</option>`;
    categorySelect.innerHTML = `<option value="all">Semua Kategori</option>`;

    // isi tahun
    [...years].sort((a,b)=>b-a).forEach(year => {

        const option = document.createElement("option");

        option.value = year;
        option.textContent = year;

        yearSelect.appendChild(option);

    });

    // isi kategori
    [...categories].forEach(cat => {

        const option = document.createElement("option");

        option.value = cat;
        option.textContent = cat;

        categorySelect.appendChild(option);

    });

}

// ===============================
// APPLY FILTER
// ===============================

function applyFilters() {

    const search = document.getElementById("searchInput").value.toLowerCase();
    const year = document.getElementById("yearSelect").value;
    const category = document.getElementById("categorySelect").value;

    filteredArchives = allArchives.filter(item => {

    const matchSearch =
        (item.nama || "").toLowerCase().includes(search);

    const fileYear = item.tanggal ? item.tanggal.split("-")[0] : null;

    const matchYear =
    year === "all" || fileYear == year;

    const matchCategory =
    category === "all" ||
        (item.kategori || "").toLowerCase() === category.toLowerCase();

        return matchSearch && matchYear && matchCategory;

        });

        currentPage = 1;

        renderTable();
        renderPagination();

}

// ===============================
// FILTER EVENTS
// ===============================

document.addEventListener("DOMContentLoaded",()=>{

const searchInput = document.getElementById("searchInput");
const yearSelect = document.getElementById("yearSelect");
const categorySelect = document.getElementById("categorySelect");

if(searchInput) searchInput.addEventListener("input",applyFilters);
if(yearSelect) yearSelect.addEventListener("change",applyFilters);
if(categorySelect) categorySelect.addEventListener("change",applyFilters);

});

// ===============================
// PAGINATION
// ===============================

function renderPagination() {

    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = "";

    const totalPages = Math.ceil(filteredArchives.length / rowsPerPage);

    for (let i = 1; i <= totalPages; i++) {

        const btn = document.createElement("button");

        btn.textContent = i;

        btn.className = `
        px-3 py-1 border rounded text-sm
        ${i === currentPage ? "bg-primary text-white" : "bg-white"}
        `;

        btn.onclick = () => {

            currentPage = i;

            renderTable();
            renderPagination();

        };

        container.appendChild(btn);

    }

}
// ===============================
// CALCULATE STATISTICS
// ===============================

async function calculateStatistics() {
    // 1. Total Arsip
    const totalArsip = allArchives.length;
    const totalArsipEl = document.getElementById("totalArsipStat");
    if (totalArsipEl) {
        totalArsipEl.textContent = totalArsip;
    }

    // 2. Kategori Terbanyak
    const categoryCount = {};
    allArchives.forEach(item => {
        const cat = item.kategori || "Unknown";
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
    const topCategoryEl = document.getElementById("topCategoryStat");
    if (topCategoryEl) {
        topCategoryEl.textContent = topCategory ? topCategory[0] : "-";
    }

    // 3. Get Last Accessed Archive from activity logs
    try {
        const q = query(
            collection(db, "activityLogs"),
            orderBy("accessTime", "desc"),
            limit(100)
        );

        const snapshot = await getDocs(q);
        const userLogs = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.userId === currentUserUID) {
                userLogs.push(data);
            }
        });

        if (userLogs.length > 0) {
            const lastLog = userLogs[0];
            lastAccessedArchive = {
                fileId: lastLog.fileId,
                nama: lastLog.fileName,
                lastAccessTime: lastLog.accessTime
            };
        }
    } catch (error) {
        console.error("Error fetching last accessed archive:", error);
    }

    // Update UI untuk last accessed
    const lastAccessedEl = document.getElementById("lastAccessedStat");
    const lastAccessedTimeEl = document.getElementById("lastAccessedTime");
    
    if (lastAccessedArchive) {
        if (lastAccessedEl) {
            lastAccessedEl.textContent = lastAccessedArchive.nama || "-";
        }
        
        if (lastAccessedTimeEl && lastAccessedArchive.lastAccessTime) {
            const date = lastAccessedArchive.lastAccessTime?.toDate ? 
                new Date(lastAccessedArchive.lastAccessTime.toDate()) : 
                new Date(lastAccessedArchive.lastAccessTime);
            const timeString = date.toLocaleString('id-ID', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            lastAccessedTimeEl.textContent = timeString;
        }
    } else {
        if (lastAccessedEl) lastAccessedEl.textContent = "-";
        if (lastAccessedTimeEl) lastAccessedTimeEl.textContent = "-";
    }
}

// ===============================
// LOG ACCESS - SAVE TO ACTIVITY LOGS
// ===============================

async function logAccess(fileId, fileName) {

    async function increaseFileAccessCount(fileId){

try{

const fileRef = doc(db,"files",fileId);

const fileSnap = await getDoc(fileRef);

if(fileSnap.exists()){

const data = fileSnap.data();

const count = data.accessCount || 0;

await updateDoc(fileRef,{
accessCount: count + 1
});

}

}catch(err){

console.error("Access counter error:",err);

}

}

    try {
        // Get user email from users collection
        const userRef = doc(db, "users", currentUserUID);
        const userSnap = await getDoc(userRef);
        const userEmail = userSnap.exists() ? userSnap.data().email : "unknown";

        // Standardized activity log entry
        const logEntry = {
            uid: currentUserUID,
            userEmail: userEmail,
            action: "access",
            fileName: fileName,
            fileId: fileId,
            status: "success",
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "activityLogs"), logEntry);
        console.log("Access logged successfully");

        // Update last accessed info
        if (userSnap.exists()) {
            const lastAccessedData = {
                fileId: fileId,
                fileName: fileName,
                lastAccessTime: Timestamp.now()
            };
            
            // Update user document dengan last accessed info
            lastAccessedArchive = lastAccessedData;
            await calculateStatistics();
        }

    } catch (error) {
        console.error("Error logging access:", error);
    }
}

async function logLogin(){

try{

const user = auth.currentUser;

await addDoc(collection(db,"activityLogs"),{

uid: user.uid,
userEmail: user.email,

action: "login",

fileId: "-",
fileName: "-",

status: "success",

timestamp: serverTimestamp()

});

console.log("Login logged");

}catch(err){

console.error("Login log error:",err);

}

}

async function increaseFileAccessCount(fileId){

try{

const fileRef = doc(db,"files",fileId);
const fileSnap = await getDoc(fileRef);

if(fileSnap.exists()){

const data = fileSnap.data();
const currentCount = data.accessCount || 0;

await updateDoc(fileRef,{
accessCount: currentCount + 1
});

}

}catch(err){

console.error("Access count error:",err);

}

}

async function updateLastActive(){

try{

const user = auth.currentUser;

await updateDoc(doc(db,"users",user.uid),{

lastActive: serverTimestamp()

});

}catch(err){

console.error("Last active update error:",err);

}

}

// ===============================
// LOAD ACTIVITY LOGS
// ===============================

async function loadActivityLogs() {
    try {
        const logsBody = document.getElementById("activityLogsBody");
        if (!logsBody) return;

        // Query activity logs terbaru untuk user saat ini
        const q = query(
            collection(db, "activityLogs"),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        const snapshot = await getDocs(q);

        // Filter hanya logs milik user saat ini (hanya akses mereka sendiri)
        const userLogs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.uid === currentUserUID) {
                userLogs.push(data);
            }
        });

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

        // Limit to 10 most recent logs
        const displayLogs = userLogs.slice(0, 10);
        
        logsBody.innerHTML = "";

        displayLogs.forEach((log) => {
            const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            const dateString = date.toLocaleString('id-ID', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const row = `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <td class="px-6 py-4 text-sm font-medium text-slate-800 dark:text-white">
                    ${dateString}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800 dark:text-white">
                    ${log.fileName || "-"}
                </td>
                <td class="px-6 py-4 text-sm text-slate-500">
                    ${log.action === "login" ? "User login to Dashboard" : "File accessed from Dashboard"}
                </td>
            </tr>
            `;

            logsBody.innerHTML += row;
        });

    } catch (error) {
        console.error("Error loading activity logs:", error);
    }
}

// ===============================
// HANDLE ARCHIVE ACCESS
// ===============================

async function handleArchiveAccess(fileId, fileName) {
    // Log the access and wait for it to complete
    await logAccess(fileId, fileName);
    await increaseFileAccessCount(fileId);
    await updateLastActive();
    
    // Refresh activity logs after access is logged
    await loadActivityLogs();

    // Find the archive and open it
    const archive = allArchives.find(a => a.id === fileId);
    if (archive && archive.driveFileId) {
        window.open(archive.driveFileId, '_blank');
    }
}

// ===============================
// OPEN LAST ACCESSED ARCHIVE
// ===============================

function openLastAccessedArchive() {
    if (!lastAccessedArchive || !lastAccessedArchive.fileId) {
        console.log("No last accessed archive found");
        return;
    }

    const archive = allArchives.find(a => a.id === lastAccessedArchive.fileId);
    if (archive && archive.driveFileId) {
        window.open(archive.driveFileId, '_blank');
    }
}

// ===============================
// LOGOUT
// ===============================

// Expose functions to global scope for HTML onclick handlers
window.handleArchiveAccess = handleArchiveAccess;
window.openLastAccessedArchive = openLastAccessedArchive;

const logoutBtn = document.getElementById("confirmLogoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

        try {

            await signOut(auth);

            window.location.href = "../index.html";

        } catch (error) {

            console.error("Logout error:", error);

        }

    });

}

// ===============================
// PROFILE BUTTON
// ===============================

function setupProfileRedirect() {

const profileBtn = document.getElementById("profileBtn");

if(!profileBtn) return;

profileBtn.addEventListener("click",()=>{

window.location.href = "profile-pegawai.html";

});

}

// ===============================
// PROFILE CARD CLICK
// ===============================

const profileCard = document.getElementById("profileCard");

if(profileCard){

profileCard.addEventListener("click",()=>{

window.location.href = "profile-pegawai.html";

});

}