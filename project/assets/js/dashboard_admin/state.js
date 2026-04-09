// ===============================
// GLOBAL STATE
// ===============================

// selected file access
export let selectedFileId = null;
export let selectedAccessUsers = [];

// pagination
export let lastVisibleDoc = null;
export let currentPage = 1;
export let currentPageData = [];

// filters
export let currentFilters = {};

// upload & edit
export let selectedUploadFiles = [];
export let selectedEditFiles = [];
export let activeEditItem = null;

// table config
export const PAGE_SIZE = 10;

// ===============================
// RESET ACCESS STATE
// ===============================
export function resetAccessState(){

selectedFileId = null;
selectedAccessUsers = [];

}

// ===============================
// RESET PAGINATION
// ===============================
export function resetPagination(){

lastVisibleDoc = null;
currentPage = 1;
currentPageData = [];

}

// ===============================
// RESET UPLOAD STATE
// ===============================
export function resetUploadState(){

selectedUploadFiles = [];

}

// ===============================
// RESET EDIT STATE
// ===============================
export function resetEditState(){

selectedEditFiles = [];
activeEditItem = null;

}

// ===============================
// RESET FILTERS
// ===============================
export function resetFilters(){

currentFilters = {};

}