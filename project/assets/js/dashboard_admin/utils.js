// ===============================
// VALIDATE GOOGLE SHEETS LINK
// ===============================
export function isValidSpreadsheetLink(link) {

    if (!link) return false;

    try {

        const parsed = new URL(link.trim());

        // hanya terima docs.google.com
        if (!parsed.hostname.includes("docs.google.com")) return false;

        // path spreadsheet
        const regex = /^\/spreadsheets\/d\/[a-zA-Z0-9_-]+/;

        return regex.test(parsed.pathname);

    } catch {

        return false;

    }

}


// ===============================
// GET FILE EXTENSION
// ===============================
export function getFileExtension(fileName = "") {

    if (!fileName || typeof fileName !== "string") return "";

    const parts = fileName.toLowerCase().split(".");

    return parts.length > 1 ? parts.pop() : "";

}


// ===============================
// SANITIZE FILE NAME
// ===============================
export function sanitizeFileName(fileName = "file") {

    if (!fileName) return "file";

    const clean = fileName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_");

    return clean.slice(0, 120);

}


// ===============================
// CATEGORY FORMAT
// ===============================
export function toTitleCaseCategory(value = "") {

    if (!value) return "";

    const text = value.trim().toLowerCase();

    return text.charAt(0).toUpperCase() + text.slice(1);

}


// ===============================
// VALIDATE YEAR
// ===============================
export function isValidYearValue(year) {

    const value = Number(year);

    return Number.isInteger(value) && value >= 1900 && value <= 2100;

}

export function getFileIcon(type = "") {

    type = type.toLowerCase();

    if (type.includes("pdf")) {
        return "picture_as_pdf";
    }

    if (type.includes("xls") || type.includes("csv")) {
        return "table_chart";
    }

    if (type.includes("sheet")) {
        return "grid_on";
    }

    return "description";

}