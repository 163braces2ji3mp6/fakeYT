import { db } from './firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc,       // 💡 剛才這裡漏掉了，這次確實引入！
  doc, 
  updateDoc, 
  increment, 
  serverTimestamp 
} from "firebase/firestore";

/**
 * 🔄 即時同步雲端影片清單（大寫 Videos 版）
 */
export function subscribeToVideos(callback) {
  try {
    const q = query(collection(db, "Videos"), orderBy("createdAt", "desc"));
    
    return onSnapshot(q, (querySnapshot) => {
      const firebaseVideos = [];
      querySnapshot.forEach((doc) => {
        firebaseVideos.push({ 
          id: doc.id, 
          ...doc.data() 
        });
      });
      callback(firebaseVideos);
    }, (error) => {
      console.error("Firebase 即時監聽失敗：", error);
      callback([]); 
    });
  } catch (err) {
    console.error("初始化 Firebase 監聽發生嚴重錯誤：", err);
    callback([]);
    return () => {}; 
  }
}

/**
 * 🚀 上傳新影片到 Firestore（大寫 Videos 版）
 */
export async function uploadVideoToFirebase(videoData) {
  try {
    if (!db) {
      throw new Error("Firestore db 物件尚未初始化，請檢查 firebase.js 設定！");
    }
    
    console.log("🚀 [Service] 正在寫入大寫 Videos 集合...");
    return await addDoc(collection(db, "Videos"), {
      ...videoData,
      createdAt: serverTimestamp() 
    });
  } catch (error) {
    console.error("🚀 [Service] 寫入失敗：", error);
    throw error;
  }
}

/**
 * 🔥 更新影片觀看次數 (+1)（大寫 Videos 版）
 */
export async function incrementVideoViews(videoId) {
  try {
    const videoRef = doc(db, "Videos", videoId);
    return await updateDoc(videoRef, {
      views: increment(1)
    });
  } catch (error) {
    console.error("🚀 [Service] 觀看次數更新失敗：", error);
    throw error;
  }
}