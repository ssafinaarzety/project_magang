import { initializeApp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import { getAuth } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getStorage }
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAtoTMSa_0i1L6u-YWCwOZGCyotbLAn3uI",
  authDomain: "e-arsip-binamarga.firebaseapp.com",
  projectId: "e-arsip-binamarga",
  storageBucket: "e-arsip-binamarga.firebasestorage.app",
  messagingSenderId: "639377403785",
  appId: "1:639377403785:web:cde2c9dfbf1f17edeefb58"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);