import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyBgu4wWGy6KjcKWIetMEbnA1SQbZlyrklg",
  authDomain: "fakeyt-bc0e1.firebaseapp.com",
  projectId: "fakeyt-bc0e1",
  storageBucket: "fakeyt-bc0e1.firebasestorage.app",
  messagingSenderId: "1018153563780",
  appId: "1:1018153563780:web:770cd336acf0183849f4d1",
  measurementId: "G-RCDJPNH7Y1"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 關鍵在這裡：定義 db 並記得 export 出去！
const db = getFirestore(app);
export const auth = getAuth(app);
export { db };