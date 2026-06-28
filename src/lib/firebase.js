// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; 
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyD8x_8o_0eQrr6scddrElqFdmnBY3pB5bs",
  authDomain: "tapvoice-d3339.firebaseapp.com",
  databaseURL: "https://tapvoice-d3339-default-rtdb.firebaseio.com",
  projectId: "tapvoice-d3339",
  storageBucket: "tapvoice-d3339.firebasestorage.app",
  messagingSenderId: "629989051404", // Fixed: Removed the space in the number
  appId: "1:629989051404:web:286f05840a200670327229",
  measurementId: "G-MFSYN3REX4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Database and export it so audio.js can use it
export const db = getDatabase(app);