import { db } from './firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "firebase/firestore";

/**
 * 🕒 將時間轉換為「距離現在多久」的 YouTube 風格相對時間字串
 * @param {any} timestamp - Firebase Timestamp、Date 物件、或時間戳記
 * @returns {string} 例如：「5 分鐘前」、「3 小時前」、「1 天前」
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '剛剛';

  let date;

  if (timestamp && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return '未知時間';

  const now = new Date();
  const secondsPast = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsPast < 0 || secondsPast < 60) return '剛剛';

  const minutesPast = Math.floor(secondsPast / 60);
  if (minutesPast < 60) return `${minutesPast} 分鐘前`;

  const hoursPast = Math.floor(minutesPast / 60);
  if (hoursPast < 24) return `${hoursPast} 小時前`;

  const daysPast = Math.floor(hoursPast / 24);
  if (daysPast < 30) return `${daysPast} 天前`;

  const monthsPast = Math.floor(daysPast / 30);
  if (monthsPast < 12) return `${monthsPast} 個月前`;

  const yearsPast = Math.floor(monthsPast / 12);
  return `${yearsPast} 年前`;
}

/* =========================================================
   Channel ID Helpers / 頻道 ID 雙軌工具
   ---------------------------------------------------------
   ✅ 新資料只寫 Channels/{userId}
   ✅ 舊資料 Channels/{username} 只讀取 fallback
   ✅ avatar 會跟著 Channels/{userId} 一起更新
========================================================= */
const getChannelNameFromData = (data = {}) => {
  return (
    data.name ||
    data.username ||
    data.channelName ||
    data.channel ||
    data.creatorName ||
    data.author ||
    ''
  );
};

const getChannelAvatarFromData = (data = {}) => {
  return data.avatar || data.creatorAvatar || data.channelAvatar || '';
};

const normalizeChannelInput = (channelInput = {}, fallback = {}) => {
  if (typeof channelInput === 'string') {
    return {
      name: channelInput,
      username: channelInput,
      channelName: channelInput,
      userId: fallback.userId || '',
      avatar: fallback.avatar || ''
    };
  }

  const name = getChannelNameFromData(channelInput) || getChannelNameFromData(fallback);
  const avatar = getChannelAvatarFromData(channelInput) || getChannelAvatarFromData(fallback);

  return {
    ...fallback,
    ...channelInput,
    name,
    username: channelInput.username || channelInput.name || channelInput.channelName || name,
    channelName: channelInput.channelName || channelInput.name || channelInput.username || name,
    userId: channelInput.userId || channelInput.uid || fallback.userId || '',
    avatar
  };
};

const findChannelByName = async (channelName) => {
  if (!channelName) return null;

  const fieldsToCheck = ['username', 'name', 'channelName'];

  for (const fieldName of fieldsToCheck) {
    const q = query(
      collection(db, 'Channels'),
      where(fieldName, '==', channelName)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const channelDoc = snapshot.docs[0];
      return {
        id: channelDoc.id,
        ...channelDoc.data()
      };
    }
  }

  // 舊資料 fallback：Channels/{username}
  const legacySnap = await getDoc(doc(db, 'Channels', channelName));
  if (legacySnap.exists()) {
    return {
      id: legacySnap.id,
      ...legacySnap.data()
    };
  }

  return null;
};

const resolveChannelId = async (channelInput) => {
  const normalized = normalizeChannelInput(channelInput);

  if (normalized.userId) {
    return {
      channelId: normalized.userId,
      channelData: normalized
    };
  }

  if (normalized.name) {
    const found = await findChannelByName(normalized.name);

    if (found) {
      return {
        channelId: found.userId || found.canonicalChannelId || found.id,
        channelData: normalizeChannelInput(found, normalized)
      };
    }
  }

  return {
    channelId: '',
    channelData: normalized
  };
};

const upsertChannelByUserId = async (channelInput) => {
  const normalized = normalizeChannelInput(channelInput);

  if (!normalized.userId) return null;

  const channelRef = doc(db, 'Channels', normalized.userId);
  const channelSnap = await getDoc(channelRef);

  const payload = {
    userId: normalized.userId,
    name: normalized.name,
    username: normalized.username || normalized.name,
    channelName: normalized.channelName || normalized.name,
    updatedAt: serverTimestamp()
  };

  if (normalized.avatar) payload.avatar = normalized.avatar;

  // 只有第一次建立才初始化 subscriberCount，避免覆蓋既有訂閱數
  if (!channelSnap.exists()) {
    payload.subscriberCount = Number(normalized.subscriberCount ?? 0);
    payload.createdAt = serverTimestamp();
  }

  await setDoc(channelRef, payload, { merge: true });
  return channelRef;
};

/**
 * 🔄 即時同步雲端影片清單（大寫 Videos 版）
 */
