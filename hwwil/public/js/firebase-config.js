// ══════════════════════════════════════
// firebase-config.js
// ══════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA4W0Rq_Rd7c7zmh-Vuw8YV9v4WDFCgoeI",
  authDomain:        "hawwil2.firebaseapp.com",
  projectId:         "hawwil2",
  storageBucket:     "hawwil2.firebasestorage.app",
  messagingSenderId: "350634992471",
  appId:             "1:350634992471:web:96e296f582dda728829412"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
