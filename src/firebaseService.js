import { db } from './firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc,      
  doc, 
  getDoc,
  setDoc,
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

/**
 * 📢 即時監聽特定頻道的資訊與訂閱數（包含自動初始化機制）
 */
export function subscribeToChannelData(channelName, callback) {
  if (!channelName) return () => {};
  
  // 💡 以頻道名稱作為 Document ID
  const channelRef = doc(db, "Channels", channelName);
  
  return onSnapshot(channelRef, async (docSnapshot) => {
    if (docSnapshot.exists()) {
      callback(docSnapshot.data());
    } else {
      // 💡 如果雲端尚未存在這個帳號，自動建立，並給予一個隨機的「基礎訂閱人數」充場面（1000 ~ 50000）
      const baseSubs = Math.floor(1000 + Math.random() * 9000);
      const initialData = {
        name: channelName,
        subscriberCount: baseSubs,
        createdAt: serverTimestamp()
      };
      try {
        await setDoc(channelRef, initialData);
        callback(initialData);
      } catch (err) {
        console.error("自動建立雲端頻道資料失敗:", err);
        callback({ name: channelName, subscriberCount: 0 });
      }
    }
  });
}

/**
 * 🔔 變更雲端頻道的訂閱人數 (isSubscribing ? +1 : -1)
 */
export async function toggleChannelSubscription(channelName, isSubscribing) {
  try {
    const channelRef = doc(db, "Channels", channelName);
    await updateDoc(channelRef, {
      subscriberCount: increment(isSubscribing ? 1 : -1)
    });
  } catch (error) {
    console.error("更新雲端頻道訂閱數失敗:", error);
  }
}