export function subscribeToVideos(callback) {
  try {
    const q = query(collection(db, "Videos"), orderBy("createdAt", "desc"));

    return onSnapshot(q, (querySnapshot) => {
      const firebaseVideos = [];

      querySnapshot.forEach((videoDoc) => {
        firebaseVideos.push({
          id: videoDoc.id,
          ...videoDoc.data()
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
 * 新資料會同步更新 Channels/{userId} 的 name / avatar，不再建立 Channels/{username}
 */
export async function uploadVideoToFirebase(videoData) {
  try {
    if (!db) {
      throw new Error("Firestore db 物件尚未初始化，請檢查 firebase.js 設定！");
    }

    const channelPayload = normalizeChannelInput({
      userId: videoData.userId,
      name: videoData.channel || videoData.creatorName || videoData.username || videoData.author,
      username: videoData.username || videoData.channel || videoData.creatorName || videoData.author,
      channelName: videoData.channelName || videoData.channel || videoData.creatorName || videoData.username || videoData.author,
      avatar: videoData.avatar || videoData.creatorAvatar || videoData.channelAvatar,
      subscriberCount: videoData.subscriberCount
    });

    // 🟢 有 userId 才寫 Channels/{userId}；沒有 userId 不再新建 Channels/{channelName}
    if (channelPayload.userId) {
      await upsertChannelByUserId(channelPayload);
    }

    console.log("🚀 [Service] 正在寫入大寫 Videos 集合...");

    return await addDoc(collection(db, "Videos"), {
      ...videoData,
      userId: videoData.userId || channelPayload.userId || '',
      channel: videoData.channel || channelPayload.name,
      creatorName: videoData.creatorName || channelPayload.name,
      username: videoData.username || channelPayload.name,
      channelName: videoData.channelName || channelPayload.channelName || channelPayload.name,
      avatar: videoData.avatar || channelPayload.avatar,
      creatorAvatar: videoData.creatorAvatar || channelPayload.avatar,
      channelAvatar: videoData.channelAvatar || channelPayload.avatar,
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
 * 📢 即時監聽特定頻道的資訊與訂閱數
 * 支援 channelInfo 物件：{ userId, name, avatar }
 * 讀取：優先 Channels/{userId}，fallback 舊版 Channels/{username}
 * 寫入：只有有 userId 時才初始化 Channels/{userId}
 */
export function subscribeToChannelData(channelInput, callback) {
  const normalized = normalizeChannelInput(channelInput);

  if (!normalized.userId && !normalized.name) return () => {};

  let unsubscribed = false;
  let unsubscribePrimary = null;
  let unsubscribeFallback = null;

  const emitData = (snapshot, fallbackData = normalized) => {
    if (!snapshot?.exists?.()) return false;

    const data = snapshot.data();
    callback({
      id: snapshot.id,
      ...data,
      userId: data.userId || fallbackData.userId || snapshot.id,
      name: data.name || data.username || data.channelName || fallbackData.name,
      username: data.username || data.name || data.channelName || fallbackData.username || fallbackData.name,
      channelName: data.channelName || data.name || data.username || fallbackData.channelName || fallbackData.name,
      avatar: data.avatar || fallbackData.avatar || '',
      subscriberCount: Number(data.subscriberCount ?? fallbackData.subscriberCount ?? 0)
    });

    return true;
  };

  const subscribeFallbackByName = () => {
    if (!normalized.name || unsubscribed) return;

    unsubscribeFallback = onSnapshot(
      doc(db, "Channels", normalized.name),
      (legacySnapshot) => {
        if (unsubscribed) return;
        emitData(legacySnapshot, normalized);
      },
      (error) => {
        console.error("舊版 Channels/{username} 監聽失敗:", error);
      }
    );
  };

  if (normalized.userId) {
    const channelRef = doc(db, "Channels", normalized.userId);

    unsubscribePrimary = onSnapshot(channelRef, async (docSnapshot) => {
      if (unsubscribed) return;

      if (docSnapshot.exists()) {
        emitData(docSnapshot, normalized);
        return;
      }

      try {
        // 🟢 新資料只初始化 Channels/{userId}
        await upsertChannelByUserId({
          ...normalized,
          subscriberCount: 0
        });
      } catch (err) {
        console.error("自動建立 Channels/{userId} 頻道資料失敗:", err);
      }

      if (!unsubscribeFallback) subscribeFallbackByName();
    });
  } else {
    // 沒有 userId 時只讀舊版 fallback，不新建 Channels/{username}
    subscribeFallbackByName();
  }

  return () => {
    unsubscribed = true;
    if (unsubscribePrimary) unsubscribePrimary();
    if (unsubscribeFallback) unsubscribeFallback();
  };
}

/**
 * 🔔 變更雲端頻道的訂閱人數 (isSubscribing ? +1 : -1)
 * 支援 channelInfo 物件：{ userId, name, avatar }
 * 會優先更新 Channels/{userId}。
 */
export async function toggleChannelSubscription(channelInput, isSubscribing) {
  try {
    const { channelId, channelData } = await resolveChannelId(channelInput);

    if (!channelId) {
      console.warn("找不到頻道 userId，略過訂閱數更新：", channelInput);
      return;
    }

    const channelRef = doc(db, "Channels", channelId);

    const updatePayload = {
      subscriberCount: increment(isSubscribing ? 1 : -1),
      updatedAt: serverTimestamp()
    };

    if (channelData.userId || channelId) updatePayload.userId = channelData.userId || channelId;
    if (channelData.name) updatePayload.name = channelData.name;
    if (channelData.username || channelData.name) updatePayload.username = channelData.username || channelData.name;
    if (channelData.channelName || channelData.name) updatePayload.channelName = channelData.channelName || channelData.name;
    if (channelData.avatar) updatePayload.avatar = channelData.avatar;

    await setDoc(channelRef, updatePayload, { merge: true });
  } catch (error) {
    console.error("更新雲端頻道訂閱數失敗:", error);
  }
}
