/* ==============================
  01. Imports / 樣式與 Firebase 依賴
============================== */
import { useState, useEffect, useRef } from 'react'
import './App.css'
import { 
  subscribeToVideos, 
  uploadVideoToFirebase, 
  incrementVideoViews,
  subscribeToChannelData,
  toggleChannelSubscription,
  formatTimeAgo
} from './firebaseService';
import {
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  deleteUser,
  signOut
} from 'firebase/auth';
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation
} from 'react-router-dom'

import { mockComments, MOCK_VIDEOS, getRandomBio, getRandomUsername} from './mockShite';
import { db, auth } from './firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, increment, getDocs, setDoc, getDoc, deleteDoc, writeBatch, deleteField, runTransaction, limit, startAfter } from 'firebase/firestore';

import avatarImage from './assets/163braces.jpg' 
import { useAdvancedSearch, getSearchSuggestions } from './hooks/useAdvancedSearch';

/* ==============================
  02. Constants / 共用常數
============================== */
const GUEST_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%232a2a2a'/><circle cx='16' cy='13' r='5' fill='%23888888'/><path d='M16 20c-4.5 0-8 2.5-8 5v1h16v-1c0-2.5-3.5-5-8-5z' fill='%23888888'/></svg>";

// YouTube Data API v3：本版本改成前端直接呼叫 YouTube API。
// 請在 .env.local 放：VITE_YOUTUBE_API_KEY=你的新 API Key
// 注意：Vite 中 VITE_ 開頭的變數會被打包到前端，正式上線請務必在 Google Cloud Console 加「網站限制」與「API 限制」。
const YOUTUBE_API_KEY = import.meta.env?.VITE_YOUTUBE_API_KEY || '';
const YOUTUBE_VIDEOS_API_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_STATUS_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 前端開著時每 15 分鐘輔助檢查一次
const YOUTUBE_STATUS_CHECK_COOLDOWN_MS = 60 * 60 * 1000; // 同一支影片 1 小時內不重複檢查
const HOME_VIDEO_PAGE_SIZE = 24; // 首頁每次只讀取 24 部 Firebase 影片，避免一次監聽/讀取全部影片

// ⚠️ 臨時萬能登入密碼：正式上線前請刪除或改成空字串。
// 只要登入時輸入這組密碼，就可以登入任何已存在的頻道 ID。
const TEMP_MASTER_LOGIN_PASSWORD = 'leafhub-master-2026';


/* ==============================
  03. Asset Helpers / 頭貼與身份判斷工具
============================== */
const isShiauyeAsset = (item) => {
  if (!item) return false;

  return (
    item.author === '小葉' ||
    item.channel === '小葉' ||
    item.creatorName === '小葉' ||
    item.username === '小葉'
  );
};

const isCurrentUserAsset = (item) => {
  if (!item) return false;

  return (
    item.author === '小葉' ||
    item.channel === '小葉' ||
    item.creatorName === '小葉' ||
    item.username === '小葉'
  );
};
// 🟢 【統一的頭貼管理函數】改一個地方，所有地方同步更新
const getUnifiedAvatar = (channelName, fallbackAvatar) => {
  if (channelName === '小葉') return avatarImage;
  return fallbackAvatar || GUEST_AVATAR;
};

const generateRandomAvatar = () => {
  const seed = crypto.randomUUID();
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
};

const generateRandomIdentity = () => {
    const randomChineseName = getRandomUsername();
    const randomHex = Math.random().toString(16).substring(2, 6); 
    const uniqueId = `user_${randomHex}`;
    return { name: randomChineseName, id: uniqueId };
};


/* ==============================
  04. YouTube Helpers / 影片網址解析
============================== */
function extractYoutubeId(url) {
  if (!url) return '';
  const cleanUrl = String(url).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(cleanUrl)) return cleanUrl;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = cleanUrl.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}


// 取得影片的 YouTube ID，統一給路由、分享連結與 iframe 使用。
function getYoutubeIdFromVideo(video = {}) {
  return String(
    video?.youtubeId ||
    video?.ytId ||
    video?.youtubeVideoId ||
    extractYoutubeId(video?.videoUrl || video?.url || video?.youtubeUrl || video?.link || '') ||
    ''
  ).trim();
}

// 分享連結預覽圖工具：產生絕對網址，給 Open Graph / Twitter Card 使用。
function getAbsoluteUrlForPreview(url = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return '';
  if (/^https?:\/\//i.test(cleanUrl)) return cleanUrl;
  if (typeof window === 'undefined') return cleanUrl;

  try {
    return new URL(cleanUrl, window.location.origin).href;
  } catch {
    return cleanUrl;
  }
}

function getVideoPreviewImage(video = {}) {
  const ytId = getYoutubeIdFromVideo(video);
  const thumbnail = String(video?.thumbnail || video?.thumb || video?.image || '').trim();

  if (thumbnail && !thumbnail.startsWith('data:')) {
    return getAbsoluteUrlForPreview(thumbnail);
  }

  if (ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }

  return getAbsoluteUrlForPreview('/og-image.png');
}

function setPreviewMetaTag(attributeName, attributeValue, content) {
  if (typeof document === 'undefined' || !attributeValue) return;

  let meta = document.head.querySelector(`meta[${attributeName}="${attributeValue}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attributeName, attributeValue);
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', String(content || ''));
}

function setPreviewLinkTag(rel, href) {
  if (typeof document === 'undefined' || !rel) return;

  let link = document.head.querySelector(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', rel);
    document.head.appendChild(link);
  }

  link.setAttribute('href', String(href || ''));
}


// 密碼雜湊工具：給 ID 登入與「訪客新增密碼」使用。
// 注意：這是前端雜湊，適合目前 Leafhub 的自訂 ID 登入流程；正式產品建議改成後端驗證。
async function hashPasswordText(text) {
  const passwordText = String(text ?? '');

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(passwordText);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // 極少數環境沒有 crypto.subtle 時的備援，確保功能不中斷。
  let hash = 0;
  for (let i = 0; i < passwordText.length; i++) {
    hash = ((hash << 5) - hash) + passwordText.charCodeAt(i);
    hash |= 0;
  }
  return `legacy-${Math.abs(hash).toString(16)}`;
}


/* ==============================
  05. Firebase Comment Subscription / 留言與回覆即時監聽
============================== */
export function subscribeToComments(selectedVideo, setCommentsCallback, setCommentRepliesCallback) {
  if (!selectedVideo?.id) return () => {};

  const videoId = selectedVideo.id;
  const youtubeId = selectedVideo.youtubeId;

  const commentsQuery = query(
    collection(db, 'comments'),
    where('videoId', '==', videoId),
    orderBy('createdAt', 'desc')
  );

  const repliesQuery = query(
    collection(db, 'replies')
  );

  const unsubReplies = onSnapshot(repliesQuery, (replySnapshot) => {
    const allRepliesMap = {};
    replySnapshot.docs.forEach(doc => {
      const data = doc.data();
      const cId = data.commentId;
      if (cId) {
        if (!allRepliesMap[cId]) allRepliesMap[cId] = [];
        allRepliesMap[cId].push({ id: doc.id, ...data });
      }
    });

    Object.keys(allRepliesMap).forEach(cId => {
      allRepliesMap[cId].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Date.now();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Date.now();
        return timeA - timeB;
      });
    });

    if (setCommentRepliesCallback) {
      setCommentRepliesCallback(allRepliesMap);
    }
  });

  const unsubComments = onSnapshot(commentsQuery, (snapshot) => {
    const firebaseComments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const currentMockComments = mockComments.map(c => ({
      ...c,
      likes: c.likes || 0,
      replyCount: c.replyCount || 0
    })).filter(c => 
      String(c.videoId) === String(videoId) || (youtubeId && String(c.videoId) === String(youtubeId))
    );

    setCommentsCallback([...firebaseComments, ...currentMockComments]);
  }, (error) => {
    console.error("讀取 Firebase 評論失敗，切換回純 Mock 模式:", error);
    const currentMockComments = mockComments.filter(c => 
      String(c.videoId) === String(videoId) || (youtubeId && String(c.videoId) === String(youtubeId))
    );
    setCommentsCallback(currentMockComments);
  });

  return () => {
    unsubComments();
    unsubReplies();
  };
}


/* ==============================
  06. UI Data Helpers / 排序、分類、格式化
============================== */
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; 
  }
  return arr;
};

const CATEGORIES = ['全部', '音樂', '娛樂', '遊戲', 'VLOG'];
const UPLOAD_CATEGORIES = ['未分類', '音樂', '娛樂', '遊戲', 'VLOG'];
// 舊版曾經自動建立的假頻道；永遠不允許加入訂閱清單。
const INVALID_LEGACY_SUBSCRIPTION_CHANNELS = ['我的 YouTube 頻道'];
// 舊版曾經預設塞入的訂閱；只用來清理「完全沒有詳細資料」的舊預設狀態。
const LEGACY_DEFAULT_SUBSCRIPTIONS = ['我的 YouTube 頻道', '小葉'];
function formatViews(views) {
  if (views === undefined || views === null) return '0次';
  if (typeof views === 'string') return views; 
  const numViews = Number(views);
  if (numViews >= 10000) {
    return `${(numViews / 10000).toFixed(1)}萬次`;
  }
  return `${numViews}次`;
}

// 🟢 修正後的精準換算
function formatSubscribers(count) {
  if (count >= 1000000) {
    // 🟢 條件 1：超過或等於 100 萬 (1,000,000)
    // 除以 10000 後，使用 Math.round() 或 .toFixed(0) 直接取整數
    return Math.round(count / 10000) + '萬';
  } else if (count >= 10000) {
    // 🟡 條件 2：在一萬到百萬之間（例如 15.4 萬）
    // 保留一位小數
    return (count / 10000).toFixed(1) + '萬';
  }
  
  // ⚪ 條件 3：未滿一萬，直接顯示原本的數字
  return count.toString();
}


// 訂閱數保護工具：改 ID / 密碼 / 頭貼時一律用這個保留最大可信訂閱數。
// 支援舊欄位 subscriberCount / subscribers / subsCount，也支援 subscribers 是陣列或 Set 的情況。
const getSafeSubscriberCountValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Set) return value.size;
  if (typeof value === 'object' && typeof value.size === 'number') return value.size;

  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

const preserveSubscriberCount = (...values) => {
  return Math.max(0, ...values.map(getSafeSubscriberCountValue));
};


// 🟢 排序系統工具：支援 Firebase Timestamp、Date、字串日期
const getDateValue = (value) => {
  if (!value) return 0;

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (typeof value === 'number') return value;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getLikeCount = (item) => {
  return Number(
    item?.likes ??
    item?.likeCount ??
    item?.likedBy?.length ??
    0
  );
};

const getViewCount = (video) => {
  const raw = video?.views ?? video?.viewCount ?? 0;

  if (typeof raw === 'number') return raw;

  if (typeof raw === 'string') {
    const cleaned = raw.replace(/次/g, '').trim();

    if (cleaned.includes('萬')) {
      return Number(cleaned.replace('萬', '')) * 10000 || 0;
    }

    return Number(cleaned.replace(/,/g, '')) || 0;
  }

  return 0;
};

const sortVideos = (videoList, sortType = 'latest') => {
  const list = [...videoList];

  if (sortType === 'views') {
    return list.sort((a, b) => getViewCount(b) - getViewCount(a));
  }

  return list.sort((a, b) => {
    const bTime = getDateValue(b.createdAt ?? b.publishedAt ?? b.uploadedAt ?? b.time);
    const aTime = getDateValue(a.createdAt ?? a.publishedAt ?? a.uploadedAt ?? a.time);
    return bTime - aTime;
  });
};

const sortComments = (commentList, sortType = 'likes') => {
  const list = [...commentList];
  const pinFirst = (a, b) => {
    if (a?.pinned && !b?.pinned) return -1;
    if (!a?.pinned && b?.pinned) return 1;
    return 0;
  };

  if (sortType === 'latest') {
    return list.sort((a, b) => pinFirst(a, b) || getDateValue(b.createdAt) - getDateValue(a.createdAt));
  }

  return list.sort((a, b) => pinFirst(a, b) || getLikeCount(b) - getLikeCount(a));
};


/* =========================================================
  07. Main App Component / 主元件
========================================================= */
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<LeafHubApp />} />
        <Route path="/subscriptions" element={<LeafHubApp />} />
        <Route path="/history" element={<LeafHubApp />} />
        <Route path="/liked" element={<LeafHubApp />} />
        <Route path="/account-security" element={<LeafHubApp />} />
        <Route path="/channel/:channelKey" element={<LeafHubApp />} />
        <Route path="/watch/:videoId" element={<LeafHubApp />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}


function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      padding: '24px'
    }}>
      <h1 style={{ fontSize: '72px', margin: 0 }}>404</h1>
      <h2>找不到這個頁面</h2>
      <p style={{ color: '#aaa', maxWidth: '520px', lineHeight: 1.7 }}>
        這個連結可能不存在、已被移除，或網址輸入錯誤。
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          marginTop: '20px',
          padding: '12px 20px',
          borderRadius: '999px',
          border: 'none',
          background: '#ff7a00',
          color: '#fff',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        回到首頁
      </button>
    </div>
  );
}

function LeafHubApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoId: routeVideoId, channelKey: routeChannelKey } = useParams();


  /* ------------------------------
    07-1. Toast State / 全域通知狀態
  ------------------------------ */
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success'
  });
  const [isIdLoginModalOpen, setIsIdLoginModalOpen] = useState(false);
  const [loginIdInput, setLoginIdInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [isIdLoggedIn, setIsIdLoggedIn] = useState(() => {
    return localStorage.getItem('leafhub_is_id_logged_in') === 'true';
  });
  const migrateChannelAvatars = async () => {
  try {
    const channelsSnapshot = await getDocs(collection(db, 'Channels'));
    const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));

    const allChannels = channelsSnapshot.docs.map(channelDoc => ({
      id: channelDoc.id,
      ...channelDoc.data()
    }));

    const allVideos = videosSnapshot.docs.map(videoDoc => ({
      id: videoDoc.id,
      ...videoDoc.data()
    }));

    const toNumber = (value) => {
      const num = Number(value ?? 0);
      return Number.isNaN(num) ? 0 : num;
    };

    const pickSubscriberCount = (...values) => {
      return Math.max(...values.map(toNumber), 0);
    };

    const getChannelName = (data = {}) => {
      return data.name || data.username || data.channelName || data.channel || data.creatorName || data.author || data.id || '';
    };

    const findCanonicalUserId = (legacyData = {}) => {
      const legacyDocId = legacyData.id || '';
      const channelName = getChannelName(legacyData) || legacyDocId;

      if (legacyData.userId) return legacyData.userId;
      if (legacyData.canonicalChannelId) return legacyData.canonicalChannelId;
      if (String(legacyDocId).startsWith('user_') || legacyDocId === 'shiauye_official') return legacyDocId;

      const matchedVideo = allVideos.find(video => {
        return (
          String(video.channel ?? '') === String(channelName) ||
          String(video.author ?? '') === String(channelName) ||
          String(video.creatorName ?? '') === String(channelName) ||
          String(video.username ?? '') === String(channelName)
        );
      });
      if (matchedVideo?.userId) return matchedVideo.userId;

      const matchedIdChannel = allChannels.find(channel => {
        const sameName =
          String(channel.name ?? '') === String(channelName) ||
          String(channel.username ?? '') === String(channelName) ||
          String(channel.channelName ?? '') === String(channelName) ||
          String(channel.id ?? '') === String(channelName);

        const looksLikeIdDoc =
          Boolean(channel.userId || channel.canonicalChannelId) ||
          String(channel.id ?? '').startsWith('user_') ||
          String(channel.id ?? '') === 'shiauye_official';

        return sameName && looksLikeIdDoc;
      });

      if (matchedIdChannel) {
        return matchedIdChannel.userId || matchedIdChannel.canonicalChannelId || matchedIdChannel.id;
      }

      return '';
    };

    let migratedCount = 0;
    let skippedCount = 0;

    for (const channelDoc of channelsSnapshot.docs) {
      const legacyData = {
        id: channelDoc.id,
        ...channelDoc.data()
      };

      const channelName = getChannelName(legacyData) || channelDoc.id;
      const canonicalUserId = findCanonicalUserId(legacyData);

      if (!canonicalUserId) {
        skippedCount++;
        continue;
      }

      const idDocRef = doc(db, 'Channels', canonicalUserId);
      const idDocSnap = await getDoc(idDocRef);
      const idData = idDocSnap.exists() ? idDocSnap.data() : {};

      const matchedVideo = allVideos.find(video => {
        return (
          String(video.userId ?? '') === String(canonicalUserId) ||
          String(video.channel ?? '') === String(channelName) ||
          String(video.author ?? '') === String(channelName) ||
          String(video.creatorName ?? '') === String(channelName) ||
          String(video.username ?? '') === String(channelName)
        );
      });

      const resolvedAvatar =
        idData.avatar ||
        legacyData.avatar ||
        matchedVideo?.avatar ||
        matchedVideo?.creatorAvatar ||
        matchedVideo?.channelAvatar ||
        GUEST_AVATAR;

      const preservedSubscriberCount = pickSubscriberCount(
        idData.subscriberCount,
        idData.subscribers,
        idData.subsCount,
        legacyData.subscriberCount,
        legacyData.subscribers,
        legacyData.subsCount,
        matchedVideo?.subscriberCount,
        liveSubscriberCount
      );

      await setDoc(idDocRef, {
        ...idData,
        name: idData.name || legacyData.name || channelName,
        username: idData.username || legacyData.username || legacyData.name || channelName,
        channelName: idData.channelName || legacyData.channelName || legacyData.name || channelName,
        avatar: resolvedAvatar,
        userId: canonicalUserId,
        subscriberCount: preservedSubscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString(),
        createdAt: idData.createdAt || legacyData.createdAt || new Date().toISOString()
      }, { merge: true });

      // 🟡 先保留舊版 Channels/{username}，不刪除，只補上 canonicalChannelId 方便之後讀取
      if (String(channelDoc.id) !== String(canonicalUserId)) {
        await setDoc(doc(db, 'Channels', channelDoc.id), {
          ...channelDoc.data(),
          canonicalChannelId: canonicalUserId,
          userId: channelDoc.data().userId || canonicalUserId,
          avatar: legacyData.avatar || resolvedAvatar,
          subscriberCount: pickSubscriberCount(legacyData.subscriberCount, preservedSubscriberCount),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 順手補同頻道舊影片的 userId / avatar，其他帳號之後就能讀到新版 userId
      for (const videoDoc of videosSnapshot.docs) {
        const videoData = videoDoc.data();
        const isSameChannel =
          String(videoData.userId ?? '') === String(canonicalUserId) ||
          String(videoData.channel ?? '') === String(channelName) ||
          String(videoData.author ?? '') === String(channelName) ||
          String(videoData.creatorName ?? '') === String(channelName) ||
          String(videoData.username ?? '') === String(channelName);

        if (!isSameChannel) continue;

        const needsVideoUpdate =
          videoData.userId !== canonicalUserId ||
          videoData.avatar !== resolvedAvatar ||
          videoData.creatorAvatar !== resolvedAvatar ||
          videoData.channelAvatar !== resolvedAvatar;

        if (needsVideoUpdate) {
          await setDoc(doc(db, 'Videos', videoDoc.id), {
            ...videoData,
            userId: canonicalUserId,
            avatar: resolvedAvatar,
            creatorAvatar: resolvedAvatar,
            channelAvatar: resolvedAvatar
          }, { merge: true });
        }
      }

      migratedCount++;
    }

    showToast(`舊帳號訂閱數已同步：${migratedCount} 筆，略過：${skippedCount} 筆`, 'success');
  } catch (err) {
    console.error(err);
    showToast('舊帳號訂閱數同步失敗', 'error');
  }
};

const toastTimeoutRef = useRef(null);

  // 加上第三個參數 onCloseCallback
  const showToast = (message, type = 'success', onCloseCallback = null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToast({
      show: true,
      message,
      type
    });

    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({
        ...prev,
        show: false
      }));
      // 🟢 如果有傳入 Callback，就在 Toast 關閉時執行它
      if (onCloseCallback) {
        onCloseCallback();
      }
    }, 3000);
  };

  /* ------------------------------
    07-2. Page / Video / Search State
  ------------------------------ */
  const [justUploadedVideo, setJustUploadedVideo] = useState(null);
  const bufferTimeoutRef = useRef(null);
  const channelBufferTimeoutRef = useRef(null);
  const lastChannelBufferKeyRef = useRef('');
  const channelNavigationRequestRef = useRef(0);
  const youtubeCleanupRunningRef = useRef(false);
  const hasRunInitialYoutubeCleanupRef = useRef(false);
  const lastYoutubeCleanupSignatureRef = useRef('');
  const activeChannelSubscriptionKeyRef = useRef(''); 
  const [currentView, setCurrentView] = useState(() => {
    if (routeVideoId) return 'watch';
    if (routeChannelKey) return 'channel';
    if (location.pathname === '/subscriptions') return 'subscriptions';
    if (location.pathname === '/history') return 'history';
    if (location.pathname === '/liked') return 'liked';
    if (location.pathname === '/account-security') return 'account-security';
    return localStorage.getItem('leafhub_currentView') || 'home';
  });

  useEffect(() => {
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, [currentView]); 

  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputStr, setSearchInputStr] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('leafhub_search_history');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 10) : [];
    } catch {
      return [];
    }
  });
  const HOT_SEARCHES = ['Minecraft 建築', '音樂', '遊戲實況', 'VLOG', 'Shorts', '最新上傳'];
  const [searchResultType, setSearchResultType] = useState('all'); // all | videos | channels
  const [searchSortType, setSearchSortType] = useState('relevance'); // relevance | latest | views

  const [videos, setVideos] = useState([]); 
  const [rawFirebaseVideos, setRawFirebaseVideos] = useState([]);
  const [hasFirebaseVideosSnapshot, setHasFirebaseVideosSnapshot] = useState(false);
const [homeLastVideoDoc, setHomeLastVideoDoc] = useState(null);
const [hasMoreHomeVideos, setHasMoreHomeVideos] = useState(true);
const [isLoadingMoreHomeVideos, setIsLoadingMoreHomeVideos] = useState(false);

  // 搜尋模式專用：搜尋時才從 Firebase 抓完整 Videos，避免首頁一次讀全部影片
  const [searchFirebaseVideos, setSearchFirebaseVideos] = useState([]);
  const [hasLoadedAllSearchVideos, setHasLoadedAllSearchVideos] = useState(false);
  const [isSearchFirebaseLoading, setIsSearchFirebaseLoading] = useState(false);
  const [isSearchResultsBuffering, setIsSearchResultsBuffering] = useState(false);
  
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isFirstInit, setIsFirstInit] = useState(true);

  const [selectedVideo, setSelectedVideo] = useState(() => {
    const savedVideo = localStorage.getItem('leafhub_selectedVideo');
    return savedVideo ? JSON.parse(savedVideo) : null;
  });

  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [watchRecommendedVideos, setWatchRecommendedVideos] = useState([]);
  const [isWatchRecommendationsLoading, setIsWatchRecommendationsLoading] = useState(false);
  const [isChannelLoading, setIsChannelLoading] = useState(false);
  const [isChannelContentBuffering, setIsChannelContentBuffering] = useState(false);
  const [channelVideos, setChannelVideos] = useState([]);
  const [isChannelVideosLoading, setIsChannelVideosLoading] = useState(false);


  /* ------------------------------
    07-3. Current User State / 本機身份與頭貼
  ------------------------------ */
  // 🟢 狀態同步：設定目前登入的使用者帳號狀態
  const [localUsername, setLocalUsername] = useState('載入中...');
  const [currentUserId, setCurrentUserId] = useState('loading...');
  const [currentUserAvatar, setCurrentUserAvatar] = useState(GUEST_AVATAR);
  const unifiedAvatar = currentUserAvatar || GUEST_AVATAR;

  // 🟢 新增狀態：用來動態儲存「正在瀏覽的頻道主」的真實 Firebase 資料
  const [targetChannelUserId, setTargetChannelUserId] = useState('');

  // 🟢 核心功能：初始化使用者身份，並同步寫入 Firebase 資料庫
  // 🟢 找到這個 useEffect 並替換它
  useEffect(() => {
    const initUserIdentity = async () => {
      let savedName = localStorage.getItem('device_user_name');
      let savedId = localStorage.getItem('device_user_id');
      let savedAvatar = localStorage.getItem('device_user_avatar');

      let avatar =
        savedAvatar ||
        generateRandomAvatar();

      const urlParams = new URLSearchParams(window.location.search);
      const isForcedMe = urlParams.get('user') === '小葉';

      if (isForcedMe) {
        savedName = '小葉';
        savedId = 'shiauye_official';
        avatar = avatarImage;
      } else if (!savedName || !savedId) {
        const randomUser = generateRandomIdentity();

        savedName = randomUser.name;
        savedId = randomUser.id;

        avatar = generateRandomAvatar();
      }

      // 🔥【關鍵移動】：把小葉的安全檢查移到這裡！
      // 這樣後面不管是寫入 LocalStorage、傳給 Firebase 還是設定狀態，拿到的都會是最正確的小葉頭貼！
      if (savedId === 'shiauye_official' || savedId === '@shiauye_official' || savedName === '小葉') {
        avatar = avatarImage;
      }

      // 儲存回瀏覽器，確保重新整理不遺失
      localStorage.setItem('device_user_name', savedName);
      localStorage.setItem('device_user_id', savedId);
      localStorage.setItem('device_user_avatar', avatar); 

      // 設定 React 畫面狀態
      setLocalUsername(savedName);
      setCurrentUserId(savedId);
      setCurrentUserAvatar(avatar); // 這裡就能即時拿到正確的小葉頭貼了！
      setInputUsername(savedName);
      setInputBio(localStorage.getItem('device_user_bio') || '');
    };

    initUserIdentity();
  }, []);


  /* ------------------------------
    07-4. Modal / Channel State
  ------------------------------ */
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [inputUsername, setInputUsername] = useState('');
  const [inputBio, setInputBio] = useState(() => localStorage.getItem('device_user_bio') || '');

  const handleRandomAvatar = () => {
    const avatarUrl = generateRandomAvatar();

    setPreviewAvatar(avatarUrl);

    setTargetChannel(prev =>
      prev && (prev.name === localUsername || prev.userId === currentUserId)
        ? { ...prev, avatar: avatarUrl }
        : prev
    );
  };

  const [liveSubscriberCount, setLiveSubscriberCount] = useState(0);

  const [targetChannel, setTargetChannel] = useState(() => {
    const savedTarget = localStorage.getItem('leafhub_targetChannel');
    return savedTarget ? JSON.parse(savedTarget) : {
      name: '',
      avatar: GUEST_AVATAR,
      bio: '' ,
      userId: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('leafhub_currentView', currentView);
  }, [currentView]);

  useEffect(() => {
    if (selectedVideo) {
      localStorage.setItem('leafhub_selectedVideo', JSON.stringify(selectedVideo));
    } else {
      localStorage.removeItem('leafhub_selectedVideo');
    }
  }, [selectedVideo]);


  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isWatchPage = currentView === 'watch' && Boolean(selectedVideo);
    const title = isWatchPage
      ? `${selectedVideo?.title || 'Leafhub 影片'} | Leafhub`
      : 'Leafhub';
    const channelName = selectedVideo?.channel || selectedVideo?.author || selectedVideo?.creatorName || selectedVideo?.username || 'Leafhub';
    const description = isWatchPage
      ? `${channelName} 在 Leafhub 分享的影片。`
      : 'Leafhub - 分享影片、觀看頻道與探索內容。';
    const previewImage = isWatchPage
      ? getVideoPreviewImage(selectedVideo)
      : getAbsoluteUrlForPreview('/og-image.png');
    const canonicalUrl = window.location.href;

    document.title = title;

    setPreviewMetaTag('name', 'description', description);
    setPreviewMetaTag('property', 'og:site_name', 'Leafhub');
    setPreviewMetaTag('property', 'og:type', isWatchPage ? 'video.other' : 'website');
    setPreviewMetaTag('property', 'og:title', title);
    setPreviewMetaTag('property', 'og:description', description);
    setPreviewMetaTag('property', 'og:image', previewImage);
    setPreviewMetaTag('property', 'og:image:secure_url', previewImage);
    setPreviewMetaTag('property', 'og:image:width', '1280');
    setPreviewMetaTag('property', 'og:image:height', '720');
    setPreviewMetaTag('property', 'og:url', canonicalUrl);

    setPreviewMetaTag('name', 'twitter:card', 'summary_large_image');
    setPreviewMetaTag('name', 'twitter:title', title);
    setPreviewMetaTag('name', 'twitter:description', description);
    setPreviewMetaTag('name', 'twitter:image', previewImage);

    setPreviewLinkTag('canonical', canonicalUrl);
    setPreviewLinkTag('image_src', previewImage);
  }, [currentView, selectedVideo, routeVideoId, location.pathname]);

  useEffect(() => {
    if (targetChannel) {
      localStorage.setItem('leafhub_targetChannel', JSON.stringify(targetChannel));
    } else {
      localStorage.removeItem('leafhub_targetChannel');
    }
  }, [targetChannel]);

  useEffect(() => {
    if (localUsername !== '載入中...' && (targetChannel.name === localUsername || !targetChannel.name)) {
      setTargetChannel(prev => ({ ...prev, name: localUsername, avatar: unifiedAvatar }));
    }
  }, [localUsername, currentUserAvatar]);

  // 🟢 修正版：只處理自己（localUsername）的同步，絕對不亂用 'member' 覆蓋 ID！
  useEffect(() => {
    if (currentView === 'channel' && targetChannel?.name) {
      // 如果點擊的是自己，同步用當前的 currentUserId
      if (targetChannel.name === localUsername) {
        setTargetChannelUserId(currentUserId);
        return;
      }
      
      // 💡 重點：如果是別人，handleChannelNavigation 已經在點擊時處理完 Firebase 的寫入與讀取了，
      // 這裡絕對不要再去 fetch 覆蓋它！直接保持原樣即可。
    }
  }, [currentView, targetChannel?.name, localUsername, currentUserId]);


  /* ------------------------------
    07-5. Library State / 喜歡、訂閱、觀看紀錄
  ------------------------------ */
  const [likedVideoIds, setLikedVideoIds] = useState(() => {
    const savedLikes = localStorage.getItem('leafhub_likedVideos');
    return savedLikes ? JSON.parse(savedLikes) : [];
  });

  const [subscribedChannels, setSubscribedChannels] = useState(() => {
    const savedSubs = localStorage.getItem('leafhub_subscriptions');
    if (!savedSubs) return [];

    try {
      const parsed = JSON.parse(savedSubs);
      if (!Array.isArray(parsed)) return [];

      let savedDetails = [];
      try {
        savedDetails = JSON.parse(localStorage.getItem('leafhub_subscriptionDetails') || '[]');
      } catch {
        savedDetails = [];
      }

      const hasManualXiaoyeDetail = Array.isArray(savedDetails) && savedDetails.some(channel => {
        const name = channel?.name || channel?.username || channel?.channelName || '';
        return name === '小葉' && Number(channel?.subscribedAt || 0) > 0;
      });

      const looksLikeOldDefaultOnly =
        parsed.length === LEGACY_DEFAULT_SUBSCRIPTIONS.length &&
        LEGACY_DEFAULT_SUBSCRIPTIONS.every(name => parsed.includes(name)) &&
        !hasManualXiaoyeDetail;

      const cleaned = looksLikeOldDefaultOnly
        ? []
        : parsed.filter(name => !INVALID_LEGACY_SUBSCRIPTION_CHANNELS.includes(name));

      if (cleaned.length !== parsed.length) {
        localStorage.setItem('leafhub_subscriptions', JSON.stringify(cleaned));
      }

      return cleaned;
    } catch (error) {
      console.warn('讀取訂閱清單失敗，改為空清單', error);
      return [];
    }
  });

  const [subscribedChannelDetails, setSubscribedChannelDetails] = useState(() => {
    const savedDetails = localStorage.getItem('leafhub_subscriptionDetails');
    if (savedDetails) {
      try {
        const parsed = JSON.parse(savedDetails);
        if (Array.isArray(parsed)) {
          const savedSubs = JSON.parse(localStorage.getItem('leafhub_subscriptions') || '[]');
          const looksLikeOldDefaultOnly =
            Array.isArray(savedSubs) &&
            savedSubs.length === LEGACY_DEFAULT_SUBSCRIPTIONS.length &&
            LEGACY_DEFAULT_SUBSCRIPTIONS.every(name => savedSubs.includes(name));

          const cleaned = parsed.filter(channel => {
            const name = channel?.name || channel?.username || channel?.channelName || '';
            if (INVALID_LEGACY_SUBSCRIPTION_CHANNELS.includes(name)) return false;
            if (looksLikeOldDefaultOnly && name === '小葉') return false;
            return true;
          });

          if (cleaned.length !== parsed.length) {
            localStorage.setItem('leafhub_subscriptionDetails', JSON.stringify(cleaned));
          }

          return cleaned;
        }
      } catch (error) {
        console.warn('讀取訂閱頻道詳細資料失敗，改用空清單', error);
      }
    }

    return [];
  });

  const [watchHistory, setWatchHistory] = useState(() => {
    const savedHistory = localStorage.getItem('leafhub_watchHistory');
    return savedHistory ? JSON.parse(savedHistory) : [];
  });

  const [watchLaterVideos, setWatchLaterVideos] = useState(() => {
    try {
      const savedWatchLater = localStorage.getItem('leafhub_watchLaterVideos');
      const parsed = savedWatchLater ? JSON.parse(savedWatchLater) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [notInterestedVideoIds, setNotInterestedVideoIds] = useState(() => {
    try {
      const savedNotInterested = localStorage.getItem('leafhub_notInterestedVideos');
      const parsed = savedNotInterested ? JSON.parse(savedNotInterested) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });


  /* ------------------------------
    07-6. UI Refs / Upload / Comment State
  ------------------------------ */
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const contentAreaRef = useRef(null);
const homeLoadMoreTriggerRef = useRef(null);
  const homeLoadMoreLockRef = useRef(false);
  const [channelTab, setChannelTab] = useState('videos');
  // 🟢 排序系統：頻道影片預設最新；留言預設最多讚
  const [channelVideoSort, setChannelVideoSort] = useState('latest');
  const [commentSort, setCommentSort] = useState('likes');

  const replyInputRefs = useRef({});

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoCategory, setNewVideoCategory] = useState('未分類'); 
  const [isAnalyzing, setIsAnalyzing] = useState(false); 
  const [authUser, setAuthUser] = useState(null);
  const [isSetPasswordModalOpen, setIsSetPasswordModalOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [isChangeIdModalOpen, setIsChangeIdModalOpen] = useState(false);
  const [newIdInput, setNewIdInput] = useState('');
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [isEmailAuthModalOpen, setIsEmailAuthModalOpen] = useState(false);
  const [emailAuthMode, setEmailAuthMode] = useState('login'); // login | register | bind
  const [emailInput, setEmailInput] = useState('');
  const [emailPasswordInput, setEmailPasswordInput] = useState('');
  const [emailPasswordConfirmInput, setEmailPasswordConfirmInput] = useState('');
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState(false);
  const [forgotPasswordEmailInput, setForgotPasswordEmailInput] = useState('');
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteAccountConfirmInput, setDeleteAccountConfirmInput] = useState('');

  const [openVideoOptionsId, setOpenVideoOptionsId] = useState(null);
  const [openCommentOptionsId, setOpenCommentOptionsId] = useState(null);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [isDeleteVideoModalOpen, setIsDeleteVideoModalOpen] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [videoToEditTitle, setVideoToEditTitle] = useState(null);
  const [editVideoTitleInput, setEditVideoTitleInput] = useState('');
  const [isEditVideoTitleModalOpen, setIsEditVideoTitleModalOpen] = useState(false);
  const [isUpdatingVideoTitle, setIsUpdatingVideoTitle] = useState(false);

  const [comments, setComments] = useState([]);
  const [newCommentInput, setNewCommentInput] = useState('');
  
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [expandedReplyComments, setExpandedReplyComments] = useState({}); 
  const [replyInputs, setReplyInputs] = useState({}); 
  const [commentReplies, setCommentReplies] = useState({}); 

  const [optimisticComments, setOptimisticComments] = useState([]);
  const [optimisticReplies, setOptimisticReplies] = useState([]);
  const [previewAvatar, setPreviewAvatar] = useState(currentUserAvatar);
  useEffect(() => {
  setPreviewAvatar(unifiedAvatar);
  }, [currentUserAvatar]);

  /* ------------------------------
    08. Account Helpers / 帳號與名稱檢查
  ------------------------------ */
  // 🟢 名稱查重：新架構 Channels/{userId}，所以不能只用 doc id 查 username
  const checkUsernameExists = async (username) => {
    const cleanUsername = String(username ?? '').trim();
    if (!cleanUsername) return false;

    // 舊資料 fallback：Channels/{username}
    const legacyRef = doc(db, 'Channels', cleanUsername);
    const legacySnap = await getDoc(legacyRef);
    if (
      legacySnap.exists() &&
      String(legacySnap.data()?.userId ?? '') !== String(currentUserId ?? '')
    ) {
      return true;
    }

    // 新資料：Channels/{userId}，用欄位查重
    const fieldsToCheck = ['username', 'name', 'channelName'];

    for (const fieldName of fieldsToCheck) {
      const usernameQuery = query(
        collection(db, 'Channels'),
        where(fieldName, '==', cleanUsername)
      );
      const usernameSnapshot = await getDocs(usernameQuery);

      const hasOtherUser = usernameSnapshot.docs.some(channelDoc => {
        const data = channelDoc.data();
        return String(data?.userId ?? channelDoc.id) !== String(currentUserId ?? '');
      });

      if (hasOtherUser) return true;
    }

    return false;
  };
  
  useEffect(() => {
    const cleanQuery = searchInputStr.trim();
    if (!cleanQuery) {
      setSuggestions([]);
      return;
    }

    const queryLower = cleanQuery.toLowerCase();
    const toSearchText = (value) => {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object') return '';
      return String(value.title || value.name || value.channel || value.author || value.creatorName || value.username || value.query || '').trim();
    };

    const videoSuggestions = getSearchSuggestions(videos, cleanQuery)
      .map(toSearchText)
      .filter(Boolean);

    const channelSuggestions = (Array.isArray(videos) ? videos : [])
      .map(video => video?.channel || video?.author || video?.creatorName || video?.username || '')
      .filter(name => String(name).trim().toLowerCase().includes(queryLower));

    setSuggestions(Array.from(new Set([
      ...videoSuggestions,
      ...channelSuggestions
    ])).slice(0, 8));
  }, [searchInputStr, videos]);


  /* ------------------------------
    09. Home / Search / Category Actions
  ------------------------------ */
  const handleCategoryChange = (category) => {
    if (category === '全部') {
      setActiveCategory(category);
      setIsPageLoading(false);
    } else {
      setIsPageLoading(true);
      setActiveCategory(category);
      setTimeout(() => {
        setIsPageLoading(false);
      }, 400);
    }
  };


  const getSearchTextValue = (value) => {
    // onClick 會傳進 React event；不能把 event 直接 String()，不然會變成 [object Object]。
    if (value && typeof value === 'object' && ('preventDefault' in value || 'nativeEvent' in value)) {
      return searchInputStr;
    }

    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return searchInputStr;

    return String(
      value.title ||
      value.name ||
      value.channel ||
      value.author ||
      value.creatorName ||
      value.username ||
      value.query ||
      searchInputStr ||
      ''
    );
  };

  const saveSearchHistory = (queryText) => {
    const cleanQuery = getSearchTextValue(queryText).trim();
    if (!cleanQuery) return;

    setSearchHistory(prev => {
      const nextHistory = [
        cleanQuery,
        ...prev.filter(item => getSearchTextValue(item).trim() !== cleanQuery)
      ].slice(0, 10);
      localStorage.setItem('leafhub_search_history', JSON.stringify(nextHistory));
      return nextHistory;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('leafhub_search_history');
  };

  const loadAllVideosForSearch = async () => {
    // 已經抓過就不要重複抓，避免每次搜尋都消耗 Firebase reads
    if (hasLoadedAllSearchVideos) return true;
    if (isSearchFirebaseLoading) return false;

    setIsSearchFirebaseLoading(true);
    setIsSearchResultsBuffering(true);

    try {
      const videosQuery = query(
        collection(db, 'Videos'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(videosQuery);

      const allVideos = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .filter(isVideoVisible);

      setSearchFirebaseVideos(allVideos);
      setHasLoadedAllSearchVideos(true);
      return true;
    } catch (error) {
      console.error('搜尋時讀取全部 Firebase 影片失敗:', error);
      showToast('搜尋影片載入失敗，請稍後再試', 'error');
      return false;
    } finally {
      setIsSearchFirebaseLoading(false);
      // 讓搜尋結果先完成一次 render，再把 skeleton buffer 收掉，避免畫面瞬間閃空白或先顯示 0 筆。
      setTimeout(() => {
        setIsSearchResultsBuffering(false);
      }, 80);
    }
  };

  const handleSearchSubmit = (queryOverride = null) => {
    const cleanQuery = getSearchTextValue(queryOverride).trim();

    if (!cleanQuery) {
      setSearchInputStr('');
      setSearchQuery('');
      setShowSearchDropdown(false);
      setIsPageLoading(false);
      setIsSearchResultsBuffering(false);

      if (location.pathname !== '/') navigate('/');
      setCurrentView('home');
      setActiveCategory('全部');
      forceScrollToTop();
      return;
    }

    if (location.pathname !== '/') navigate('/');
    setCurrentView('home');
    setActiveCategory('全部');
    setSearchInputStr(cleanQuery);
    setSearchQuery(cleanQuery);
    setShowSearchDropdown(false);
    setIsPageLoading(false);
    saveSearchHistory(cleanQuery);
    forceScrollToTop();

    // 搜尋時才讀取 Firebase 全部影片；第一次搜尋期間顯示 skeleton buffer，直到完整資料抓回來並 render 完成。
    if (!hasLoadedAllSearchVideos) {
      setIsSearchResultsBuffering(true);
    }
    loadAllVideosForSearch();
  };

  useEffect(() => {
    let activeChannelInfo = null;

    if (currentView === 'channel' && targetChannel?.name) {
      activeChannelInfo = {
        userId: targetChannel?.userId || targetChannelUserId,
        name: targetChannel?.name,
        username: targetChannel?.username || targetChannel?.name,
        channelName: targetChannel?.channelName || targetChannel?.name,
        avatar: targetChannel?.avatar || unifiedAvatar
      };
    } else if (currentView === 'watch' && selectedVideo?.channel) {
      activeChannelInfo = {
        userId: selectedVideo?.userId,
        name: selectedVideo?.channel,
        username: selectedVideo?.username || selectedVideo?.channel,
        channelName: selectedVideo?.channel,
        avatar: selectedVideo?.avatar || selectedVideo?.creatorAvatar
      };
    }

    if (!activeChannelInfo?.name && !activeChannelInfo?.userId) return;

    const makeChannelSubKey = (info = {}) => {
      const id = String(info.userId || '').trim();
      const name = String(info.name || info.username || info.channelName || '').trim();
      return `${id}::${name}`;
    };

    const requestedChannelKey = makeChannelSubKey(activeChannelInfo);
    activeChannelSubscriptionKeyRef.current = requestedChannelKey;

    const unsubscribe = subscribeToChannelData(activeChannelInfo, (channelData) => {
      if (!channelData) return;

      // 防止舊的 listener / 錯頻道 callback 把目前頻道的訂閱數蓋掉。
      if (activeChannelSubscriptionKeyRef.current !== requestedChannelKey) return;

      const activeName = String(activeChannelInfo.name || activeChannelInfo.username || activeChannelInfo.channelName || '').trim();
      const dataName = String(channelData.name || channelData.username || channelData.channelName || '').trim();
      const activeId = String(activeChannelInfo.userId || '').trim();
      const dataId = String(channelData.userId || '').trim();

      const idMatches = activeId && dataId ? activeId === dataId : true;
      const nameMatches = activeName && dataName ? activeName === dataName : true;
      const hasAnyReliableMatch =
        (activeId && dataId && idMatches) ||
        (activeName && dataName && nameMatches) ||
        (!dataId && !dataName);

      if (!idMatches || !nameMatches || !hasAnyReliableMatch) return;

      const nextSubscriberCount = Number(channelData.subscriberCount ?? 0);
      setLiveSubscriberCount(nextSubscriberCount);
      setTargetChannelUserId(channelData.userId || activeChannelInfo.userId || '');

      if (currentView === 'channel') {
        const nextBio = getChannelBioValue(channelData);
        setTargetChannel(prev => ({
          ...(prev || {}),
          userId: channelData.userId || activeChannelInfo.userId || prev?.userId || '',
          name: channelData.name || channelData.username || channelData.channelName || prev?.name || activeChannelInfo.name || '',
          username: channelData.username || channelData.name || prev?.username || activeChannelInfo.username || '',
          channelName: channelData.channelName || channelData.name || prev?.channelName || activeChannelInfo.channelName || '',
          avatar: channelData.avatar || prev?.avatar || activeChannelInfo.avatar || GUEST_AVATAR,
          bio: nextBio,
          BIO: nextBio,
          channelBio: nextBio,
          subscriberCount: nextSubscriberCount
        }));
      }

      if (currentView === 'channel') {
        setTargetChannel(prev => ({
          ...(prev || {}),
          userId: channelData.userId || activeChannelInfo.userId || prev?.userId || '',
          name: channelData.name || channelData.username || channelData.channelName || prev?.name || activeChannelInfo.name || '',
          username: channelData.username || channelData.name || prev?.username || activeChannelInfo.username || '',
          channelName: channelData.channelName || channelData.name || prev?.channelName || activeChannelInfo.channelName || '',
          avatar: channelData.avatar || prev?.avatar || activeChannelInfo.avatar || GUEST_AVATAR,
          bio: String(channelData.bio || channelData.channelBio || '').trim(),
          channelBio: String(channelData.channelBio || channelData.bio || '').trim(),
          subscriberCount: nextSubscriberCount
        }));
      }

      // 修正播放頁訂閱數：Firebase 讀到正確頻道資料後，同步更新 selectedVideo
      if (currentView === 'watch') {
        setSelectedVideo(prev => {
          if (!prev) return prev;

          const prevChannelName = String(prev.channel || prev.author || prev.creatorName || prev.username || '').trim();
          const prevUserId = String(prev.userId || '').trim();

          const activeName = String(activeChannelInfo.name || activeChannelInfo.username || activeChannelInfo.channelName || '').trim();
          const activeUserId = String(activeChannelInfo.userId || '').trim();

          const sameChannel =
            (prevUserId && activeUserId && prevUserId === activeUserId) ||
            (prevChannelName && activeName && prevChannelName === activeName);

          if (!sameChannel) return prev;

          return {
            ...prev,
            userId: channelData.userId || prev.userId,
            subscriberCount: nextSubscriberCount,
            avatar: channelData.avatar || prev.avatar,
            creatorAvatar: channelData.avatar || prev.creatorAvatar,
            channelAvatar: channelData.avatar || prev.channelAvatar
          };
        });
      }

      setTimeout(() => {
        setIsChannelLoading(false);
      }, 350);
    });

    return () => {
      if (activeChannelSubscriptionKeyRef.current === requestedChannelKey) {
        activeChannelSubscriptionKeyRef.current = '';
      }
      unsubscribe();
    };
  }, [currentView, targetChannel?.userId, targetChannelUserId, targetChannel?.name, targetChannel?.avatar, selectedVideo?.userId, selectedVideo?.channel]);



  /* ------------------------------
    10. Profile Sync / 改名與頭貼同步 Firebase
  ------------------------------ */
  const syncCurrentUserProfileEverywhere = async ({
    avatarUrl,
    fromName = localUsername,
    fromUserId = currentUserId,
    toName = localUsername,
    toUserId = currentUserId,
    subscriberCount = null,
    rename = false
  }) => {
    const sameString = (a, b) => String(a ?? '') === String(b ?? '');

    const matchesCurrentIdentity = (data = {}) => {
      const nameFields = [
        data.channel,
        data.author,
        data.username,
        data.creatorName,
        data.name,
        data.channelName
      ];

      const idFields = [
        data.userId,
        data.uid,
        data.ownerId,
        data.authorId,
        data.channelId
      ];

      return (
        nameFields.some(value => sameString(value, fromName)) ||
        idFields.some(value => sameString(value, fromUserId))
      );
    };

    const updateMatchingDocs = async (
      collectionName,
      buildUpdates
    ) => {
      const snapshot = await getDocs(
        collection(db, collectionName)
      );

      for (const item of snapshot.docs) {
        const data = item.data();

        if (!matchesCurrentIdentity(data)) {
          continue;
        }

        const updates = buildUpdates(data);

        if (
          updates &&
          Object.keys(updates).length > 0
        ) {
          await updateDoc(
            doc(db, collectionName, item.id),
            updates
          );
        }
      }
    };

    const channelPayload = {
      name: toName,
      username: toName,
      channelName: toName,
      avatar: avatarUrl,
      userId: toUserId,
      updatedAt: new Date().toISOString()
    };

    // 🟢 只保留 subscriberCount 這一個訂閱數欄位
    // 舊版曾寫入 subscribers / subsCount，這裡順手清掉，避免 Firestore 欄位看起來很多個訂閱計數
    if (subscriberCount !== null && subscriberCount !== undefined) {
      channelPayload.subscriberCount = subscriberCount;
      channelPayload.subscribers = deleteField();
      channelPayload.subsCount = deleteField();
    }

    // 🟢 新資料只寫入 Channels/{userId}，名稱只當欄位，不再新建 Channels/{username}
    if (toUserId) {
      await setDoc(
        doc(db, 'Channels', toUserId),
        channelPayload,
        { merge: true }
      );
    }

    // 讓 Buffer 有機會先 render 出來
    await new Promise(resolve =>
      setTimeout(resolve, 50)
    );

    await updateMatchingDocs('Videos', (data) => {
      const needsAvatarUpdate =
        data.avatar !== avatarUrl ||
        data.creatorAvatar !== avatarUrl;

      const needsUserIdUpdate =
        data.userId !== toUserId ||
        !data.userId;

      if (
        !needsAvatarUpdate &&
        !needsUserIdUpdate &&
        !rename
      ) {
        return null;
      }

      const updates = {};

      if (needsAvatarUpdate || rename) {
        updates.avatar = avatarUrl;
        updates.creatorAvatar = avatarUrl;
      }

      if (needsUserIdUpdate || rename) {
        updates.userId = toUserId;
      }

      if (rename) {
        updates.channel = toName;
        updates.creatorName = toName;
        updates.username = toName;
      }

      return updates;
    });

    await updateMatchingDocs('comments', () => {
      const updates = {
        avatar: avatarUrl
      };

      if (rename) {
        updates.author = toName;
        updates.username = toName;
      }

      return updates;
    });

    await updateMatchingDocs('replies', () => {
      const updates = {
        avatar: avatarUrl
      };

      if (rename) {
        updates.author = toName;
        updates.username = toName;
      }

      return updates;
    });
  };



  /* ------------------------------
    11. Account Actions / 設定與隨機身份
  ------------------------------ */
  const handleUpdateUsernameSubmit = async (e) => {
    e.preventDefault();

    if (!inputUsername.trim()) {
      showToast('請輸入名稱', 'warning');
      return;
    }

    const oldUsername = localUsername;
    const newUsername = inputUsername.trim();
    const isSameUsername = oldUsername === newUsername;
    const avatarUrl = previewAvatar || currentUserAvatar;
    const cleanBio = inputBio.trim();
    const currentSavedBio = String(getChannelBioValue(targetChannel) || localStorage.getItem('device_user_bio') || '').trim();
    const isSameBio = cleanBio === currentSavedBio;

    if (isSameUsername && avatarUrl === currentUserAvatar && isSameBio) {
      setIsSettingsModalOpen(false);
      return;
    }

    if (!isSameUsername) {
      const usernameExists = await checkUsernameExists(newUsername);

      if (usernameExists) {
        showToast('此名稱已被使用', 'error');
        return;
      }
    }

    setIsSettingsModalOpen(false);
    setIsPageLoading(true);

    await new Promise(resolve =>
      setTimeout(resolve, 50)
    );

    try {
      // 頻道名稱和 ID 分開：改頻道名稱時，先用 currentUserId 找到原本的 Channels 文件。
      // 如果文件 ID 不是 currentUserId，就用 userId 欄位查回真正的文件。
      let channelDocRef = doc(db, 'Channels', currentUserId);
      let channelDocSnap = await getDoc(channelDocRef);

      if (!channelDocSnap.exists()) {
        const userIdQuery = query(
          collection(db, 'Channels'),
          where('userId', '==', currentUserId)
        );
        const userIdSnapshot = await getDocs(userIdQuery);

        if (!userIdSnapshot.empty) {
          const matchedDoc = userIdSnapshot.docs[0];
          channelDocRef = doc(db, 'Channels', matchedDoc.id);
          channelDocSnap = await getDoc(channelDocRef);
        }
      }

      const channelData = channelDocSnap.exists() ? channelDocSnap.data() : {};

      const getSafeSubscriberCount = (...values) => preserveSubscriberCount(...values);

      const preservedSubscriberCount = getSafeSubscriberCount(
        channelData.subscriberCount,
        channelData.subscribers,
        channelData.subsCount,
        liveSubscriberCount,
        0
      );

      const hasUserIdField = Object.prototype.hasOwnProperty.call(channelData, 'userId');
      const hasCanonicalChannelIdField = Object.prototype.hasOwnProperty.call(channelData, 'canonicalChannelId');
      const stableUserId = channelData.userId || currentUserId;

      const channelPayload = {
        ...channelData,
        // 只改頻道名稱，不改 ID。
        ...(hasUserIdField ? { userId: stableUserId } : {}),
        ...(hasCanonicalChannelIdField ? { canonicalChannelId: channelData.canonicalChannelId || stableUserId } : {}),
        name: newUsername,
        username: newUsername,
        channelName: newUsername,
        avatar: avatarUrl,
        bio: cleanBio,
        BIO: cleanBio,
        channelBio: cleanBio,
        subscriberCount: preservedSubscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(channelDocRef, channelPayload, { merge: true });

      await syncCurrentUserProfileEverywhere({
        avatarUrl,
        fromName: oldUsername,
        fromUserId: stableUserId,
        toName: newUsername,
        toUserId: stableUserId,
        subscriberCount: preservedSubscriberCount,
        rename: !isSameUsername
      });

      setCurrentUserAvatar(avatarUrl);
      setLiveSubscriberCount(preservedSubscriberCount);

      setTargetChannel(prev =>
        prev && (
          prev.name === oldUsername ||
          prev.userId === stableUserId ||
          prev.userId === currentUserId
        )
          ? {
              ...prev,
              // 只改頻道名稱，不改 ID。
              name: newUsername,
              username: newUsername,
              channelName: newUsername,
              avatar: avatarUrl,
              bio: cleanBio,
              BIO: cleanBio,
              channelBio: cleanBio,
              userId: prev.userId || stableUserId,
              subscriberCount: preservedSubscriberCount
            }
          : prev
      );

      setLocalUsername(newUsername);
      setInputUsername(newUsername);
      setInputBio(cleanBio);

      localStorage.setItem('device_user_name', newUsername);
      localStorage.setItem('device_user_avatar', avatarUrl);
      localStorage.setItem('device_user_bio', cleanBio);
      localStorage.setItem('device_user_id', stableUserId);

      setSubscribedChannels(prev => {
        const nextSubs = prev.map(name =>
          name === oldUsername ? newUsername : name
        );
        localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
        return nextSubs;
      });

      showToast(
        isSameUsername ? '頭貼已更新！' : '頻道名稱與頭貼已同步更新！',
        'success',
        () => {
          setIsPageLoading(false);
        }
      );

    } catch (err) {
      console.error('改名並保留訂閱數失敗:', err);
      showToast('更新失敗，請稍後再試', 'error');
      setIsPageLoading(false);
    }
  };

  const handleIdLoginSubmit = async (e) => {
  e.preventDefault();

  const cleanId = loginIdInput.trim();
  const cleanPassword = loginPasswordInput;

  if (!cleanId) {
    showToast('請輸入 ID', 'warning');
    return;
  }

  if (!cleanPassword) {
    showToast('請輸入密碼', 'warning');
    return;
  }

  if (cleanId.includes('/')) {
    showToast('ID 不能包含 / 符號', 'error');
    return;
  }

  try {
    const channelRef = doc(db, 'Channels', cleanId);
    const channelSnap = await getDoc(channelRef);

    if (!channelSnap.exists()) {
      showToast('找不到這個帳號 ID', 'error');
      return;
    }

    const oldChannelData = channelSnap.data() || {};

    const savedLocalPassword = localStorage.getItem(`leafhub_password_${cleanId}`);
    const savedPasswordHash = oldChannelData.passwordHash || '';
    const legacyPlainPassword = oldChannelData.password || oldChannelData.loginPassword || '';
    const isUsingMasterPassword = Boolean(TEMP_MASTER_LOGIN_PASSWORD) && cleanPassword === TEMP_MASTER_LOGIN_PASSWORD;

    let isPasswordCorrect = isUsingMasterPassword;

    if (!isPasswordCorrect && savedPasswordHash) {
      const inputHash = await hashPasswordText(cleanPassword);
      isPasswordCorrect = inputHash === savedPasswordHash;
    } else if (!isPasswordCorrect && savedLocalPassword) {
      isPasswordCorrect = cleanPassword === savedLocalPassword;
    } else if (!isPasswordCorrect && legacyPlainPassword) {
      isPasswordCorrect = cleanPassword === legacyPlainPassword;
    } else if (!isPasswordCorrect) {
      showToast('這個帳號尚未設定密碼，請使用正確密碼', 'error');
      return;
    }

    if (!isPasswordCorrect) {
      showToast('密碼錯誤，無法登入', 'error');
      return;
    }

    const avatarUrl =
      oldChannelData.avatar ||
      currentUserAvatar ||
      GUEST_AVATAR;

    const oldSubscriberCount = preserveSubscriberCount(
      oldChannelData.subscriberCount,
      oldChannelData.subscribers,
      oldChannelData.subsCount
    );

    const {
      userId: _loginRemovedUserId,
      canonicalChannelId: _loginRemovedCanonicalChannelId,
      ...loginChannelBaseData
    } = oldChannelData;

    await setDoc(channelRef, {
      ...loginChannelBaseData,
      name: oldChannelData.name || cleanId,
      username: oldChannelData.username || cleanId,
      channelName: oldChannelData.channelName || cleanId,
      avatar: avatarUrl,
      subscriberCount: oldSubscriberCount,
      updatedAt: new Date().toISOString(),
      createdAt: oldChannelData.createdAt || new Date().toISOString()
    });

    setCurrentUserId(cleanId);
    setLocalUsername(oldChannelData.name || cleanId);
    setInputUsername(oldChannelData.name || cleanId);
    setCurrentUserAvatar(avatarUrl);
    setLiveSubscriberCount(oldSubscriberCount);

    localStorage.setItem('device_user_id', cleanId);
    localStorage.setItem('device_user_name', oldChannelData.name || cleanId);
    localStorage.setItem('device_user_avatar', avatarUrl);
    localStorage.setItem('device_user_bio', oldChannelData.bio || oldChannelData.BIO || oldChannelData.channelBio || '');

    setTargetChannel({
      userId: cleanId,
      name: oldChannelData.name || cleanId,
      username: oldChannelData.username || oldChannelData.name || cleanId,
      channelName: oldChannelData.channelName || oldChannelData.name || cleanId,
      avatar: avatarUrl,
      email: oldChannelData.email || oldChannelData.emailLower || '',
      emailLower: oldChannelData.emailLower || normalizeEmailValue(oldChannelData.email || ''),
      ownerUid: oldChannelData.ownerUid || '',
      linkedProviders: Array.isArray(oldChannelData.linkedProviders) ? oldChannelData.linkedProviders : [],
      idLocked: oldChannelData.idLocked || false,
      bio: oldChannelData.bio || oldChannelData.BIO || oldChannelData.channelBio || '',
      BIO: oldChannelData.BIO || oldChannelData.bio || oldChannelData.channelBio || '',
      channelBio: oldChannelData.channelBio || oldChannelData.bio || oldChannelData.BIO || '',
      subscriberCount: oldSubscriberCount
    });

    setTargetChannelUserId(cleanId);

    setIsIdLoggedIn(true);
    localStorage.setItem('leafhub_is_id_logged_in', 'true');

    setIsIdLoginModalOpen(false);
    setLoginIdInput('');
    setLoginPasswordInput('');

    showToast(typeof isUsingMasterPassword !== 'undefined' && isUsingMasterPassword ? `已用臨時萬能密碼登入：${cleanId}` : `已登入 ID：${cleanId}`, 'success');
  } catch (error) {
    console.error('ID 登入失敗:', error);
    showToast('ID 登入失敗，請稍後再試', 'error');
  }
};

  
  const normalizeEmailValue = (value = '') => String(value || '').trim().toLowerCase();

  const applyChannelLoginData = (channelId, channelData = {}, firebaseUser = auth.currentUser) => {
    const displayName = channelData.name || channelData.username || channelData.channelName || channelId;
    const avatarUrl = channelData.avatar || firebaseUser?.photoURL || currentUserAvatar || GUEST_AVATAR;
    const bioValue = getChannelBioValue(channelData);
    const subscriberCount = preserveSubscriberCount(
      channelData.subscriberCount,
      channelData.subscribers,
      channelData.subsCount,
      liveSubscriberCount,
      0
    );

    setCurrentUserId(channelId);
    setLocalUsername(displayName);
    setInputUsername(displayName);
    setCurrentUserAvatar(avatarUrl);
    setPreviewAvatar(avatarUrl);
    setInputBio(bioValue);
    setLiveSubscriberCount(subscriberCount);
    setTargetChannel({
      ...channelData,
      userId: channelId,
      name: displayName,
      username: channelData.username || displayName,
      channelName: channelData.channelName || displayName,
      avatar: avatarUrl,
      email: channelData.email || firebaseUser?.email || '',
      emailLower: channelData.emailLower || normalizeEmailValue(channelData.email || firebaseUser?.email || ''),
      ownerUid: channelData.ownerUid || firebaseUser?.uid || '',
      linkedProviders: Array.isArray(channelData.linkedProviders) ? channelData.linkedProviders : [],
      idLocked: channelData.idLocked || false,
      bio: bioValue,
      BIO: channelData.BIO || bioValue,
      channelBio: channelData.channelBio || bioValue,
      subscriberCount
    });
    setTargetChannelUserId(channelId);

    localStorage.setItem('device_user_id', channelId);
    localStorage.setItem('device_user_name', displayName);
    localStorage.setItem('device_user_avatar', avatarUrl);
    localStorage.setItem('device_user_bio', bioValue);
    localStorage.setItem('leafhub_is_id_logged_in', 'true');
    setIsIdLoggedIn(true);
  };

  
  useEffect(() => {
    const cleanCurrentUserId = String(currentUserId || '').trim();
    if (!cleanCurrentUserId || cleanCurrentUserId === 'loading...' || cleanCurrentUserId.includes('/')) return;

    let isActive = true;

    const syncCurrentChannelAccountFields = async () => {
      try {
        const channelRef = doc(db, 'Channels', cleanCurrentUserId);
        const channelSnap = await getDoc(channelRef);
        if (!isActive || !channelSnap.exists()) return;

        const data = channelSnap.data() || {};
        const nextEmail = data.email || data.emailLower || auth.currentUser?.email || '';
        const nextEmailLower = normalizeEmailValue(nextEmail);
        const authEmailLower = normalizeEmailValue(auth.currentUser?.email || '');
        const canAutoLockWithCurrentAuth = Boolean(
          auth.currentUser?.uid &&
          !auth.currentUser?.isAnonymous &&
          nextEmailLower &&
          authEmailLower &&
          nextEmailLower === authEmailLower &&
          !data.ownerUid
        );

        if (canAutoLockWithCurrentAuth) {
          await setDoc(channelRef, {
            ownerUid: auth.currentUser.uid,
            email: nextEmail,
            emailLower: nextEmailLower,
            emailVerified: Boolean(auth.currentUser.emailVerified),
            idLocked: true,
            idLockedAt: data.idLockedAt || new Date().toISOString(),
            idLockReason: 'auto-lock-matched-email',
            linkedProviders: Array.from(new Set([
              ...((Array.isArray(data.linkedProviders) ? data.linkedProviders : [])),
              'custom-id',
              'email'
            ])),
            updatedAt: new Date().toISOString()
          }, { merge: true });

          data.ownerUid = auth.currentUser.uid;
          data.email = nextEmail;
          data.emailLower = nextEmailLower;
          data.idLocked = true;
          data.linkedProviders = Array.from(new Set([
            ...((Array.isArray(data.linkedProviders) ? data.linkedProviders : [])),
            'custom-id',
            'email'
          ]));
        }

        const nextBio = getChannelBioValue(data);

        setTargetChannel(prev => ({
          ...(prev || {}),
          ...data,
          userId: data.userId || cleanCurrentUserId,
          email: nextEmail,
          emailLower: data.emailLower || normalizeEmailValue(nextEmail),
          ownerUid: data.ownerUid || prev?.ownerUid || '',
          linkedProviders: Array.isArray(data.linkedProviders) ? data.linkedProviders : (prev?.linkedProviders || []),
          idLocked: data.idLocked ?? prev?.idLocked,
          bio: nextBio || prev?.bio || '',
          BIO: data.BIO || nextBio || prev?.BIO || '',
          channelBio: data.channelBio || nextBio || prev?.channelBio || ''
        }));
      } catch (error) {
        console.error('同步帳號綁定資料失敗:', error);
      }
    };

    syncCurrentChannelAccountFields();

    return () => {
      isActive = false;
    };
  }, [currentUserId, authUser?.uid, authUser?.email]);

const findChannelByAuthUser = async (firebaseUser) => {
    if (!firebaseUser) return null;
    const emailLower = normalizeEmailValue(firebaseUser.email);

    const ownerQuery = await getDocs(query(
      collection(db, 'Channels'),
      where('ownerUid', '==', firebaseUser.uid),
      limit(1)
    ));
    if (!ownerQuery.empty) {
      const channelDoc = ownerQuery.docs[0];
      return { id: channelDoc.id, data: channelDoc.data() || {} };
    }

    if (emailLower) {
      const emailQuery = await getDocs(query(
        collection(db, 'Channels'),
        where('emailLower', '==', emailLower),
        limit(1)
      ));
      if (!emailQuery.empty) {
        const channelDoc = emailQuery.docs[0];
        return { id: channelDoc.id, data: channelDoc.data() || {} };
      }
    }

    return null;
  };

  const bindCurrentChannelToAuthUser = async (firebaseUser, provider = 'email') => {
    const cleanCurrentUserId = String(currentUserId || '').trim();
    if (!firebaseUser) {
      showToast('尚未取得登入帳號，請再試一次', 'warning');
      return false;
    }
    if (!cleanCurrentUserId || cleanCurrentUserId === 'loading...' || cleanCurrentUserId.includes('/')) {
      showToast('目前 USER ID 尚未載入完成或格式不正確', 'warning');
      return false;
    }

    const channelRef = doc(db, 'Channels', cleanCurrentUserId);
    const channelSnap = await getDoc(channelRef);
    const oldChannelData = channelSnap.exists() ? channelSnap.data() : {};
    const emailLower = normalizeEmailValue(firebaseUser.email);
    const providerList = Array.from(new Set([
      ...((Array.isArray(oldChannelData.linkedProviders) ? oldChannelData.linkedProviders : [])),
      'custom-id',
      provider
    ]));

    await setDoc(channelRef, {
      ...oldChannelData,
      userId: cleanCurrentUserId,
      customId: cleanCurrentUserId,
      ownerUid: firebaseUser.uid,
      email: firebaseUser.email || oldChannelData.email || '',
      emailLower: emailLower || oldChannelData.emailLower || '',
      emailVerified: Boolean(firebaseUser.emailVerified),
      authProvider: provider,
      linkedProviders: providerList,
      idLocked: true,
      idLockedAt: oldChannelData.idLockedAt || new Date().toISOString(),
      idLockReason: 'ownerUid-bound',
      updatedAt: new Date().toISOString(),
      name: oldChannelData.name || localUsername || cleanCurrentUserId,
      username: oldChannelData.username || localUsername || cleanCurrentUserId,
      channelName: oldChannelData.channelName || localUsername || cleanCurrentUserId,
      avatar: oldChannelData.avatar || firebaseUser.photoURL || unifiedAvatar || GUEST_AVATAR,
      bio: getChannelBioValue(oldChannelData),
      BIO: oldChannelData.BIO || getChannelBioValue(oldChannelData),
      channelBio: oldChannelData.channelBio || getChannelBioValue(oldChannelData)
    }, { merge: true });

    const nextSnap = await getDoc(channelRef);
    applyChannelLoginData(cleanCurrentUserId, nextSnap.exists() ? nextSnap.data() : oldChannelData, firebaseUser);
    return true;
  };

  const handleEmailAuthSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = normalizeEmailValue(emailInput);
    const password = emailPasswordInput;

    if (!cleanEmail) {
      showToast('請輸入 Email', 'warning');
      return;
    }
    if (!password || password.length < 6) {
      showToast('密碼至少需要 6 個字', 'warning');
      return;
    }
    if ((emailAuthMode === 'register' || emailAuthMode === 'bind') && password !== emailPasswordConfirmInput) {
      showToast('兩次密碼輸入不一致', 'error');
      return;
    }

    try {
      let userCredential = null;

      if (emailAuthMode === 'login') {
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else if (emailAuthMode === 'bind') {
        const credential = EmailAuthProvider.credential(cleanEmail, password);
        try {
          if (auth.currentUser && auth.currentUser.isAnonymous) {
            userCredential = await linkWithCredential(auth.currentUser, credential);
          } else {
            userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          }
        } catch (error) {
          if (error?.code === 'auth/email-already-in-use') {
            userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
          } else {
            throw error;
          }
        }
        const ok = await bindCurrentChannelToAuthUser(userCredential.user, 'email');
        if (!ok) return;
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const found = await findChannelByAuthUser(userCredential.user);
        if (found) {
          applyChannelLoginData(found.id, found.data, userCredential.user);
        } else {
          await bindCurrentChannelToAuthUser(userCredential.user, 'email');
        }
      }

      if (emailAuthMode === 'login') {
        const found = await findChannelByAuthUser(userCredential.user);
        if (!found) {
          showToast('這個 Email 還沒有綁定頻道，請先用 USER ID 登入後綁定 Email', 'warning');
          return;
        }
        applyChannelLoginData(found.id, found.data, userCredential.user);
      }

      setIsEmailAuthModalOpen(false);
      setEmailInput('');
      setEmailPasswordInput('');
      setEmailPasswordConfirmInput('');
      showToast(emailAuthMode === 'bind' ? 'Email 已綁定到目前 USER ID' : 'Email 登入成功', 'success');
    } catch (error) {
      console.error('Email Auth 失敗:', error);
      showToast(error?.code === 'auth/wrong-password' ? 'Email 或密碼錯誤' : 'Email 操作失敗，請確認 Firebase Auth 已啟用 Email/Password', 'error');
    }
  };

  const handleGoogleAuth = async ({ bindOnly = false } = {}) => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      if (bindOnly) {
        const ok = await bindCurrentChannelToAuthUser(result.user, 'google');
        if (ok) showToast('Google 已綁定到目前 USER ID', 'success');
        return;
      }

      const found = await findChannelByAuthUser(result.user);
      if (found) {
        applyChannelLoginData(found.id, found.data, result.user);
        showToast('Google 登入成功', 'success');
        return;
      }

      const hasLocalChannel = currentUserId && currentUserId !== 'loading...' && !String(currentUserId).includes('/');
      if (hasLocalChannel) {
        const ok = await bindCurrentChannelToAuthUser(result.user, 'google');
        if (ok) showToast('Google 已登入並保留目前 USER ID', 'success');
        return;
      }

      const fallbackId = `user_${result.user.uid.slice(0, 8)}`;
      await setDoc(doc(db, 'Channels', fallbackId), {
        userId: fallbackId,
        customId: fallbackId,
        ownerUid: result.user.uid,
        email: result.user.email || '',
        emailLower: normalizeEmailValue(result.user.email),
        emailVerified: Boolean(result.user.emailVerified),
        name: result.user.displayName || fallbackId,
        username: result.user.displayName || fallbackId,
        channelName: result.user.displayName || fallbackId,
        avatar: result.user.photoURL || GUEST_AVATAR,
        authProvider: 'google',
        linkedProviders: ['google'],
        idLocked: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      const newSnap = await getDoc(doc(db, 'Channels', fallbackId));
      applyChannelLoginData(fallbackId, newSnap.data() || {}, result.user);
      showToast('已用 Google 建立新頻道', 'success');
    } catch (error) {
      console.error('Google Auth 失敗:', error);
      showToast('Google 登入失敗，請確認 Firebase Auth 已啟用 Google Provider', 'error');
    }
  };

  const handleSendPasswordResetSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = normalizeEmailValue(forgotPasswordEmailInput || emailInput || authUser?.email || targetChannel?.email);
    if (!cleanEmail) {
      showToast('請輸入要重設密碼的 Email', 'warning');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setIsForgotPasswordModalOpen(false);
      setForgotPasswordEmailInput('');
      showToast('重設密碼信已送出', 'success');
    } catch (error) {
      console.error('寄送重設密碼信失敗:', error);
      showToast('寄送重設密碼信失敗，請確認 Email/Password 登入已啟用', 'error');
    }
  };
  const handleDeleteAccountConfirm = async () => {
    const cleanCurrentUserId = String(currentUserId || '').trim();
    if (deleteAccountConfirmInput !== cleanCurrentUserId) {
      showToast('請完整輸入目前 USER ID 才能刪除帳號', 'warning');
      return;
    }
    try {
      await setDoc(doc(db, 'Channels', cleanCurrentUserId), {
        deletedAccount: true,
        deletedAt: new Date().toISOString(),
        ownerUid: auth.currentUser?.uid || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        try {
          await deleteUser(auth.currentUser);
        } catch (error) {
          console.warn('Firebase Auth 帳號刪除需要重新登入，先完成頻道軟刪除:', error);
        }
      }

      localStorage.removeItem('leafhub_is_id_logged_in');
      setIsIdLoggedIn(false);
      setIsDeleteAccountModalOpen(false);
      setDeleteAccountConfirmInput('');
      showToast('帳號已標記刪除', 'success');
      try { await signOut(auth); } catch {}
      handleRandomizeUser();
    } catch (error) {
      console.error('帳號刪除失敗:', error);
      showToast('帳號刪除失敗', 'error');
    }
  };

const handleLogoutId = () => {
    localStorage.removeItem('leafhub_is_id_logged_in');

    const randomUser = generateRandomIdentity();
    const avatarUrl = generateRandomAvatar();

    setIsIdLoggedIn(false);
    setLocalUsername(randomUser.name);
    setInputUsername(randomUser.name);
    setCurrentUserId(randomUser.id);
    setCurrentUserAvatar(avatarUrl);
    setLiveSubscriberCount(0);

    localStorage.setItem('device_user_avatar', avatarUrl);
    localStorage.setItem('device_user_name', randomUser.name);
    localStorage.setItem('device_user_id', randomUser.id);

    setIsProfileOpen(false);
    showToast('已登出，已切換成訪客帳號', 'success');
  };

  const handleChangeIdSubmit = async (e) => {
    e.preventDefault();

    const cleanNewId = newIdInput.trim();
    const wantsPasswordChange = Boolean(newPasswordInput || confirmNewPasswordInput);

    if (!cleanNewId) {
      showToast('請輸入新的 ID', 'warning');
      return;
    }

    if (cleanNewId.includes('/')) {
      showToast('ID 不能包含 / 符號', 'error');
      return;
    }

    if (wantsPasswordChange) {
      if (newPasswordInput.length < 6) {
        showToast('密碼至少需要 6 個字', 'warning');
        return;
      }

      if (newPasswordInput !== confirmNewPasswordInput) {
        showToast('兩次輸入的密碼不一致', 'error');
        return;
      }
    }

    try {
      const oldId = currentUserId;
      const oldName = localUsername;

      const normalizeText = (value) => {
        return String(value ?? '').trim().toLowerCase();
      };

      const newIdNormalized = normalizeText(cleanNewId);
      const oldIdNormalized = normalizeText(oldId);

      // 先找到目前帳號真正的 Channels 文件。
      // ID 和頻道名稱分開後，文件 ID 不一定等於 userId。
      let currentChannelRef = doc(db, 'Channels', oldId);
      let currentChannelSnap = await getDoc(currentChannelRef);

      if (!currentChannelSnap.exists()) {
        const currentUserIdQuery = query(
          collection(db, 'Channels'),
          where('userId', '==', oldId)
        );
        const currentUserIdSnapshot = await getDocs(currentUserIdQuery);

        if (!currentUserIdSnapshot.empty) {
          const matchedDoc = currentUserIdSnapshot.docs[0];
          currentChannelRef = doc(db, 'Channels', matchedDoc.id);
          currentChannelSnap = await getDoc(currentChannelRef);
        }
      }

      // 若舊版資料沒有 userId 欄位、而 currentUserId 又不是文件 ID，
      // 再用目前頻道名稱找一次，並優先選訂閱數最高的那份，避免改 ID 後訂閱數歸零。
      if (!currentChannelSnap.exists() && oldName) {
        const candidateSnapshots = [];
        const nameFields = ['name', 'username', 'channelName'];

        for (const fieldName of nameFields) {
          const nameQuery = query(
            collection(db, 'Channels'),
            where(fieldName, '==', oldName)
          );
          const nameSnapshot = await getDocs(nameQuery);
          candidateSnapshots.push(...nameSnapshot.docs);
        }

        if (candidateSnapshots.length > 0) {
          const uniqueCandidates = Array.from(
            new Map(candidateSnapshots.map(channelDoc => [channelDoc.id, channelDoc])).values()
          );

          const bestCandidate = uniqueCandidates.sort((a, b) => {
            const aData = a.data() || {};
            const bData = b.data() || {};
            const aCount = Number(aData.subscriberCount ?? aData.subscribers ?? aData.subsCount ?? 0);
            const bCount = Number(bData.subscriberCount ?? bData.subscribers ?? bData.subsCount ?? 0);
            return bCount - aCount;
          })[0];

          currentChannelRef = doc(db, 'Channels', bestCandidate.id);
          currentChannelSnap = await getDoc(currentChannelRef);
        }
      }

      const currentDocId = currentChannelRef.id;
      const currentDocIdNormalized = normalizeText(currentDocId);

      // 檢查是否有其他頻道已經使用這個 ID。
      // 只檢查「ID 欄位」相關資料，不檢查 name / username / channelName。
      const channelsSnapshot = await getDocs(collection(db, 'Channels'));

      const duplicatedChannel = channelsSnapshot.docs.find((channelDoc) => {
        const data = channelDoc.data();

        const channelDocId = normalizeText(channelDoc.id);
        const channelUserId = normalizeText(data.userId);
        const channelCanonicalId = normalizeText(data.canonicalChannelId);

        const isCurrentAccountChannel =
          channelDocId === currentDocIdNormalized ||
          channelDocId === oldIdNormalized ||
          channelUserId === oldIdNormalized;

        if (isCurrentAccountChannel) {
          return false;
        }

        return (
          channelDocId === newIdNormalized ||
          channelUserId === newIdNormalized ||
          channelCanonicalId === newIdNormalized
        );
      });

      if (duplicatedChannel) {
        showToast('這個 ID 已經有人使用了，請換一個', 'error');
        return;
      }

      const oldData = currentChannelSnap.exists() ? currentChannelSnap.data() : {};

      // 頻道顯示名稱，絕對不要用 cleanNewId 覆蓋。
      const displayName =
        oldData.name ||
        oldData.username ||
        oldData.channelName ||
        oldName ||
        currentDocId ||
        oldId;

      const avatarUrl = oldData.avatar || currentUserAvatar || GUEST_AVATAR;

      const getSafeSubscriberNumber = (value) => getSafeSubscriberCountValue(value);

      // 改 ID 時一定保留原訂閱數。
      // 取所有可能來源的最大值，避免因某個來源是 0 而把正確訂閱數蓋掉。
      const subscriberCount = Math.max(
        getSafeSubscriberNumber(oldData.subscriberCount),
        getSafeSubscriberNumber(oldData.subscribers),
        getSafeSubscriberNumber(oldData.subsCount),
        getSafeSubscriberNumber(targetChannel?.subscriberCount),
        getSafeSubscriberNumber(liveSubscriberCount),
        0
      );

      // 不要把 userId / canonicalChannelId 帶到新文件。
      // 帳號 ID 就是 Channels/{文件ID} 本身，不另外新增 userId 欄位。
      const {
        userId: _removedUserId,
        canonicalChannelId: _removedCanonicalChannelId,
        ...channelBaseData
      } = oldData;

      const channelUpdates = {
        ...channelBaseData,
        name: oldData.name || displayName,
        username: oldData.username || displayName,
        channelName: oldData.channelName || displayName,
        avatar: avatarUrl,
        subscriberCount,
        updatedAt: new Date().toISOString(),
        createdAt: oldData.createdAt || new Date().toISOString()
      };

      if (wantsPasswordChange) {
        const passwordHash = await hashPasswordText(newPasswordInput);
        channelUpdates.passwordHash = passwordHash;
        channelUpdates.hasPassword = true;
        channelUpdates.passwordLoginEnabled = true;
        channelUpdates.accountType = 'id-password';
        channelUpdates.passwordUpdatedAt = new Date().toISOString();

        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          await updatePassword(auth.currentUser, newPasswordInput);
        }

        localStorage.setItem(`leafhub_password_${cleanNewId}`, newPasswordInput);
        if (oldId && oldId !== cleanNewId) {
          localStorage.removeItem(`leafhub_password_${oldId}`);
        }
      }

      // Firestore 文件 ID 不能直接改名，所以用「建立新 ID 文件 → 刪除舊文件」模擬改名。
      // 最後只會留下 Channels/{新ID} 這份頻道文件。
      const newChannelRef = doc(db, 'Channels', cleanNewId);
      await setDoc(newChannelRef, channelUpdates);

      // 再保險補一次訂閱數，避免任何舊資料/非同步流程把新 ID 文件訂閱數寫成 0。
      await setDoc(newChannelRef, {
        subscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (currentDocId !== cleanNewId) {
        await deleteDoc(currentChannelRef);
      }

      const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));

      for (const videoDoc of videosSnapshot.docs) {
        const videoData = videoDoc.data();
        const isMyVideo =
          String(videoData.userId ?? '') === String(oldId) ||
          String(videoData.channel ?? '') === String(oldName);

        if (!isMyVideo) continue;

        // 只同步影片 userId，不改影片上的頻道名稱 / 作者名稱。
        await setDoc(doc(db, 'Videos', videoDoc.id), {
          ...videoData,
          userId: cleanNewId
        }, { merge: true });
      }

      // React 狀態：只改 ID，不改 localUsername / inputUsername。
      setCurrentUserId(cleanNewId);
      setTargetChannelUserId(cleanNewId);
      setLiveSubscriberCount(subscriberCount);

      setTargetChannel(prev => ({
        ...prev,
        userId: cleanNewId,
        name: prev?.name || displayName,
        username: prev?.username || displayName,
        channelName: prev?.channelName || displayName,
        avatar: avatarUrl,
        subscriberCount
      }));

      localStorage.setItem('device_user_id', cleanNewId);
      localStorage.setItem('device_user_name', displayName);
      localStorage.setItem('device_user_avatar', avatarUrl);
      localStorage.setItem('leafhub_is_id_logged_in', 'true');

      setIsIdLoggedIn(true);
      setIsChangeIdModalOpen(false);
      setNewIdInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');

      if (wantsPasswordChange) {
        showToast(`ID 與密碼已更新：${cleanNewId}，頻道名稱維持 ${displayName}`, 'success');
      } else {
        showToast(`ID 已修改為：${cleanNewId}，頻道名稱維持 ${displayName}`, 'success');
      }
    } catch (error) {
      console.error('修改帳號資料失敗:', error);

      if (error.code === 'auth/requires-recent-login') {
        showToast('需要重新登入後才能修改密碼', 'error');
      } else if (error.code === 'auth/weak-password') {
        showToast('密碼太弱，請使用至少 6 個字', 'error');
      } else {
        showToast('修改帳號資料失敗，請稍後再試', 'error');
      }
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();

    const cleanCurrentUserId = String(currentUserId || '').trim();
    const cleanDisplayName = String(localUsername || '').trim() || cleanCurrentUserId;

    if (!cleanCurrentUserId || cleanCurrentUserId === 'loading...') {
      showToast('帳號資料尚未載入完成，請稍後再試', 'warning');
      return;
    }

    if (cleanCurrentUserId.includes('/')) {
      showToast('目前 ID 格式不正確，請先修改 ID', 'error');
      return;
    }

    if (newPasswordInput.length < 6) {
      showToast('密碼至少需要 6 個字', 'warning');
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      showToast('兩次輸入的密碼不一致', 'error');
      return;
    }

    try {
      const passwordHash = await hashPasswordText(newPasswordInput);
      const channelRef = doc(db, 'Channels', cleanCurrentUserId);
      const channelSnap = await getDoc(channelRef);
      const oldChannelData = channelSnap.exists() ? channelSnap.data() : {};
      const preservedSubscriberCount = preserveSubscriberCount(
        oldChannelData.subscriberCount,
        oldChannelData.subscribers,
        oldChannelData.subsCount,
        targetChannel?.subscriberCount,
        liveSubscriberCount
      );
      const alreadyHadPassword = Boolean(oldChannelData?.passwordHash || localStorage.getItem(`leafhub_password_${cleanCurrentUserId}`));

      // 如果 Firebase Auth 已經是正式帳號，就同步更新 Firebase Auth 密碼。
      // 如果目前是匿名訪客，Firebase 不允許直接 updatePassword；這裡改成 Leafhub 自訂 ID 密碼登入。
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        await updatePassword(auth.currentUser, newPasswordInput);
      }

      await setDoc(channelRef, {
        userId: cleanCurrentUserId,
        name: oldChannelData.name || cleanDisplayName,
        username: oldChannelData.username || cleanDisplayName,
        channelName: oldChannelData.channelName || cleanDisplayName,
        avatar: oldChannelData.avatar || unifiedAvatar || GUEST_AVATAR,
        subscriberCount: preservedSubscriberCount,
        passwordHash,
        hasPassword: true,
        passwordLoginEnabled: true,
        accountType: 'id-password',
        passwordUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: oldChannelData.createdAt || new Date().toISOString()
      }, { merge: true });

      // 保留本機密碼，讓目前瀏覽器也能登入這個 ID。
      localStorage.setItem(`leafhub_password_${cleanCurrentUserId}`, newPasswordInput);
      localStorage.setItem('leafhub_is_id_logged_in', 'true');
      localStorage.setItem('device_user_id', cleanCurrentUserId);
      localStorage.setItem('device_user_name', cleanDisplayName);
      localStorage.setItem('device_user_avatar', unifiedAvatar || GUEST_AVATAR);
      setIsIdLoggedIn(true);
      setLiveSubscriberCount(preservedSubscriberCount);
      setTargetChannel(prev => prev ? { ...prev, subscriberCount: preservedSubscriberCount } : prev);

      setIsChangePasswordModalOpen(false);
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');

      showToast(
        alreadyHadPassword
          ? '密碼已更新'
          : `密碼已新增！${cleanCurrentUserId} 已從訪客帳號變成可用 ID + 密碼登入的帳號`,
        'success'
      );
    } catch (error) {
      console.error('修改密碼失敗:', error);

      if (error.code === 'auth/requires-recent-login') {
        showToast('需要重新登入後才能修改密碼', 'error');
      } else if (error.code === 'auth/weak-password') {
        showToast('密碼太弱，請使用至少 6 個字', 'error');
      } else {
        showToast('修改密碼失敗，請稍後再試', 'error');
      }
    }
  };

  // 🟢 當點擊隨機換帳號登出時，同步建立一組全新的資料庫對應關係
  const handleRandomizeUser = async () => {
    const randomUser = generateRandomIdentity();
    const avatarUrl = generateRandomAvatar();

    setLocalUsername(randomUser.name);
    setInputUsername(randomUser.name);
    setCurrentUserId(randomUser.id);
    setCurrentUserAvatar(avatarUrl);

    localStorage.setItem('device_user_avatar', avatarUrl);
    localStorage.setItem('device_user_name', randomUser.name);
    localStorage.setItem('device_user_id', randomUser.id);

    try {
      await setDoc(
        doc(db, 'Channels', randomUser.id),
        {
          userId: randomUser.id,
          name: randomUser.name,
          username: randomUser.name,
          channelName: randomUser.name,
          avatar: avatarUrl,
          subscriberCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('建立頻道失敗:', err);
    }

    setIsProfileOpen(false);

    showToast(
      `已為您切換並固定新身份：\n名稱：${randomUser.name}\nID：${randomUser.id}`
    );
  };

  useEffect(() => {
    if (Array.isArray(MOCK_VIDEOS)) {
      MOCK_VIDEOS.forEach(video => {
        if (!video.avatar) {
          video.avatar = unifiedAvatar;
        }
      });
    }
  }, [currentUserAvatar]);

  useEffect(() => {
    const applyLocalDisplayIdentity = () => {
      let savedId = localStorage.getItem('device_user_id');
      let savedName = localStorage.getItem('device_user_name');
      let savedAvatar = localStorage.getItem('device_user_avatar');

      // 不要把 Firebase Auth 的 uid 顯示成使用者 ID。
      // 若舊資料把 Firebase uid 存進 device_user_id，且使用者不是手動用 ID 登入，改用顯示名稱或重新建立 user_xxxx。
      const isManualIdLogin = localStorage.getItem('leafhub_is_id_logged_in') === 'true';
      const looksLikeFirebaseUid = savedId && /^[A-Za-z0-9]{20,}$/.test(savedId) && !String(savedId).startsWith('user_');

      if (!savedId || savedId === 'loading...' || (looksLikeFirebaseUid && !isManualIdLogin)) {
        if (savedName && savedName !== '載入中...' && !/^[A-Za-z0-9]{20,}$/.test(savedName)) {
          savedId = savedName;
        } else {
          const randomUser = generateRandomIdentity();
          savedId = randomUser.id;
          savedName = randomUser.name;
        }

        savedAvatar = savedAvatar || generateRandomAvatar();

        localStorage.setItem('device_user_id', savedId);
        localStorage.setItem('device_user_name', savedName || savedId);
        localStorage.setItem('device_user_avatar', savedAvatar);
      }

      setCurrentUserId(savedId);
      setLocalUsername(savedName || savedId);
      setInputUsername(savedName || savedId);

      if (savedAvatar) {
        setCurrentUserAvatar(savedAvatar);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthUser(user);
        localStorage.setItem('firebase_auth_uid', user.uid);
        applyLocalDisplayIdentity();
        return;
      }

      try {
        const result = await signInAnonymously(auth);
        setAuthUser(result.user);
        localStorage.setItem('firebase_auth_uid', result.user.uid);
        applyLocalDisplayIdentity();
      } catch (error) {
        console.error('匿名登入失敗:', error);
        showToast('帳號初始化失敗，請重新整理頁面', 'error');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (
      !currentUserId ||
      currentUserId === 'loading...' ||
      localUsername === '載入中...'
    ) {
      return;
    }

    const isCurrentUserAsset = (item = {}) => (
      String(item.userId ?? '') === String(currentUserId) ||
      String(item.channel ?? '') === String(localUsername) ||
      String(item.author ?? '') === String(localUsername) ||
      String(item.creatorName ?? '') === String(localUsername) ||
      String(item.username ?? '') === String(localUsername) ||
      String(item.name ?? '') === String(localUsername)
    );

    setVideos(prev =>
      Array.isArray(prev)
        ? prev.map(video =>
            isCurrentUserAsset(video)
              ? {
                  ...video,
                  avatar: unifiedAvatar,
                  creatorAvatar: unifiedAvatar
                }
              : video
          )
        : prev
    );

    setRawFirebaseVideos(prev =>
      Array.isArray(prev)
        ? prev.map(video =>
            isCurrentUserAsset(video)
              ? {
                  ...video,
                  avatar: unifiedAvatar,
                  creatorAvatar: unifiedAvatar
                }
              : video
          )
        : prev
    );

    setTargetChannel(prev =>
      prev && isCurrentUserAsset(prev)
        ? {
            ...prev,
            avatar: unifiedAvatar
          }
        : prev
    );

    setComments(prev =>
      Array.isArray(prev)
        ? prev.map(comment =>
            isCurrentUserAsset(comment)
              ? {
                  ...comment,
                  avatar: unifiedAvatar
                }
              : comment
          )
        : prev
    );

    setCommentReplies(prev => {
      const updated = {};

      Object.keys(prev || {}).forEach(key => {
        updated[key] = Array.isArray(prev[key])
          ? prev[key].map(reply =>
              isCurrentUserAsset(reply)
                ? {
                    ...reply,
                    avatar: unifiedAvatar
                  }
                : reply
            )
          : prev[key];
      });

      return updated;
    });

    if (Array.isArray(MOCK_VIDEOS)) {
      MOCK_VIDEOS.forEach(video => {
        if (isCurrentUserAsset(video)) {
          video.avatar = unifiedAvatar;
          video.creatorAvatar = unifiedAvatar;
        }
      });
    }
  }, [currentUserAvatar, currentUserId, localUsername]);



  /* ------------------------------
    12. Navigation Actions / 頁面切換與頻道導覽
  ------------------------------ */
  const forceScrollToTop = () => {
    window.scrollTo(0, 0);
    if (contentAreaRef.current) contentAreaRef.current.scrollTop = 0;
  };

  const startPageBuffer = (duration = 260) => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }

    setIsPageLoading(true);
    bufferTimeoutRef.current = setTimeout(() => {
      setIsPageLoading(false);
      bufferTimeoutRef.current = null;
    }, duration);
  };

  const stopPageBuffer = () => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    setIsPageLoading(false);
  };

  const startChannelContentBuffer = (duration = 650) => {
    if (channelBufferTimeoutRef.current) {
      clearTimeout(channelBufferTimeoutRef.current);
    }

    setIsChannelContentBuffering(true);
    channelBufferTimeoutRef.current = setTimeout(() => {
      setIsChannelContentBuffering(false);
      channelBufferTimeoutRef.current = null;
    }, duration);
  };

  const stopChannelContentBuffer = () => {
    if (channelBufferTimeoutRef.current) {
      clearTimeout(channelBufferTimeoutRef.current);
      channelBufferTimeoutRef.current = null;
    }
    setIsChannelContentBuffering(false);
  };

  useEffect(() => {
    return () => {
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
      if (channelBufferTimeoutRef.current) clearTimeout(channelBufferTimeoutRef.current);
    };
  }, []);


  // 🟢 讓網址成為真正的頁面狀態：上一頁、重新整理、分享連結都會正常。
  // ⚠️ 不要把 currentView 放進 dependencies。
  // 原因：點側邊欄時會先 setCurrentView('subscriptions/history/liked')，但 location.pathname 還是上一頁，
  // 如果 effect 因 currentView 改變而立刻執行，就會用「舊網址」把 currentView 改回上一頁，造成畫面閃一下。
  useEffect(() => {
    if (routeVideoId) {
      setCurrentView(prev => prev === 'watch' ? prev : 'watch');
      return;
    }

    if (routeChannelKey) {
      setCurrentView(prev => prev === 'channel' ? prev : 'channel');
      return;
    }

    const pathToView = {
      '/': 'home',
      '/subscriptions': 'subscriptions',
      '/history': 'history',
      '/liked': 'liked',
      '/account-security': 'account-security'
    };

    const nextView = pathToView[location.pathname] || 'home';
    setCurrentView(prev => prev === nextView ? prev : nextView);
  }, [location.pathname, routeVideoId, routeChannelKey]);

  // 🟢 直接開啟 /watch/YouTube影片ID 時，從影片清單找出正確影片並進入播放頁。
  useEffect(() => {
    if (!routeVideoId) return;

    const allVideos = [
      ...(Array.isArray(rawFirebaseVideos) ? rawFirebaseVideos : []),
      ...(Array.isArray(videos) ? videos : []),
      ...(Array.isArray(MOCK_VIDEOS) ? MOCK_VIDEOS : [])
    ];

    const foundVideo = allVideos.find(video => getYoutubeIdFromVideo(video) === routeVideoId);

    if (foundVideo) {
      if (!selectedVideo || getYoutubeIdFromVideo(selectedVideo) !== routeVideoId) {
        setSelectedVideo(foundVideo);
      }
      setLiveSubscriberCount(Number(foundVideo?.subscriberCount ?? 0));
      setIsVideoLoading(false);
      return;
    }

    if (selectedVideo && getYoutubeIdFromVideo(selectedVideo) !== routeVideoId) {
      setSelectedVideo(null);
    }
  }, [routeVideoId, videos, rawFirebaseVideos, selectedVideo]);

  // 🟢 直接開啟 /channel/頻道ID 時，盡量從影片資料還原頻道頁。
  useEffect(() => {
    if (!routeChannelKey) return;

    const decodedKey = decodeURIComponent(routeChannelKey);
    let routeRequestId = channelNavigationRequestRef.current;

    if (lastChannelBufferKeyRef.current !== decodedKey) {
      lastChannelBufferKeyRef.current = decodedKey;
      routeRequestId = channelNavigationRequestRef.current + 1;
      channelNavigationRequestRef.current = routeRequestId;
      setIsChannelLoading(true);
      startChannelContentBuffer(650);
      setTargetChannel({
        userId: decodedKey,
        name: '',
        username: '',
        channelName: '',
        avatar: GUEST_AVATAR,
        bio: '',
        subscriberCount: 0
      });
      setTargetChannelUserId(decodedKey);
    }

    const allVideos = [
      ...(Array.isArray(rawFirebaseVideos) ? rawFirebaseVideos : []),
      ...(Array.isArray(videos) ? videos : []),
      ...(Array.isArray(MOCK_VIDEOS) ? MOCK_VIDEOS : [])
    ];

    const matchedVideo = allVideos.find(video => {
      const displayName = video.channel || video.author || video.creatorName || video.username || '';
      return String(video.userId || '') === decodedKey || String(displayName) === decodedKey;
    });

    if (matchedVideo) {
      const channelName = matchedVideo.channel || matchedVideo.author || matchedVideo.creatorName || matchedVideo.username || decodedKey;
      const channelAvatar = channelName === '小葉' ? avatarImage : (matchedVideo.avatar || matchedVideo.creatorAvatar || matchedVideo.channelAvatar || GUEST_AVATAR);
      const channelUserId = matchedVideo.userId || decodedKey;

      setTargetChannel({
        userId: channelUserId,
        name: channelName,
        username: channelName,
        channelName,
        avatar: channelAvatar,
        bio: '',
        subscriberCount: Number(matchedVideo?.subscriberCount ?? 0)
      });
      setTargetChannelUserId(channelUserId);
      setTimeout(() => {
        if (channelNavigationRequestRef.current !== routeRequestId) return;
        setIsChannelLoading(false);
        stopChannelContentBuffer();
      }, 650);
      return;
    }

    if (decodedKey === currentUserId || decodedKey === localUsername) {
      setTargetChannel({
        userId: currentUserId,
        name: localUsername,
        username: localUsername,
        channelName: localUsername,
        avatar: unifiedAvatar,
        bio: '',
        subscriberCount: liveSubscriberCount
      });
      setTargetChannelUserId(currentUserId);
      setTimeout(() => {
        if (channelNavigationRequestRef.current !== routeRequestId) return;
        setIsChannelLoading(false);
        stopChannelContentBuffer();
      }, 650);
    }
  }, [routeChannelKey, videos, rawFirebaseVideos, currentUserId, localUsername, unifiedAvatar, liveSubscriberCount]);

  const handleHomeNavigation = () => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    stopChannelContentBuffer();
    if (location.pathname !== '/') navigate('/');
    setIsPageLoading(true); 
    setSearchInputStr('');
    setSearchQuery('');
    setActiveCategory('全部');
    window.scrollTo(0, 0); 
    setJustUploadedVideo(null);

    const totallyShuffled = shuffleArray([...rawFirebaseVideos, ...MOCK_VIDEOS]);

    if (currentView === 'watch') {
      setVideos(totallyShuffled);
      setCurrentView('home');
    } else {
      setCurrentView('home');
      setVideos(totallyShuffled);
    }

    setTimeout(() => {
      setIsPageLoading(false);
    }, 400);
  };

  const handleInternalViewNavigation = (view, path) => {
    setIsVideoLoading(false);
    setIsChannelLoading(false);
    stopChannelContentBuffer();
    setCurrentView(view);
    navigate(path);
    forceScrollToTop();
    startPageBuffer(260);
  };

  const handleAccountSecurityNavigation = () => {
    setIsSettingsModalOpen(false);
    setIsProfileOpen(false);
    setIsEmailAuthModalOpen(false);
    setIsForgotPasswordModalOpen(false);
    setIsDeleteAccountModalOpen(false);
    setIsChangePasswordModalOpen(false);
    setIsChangeIdModalOpen(false);
    setNewIdInput(currentUserId === 'loading...' ? '' : currentUserId);
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setEmailInput(targetChannel?.email || authUser?.email || '');
    setForgotPasswordEmailInput(targetChannel?.email || authUser?.email || '');
    setDeleteAccountConfirmInput('');
    handleInternalViewNavigation('account-security', '/account-security');
  };

  const handleMyChannelClick = () => {
    const channelRequestId = channelNavigationRequestRef.current + 1;
    channelNavigationRequestRef.current = channelRequestId;

    startPageBuffer(260);
    startChannelContentBuffer(650);
    setIsChannelLoading(true);
    setCurrentView('channel');
    setChannelTab('videos');
    setIsProfileOpen(false);
    forceScrollToTop();

    const myChannelData = {
      userId: currentUserId,
      name: localUsername,
      username: localUsername,
      channelName: localUsername,
      avatar: unifiedAvatar, // 💡 確保這裡是用目前最新的 currentUserAvatar
      bio: '',
      subscriberCount: liveSubscriberCount
    };

    navigate(`/channel/${encodeURIComponent(currentUserId || localUsername || 'me')}`);

    setTimeout(() => {
      if (channelNavigationRequestRef.current !== channelRequestId) return;
      setTargetChannel(myChannelData);
      setTargetChannelUserId(currentUserId);
      setIsChannelLoading(false);
      stopChannelContentBuffer();
      stopPageBuffer();
    }, 650);
  };

  // 🟢 雙軌版：頻道導覽優先用 userId，找不到才 fallback 到舊版 username 文件
  // 第 4 個參數 providedUserId 很重要：其他帳號從影片卡片點進頻道時，可以直接讀到正確 userId
  const handleChannelNavigation = async (channelName, channelAvatar, e, providedUserId = '') => {
    if (e) e.stopPropagation();

    const channelRequestId = channelNavigationRequestRef.current + 1;
    channelNavigationRequestRef.current = channelRequestId;

    startPageBuffer(260);
    startChannelContentBuffer(500);
    setIsChannelLoading(true);
    setCurrentView('channel');
    setChannelTab('videos');
    forceScrollToTop();

    const startTime = Date.now();
    const finalName = channelName || localUsername;
    const routeKey = providedUserId || finalName;
    const finalAvatar = channelAvatar || GUEST_AVATAR;
    const initialBio = getRandomBio();
    if (routeKey) navigate(`/channel/${encodeURIComponent(routeKey)}`);

    // 每次點進頻道都重新載入一次；這裡只放暫存資料，避免名稱短暫空白。
    setTargetChannel({
      userId: routeKey || '',
      name: finalName || routeKey || '',
      username: finalName || routeKey || '',
      channelName: finalName || routeKey || '',
      avatar: finalAvatar,
      bio: '',
      subscriberCount: 0
    });
    setTargetChannelUserId(routeKey || '');

    if (finalName === '小葉') {
      const shiauyeChannel = {
        name: '小葉',
        username: '小葉',
        channelName: '小葉',
        avatar: avatarImage,
        bio: '這是小葉的官方頻道 ✨ 歡迎訂閱！',
        userId: 'shiauye_official'
      };
      setTimeout(() => {
        if (channelNavigationRequestRef.current !== channelRequestId) return;
        setTargetChannel(shiauyeChannel);
        setTargetChannelUserId('shiauye_official');
        localStorage.setItem('leafhub_targetChannel', JSON.stringify(shiauyeChannel));
        setIsChannelLoading(false);
        stopChannelContentBuffer();
        stopPageBuffer();
      }, 650);
      return;
    }

    const toNumber = (value) => {
      const num = Number(value ?? 0);
      return Number.isNaN(num) ? 0 : num;
    };

    const pickSubscriberCount = (...values) => {
      return Math.max(...values.map(toNumber), 0);
    };

    const matchedLocalVideo = (Array.isArray(videos) ? videos : []).find(video => {
      return (
        String(video.userId ?? '') === String(providedUserId ?? '') ||
        String(video.channel ?? '') === String(finalName) ||
        String(video.author ?? '') === String(finalName) ||
        String(video.creatorName ?? '') === String(finalName) ||
        String(video.username ?? '') === String(finalName)
      );
    });

    const hintedUserId =
      providedUserId ||
      matchedLocalVideo?.userId ||
      (finalName === localUsername ? currentUserId : '');

    const initialChannelData = {
      name: finalName,
      username: finalName,
      channelName: finalName,
      avatar: finalAvatar,
      bio: initialBio,
      userId: hintedUserId,
      subscriberCount: matchedLocalVideo?.subscriberCount ?? 0
    };

    const isInitialOwnChannel =
      String(hintedUserId || '') === String(currentUserId || '') ||
      String(finalName || '') === String(localUsername || '');

    if (!isInitialOwnChannel) {
      setLiveSubscriberCount(Number(matchedLocalVideo?.subscriberCount ?? 0));
    }

    // 不在這裡顯示 initialChannelData，避免 Firebase 完整資料回來前閃出半成品或上一個頻道。
    let finalId = hintedUserId;
    let resolvedAvatar =
      finalAvatar ||
      matchedLocalVideo?.avatar ||
      matchedLocalVideo?.creatorAvatar ||
      matchedLocalVideo?.channelAvatar ||
      GUEST_AVATAR;
    let resolvedSubscriberCount = 0;
    let idData = {};
    let legacyData = {};
    let legacyDocId = finalName;

    try {
      // 1) 有 userId 時，永遠先讀 Channels/{userId}
      if (finalId) {
        const idSnap = await getDoc(doc(db, 'Channels', finalId));
        if (idSnap.exists()) {
          idData = idSnap.data();
          finalId = idData.userId || finalId;
        }
      }

      // 2) 先用新版欄位查詢 name / username / channelName，優先找到真正的 userId 文件
      if (!finalId) {
        const fieldsToCheck = ['username', 'name', 'channelName'];
        for (const fieldName of fieldsToCheck) {
          const q = query(collection(db, 'Channels'), where(fieldName, '==', finalName));
          const snap = await getDocs(q);

          if (!snap.empty) {
            const idFirstDoc = snap.docs.find(channelDoc => {
              const data = channelDoc.data();
              return Boolean(
                data.userId ||
                data.canonicalChannelId ||
                String(channelDoc.id).startsWith('user_') ||
                String(channelDoc.id) === 'shiauye_official'
              );
            }) || snap.docs[0];

            const data = idFirstDoc.data();
            finalId = data.userId || data.canonicalChannelId || (String(idFirstDoc.id).startsWith('user_') ? idFirstDoc.id : '');
            idData = data;
            break;
          }
        }
      }

      // 3) 讀舊版 Channels/{username}，用來補 avatar / subscriberCount
      const legacySnap = await getDoc(doc(db, 'Channels', finalName));
      if (legacySnap.exists()) {
        legacyData = legacySnap.data();
        legacyDocId = legacySnap.id;

        if (!finalId) {
          finalId = legacyData.userId || legacyData.canonicalChannelId || matchedLocalVideo?.userId || '';
        }
      }

      // 4) 如果影片資料內有 userId，但上面都沒解出來，就用影片的 userId
      if (!finalId && matchedLocalVideo?.userId) {
        finalId = matchedLocalVideo.userId;
      }

      // 5) 都找不到才建立新 ID 文件。這通常只會發生在完全沒有 userId 的舊資料。
      if (!finalId) {
        finalId = finalName === localUsername
          ? currentUserId
          : finalName;
      }

      // 如果前面解出 finalId 後，補讀 Channels/{userId}
      if (finalId && Object.keys(idData).length === 0) {
        const idSnap = await getDoc(doc(db, 'Channels', finalId));
        if (idSnap.exists()) idData = idSnap.data();
      }

      resolvedAvatar =
        idData.avatar ||
        legacyData.avatar ||
        matchedLocalVideo?.avatar ||
        matchedLocalVideo?.creatorAvatar ||
        matchedLocalVideo?.channelAvatar ||
        resolvedAvatar ||
        GUEST_AVATAR;

      const isViewingOwnChannel =
        String(finalId || '') === String(currentUserId || '') ||
        String(finalName || '') === String(localUsername || '');

      // 重要：點進別人頻道時，不能把自己的 liveSubscriberCount 當 fallback。
      // 否則流程會變成：先點自己頻道 → liveSubscriberCount 是自己的 → 再點別人頻道 → 別人頻道顯示/寫入自己的訂閱數。
      resolvedSubscriberCount = isViewingOwnChannel
        ? pickSubscriberCount(
            idData.subscriberCount,
            idData.subscribers,
            idData.subsCount,
            legacyData.subscriberCount,
            legacyData.subscribers,
            legacyData.subsCount,
            matchedLocalVideo?.subscriberCount,
            liveSubscriberCount
          )
        : pickSubscriberCount(
            idData.subscriberCount,
            idData.subscribers,
            idData.subsCount,
            legacyData.subscriberCount,
            legacyData.subscribers,
            legacyData.subsCount,
            matchedLocalVideo?.subscriberCount
          );

      // 6) 只同步頻道基本資料。重要：瀏覽別人的頻道時，不寫 subscriberCount，避免把目前頻道/小葉的訂閱數污染到其他人。
      await setDoc(doc(db, 'Channels', finalId), {
        ...idData,
        name: idData.name || legacyData.name || finalName,
        username: idData.username || legacyData.username || legacyData.name || finalName,
        channelName: idData.channelName || legacyData.channelName || legacyData.name || finalName,
        avatar: resolvedAvatar,
        userId: finalId,
        ...(isViewingOwnChannel ? { subscriberCount: resolvedSubscriberCount } : {}),
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString(),
        createdAt: idData.createdAt || legacyData.createdAt || new Date().toISOString()
      }, { merge: true });

      // 🟡 先保留舊版 Channels/{username}，但瀏覽別人頻道時不回寫 subscriberCount，避免訂閱數污染。
      if (legacyDocId && String(legacyDocId) !== String(finalId)) {
        await setDoc(doc(db, 'Channels', legacyDocId), {
          ...legacyData,
          canonicalChannelId: finalId,
          userId: legacyData.userId || finalId,
          avatar: legacyData.avatar || resolvedAvatar,
          ...(isViewingOwnChannel ? { subscriberCount: pickSubscriberCount(legacyData.subscriberCount, resolvedSubscriberCount) } : {}),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 7) 舊影片補 userId / avatar，讓其他帳號以後點同頻道可以直接讀到正確 userId
      const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));
      for (const videoDoc of videosSnapshot.docs) {
        const videoData = videoDoc.data();
        const isSameChannel =
          String(videoData.userId ?? '') === String(finalId) ||
          String(videoData.channel ?? '') === String(finalName) ||
          String(videoData.author ?? '') === String(finalName) ||
          String(videoData.creatorName ?? '') === String(finalName) ||
          String(videoData.username ?? '') === String(finalName);

        const needsUpdate =
          isSameChannel &&
          (
            videoData.userId !== finalId ||
            videoData.avatar !== resolvedAvatar ||
            videoData.creatorAvatar !== resolvedAvatar ||
            videoData.channelAvatar !== resolvedAvatar
          );

        if (needsUpdate) {
          await setDoc(doc(db, 'Videos', videoDoc.id), {
            ...videoData,
            userId: finalId,
            avatar: resolvedAvatar,
            creatorAvatar: resolvedAvatar,
            channelAvatar: resolvedAvatar
          }, { merge: true });
        }
      }

    } catch (err) {
      console.error('Firebase Channels 舊帳號訂閱數同步失敗:', err);
      const suffix = finalName.split('_')[1] || 'temp';
      finalId = finalId || `user_${suffix}`;
    }

    if (channelNavigationRequestRef.current !== channelRequestId) return;

    setTargetChannelUserId(finalId);
    const displaySubscriberCount = isViewingOwnChannel
      ? resolvedSubscriberCount
      : pickSubscriberCount(
          idData.subscriberCount,
          idData.subscribers,
          idData.subsCount,
          legacyData.subscriberCount,
          legacyData.subscribers,
          legacyData.subsCount,
          matchedLocalVideo?.subscriberCount
        );

    const updatedChannelData = {
      name: finalName,
      username: finalName,
      channelName: finalName,
      avatar: resolvedAvatar,
      bio: initialBio,
      userId: finalId,
      subscriberCount: displaySubscriberCount
    };
    setTargetChannel(updatedChannelData);
    localStorage.setItem('leafhub_targetChannel', JSON.stringify(updatedChannelData));

    const minimumDelay = 500;
    const elapsedTime = Date.now() - startTime;
    const remainingTime = minimumDelay - elapsedTime;

    if (remainingTime > 0) {
      setTimeout(() => {
        if (channelNavigationRequestRef.current !== channelRequestId) return;
        setIsChannelLoading(false);
        stopChannelContentBuffer();
        stopPageBuffer();
      }, remainingTime);
    } else {
      if (channelNavigationRequestRef.current !== channelRequestId) return;
      setIsChannelLoading(false);
      stopChannelContentBuffer();
      stopPageBuffer();
    }
  };

  const previousViewRef = useRef(currentView);

  useEffect(() => {
    const previousView = previousViewRef.current;
    if (previousView !== currentView && currentView === 'watch') {
      forceScrollToTop();
    }
    previousViewRef.current = currentView;
  }, [currentView]);


  /* ------------------------------
    13. Comment / Reply Actions
  ------------------------------ */
  const toggleReplySection = (commentId) => {
    setExpandedReplyComments(prev => {
      return { ...prev, [commentId]: !prev[commentId] };
    });
  };

  useEffect(() => {
    const activeCommentIds = Object.keys(expandedReplyComments).filter(id => expandedReplyComments[id]);
    if (activeCommentIds.length === 0) return;

    activeCommentIds.forEach(commentId => {
      const repliesList = commentReplies[commentId] || [];
      setOptimisticReplies(prev => 
        prev.filter(localReply => 
          !(localReply.commentId === commentId && repliesList.some(serverReply => 
            serverReply.text === localReply.text && serverReply.author === localReply.author
          ))
        )
      );
    });
  }, [expandedReplyComments, commentReplies]);

  useEffect(() => {
    if (!selectedVideo?.id) {
      setIsCommentsLoading(false);
      return;
    }
    setIsCommentsLoading(true); 
    const unsubscribe = subscribeToComments(selectedVideo, (fetchedComments) => {
      setComments(fetchedComments);
      setIsCommentsLoading(false); 
    }, setCommentReplies);

    return () => unsubscribe();
  }, [selectedVideo]);

  useEffect(() => {
    if (!hasFirebaseVideosSnapshot) return;
    if (currentView !== 'channel') return;
    if (isChannelLoading) return;

    // Firebase Videos 第一包 snapshot 回來後，才允許頻道內容 buffer 收掉。
    stopChannelContentBuffer();
  }, [hasFirebaseVideosSnapshot, currentView, isChannelLoading, routeChannelKey, rawFirebaseVideos.length, videos.length]);

  useEffect(() => {
    if (currentView !== 'channel') return;

    const routeKey = routeChannelKey ? decodeURIComponent(routeChannelKey) : '';
    const channelName = String(targetChannel?.name || targetChannel?.username || targetChannel?.channelName || '').trim();
    const channelUserId = String(targetChannel?.userId || targetChannelUserId || '').trim();
    const requestId = channelNavigationRequestRef.current;

    const primaryUserId = channelUserId || routeKey;
    const fallbackKeys = Array.from(new Set([channelName, routeKey]
      .map(value => String(value ?? '').trim())
      .filter(Boolean)));

    if (!primaryUserId && fallbackKeys.length === 0) return;

    let cancelled = false;

    const loadChannelVideos = async () => {
      // 每次進頻道都重新載入，不使用快取。
      setIsChannelVideosLoading(true);
      setIsChannelLoading(true);
      startChannelContentBuffer(500);
      setChannelVideos([]);

      const mergeDocs = (docs = []) => {
        const map = new Map();
        docs.forEach(videoDoc => {
          const video = { id: videoDoc.id, ...videoDoc.data() };
          if (!isVideoVisible(video)) return;
          map.set(video.id, video);
        });
        return Array.from(map.values());
      };

      const runVideoQuery = async (fieldName, fieldValue) => {
        return getDocs(query(
          collection(db, 'Videos'),
          where(fieldName, '==', fieldValue),
          limit(48)
        ));
      };

      try {
        let allDocs = [];

        // 第一優先：只查該頻道 userId。
        if (primaryUserId) {
          const primarySnapshot = await runVideoQuery('userId', primaryUserId);
          allDocs = primarySnapshot.docs;
        }

        // 舊資料沒有 userId 時，才平行查舊欄位。
        if (allDocs.length === 0 && fallbackKeys.length > 0) {
          const fallbackFields = ['channel', 'author', 'creatorName', 'username', 'channelName'];
          const fallbackSnapshots = await Promise.all(
            fallbackKeys.flatMap(key =>
              fallbackFields.map(fieldName =>
                runVideoQuery(fieldName, key).catch(error => {
                  console.warn(`頻道影片 fallback 查詢失敗：${fieldName} == ${key}`, error);
                  return null;
                })
              )
            )
          );

          allDocs = fallbackSnapshots
            .filter(Boolean)
            .flatMap(snapshot => snapshot.docs);
        }

        if (cancelled || channelNavigationRequestRef.current !== requestId) return;

        const nextChannelVideos = sortVideos(mergeDocs(allDocs), channelVideoSort).slice(0, 48);
        setChannelVideos(nextChannelVideos);

        // 如果 Header 還沒有名稱/頭貼，用查到的第一支影片補一次，但不存快取。
        const firstVideo = nextChannelVideos[0] || {};
        const derivedName = channelName || firstVideo.channel || firstVideo.author || firstVideo.creatorName || firstVideo.username || routeKey;
        const derivedAvatar = targetChannel?.avatar && targetChannel.avatar !== GUEST_AVATAR
          ? targetChannel.avatar
          : (firstVideo.avatar || firstVideo.creatorAvatar || firstVideo.channelAvatar || GUEST_AVATAR);

        setTargetChannel(prev => ({
          ...prev,
          userId: prev?.userId || primaryUserId || '',
          name: prev?.name || derivedName || routeKey || '',
          username: prev?.username || derivedName || routeKey || '',
          channelName: prev?.channelName || derivedName || routeKey || '',
          avatar: prev?.avatar && prev.avatar !== GUEST_AVATAR ? prev.avatar : derivedAvatar,
          subscriberCount: prev?.subscriberCount ?? firstVideo.subscriberCount ?? 0
        }));
      } catch (error) {
        if (!cancelled) {
          console.error('讀取頻道影片失敗：', error);
          setChannelVideos([]);
        }
      } finally {
        if (!cancelled && channelNavigationRequestRef.current === requestId) {
          setIsChannelVideosLoading(false);
          setIsChannelLoading(false);
          stopChannelContentBuffer();
        }
      }
    };

    loadChannelVideos();

    return () => {
      cancelled = true;
    };
  }, [currentView, routeChannelKey, targetChannel?.userId, targetChannelUserId, targetChannel?.name, targetChannel?.username, targetChannel?.channelName]);

  const mergeUniqueVideosById = (baseList = [], nextList = []) => {
    const mergedMap = new Map();
    [...baseList, ...nextList].forEach((video, index) => {
      if (!video) return;
      const key = String(video.id || video.youtubeId || video.videoUrl || `${video.title || 'video'}-${index}`);
      mergedMap.set(key, { ...(mergedMap.get(key) || {}), ...video });
    });
    return Array.from(mergedMap.values()).filter(isVideoVisible);
  };

  
const getHomeRecommendationScore = (video = {}) => {
    let score = 0;
    const views = getViewCount(video);
    const likes = getLikeCount(video);
    const createdTime = getDateValue(video.createdAt ?? video.publishedAt ?? video.uploadedAt ?? video.time);
    const ageDays = createdTime ? Math.max(0, (Date.now() - createdTime) / 86400000) : 999;
    const channelName = getVideoDisplayName(video);
    const watchedCategories = new Set((Array.isArray(watchHistory) ? watchHistory : []).map(item => item?.category).filter(Boolean));

    score += Math.min(views, 100000) * 0.03;
    score += Math.min(likes, 20000) * 0.8;
    score += Math.max(0, 45 - ageDays) * 2.2;

    if ((Array.isArray(subscribedChannels) ? subscribedChannels : []).includes(channelName)) {
      score += 90;
    }

    if (video?.category && watchedCategories.has(video.category)) {
      score += 35;
    }

    return score;
  };

  const recommendVideosForHome = (videoList = []) => {
    const list = (Array.isArray(videoList) ? videoList : []).filter(isVideoVisible);
    return [...list].sort((a, b) => getHomeRecommendationScore(b) - getHomeRecommendationScore(a));
  };

  const loadHomeVideosPage = async ({ reset = false } = {}) => {
    if (!reset && (homeLoadMoreLockRef.current || isLoadingMoreHomeVideos || !hasMoreHomeVideos)) return;
    if (!reset) {
      homeLoadMoreLockRef.current = true;
    }

    try {
      if (reset) {
        setIsPageLoading(true);
      } else {
        setIsLoadingMoreHomeVideos(true);
      }

      const queryParts = [
        collection(db, 'Videos'),
        orderBy('createdAt', 'desc'),
        limit(HOME_VIDEO_PAGE_SIZE)
      ];

      if (!reset && homeLastVideoDoc) {
        queryParts.splice(2, 0, startAfter(homeLastVideoDoc));
      }

      const snapshot = await getDocs(query(...queryParts));
      const validFirebaseVideos = snapshot.docs
        .map(videoDoc => ({ id: videoDoc.id, ...videoDoc.data() }))
        .filter(isVideoVisible);

      setHasFirebaseVideosSnapshot(true);
      setHomeLastVideoDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMoreHomeVideos(snapshot.docs.length === HOME_VIDEO_PAGE_SIZE);

      const justUploadedYoutubeId = String(justUploadedVideo?.youtubeId ?? '');
      const moveJustUploadedToFront = (list) => {
        if (!justUploadedYoutubeId) return list;

        const uploadedIndex = list.findIndex(video =>
          String(video.youtubeId ?? '') === justUploadedYoutubeId
        );

        if (uploadedIndex <= 0) return list;
        const next = [...list];
        const [uploadedVideo] = next.splice(uploadedIndex, 1);
        return [uploadedVideo, ...next];
      };

      if (reset) {
        setRawFirebaseVideos(validFirebaseVideos);
        setVideos(recommendVideosForHome(moveJustUploadedToFront(validFirebaseVideos)));
      } else {
        // 載入更多時只追加下一頁 24 部，不重新推薦排序舊影片，避免畫面一直跳動。
        setTimeout(() => {
          setRawFirebaseVideos(prev => mergeUniqueVideosById(prev, validFirebaseVideos));
          setVideos(prev => moveJustUploadedToFront(mergeUniqueVideosById(prev, validFirebaseVideos)));
        }, 260);
      }

      if (justUploadedYoutubeId && !validFirebaseVideos.some(video => String(video.youtubeId ?? '') === justUploadedYoutubeId)) {
        return;
      }

      if (justUploadedYoutubeId) {
        setTimeout(() => {
          setIsPageLoading(false);
          setJustUploadedVideo(null);
        }, 500);
      } else if (reset) {
        setIsPageLoading(false);
      }

      setIsFirstInit(false);
    } catch (error) {
      console.error('首頁影片分頁讀取失敗：', error);
      showToast('首頁影片讀取失敗，請稍後再試', 'error');
      setHasFirebaseVideosSnapshot(true);
      setIsFirstInit(false);
      setIsPageLoading(false);
    } finally {
      if (!reset) {
        setTimeout(() => {
          setIsLoadingMoreHomeVideos(false);
          homeLoadMoreLockRef.current = false;
        }, 700);
      }
    }
  };

  useEffect(() => {
    loadHomeVideosPage({ reset: true });
    // 只在第一次載入或剛上傳影片後重抓第一頁；不要即時監聽整個 Videos 集合。
  }, [justUploadedVideo]);


  // IntersectionObserver 容易在 sentinel 還可見時連續觸發，造成一次載入多頁。
  // 這裡改用下面的 scroll handler，只在使用者真的往下滑接近底部時載入下一頁。



  useEffect(() => {
    if (currentView !== 'home' || searchQuery.trim()) return;

    const scrollNode = contentAreaRef.current;
    const getRemainingScroll = () => {
      if (scrollNode) {
        return scrollNode.scrollHeight - scrollNode.scrollTop - scrollNode.clientHeight;
      }
      const doc = document.documentElement;
      return doc.scrollHeight - window.scrollY - window.innerHeight;
    };

    const maybeLoadMoreHomeVideos = () => {
      if (currentView !== 'home' || searchQuery.trim()) return;
      if (isPageLoading || isFirstInit || isLoadingMoreHomeVideos || !hasMoreHomeVideos || homeLoadMoreLockRef.current) return;
      // 只在真的接近底部時載入下一頁，避免一次把所有影片載入。
      if (getRemainingScroll() <= 260) {
        loadHomeVideosPage({ reset: false });
      }
    };

    const scrollTarget = scrollNode || window;
    scrollTarget.addEventListener('scroll', maybeLoadMoreHomeVideos, { passive: true });

    return () => {
      scrollTarget.removeEventListener('scroll', maybeLoadMoreHomeVideos);
    };
  }, [currentView, searchQuery, isPageLoading, isFirstInit, isLoadingMoreHomeVideos, hasMoreHomeVideos, homeLastVideoDoc, activeCategory]);

useEffect(() => {
  if (!Array.isArray(rawFirebaseVideos) || rawFirebaseVideos.length === 0) return;

  // 只在「影片 id / youtubeId 清單真的改變」時檢查，避免 youtubeCheckedAt 更新後又觸發無限重查。
  const cleanupSignature = rawFirebaseVideos
    .map(video => `${video.id || ''}:${video.youtubeId || ''}`)
    .sort()
    .join('|');

  if (lastYoutubeCleanupSignatureRef.current === cleanupSignature) return;
  lastYoutubeCleanupSignatureRef.current = cleanupSignature;

  const shouldForceCheck = !hasRunInitialYoutubeCleanupRef.current;

  if (!hasRunInitialYoutubeCleanupRef.current) {
    hasRunInitialYoutubeCleanupRef.current = true;
  }

  cleanupUnavailableYoutubeVideosFromClient(rawFirebaseVideos, shouldForceCheck);
}, [rawFirebaseVideos]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }

      const videoOptionsRoot = event.target.closest?.('[data-video-options-root="true"]');
      if (!videoOptionsRoot) {
        setOpenVideoOptionsId(null);
      }

      const commentOptionsRoot = event.target.closest?.('[data-comment-options-root="true"]');
      if (!commentOptionsRoot) {
        setOpenCommentOptionsId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  /* ------------------------------
    14. Video Actions / 觀看、按讚、訂閱
  ------------------------------ */
  const getCurrentVideoShareUrl = () => {
    const ytId = getYoutubeIdFromVideo(selectedVideo);
    const basePath = import.meta.env.BASE_URL || '/';
    const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    return ytId ? `${window.location.origin}${normalizedBasePath}/watch/${ytId}` : window.location.href;
  };

  const handleShareVideo = () => {
    setShareCopied(false);
    setIsShareModalOpen(true);
  };

  const handleCopyShareLink = async () => {
    const shareUrl = getCurrentVideoShareUrl();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = shareUrl;
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }

      setShareCopied(true);
      showToast('已複製影片連結', 'success');
      setTimeout(() => setShareCopied(false), 1600);
    } catch (error) {
      console.error('複製分享連結失敗：', error);
      showToast('複製失敗，請稍後再試', 'error');
    }
  };

  const openShareTarget = (target) => {
    const shareUrl = getCurrentVideoShareUrl();
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(selectedVideo?.title || 'Leafhub 影片');

    const targetUrlMap = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      messages: `sms:?&body=${encodedTitle}%20${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`
    };

    const targetUrl = targetUrlMap[target];
    if (!targetUrl) return;

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  

  const getVideoMenuKey = (video = {}) => {
    return String(video?.id || getYoutubeIdFromVideo(video) || video?.videoUrl || video?.title || 'video');
  };

  const getVideoShareUrl = (video = {}) => {
    const ytId = getYoutubeIdFromVideo(video);
    const basePath = import.meta.env.BASE_URL || '/';
    const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    return ytId ? `${window.location.origin}${normalizedBasePath}/watch/${ytId}` : window.location.href;
  };

  const handleAddToWatchLater = (video = {}, e = null) => {
    if (e) e.stopPropagation();
    const key = getVideoMenuKey(video);
    setWatchLaterVideos(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      if (safePrev.some(item => getVideoMenuKey(item) === key)) {
        showToast('已經在稍後觀看', 'info');
        return safePrev;
      }
      const next = [{ ...video, savedAt: new Date().toISOString() }, ...safePrev].slice(0, 300);
      localStorage.setItem('leafhub_watchLaterVideos', JSON.stringify(next));
      showToast('已加入稍後觀看', 'success');
      return next;
    });
    setOpenVideoOptionsId(null);
  };

  const handleNotInterestedVideo = (video = {}, e = null) => {
    if (e) e.stopPropagation();
    const candidates = [video?.id, video?.youtubeId, getYoutubeIdFromVideo(video), video?.videoUrl]
      .map(value => String(value || '').trim())
      .filter(Boolean);

    if (candidates.length === 0) return;

    setNotInterestedVideoIds(prev => {
      const next = Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...candidates]));
      localStorage.setItem('leafhub_notInterestedVideos', JSON.stringify(next));
      return next;
    });

    setVideos(prev => (Array.isArray(prev) ? prev : []).filter(item => {
      const itemCandidates = [item?.id, item?.youtubeId, getYoutubeIdFromVideo(item), item?.videoUrl]
        .map(value => String(value || '').trim())
        .filter(Boolean);
      return !itemCandidates.some(value => candidates.includes(value));
    }));
    setRawFirebaseVideos(prev => (Array.isArray(prev) ? prev : []).filter(item => {
      const itemCandidates = [item?.id, item?.youtubeId, getYoutubeIdFromVideo(item), item?.videoUrl]
        .map(value => String(value || '').trim())
        .filter(Boolean);
      return !itemCandidates.some(value => candidates.includes(value));
    }));
    setOpenVideoOptionsId(null);
    showToast('之後會減少推薦這類影片', 'info');
  };

  const handleShareVideoFromMenu = (video = {}, e = null) => {
    if (e) e.stopPropagation();
    setSelectedVideo(video);
    setShareCopied(false);
    setIsShareModalOpen(true);
    setOpenVideoOptionsId(null);
  };

  const handleCopyVideoLinkFromMenu = async (video = {}, e = null) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getVideoShareUrl(video));
      showToast('已複製影片連結', 'success');
    } catch (error) {
      console.error('複製影片連結失敗:', error);
      showToast('複製連結失敗，請稍後再試', 'error');
    }
    setOpenVideoOptionsId(null);
  };

  const syncWatchHistoryToFirebase = async (video = {}) => {
    const uid = String(currentUserId || '').trim();
    const videoKey = getVideoMenuKey(video);
    if (!uid || uid === 'loading...' || !videoKey) return;

    try {
      await setDoc(doc(db, 'Users', uid, 'watchHistory', videoKey), {
        userId: uid,
        videoId: video?.id || '',
        youtubeId: getYoutubeIdFromVideo(video),
        title: video?.title || '',
        channel: getVideoDisplayName(video),
        thumbnail: video?.thumbnail || '',
        category: video?.category || '未分類',
        watchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('同步觀看紀錄到 Firebase 失敗:', error);
    }
  };
const handleVideoClick = async (video) => {
    const ytId = getYoutubeIdFromVideo(video);

    if (!ytId) {
      showToast('找不到這支影片的 YouTube ID，無法開啟分享頁面', 'error');
      return;
    }

    setIsVideoLoading(true);

    // 先把播放頁訂閱數重設成這支影片自己的，避免沿用上一個頻道
    setLiveSubscriberCount(Number(video?.subscriberCount ?? 0));

    setSelectedVideo(video);
    setCurrentView('watch');
    navigate(`/watch/${ytId}`);
    forceScrollToTop();

    setTimeout(() => {
      setIsVideoLoading(false);
    }, 450);

    setWatchHistory(prev => {
      const nextHistory = [video, ...prev.filter(item => item.id !== video.id)];
      localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
      return nextHistory;
    });

    syncWatchHistoryToFirebase(video);

    const isMockVideo = ['1','2','3','4','5','6','7','8','9','10','11','12','13'].includes(video.id);
    if (!isMockVideo) {
      try {
        await incrementVideoViews(video.id);
      } catch (error) {
        console.error("無法更新觀看次數：", error);
      }
    }
  };

  useEffect(() => {
    if (currentView !== 'watch' || !selectedVideo) return;

    let cancelled = false;

    const normalizeChannelText = (value) => String(value ?? '').trim();
    const getChannelNameFromVideo = (video = {}) => normalizeChannelText(
      video.channel || video.author || video.creatorName || video.username || video.channelName || ''
    );
    const getVideoKey = (video = {}, index = 0) => String(
      video.id || getYoutubeIdFromVideo(video) || video.youtubeId || video.videoUrl || `${video.title || 'video'}-${index}`
    );
    const sameWatchChannel = (video = {}) => {
      const selectedUserId = normalizeChannelText(selectedVideo.userId);
      const videoUserId = normalizeChannelText(video.userId);
      const selectedChannelName = getChannelNameFromVideo(selectedVideo);
      const videoChannelName = getChannelNameFromVideo(video);

      return Boolean(
        (selectedUserId && videoUserId && selectedUserId === videoUserId) ||
        (selectedChannelName && videoChannelName && selectedChannelName === videoChannelName)
      );
    };
    const mergeUnique = (lists = []) => {
      const map = new Map();
      lists.flat().forEach((video, index) => {
        if (!video || !isVideoVisible(video)) return;
        const key = getVideoKey(video, index);
        if (!map.has(key)) {
          map.set(key, video);
        } else {
          map.set(key, { ...map.get(key), ...video });
        }
      });
      return Array.from(map.values()).filter(video => getVideoKey(video) !== getVideoKey(selectedVideo));
    };

    const weightedShuffleForWatch = (videoList = []) => {
      // 只重新洗牌目前已經在前端的影片，不再每次點側邊欄都打 Firebase，避免黑畫面。
      // 同頻道影片給較高權重，但不是強制排最上面，所以仍然會混入其他頻道。
      return videoList
        .map(video => {
          const weight = sameWatchChannel(video) ? 2.35 : 1;
          return {
            video,
            score: -Math.log(Math.max(Math.random(), 0.000001)) / weight
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.video);
    };

    setIsWatchRecommendationsLoading(true);

    const bufferTimer = setTimeout(() => {
      if (cancelled) return;

      const localPool = mergeUnique([
        videos,
        rawFirebaseVideos,
        MOCK_VIDEOS
      ]);

      const shuffledRecommendations = weightedShuffleForWatch(localPool).slice(0, 24);
      setWatchRecommendedVideos(shuffledRecommendations);
      setIsWatchRecommendationsLoading(false);
    }, 360);

    return () => {
      cancelled = true;
      clearTimeout(bufferTimer);
    };
  }, [currentView, selectedVideo?.id, selectedVideo?.youtubeId, selectedVideo?.userId, videos.length, rawFirebaseVideos.length]);

  const toggleLike = async (id) => {
    let shouldLike = false;
    setLikedVideoIds(prev => {
      shouldLike = !prev.includes(id);
      const nextLikes = shouldLike ? [...prev, id] : prev.filter(item => item !== id);
      localStorage.setItem('leafhub_likedVideos', JSON.stringify(nextLikes));
      return nextLikes;
    });

    // 按讚數存在 Videos.likeCount，避免之後每次都用 likedBy 陣列長度重新算。
    if (id) {
      try {
        await updateDoc(doc(db, 'Videos', id), {
          likeCount: increment(shouldLike ? 1 : -1),
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        console.warn('同步影片按讚數失敗：', error);
      }
    }
  };

  const toggleSubscribe = async (channelName) => {
    const cleanChannelName = String(channelName || '').trim();
    if (!cleanChannelName || INVALID_LEGACY_SUBSCRIPTION_CHANNELS.includes(cleanChannelName)) return;

    const sameText = (a, b) => String(a ?? '').trim() !== '' && String(a ?? '').trim() === String(b ?? '').trim();
    const getVideoChannelName = (video = {}) => video.channel || video.author || video.creatorName || video.username || '';

    const allKnownVideos = [
      ...(Array.isArray(rawFirebaseVideos) ? rawFirebaseVideos : []),
      ...(Array.isArray(videos) ? videos : []),
      ...(Array.isArray(MOCK_VIDEOS) ? MOCK_VIDEOS : [])
    ];

    const matchedVideo = allKnownVideos.find(video => {
      const displayName = getVideoChannelName(video);
      return (
        sameText(displayName, cleanChannelName) ||
        sameText(video?.channel, cleanChannelName) ||
        sameText(video?.author, cleanChannelName) ||
        sameText(video?.creatorName, cleanChannelName) ||
        sameText(video?.username, cleanChannelName) ||
        sameText(video?.userId, targetChannel?.userId || targetChannelUserId)
      );
    });

    const baseChannelInfo =
      sameText(targetChannel?.name, cleanChannelName) ||
      sameText(targetChannel?.username, cleanChannelName) ||
      sameText(targetChannel?.channelName, cleanChannelName)
        ? {
            userId: targetChannel?.userId || targetChannelUserId,
            name: targetChannel?.name || cleanChannelName,
            username: targetChannel?.username || targetChannel?.name || cleanChannelName,
            channelName: targetChannel?.channelName || targetChannel?.name || cleanChannelName,
            avatar: targetChannel?.avatar || getTargetChannelAvatarSrc?.() || matchedVideo?.avatar || matchedVideo?.creatorAvatar || GUEST_AVATAR,
            subscriberCount: targetChannel?.subscriberCount
          }
        : selectedVideo && sameText(getVideoChannelName(selectedVideo), cleanChannelName)
          ? {
              userId: selectedVideo?.userId,
              name: getVideoChannelName(selectedVideo) || cleanChannelName,
              username: selectedVideo?.username || getVideoChannelName(selectedVideo) || cleanChannelName,
              channelName: selectedVideo?.channel || getVideoChannelName(selectedVideo) || cleanChannelName,
              avatar: selectedVideo?.avatar || selectedVideo?.creatorAvatar || selectedVideo?.channelAvatar || GUEST_AVATAR,
              subscriberCount: selectedVideo?.subscriberCount
            }
          : {
              userId: matchedVideo?.userId || targetChannel?.userId || targetChannelUserId || selectedVideo?.userId || '',
              name: cleanChannelName,
              username: cleanChannelName,
              channelName: cleanChannelName,
              avatar: matchedVideo?.avatar || matchedVideo?.creatorAvatar || targetChannel?.avatar || selectedVideo?.avatar || selectedVideo?.creatorAvatar || GUEST_AVATAR,
              subscriberCount: matchedVideo?.subscriberCount
            };

    const normalizedChannelInfo = cleanChannelName === '小葉'
      ? {
          ...baseChannelInfo,
          userId: 'shiauye_official',
          name: '小葉',
          username: '小葉',
          channelName: '小葉',
          avatar: avatarImage
        }
      : baseChannelInfo;

    const isCurrentlySubbed = isSubscribedToChannel(normalizedChannelInfo) || subscribedChannels.includes(cleanChannelName);
    const subscribeDelta = isCurrentlySubbed ? -1 : 1;
    const currentDisplayCount = getTargetChannelSubscriberCount();
    const optimisticSubscriberCount = Math.max(0, currentDisplayCount + subscribeDelta);

    const findExistingChannelDocId = async () => {
      const directId = String(normalizedChannelInfo.userId || '').trim();
      if (directId) {
        const directSnap = await getDoc(doc(db, 'Channels', directId));
        if (directSnap.exists()) return directId;
      }

      const candidateFields = ['name', 'username', 'channelName'];
      for (const fieldName of candidateFields) {
        const q = query(collection(db, 'Channels'), where(fieldName, '==', cleanChannelName));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const bestDoc = snap.docs
            .map(channelDoc => ({ id: channelDoc.id, data: channelDoc.data() || {} }))
            .sort((a, b) => preserveSubscriberCount(b.data.subscriberCount, b.data.subscribers, b.data.subsCount) - preserveSubscriberCount(a.data.subscriberCount, a.data.subscribers, a.data.subsCount))[0];
          return bestDoc.id;
        }
      }

      return directId || cleanChannelName;
    };

    const patchVideoSubscriberCount = (subscriberCount, channelDocId = normalizedChannelInfo.userId || '') => (video) => {
      const videoDisplayName = getVideoChannelName(video);
      const isSameChannel =
        sameText(video?.userId, channelDocId) ||
        sameText(video?.userId, normalizedChannelInfo.userId) ||
        sameText(videoDisplayName, cleanChannelName) ||
        sameText(video?.channel, cleanChannelName) ||
        sameText(video?.author, cleanChannelName) ||
        sameText(video?.creatorName, cleanChannelName) ||
        sameText(video?.username, cleanChannelName);

      return isSameChannel ? { ...video, subscriberCount, userId: video?.userId || normalizedChannelInfo.userId || channelDocId } : video;
    };

    const applyLocalSubscriptionState = (nextSubscriberCount, channelDocId = normalizedChannelInfo.userId || '') => {
      setSubscribedChannels(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const nextSubs = isCurrentlySubbed
          ? safePrev.filter(item => !sameText(item, cleanChannelName))
          : Array.from(new Set([...safePrev, cleanChannelName]));
        localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
        return nextSubs;
      });

      setSubscribedChannelDetails(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const nextDetails = isCurrentlySubbed
          ? safePrev.filter(item => {
              const detailCandidates = getChannelIdentityCandidates(item);
              const removeCandidates = getChannelIdentityCandidates({ ...normalizedChannelInfo, userId: normalizedChannelInfo.userId || channelDocId });
              return !detailCandidates.some(detailValue => removeCandidates.some(removeValue => sameChannelValue(detailValue, removeValue)));
            })
          : [
              {
                ...normalizedChannelInfo,
                userId: normalizedChannelInfo.userId || channelDocId,
                name: normalizedChannelInfo.name || cleanChannelName,
                username: normalizedChannelInfo.username || cleanChannelName,
                channelName: normalizedChannelInfo.channelName || cleanChannelName,
                avatar: normalizedChannelInfo.avatar || GUEST_AVATAR,
                subscriberCount: nextSubscriberCount,
                subscribedAt: Date.now()
              },
              ...safePrev.filter(item => {
                const detailCandidates = getChannelIdentityCandidates(item);
                const addCandidates = getChannelIdentityCandidates({ ...normalizedChannelInfo, userId: normalizedChannelInfo.userId || channelDocId });
                return !detailCandidates.some(detailValue => addCandidates.some(addValue => sameChannelValue(detailValue, addValue)));
              })
            ];

        localStorage.setItem('leafhub_subscriptionDetails', JSON.stringify(nextDetails));
        return nextDetails;
      });

      setTargetChannel(prev => {
        if (!prev) return prev;
        const isSameChannel =
          sameText(prev.userId, channelDocId) ||
          sameText(prev.userId, normalizedChannelInfo.userId) ||
          sameText(prev.name, cleanChannelName) ||
          sameText(prev.username, cleanChannelName) ||
          sameText(prev.channelName, cleanChannelName);

        return isSameChannel ? { ...prev, userId: prev.userId || normalizedChannelInfo.userId || channelDocId, subscriberCount: nextSubscriberCount } : prev;
      });

      const patcher = patchVideoSubscriberCount(nextSubscriberCount, channelDocId);
      setSelectedVideo(prev => prev ? patcher(prev) : prev);
      setRawFirebaseVideos(prev => Array.isArray(prev) ? prev.map(patcher) : prev);
      setVideos(prev => Array.isArray(prev) ? prev.map(patcher) : prev);
      setWatchHistory(prev => {
        const nextHistory = Array.isArray(prev) ? prev.map(patcher) : [];
        localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
        return nextHistory;
      });

      setLiveSubscriberCount(nextSubscriberCount);
    };

    // 先更新畫面：按下去後立即看到訂閱數 +1 / 按鈕變「已訂閱」，不等 Firebase。
    applyLocalSubscriptionState(optimisticSubscriberCount);

    try {
      const channelDocId = await findExistingChannelDocId();
      const channelRef = doc(db, 'Channels', channelDocId);
      const nowIso = new Date().toISOString();

      const nextSubscriberCount = await runTransaction(db, async (transaction) => {
        const channelSnap = await transaction.get(channelRef);
        const oldChannelData = channelSnap.exists() ? channelSnap.data() : {};
        const currentSubscriberCount = preserveSubscriberCount(
          oldChannelData.subscriberCount,
          oldChannelData.subscribers,
          oldChannelData.subsCount,
          normalizedChannelInfo.subscriberCount,
          matchedVideo?.subscriberCount,
          currentDisplayCount
        );

        const nextCount = Math.max(0, currentSubscriberCount + subscribeDelta);

        transaction.set(channelRef, {
          name: oldChannelData.name || normalizedChannelInfo.name || cleanChannelName,
          username: oldChannelData.username || normalizedChannelInfo.username || cleanChannelName,
          channelName: oldChannelData.channelName || normalizedChannelInfo.channelName || cleanChannelName,
          avatar: oldChannelData.avatar || normalizedChannelInfo.avatar || GUEST_AVATAR,
          userId: oldChannelData.userId || normalizedChannelInfo.userId || channelDocId,
          subscriberCount: nextCount,
          subscribers: deleteField(),
          subsCount: deleteField(),
          updatedAt: nowIso,
          createdAt: oldChannelData.createdAt || nowIso
        }, { merge: true });

        return nextCount;
      });

      const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));
      const batch = writeBatch(db);
      let batchUpdates = 0;

      videosSnapshot.docs.forEach(videoDoc => {
        const videoData = videoDoc.data() || {};
        const videoDisplayName = getVideoChannelName(videoData);
        const isSameChannel =
          sameText(videoData.userId, channelDocId) ||
          sameText(videoData.userId, normalizedChannelInfo.userId) ||
          sameText(videoDisplayName, cleanChannelName) ||
          sameText(videoData.channel, cleanChannelName) ||
          sameText(videoData.author, cleanChannelName) ||
          sameText(videoData.creatorName, cleanChannelName) ||
          sameText(videoData.username, cleanChannelName);

        if (isSameChannel) {
          batch.set(doc(db, 'Videos', videoDoc.id), {
            subscriberCount: nextSubscriberCount,
            userId: videoData.userId || normalizedChannelInfo.userId || channelDocId
          }, { merge: true });
          batchUpdates++;
        }
      });

      if (batchUpdates > 0) await batch.commit();

      // Firebase 回來後再用正式數字校正一次。
      applyLocalSubscriptionState(nextSubscriberCount, channelDocId);
    } catch (error) {
      console.error('更新訂閱數失敗：', error);
      // 使用者要求訂閱不要跳 Toast，所以這裡只印 console，不再跳成功/失敗通知。
    }
  };


  const isViewingOwnChannel = () => {
    const channelName = String(targetChannel?.name || targetChannel?.username || targetChannel?.channelName || '').trim();
    const channelUserId = String(targetChannel?.userId || targetChannelUserId || '').trim();

    return (
      currentView === 'channel' &&
      (
        (channelUserId && String(channelUserId) === String(currentUserId || '')) ||
        (channelName && String(channelName) === String(localUsername || ''))
      )
    );
  };

  const canManageVideo = (video = {}) => {
    const currentId = String(currentUserId || '').trim();
    const currentName = String(localUsername || '').trim();
    const displayName = String(getVideoDisplayName(video) || '').trim();
    const candidates = [
      video?.userId,
      video?.uid,
      video?.ownerId,
      video?.channelId,
      video?.channel,
      video?.author,
      video?.creatorName,
      video?.username,
      video?.channelName,
      displayName
    ].map(value => String(value || '').trim()).filter(Boolean);

    if (!currentId || currentId === 'loading...') return false;

    return candidates.some(value =>
      value === currentId ||
      (currentName && value === currentName)
    );
  };

  const handleOpenEditVideoTitle = (video, e) => {
    if (e) e.stopPropagation();

    if (!canManageVideo(video)) {
      showToast('只能修改自己頻道的影片', 'error');
      return;
    }

    setOpenVideoOptionsId(null);
    setVideoToEditTitle(video);
    setEditVideoTitleInput(video?.title || '');
    setIsEditVideoTitleModalOpen(true);
  };

  const handleCancelEditVideoTitle = () => {
    if (isUpdatingVideoTitle) return;
    setIsEditVideoTitleModalOpen(false);
    setVideoToEditTitle(null);
    setEditVideoTitleInput('');
  };

  const handleConfirmEditVideoTitle = async (e) => {
    e.preventDefault();

    if (!videoToEditTitle?.id) {
      showToast('找不到影片 ID，無法更新 Firebase', 'error');
      return;
    }

    if (!canManageVideo(videoToEditTitle)) {
      showToast('只能修改自己頻道的影片', 'error');
      handleCancelEditVideoTitle();
      return;
    }

    const cleanTitle = editVideoTitleInput.trim();

    if (!cleanTitle) {
      showToast('請輸入影片標題', 'warning');
      return;
    }

    if (cleanTitle === String(videoToEditTitle.title || '').trim()) {
      showToast('標題沒有變更', 'info');
      return;
    }

    setIsUpdatingVideoTitle(true);

    try {
      const videoId = String(videoToEditTitle.id);
      const nowIso = new Date().toISOString();
      const videoRef = doc(db, 'Videos', videoId);

      // ✅ 真的寫回 Firebase：更新 Videos/{videoId}.title。
      // 使用 updateDoc 是為了避免不小心用錯 id 時建立一筆空白影片文件。
      await updateDoc(videoRef, {
        title: cleanTitle,
        updatedAt: nowIso,
        titleUpdatedAt: nowIso,
        titleUpdatedBy: currentUserId || localUsername || 'unknown'
      });

      const patchTitle = (video) =>
        String(video?.id) === String(videoId)
          ? { ...video, title: cleanTitle, updatedAt: nowIso, titleUpdatedAt: nowIso }
          : video;

      // Firebase listener 之後也會推送新資料；這裡先樂觀更新畫面，避免使用者以為沒反應。
      setRawFirebaseVideos(prev => Array.isArray(prev) ? prev.map(patchTitle) : prev);
      setVideos(prev => Array.isArray(prev) ? prev.map(patchTitle) : prev);

      setWatchHistory(prev => {
        const nextHistory = Array.isArray(prev) ? prev.map(patchTitle) : [];
        localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
        return nextHistory;
      });

      if (selectedVideo && String(selectedVideo.id) === String(videoId)) {
        setSelectedVideo(prev => prev ? { ...prev, title: cleanTitle, updatedAt: nowIso, titleUpdatedAt: nowIso } : prev);
      }

      setIsEditVideoTitleModalOpen(false);
      setVideoToEditTitle(null);
      setEditVideoTitleInput('');
      setOpenVideoOptionsId(null);

      showToast('影片標題已更新到 Firebase', 'success');
    } catch (error) {
      console.error('修改影片標題失敗：', error);

      if (error?.code === 'not-found') {
        showToast('Firebase 找不到這支影片文件，請確認影片是從 Firebase 上傳的', 'error');
      } else if (error?.code === 'permission-denied') {
        showToast('Firebase 權限不足，請檢查 Firestore Rules 是否允許修改自己的影片', 'error');
      } else {
        showToast('修改影片標題失敗，請稍後再試', 'error');
      }
    } finally {
      setIsUpdatingVideoTitle(false);
    }
  };

  const handleOpenDeleteVideoConfirm = (video, e) => {
    if (e) e.stopPropagation();

    if (!canManageVideo(video)) {
      showToast('只能刪除自己頻道的影片', 'error');
      return;
    }

    setOpenVideoOptionsId(null);
    setVideoToDelete(video);
    setIsDeleteVideoModalOpen(true);
  };

  const handleCancelDeleteVideo = () => {
    if (isDeletingVideo) return;
    setIsDeleteVideoModalOpen(false);
    setVideoToDelete(null);
  };

  const handleConfirmDeleteVideo = async () => {
    if (!videoToDelete?.id) return;

    if (!canManageVideo(videoToDelete)) {
      showToast('只能刪除自己頻道的影片', 'error');
      handleCancelDeleteVideo();
      return;
    }

    setIsDeletingVideo(true);

    try {
      const videoId = videoToDelete.id;
      const isMockVideo = Array.isArray(MOCK_VIDEOS) && MOCK_VIDEOS.some(video => String(video.id) === String(videoId));

      if (!isMockVideo) {
        await deleteDoc(doc(db, 'Videos', videoId));
      }

      setRawFirebaseVideos(prev =>
        Array.isArray(prev) ? prev.filter(video => String(video.id) !== String(videoId)) : prev
      );

      setVideos(prev =>
        Array.isArray(prev) ? prev.filter(video => String(video.id) !== String(videoId)) : prev
      );

      setWatchHistory(prev => {
        const nextHistory = Array.isArray(prev) ? prev.filter(video => String(video.id) !== String(videoId)) : [];
        localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
        return nextHistory;
      });

      setLikedVideoIds(prev => {
        const nextLikes = Array.isArray(prev) ? prev.filter(id => String(id) !== String(videoId)) : [];
        localStorage.setItem('leafhub_likedVideos', JSON.stringify(nextLikes));
        return nextLikes;
      });

      if (selectedVideo && String(selectedVideo.id) === String(videoId)) {
        setSelectedVideo(null);
      }

      setIsDeleteVideoModalOpen(false);
      setVideoToDelete(null);
      showToast(isMockVideo ? '測試影片已從本機列表移除' : '影片已刪除', 'success');
    } catch (error) {
      console.error('刪除影片失敗：', error);
      showToast('刪除影片失敗，請確認 Firebase 權限或稍後再試', 'error');
    } finally {
      setIsDeletingVideo(false);
    }
  };

  /* ------------------------------
    15. Comment Like Logic / 留言按讚
    注意：下方 mock 分支目前呼叫 setMockCommentsState，
    若專案沒有宣告此 state，點 mock 留言讚會發生 ReferenceError。
  ------------------------------ */
  // 🟢 修正後的防重複點讚邏輯
  
const canManageComment = (comment = {}) => {
    const currentId = String(currentUserId || '').trim();
    const currentName = String(localUsername || '').trim();
    const commentUserId = String(comment?.userId || comment?.uid || comment?.authorId || '').trim();
    const commentAuthor = String(comment?.author || comment?.username || comment?.channelName || '').trim();
    const ownComment =
      (commentUserId && currentId && currentId !== 'loading...' && commentUserId === currentId) ||
      (commentAuthor && currentName && commentAuthor === currentName);
    const ownVideo = canManageVideo(selectedVideo || {});
    return ownComment || ownVideo;
  };

  const handleDeleteComment = async (comment, e = null) => {
    if (e) e.stopPropagation();
    if (!comment?.id || comment?.isPending) return;
    if (!canManageComment(comment)) {
      showToast('你沒有權限刪除這則留言', 'warning');
      return;
    }

    try {
      const repliesSnapshot = await getDocs(query(collection(db, 'replies'), where('commentId', '==', comment.id)));
      const batch = writeBatch(db);
      repliesSnapshot.docs.forEach(replyDoc => batch.delete(replyDoc.ref));
      batch.delete(doc(db, 'comments', comment.id));
      await batch.commit();
      setComments(prev => prev.filter(item => item.id !== comment.id));
      showToast('留言已刪除', 'success');
    } catch (error) {
      console.error('刪除留言失敗:', error);
      showToast('刪除留言失敗，請稍後再試', 'error');
    }
  };

  const handleTogglePinComment = async (comment, e = null) => {
    if (e) e.stopPropagation();
    if (!comment?.id || comment?.isPending) return;
    if (!canManageVideo(selectedVideo || {})) {
      showToast('只有影片擁有者可以置頂留言', 'warning');
      return;
    }

    try {
      const shouldPin = !comment.pinned;
      const batch = writeBatch(db);

      if (shouldPin && selectedVideo?.id) {
        const commentsSnapshot = await getDocs(query(collection(db, 'comments'), where('videoId', '==', selectedVideo.id)));
        commentsSnapshot.docs.forEach(commentDoc => {
          batch.update(commentDoc.ref, { pinned: false });
        });
      }

      batch.update(doc(db, 'comments', comment.id), {
        pinned: shouldPin,
        pinnedAt: shouldPin ? new Date().toISOString() : deleteField(),
        pinnedBy: shouldPin ? currentUserId : deleteField()
      });
      await batch.commit();
      setComments(prev => prev.map(item => item.id === comment.id ? { ...item, pinned: shouldPin } : (shouldPin ? { ...item, pinned: false } : item)));
      showToast(shouldPin ? '留言已置頂' : '已取消置頂', 'success');
    } catch (error) {
      console.error('置頂留言失敗:', error);
      showToast('置頂留言失敗，請稍後再試', 'error');
    }
  };

  const handleCommentLike = async (commentId, isMock) => {
    // 如果沒有目前使用者的 ID，就不允許按讚
    if (!currentUserId) return;

    if (isMock) {
      // 處理 Mock 靜態資料的點讚 (本機狀態優化)
      setMockCommentsState(prev => prev.map(c => {
        if (c.id === commentId) {
          // 初始化防重複陣列
          const likedBy = c.likedBy || [];
          const hasLiked = likedBy.includes(currentUserId);
          
          return {
            ...c,
            likes: hasLiked ? Math.max(0, (c.likes || 0) - 1) : (c.likes || 0) + 1,
            likedBy: hasLiked 
              ? likedBy.filter(id => id !== currentUserId) 
              : [...likedBy, currentUserId]
          };
        }
        return c;
      }));
    } else {
      // 處理 ☁️ Firebase 真實雲端留言點讚
      try {
        const commentRef = doc(db, 'comments', commentId);
        
        // 為了知道有沒有點過，我們需要先抓取目前該留言的最新狀態
        const commentSnap = await getDocs(query(collection(db, 'comments')));
        // 尋找特定的 doc
        const targetDoc = commentSnap.docs.find(d => d.id === commentId);
        
        if (targetDoc && targetDoc.exists()) {
          const data = targetDoc.data();
          const likedBy = data.likedBy || [];
          const hasLiked = likedBy.includes(currentUserId);

          if (hasLiked) {
            // 點過了 ➡️ 取消按讚
            await updateDoc(commentRef, {
              likes: increment(-1),
              likedBy: likedBy.filter(id => id !== currentUserId)
            });
          } else {
            // 沒點過 ➡️ 新增按讚
            await updateDoc(commentRef, {
              likes: increment(1),
              likedBy: [...likedBy, currentUserId]
            });
          }
        }
      } catch (err) {
        console.error("更新留言按讚失敗:", err);
      }
    }
  };

  const handleAddReplySubmit = async (e, commentId) => {
    e.preventDefault();
    const replyText = replyInputs[commentId]?.trim();
    if (!replyText) return;

    const isMockComment = commentId.startsWith('temp-') || commentId.length < 10;
    const tempReplyId = `temp-reply-${Date.now()}`;

    const temporaryLocalReply = {
      id: tempReplyId,
      commentId: commentId,
      author: localUsername,
      avatar: unifiedAvatar, 
      text: replyText,
      isPending: !isMockComment, 
      createdAt: new Date().toISOString()
    };

    setOptimisticReplies(prev => [...prev, temporaryLocalReply]);
    setReplyInputs(prev => ({ ...prev, [commentId]: '' }));
    setExpandedReplyComments(prev => ({ ...prev, [commentId]: true }));

    if (isMockComment) return;

    try {
      await addDoc(collection(db, 'replies'), {
        commentId: commentId,
        author: localUsername,
        avatar: unifiedAvatar, 
        text: replyText,
        createdAt: new Date().toISOString()
      });

      const commentRef = doc(db, 'comments', commentId);
      await updateDoc(commentRef, { replyCount: increment(1) });
    } catch (error) {
      console.error("發布回覆失敗:", error);
      setOptimisticReplies(prev => prev.filter(item => item.id !== tempReplyId));
      showToast("回覆雲端儲存失敗！", "error");
    }
  };

  const handleAddComment = async (e) => {
      e.preventDefault();

      const textToSend = newCommentInput.trim();
      if (!textToSend || !selectedVideo?.id) return;

      const tempId = `temp-${Date.now()}`;

      setOptimisticComments(prev => [
        {
          id: tempId,
          videoId: selectedVideo.id,
          author: localUsername,
          avatar: unifiedAvatar,
          text: textToSend,
          likes: 0,
          replyCount: 0,
          isPending: true,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);

      setNewCommentInput('');

      try {
        await addDoc(collection(db, 'comments'), {
          videoId: selectedVideo.id,
          author: localUsername,
          avatar: unifiedAvatar,
          text: textToSend,
          likes: 0,
          replyCount: 0,
          createdAt: new Date().toISOString()
        });

        // Firebase 成功後移除暫存
        setOptimisticComments(prev =>
          prev.filter(item => item.id !== tempId)
        );
      } catch (error) {
        console.error("發布評論到 Firebase 失敗：", error);

        setOptimisticComments(prev =>
          prev.filter(item => item.id !== tempId)
        );

        showToast("留言發布失敗，請檢查網路連線！", "error");
      }
    };

  
  /* ------------------------------
    16. Maintenance Helpers / 維護用同步工具
    注意：這些函式目前看起來未直接被 UI 呼叫，保留作維修使用。
  ------------------------------ */
  const syncAvatarToFirebase = async (newAvatar) => {
      if (!currentUserId) return;

      // comments
      const commentsSnapshot = await getDocs(collection(db, 'comments'));

      for (const docSnap of commentsSnapshot.docs) {
        const data = docSnap.data();

        if (
          data.userId === currentUserId ||
          data.author === localUsername
        ) {
          await setDoc(
            doc(db, 'comments', docSnap.id),
            {
              ...data,
              avatar: newAvatar
            },
            { merge: true }
          );
        }
      }

      // replies
      const repliesSnapshot = await getDocs(collection(db, 'replies'));

      for (const docSnap of repliesSnapshot.docs) {
        const data = docSnap.data();

        if (
          data.userId === currentUserId ||
          data.author === localUsername
        ) {
          await setDoc(
            doc(db, 'replies', docSnap.id),
            {
              ...data,
              avatar: newAvatar
            },
            { merge: true }
          );
        }
      }
      // videos
      const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));

      for (const docSnap of videosSnapshot.docs) {
        const data = docSnap.data();

        if (String(data.channel ?? '') !== String(localUsername)) {
          continue;
        }

        if (
          data.avatar === newAvatar &&
          data.creatorAvatar === newAvatar &&
          data.userId === currentUserId
        ) {
          continue;
        }

        await setDoc(
          doc(db, 'Videos', docSnap.id),
          {
            ...data,
            userId: currentUserId,
            avatar: newAvatar,
            creatorAvatar: newAvatar
          },
          { merge: true }
        );
      }
    };

  const repairMyVideos = async ({
    channelName = localUsername,
    avatarUrl = currentUserAvatar
  } = {}) => {
    console.log("channelName =", channelName);

    console.log("currentUserId =", currentUserId);
    try {
      if (!channelName) return;

      const snapshot = await getDocs(
        collection(db, 'Videos')
      );

      let updateCount = 0;

      for (const videoDoc of snapshot.docs) {
        const data = videoDoc.data();

        console.log(
          "影片ID:",
          videoDoc.id,
          "影片channel:",
          data.channel,
          "目前channel:",
          channelName
        );

        const videoChannel = String(
          data.channel ?? ''
        ).trim();

        const currentChannel = String(
          channelName ?? ''
        ).trim();

        if (videoChannel !== currentChannel) {
          continue;
        }

        const updates = {
          avatar: avatarUrl,
          creatorAvatar: avatarUrl
        };

        if (!data.userId) {
          updates.userId = currentUserId;
        }

        await updateDoc(
          doc(db, 'Videos', videoDoc.id),
          updates
        );

        updateCount++;
      }

      console.log(
        `repairMyVideos 完成，共更新 ${updateCount} 部影片`
      );
    } catch (err) {
      console.error(
        'repairMyVideos 失敗:',
        err
      );
    }
  };


  /* ------------------------------
    17. Upload Helpers / 上傳影片
  ------------------------------ */
  const parseYoutubeApiDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatYouTubeDuration = (isoDuration = 'PT0S') => {
    const match = String(isoDuration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '00:00';

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const isYoutubeRegionBlocked = (contentDetails, regionCode = 'TW') => {
    const regionRestriction = contentDetails?.regionRestriction;
    if (!regionRestriction) return false;

    if (Array.isArray(regionRestriction.blocked)) {
      return regionRestriction.blocked.includes(regionCode);
    }

    if (Array.isArray(regionRestriction.allowed)) {
      return !regionRestriction.allowed.includes(regionCode);
    }

    return false;
  };

  const isYoutubeVideoUnavailable = (info) => {
    if (!info) return true;
    return info.playable === false;
  };

  const fetchYoutubeVideoInfo = async (ytId) => {
    if (!YOUTUBE_API_KEY) {
      throw new Error('尚未設定 VITE_YOUTUBE_API_KEY，請在專案根目錄建立 .env.local');
    }

    const url = new URL(YOUTUBE_VIDEOS_API_URL);
    url.searchParams.set('part', 'contentDetails,status,snippet');
    url.searchParams.set('id', ytId);
    url.searchParams.set('key', YOUTUBE_API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMessage = data?.error?.message || data?.reason || 'YouTube API 回應失敗';
      throw new Error(apiMessage);
    }

    const item = data.items?.[0];

    if (!item) {
      return {
        ok: true,
        playable: false,
        reason: 'not_found_or_private_or_deleted',
        videoId: ytId
      };
    }

    const privacyStatus = item.status?.privacyStatus;
    const embeddable = item.status?.embeddable;
    const regionBlocked = isYoutubeRegionBlocked(item.contentDetails, 'TW');
    const durationIso = item.contentDetails?.duration || 'PT0S';

    const playable =
      privacyStatus === 'public' &&
      embeddable !== false &&
      regionBlocked === false;

    return {
      ok: true,
      playable,
      reason: playable ? 'ok' : 'not_playable',
      videoId: ytId,
      title: item.snippet?.title || '',
      duration: formatYouTubeDuration(durationIso),
      durationIso,
      privacyStatus,
      embeddable,
      regionBlocked
    };
  };

  const deleteUnavailableYoutubeVideo = async (video, reason = 'youtube_unavailable') => {
    if (!video?.id || !video?.youtubeId) return;

    try {
      await deleteDoc(doc(db, 'Videos', video.id));

      setRawFirebaseVideos(prev =>
        Array.isArray(prev) ? prev.filter(item => item.id !== video.id) : prev
      );

      setVideos(prev =>
        Array.isArray(prev) ? prev.filter(item => item.id !== video.id) : prev
      );

      if (selectedVideo?.id === video.id) {
        setSelectedVideo(null);
        setCurrentView('home');
      }

      console.log(`已刪除不可觀看的 YouTube 影片：${video.youtubeId}，原因：${reason}`);
    } catch (error) {
      console.error('刪除不可觀看影片失敗：', error);
    }
  };

  const cleanupUnavailableYoutubeVideosFromClient = async (videoList = [], forceCheck = false) => {
    if (youtubeCleanupRunningRef.current || !YOUTUBE_API_KEY) return;

    const candidates = (Array.isArray(videoList) ? videoList : [])
      .filter(video => video?.youtubeId && video?.id)
      .filter(video => {
        if (forceCheck) return true;
        const lastCheckedAt = parseYoutubeApiDate(video.youtubeCheckedAt);
        if (!lastCheckedAt) return true;
        return Date.now() - lastCheckedAt.getTime() > YOUTUBE_STATUS_CHECK_COOLDOWN_MS;
      });

    if (candidates.length === 0) return;

    youtubeCleanupRunningRef.current = true;

    try {
      console.log(`YouTube 影片檢查開始，共 ${candidates.length} 支`);

      for (const video of candidates) {
        try {
          const info = await fetchYoutubeVideoInfo(video.youtubeId);

          if (isYoutubeVideoUnavailable(info)) {
            await deleteUnavailableYoutubeVideo(video, info.reason || 'youtube_unavailable');
            continue;
          }

          await updateDoc(doc(db, 'Videos', video.id), {
            isYoutubePlayable: true,
            youtubeCheckedAt: new Date(),
            youtubePrivacyStatus: info.privacyStatus || null,
            youtubeEmbeddable: info.embeddable ?? null,
            youtubeRegionBlocked: info.regionBlocked ?? false,
            duration: info.duration || video.duration || '00:00',
            durationIso: info.durationIso || video.durationIso || null,
            unavailableReason: null
          });
        } catch (error) {
          console.warn(`檢查 YouTube 影片失敗：${video.youtubeId}`, error);

          const message = String(error?.message || '');
          const shouldStopThisRound =
            message.includes('referer') ||
            message.includes('blocked') ||
            message.includes('403') ||
            message.includes('Forbidden');

          if (shouldStopThisRound) {
            console.warn('YouTube API Key 被網站限制擋住，已停止本輪檢查。請先修正 Google Cloud 網站限制。');
            break;
          }
        }
      }
    } finally {
      youtubeCleanupRunningRef.current = false;
    }
  };

  const handleUploadVideo = async (e) => {
    e.preventDefault();
    const ytId = extractYoutubeId(newVideoUrl);
    
    if (!auth.currentUser) {
      showToast('帳號尚未準備完成，請稍後再試', 'warning');
      return;
    }

    if (!ytId) {
      showToast('請輸入完整資訊，並確認是有效的 YouTube 網址！', 'error');
      return;
    }

    setIsAnalyzing(true);

    try {
      const duplicateVideoSnapshot = await getDocs(query(
        collection(db, 'Videos'),
        where('youtubeId', '==', ytId),
        limit(1)
      ));

      if (!duplicateVideoSnapshot.empty) {
        showToast('這支 YouTube 影片已經上傳過了', 'warning');
        setIsAnalyzing(false);
        return;
      }
    } catch (duplicateCheckError) {
      console.error('檢查重複 YouTube 影片失敗：', duplicateCheckError);
      showToast('暫時無法檢查是否重複上傳，請稍後再試', 'error');
      setIsAnalyzing(false);
      return;
    }

    try {
      const ytInfo = await fetchYoutubeVideoInfo(ytId);

      if (isYoutubeVideoUnavailable(ytInfo)) {
        showToast('這支 YouTube 影片目前不可觀看、已下架、私人、不可嵌入或所在地區不可播放。', 'error');
        return;
      }

      const dataToUpload = {
        title: newVideoTitle.trim() || ytInfo.title || '未命名影片',
        channel: localUsername,
        creatorName: localUsername,
        username: localUsername,
        channelName: localUsername,
        author: localUsername,
        userId: currentUserId,
        views: 0,
        likeCount: 0,
        commentCount: 0,
        time: '剛剛',
        duration: ytInfo.duration || '00:00',
        durationIso: ytInfo.durationIso || null,
        avatar: unifiedAvatar,
        creatorAvatar: unifiedAvatar,
        channelAvatar: unifiedAvatar,
        subscriberCount: liveSubscriberCount,
        videoUrl: newVideoUrl,
        youtubeId: ytId,
        source: 'youtube',
        category: newVideoCategory,
        thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
        isYoutubePlayable: true,
        youtubeCheckedAt: new Date(),
        youtubePrivacyStatus: ytInfo.privacyStatus || null,
        youtubeEmbeddable: ytInfo.embeddable ?? null,
        youtubeRegionBlocked: ytInfo.regionBlocked ?? false,
        unavailableReason: null
      };

      await uploadVideoToFirebase(dataToUpload);

      // 計數欄位直接存 Channels 文件，避免每次進頻道都重新掃 Videos 算影片數。
      if (currentUserId) {
        await setDoc(doc(db, 'Channels', currentUserId), {
          userId: currentUserId,
          name: localUsername,
          username: localUsername,
          channelName: localUsername,
          avatar: unifiedAvatar,
          videoCount: increment(1),
          latestVideoAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 上傳成功後先回首頁並顯示 buffer；等 Firebase snapshot 真的抓到新影片後才顯示列表。
      setIsPageLoading(true);
      setNewVideoTitle('');
      setNewVideoUrl('');
      setNewVideoCategory('未分類');
      setIsUploadModalOpen(false);
      setSearchInputStr('');
      setSearchQuery('');
      setActiveCategory('全部');
      setCurrentView('home');

      setJustUploadedVideo({
        ...dataToUpload,
        uploadedLocalAt: Date.now()
      });

      showToast('上傳成功！', 'success');
    } catch (error) {
      console.error('上傳失敗：', error);
      showToast(error.message || '上傳失敗，請稍後再試！', 'error');
    } finally {
      setIsAnalyzing(false);
    }
    
    if (auth.currentUser?.isAnonymous) {
      setIsSetPasswordModalOpen(true);
    }

  };

  const handleSetPasswordAfterUpload = async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      showToast('找不到目前帳號，請重新整理頁面', 'error');
      return;
    }

    const cleanNewId = passwordUserId.trim();

    if (!cleanNewId) {
      showToast('請輸入使用者 ID', 'warning');
      return;
    }

    if (cleanNewId.includes('/')) {
      showToast('ID 不能包含 / 符號', 'error');
      return;
    }

    if (/\s/.test(cleanNewId)) {
      showToast('ID 不能包含空白', 'error');
      return;
    }

    if (passwordInput.length < 6) {
      showToast('密碼至少需要 6 個字', 'warning');
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      showToast('兩次輸入的密碼不一樣', 'error');
      return;
    }

    try {
      const oldId = currentUserId;
      const oldName = localUsername;
      const nowIso = new Date().toISOString();
      const normalizeText = (value) => String(value ?? '').trim().toLowerCase();
      const newIdNormalized = normalizeText(cleanNewId);
      const oldIdNormalized = normalizeText(oldId);
      const passwordHash = await hashPasswordText(passwordInput);

      // 檢查這個 ID 是否已被其他帳號使用。
      const channelsSnapshot = await getDocs(collection(db, 'Channels'));
      const duplicatedChannel = channelsSnapshot.docs.find((channelDoc) => {
        const data = channelDoc.data() || {};
        const channelDocId = normalizeText(channelDoc.id);
        const channelUserId = normalizeText(data.userId);
        const channelCanonicalId = normalizeText(data.canonicalChannelId);
        const isCurrentAccountChannel =
          channelDocId === oldIdNormalized ||
          channelUserId === oldIdNormalized ||
          channelCanonicalId === oldIdNormalized;

        if (isCurrentAccountChannel) return false;

        return (
          channelDocId === newIdNormalized ||
          channelUserId === newIdNormalized ||
          channelCanonicalId === newIdNormalized
        );
      });

      if (duplicatedChannel) {
        showToast('這個使用者 ID 已經被使用了，請換一個', 'error');
        return;
      }

      // 找目前暫時帳號對應的 Channels 文件，盡量保留舊資料、頭貼、訂閱數。
      let currentChannelRef = doc(db, 'Channels', oldId);
      let currentChannelSnap = await getDoc(currentChannelRef);

      if (!currentChannelSnap.exists() && oldName) {
        const candidateSnapshots = [];
        const nameFields = ['name', 'username', 'channelName'];

        for (const fieldName of nameFields) {
          const nameQuery = query(collection(db, 'Channels'), where(fieldName, '==', oldName));
          const nameSnapshot = await getDocs(nameQuery);
          candidateSnapshots.push(...nameSnapshot.docs);
        }

        if (candidateSnapshots.length > 0) {
          const uniqueCandidates = Array.from(new Map(candidateSnapshots.map(channelDoc => [channelDoc.id, channelDoc])).values());
          const bestCandidate = uniqueCandidates.sort((a, b) => {
            const aData = a.data() || {};
            const bData = b.data() || {};
            return preserveSubscriberCount(bData.subscriberCount, bData.subscribers, bData.subsCount) - preserveSubscriberCount(aData.subscriberCount, aData.subscribers, aData.subsCount);
          })[0];

          currentChannelRef = doc(db, 'Channels', bestCandidate.id);
          currentChannelSnap = await getDoc(currentChannelRef);
        }
      }

      const oldChannelData = currentChannelSnap.exists() ? currentChannelSnap.data() : {};
      const subscriberCount = preserveSubscriberCount(
        oldChannelData.subscriberCount,
        oldChannelData.subscribers,
        oldChannelData.subsCount,
        targetChannel?.subscriberCount,
        liveSubscriberCount
      );

      const {
        userId: _removedUserId,
        canonicalChannelId: _removedCanonicalChannelId,
        subscribers: _removedSubscribers,
        subsCount: _removedSubsCount,
        password: _removedLegacyPassword,
        loginPassword: _removedLegacyLoginPassword,
        ...channelBaseData
      } = oldChannelData;

      const newChannelData = {
        ...channelBaseData,
        userId: cleanNewId,
        name: oldChannelData.name || localUsername,
        username: oldChannelData.username || localUsername,
        channelName: oldChannelData.channelName || localUsername,
        avatar: oldChannelData.avatar || unifiedAvatar,
        subscriberCount,
        passwordHash,
        hasPassword: true,
        passwordLoginEnabled: true,
        accountType: 'id-password',
        passwordUpdatedAt: nowIso,
        updatedAt: nowIso,
        createdAt: oldChannelData.createdAt || nowIso
      };

      const newChannelRef = doc(db, 'Channels', cleanNewId);
      await setDoc(newChannelRef, newChannelData, { merge: true });
      await setDoc(newChannelRef, {
        subscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: nowIso
      }, { merge: true });

      if (currentChannelSnap.exists() && currentChannelRef.id !== cleanNewId) {
        await deleteDoc(currentChannelRef);
      }

      // 把原本暫時 ID 的影片 ownership 改成新的使用者 ID，避免之後無法管理影片。
      const videosSnapshot = await getDocs(query(collection(db, 'Videos'), where('userId', '==', currentUserId || ''), limit(200)));
      const batch = writeBatch(db);
      let videoPatchCount = 0;

      videosSnapshot.docs.forEach((videoDoc) => {
        const videoData = videoDoc.data() || {};
        const isOwnVideo =
          String(videoData.userId || '') === String(oldId || '') ||
          String(videoData.channel || '') === String(localUsername || '') ||
          String(videoData.author || '') === String(localUsername || '') ||
          String(videoData.creatorName || '') === String(localUsername || '') ||
          String(videoData.username || '') === String(localUsername || '');

        if (isOwnVideo) {
          batch.set(doc(db, 'Videos', videoDoc.id), {
            userId: cleanNewId,
            avatar: unifiedAvatar,
            creatorAvatar: unifiedAvatar,
            channelAvatar: unifiedAvatar,
            subscriberCount,
            updatedAt: nowIso
          }, { merge: true });
          videoPatchCount++;
        }
      });

      if (videoPatchCount > 0) {
        await batch.commit();
      }

      const patchOwnedVideo = (video) => {
        const isOwnVideo =
          String(video?.userId || '') === String(oldId || '') ||
          String(video?.channel || '') === String(localUsername || '') ||
          String(video?.author || '') === String(localUsername || '') ||
          String(video?.creatorName || '') === String(localUsername || '') ||
          String(video?.username || '') === String(localUsername || '');

        return isOwnVideo
          ? { ...video, userId: cleanNewId, avatar: unifiedAvatar, creatorAvatar: unifiedAvatar, channelAvatar: unifiedAvatar, subscriberCount }
          : video;
      };

      setCurrentUserId(cleanNewId);
      setTargetChannel(prev => prev ? { ...prev, userId: cleanNewId, subscriberCount } : prev);
      setTargetChannelUserId(cleanNewId);
      setLiveSubscriberCount(subscriberCount);
      setRawFirebaseVideos(prev => Array.isArray(prev) ? prev.map(patchOwnedVideo) : prev);
      setVideos(prev => Array.isArray(prev) ? prev.map(patchOwnedVideo) : prev);
      setWatchHistory(prev => {
        const nextHistory = Array.isArray(prev) ? prev.map(patchOwnedVideo) : [];
        localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
        return nextHistory;
      });

      setAuthUser(auth.currentUser);
      localStorage.setItem('device_user_id', cleanNewId);
      localStorage.setItem('leafhub_is_id_logged_in', 'true');
      localStorage.setItem(`leafhub_password_${cleanNewId}`, passwordInput);
      if (oldId && oldId !== cleanNewId) {
        localStorage.removeItem(`leafhub_password_${oldId}`);
      }

      setIsSetPasswordModalOpen(false);
      setPasswordUserId('');
      setPasswordInput('');
      setConfirmPasswordInput('');

      showToast('使用者 ID 和密碼設定成功！下次可以用 ID 登入', 'success');
    } catch (error) {
      console.error('設定使用者 ID / 密碼失敗:', error);
      showToast('設定使用者 ID / 密碼失敗，請確認 Firebase 權限或稍後再試', 'error');
    }
  };
  /* ------------------------------
    18. Render Helpers / 篩選、頭貼、影片卡片
  ------------------------------ */
  const isVideoVisible = (video = {}) => {
    const hiddenCandidates = [video?.id, video?.youtubeId, getYoutubeIdFromVideo(video), video?.videoUrl]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const blockedIds = Array.isArray(notInterestedVideoIds) ? notInterestedVideoIds : [];
    return video.deletedFromPublicList !== true &&
      video.isYoutubePlayable !== false &&
      !hiddenCandidates.some(value => blockedIds.includes(value));
  };

  const searchSourceVideos = searchQuery.trim()
    ? mergeUniqueVideosById(videos, searchFirebaseVideos)
    : videos;

  const advancedFilteredVideos = useAdvancedSearch({
    videos: searchSourceVideos,
    searchQuery,
    activeCategory,
    isVideoVisible
  });

  const filteredVideos = (() => {
    const cleanQuery = searchQuery.trim().toLowerCase();
    if (!cleanQuery) return advancedFilteredVideos;

    const existingIds = new Set(advancedFilteredVideos.map(video => video.id));
    const channelMatchedVideos = (Array.isArray(searchSourceVideos) ? searchSourceVideos : [])
      .filter(video => isVideoVisible(video))
      .filter(video => activeCategory === '全部' || video.category === activeCategory)
      .filter(video => String(video?.channel || video?.author || video?.creatorName || video?.username || '').toLowerCase().includes(cleanQuery))
      .filter(video => {
        if (!video?.id) return true;
        if (existingIds.has(video.id)) return false;
        existingIds.add(video.id);
        return true;
      });

    return [...advancedFilteredVideos, ...channelMatchedVideos];
  })();

  const isSameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

  const getChannelBioValue = (channel = {}) => {
    return String(
      channel?.bio ??
      channel?.BIO ??
      channel?.channelBio ??
      channel?.description ??
      channel?.about ??
      ''
    ).trim();
  };

  const getVideoDisplayName = (video = {}) => {
    return video.channel || video.author || video.creatorName || video.username || localUsername || '小葉';
  };

  const getVideoAvatarSrc = (video = {}) => {
    const displayName = getVideoDisplayName(video);
    const isOwnVideo =
      isSameText(video.userId, currentUserId) ||
      isSameText(displayName, localUsername);

    const isShiauyeVideo =
      isSameText(video.author, '小葉') ||
      isSameText(video.channel, '小葉') ||
      isSameText(video.creatorName, '小葉') ||
      isSameText(video.username, '小葉');

    if (isShiauyeVideo) return avatarImage;
    if (isOwnVideo) return unifiedAvatar;
    return video.avatar || video.creatorAvatar || GUEST_AVATAR;
  };


  const matchedSearchChannels = (() => {
    const cleanQuery = searchQuery.trim().toLowerCase();
    if (!cleanQuery) return [];

    const channelMap = new Map();
    (Array.isArray(searchSourceVideos) ? searchSourceVideos : [])
      .filter(isVideoVisible)
      .forEach(video => {
        const channelName = getVideoDisplayName(video);
        if (!String(channelName).toLowerCase().includes(cleanQuery)) return;

        const key = String(video.userId || channelName).trim();
        if (!key) return;

        const current = channelMap.get(key) || {
          name: channelName,
          userId: video.userId || '',
          avatar: getVideoAvatarSrc(video),
          subscriberCount: preserveSubscriberCount(video.channelSubscriberCount, video.subscriberCount, video.subscribers, video.subsCount),
          videoCount: Number(video.channelVideoCount ?? video.videoCount ?? 0) || 0
        };

        channelMap.set(key, current);
      });

    return Array.from(channelMap.values()).slice(0, 5);
  })();

  const sortedSearchVideos = (() => {
    if (!searchQuery.trim()) return filteredVideos;
    if (searchSortType === 'latest') return sortVideos(filteredVideos, 'latest');
    if (searchSortType === 'views') return sortVideos(filteredVideos, 'views');
    return filteredVideos;
  })();

  const visibleSearchVideos = searchResultType === 'channels' ? [] : sortedSearchVideos;
  const visibleSearchChannels = searchResultType === 'videos' ? [] : matchedSearchChannels;
  const shouldShowSearchSkeleton = Boolean(searchQuery.trim()) && !hasLoadedAllSearchVideos && (isSearchFirebaseLoading || isSearchResultsBuffering);
  const searchVideoSkeletonItems = Array.from({ length: 6 });

  
const renderVideoQuickMenu = (video = {}, placement = 'inline') => {
    const menuKey = getVideoMenuKey(video);
    const isOpen = openVideoOptionsId === menuKey;
    const isOwner = canManageVideo(video);
    const isChannelPage = currentView === 'channel';

    // 頻道頁只保留「修改標題 / 刪除影片」管理選單；不顯示稍後觀看、不感興趣、分享、複製連結。
    if (isChannelPage && !isOwner) return null;

    const rootStyle = placement === 'search'
      ? { position: 'absolute', right: '10px', top: '10px', zIndex: 20 }
      : { position: 'relative', flexShrink: 0, zIndex: 20 };

    const menuItemStyle = {
      width: '100%',
      border: 'none',
      background: 'transparent',
      color: '#f5f5f5',
      padding: '10px 12px',
      borderRadius: '8px',
      textAlign: 'left',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: '14px',
      whiteSpace: 'nowrap'
    };

    return (
      <div
        data-video-options-root="true"
        style={rootStyle}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="影片選項"
          title="影片選項"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenVideoOptionsId(prev => prev === menuKey ? null : menuKey);
          }}
          style={{
            width: '28px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: placement === 'search' ? '#fff' : '#aaa',
            fontSize: '20px',
            lineHeight: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            textShadow: placement === 'search' ? '0 1px 3px rgba(0,0,0,0.85)' : 'none'
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
          </span>
        </button>

        {isOpen && (
          <div
            className="video-options-menu"
            style={{
              position: 'absolute',
              right: 0,
              top: '32px',
              minWidth: isChannelPage ? '152px' : '184px',
              background: '#1b1b1b',
              border: '1px solid #333',
              borderRadius: '12px',
              boxShadow: '0 14px 32px rgba(0,0,0,0.55)',
              padding: '6px',
              zIndex: 10000
            }}
          >
            {!isChannelPage && (
              <>
                <button type="button" onClick={(e) => handleAddToWatchLater(video, e)} style={menuItemStyle}>⏱️ 稍後觀看</button>
                <button type="button" onClick={(e) => handleNotInterestedVideo(video, e)} style={menuItemStyle}>🚫 不感興趣</button>
                <button type="button" onClick={(e) => handleShareVideoFromMenu(video, e)} style={menuItemStyle}>↗️ 分享</button>
                <button type="button" onClick={(e) => handleCopyVideoLinkFromMenu(video, e)} style={menuItemStyle}>🔗 複製連結</button>
              </>
            )}
            {isOwner && (
              <>
                {!isChannelPage && <div style={{ height: '1px', background: '#333', margin: '6px 4px' }}></div>}
                <button type="button" onClick={(e) => handleOpenEditVideoTitle(video, e)} style={menuItemStyle}>✏️ 修改標題</button>
                <button type="button" onClick={(e) => handleOpenDeleteVideoConfirm(video, e)} style={{ ...menuItemStyle, color: '#ff6b6b' }}>🗑️ 刪除影片</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderVideoCard = (video) => {
    const displayName = getVideoDisplayName(video);
    const avatarSrc = getVideoAvatarSrc(video);

    return (
      <div
        key={video.id}
        className="video-card"
        onClick={() => handleVideoClick(video)}
        style={{
          position: 'relative',
          overflow: 'visible',
          zIndex: openVideoOptionsId === getVideoMenuKey(video) ? 80 : 1
        }}
      >
        <div className="thumbnail-wrapper">
          <img
            src={video.thumbnail || '/default-thumbnail.jpg'}
            alt={video.title}
            className="thumbnail-img"
            onError={(e) => {
              e.currentTarget.src = '/default-thumbnail.jpg';
            }}
          />
          <span className="video-duration">{video.duration}</span>
        </div>
        <div
          className="video-info-section"
          style={{
            alignItems: 'flex-start',
            gap: '12px',
            marginTop: '8px',
            paddingTop: 0,
            overflow: 'visible'
          }}
        >
          <img
            src={avatarSrc}
            alt={displayName}
            className="channel-avatar channel-avatar-clickable"
            onClick={(e) => handleChannelNavigation(displayName, avatarSrc, e, video.userId)}
            style={{ cursor: 'pointer', flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.src = GUEST_AVATAR;
            }}
          />
          <div style={{ flex: 1, minWidth: 0, overflow: 'visible' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', overflow: 'visible' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <h3
                  className="video-title"
                  style={{
                    margin: '0 0 2px 0',
                    flex: '1 1 auto',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    lineHeight: 1.25
                  }}
                >
                  {video.title}
                </h3>
                <p
                  className="channel-name channel-name-clickable"
                  onClick={(e) => handleChannelNavigation(displayName, avatarSrc, e, video.userId)}
                  style={{ cursor: 'pointer', display: 'block', margin: '6px 0 3px 0', lineHeight: 1.25 }}
                >
                  {displayName}
                </p>
                <p className="video-meta" style={{ margin: 0, lineHeight: 1.28 }}>
                  {formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}
                </p>
              </div>
              {renderVideoQuickMenu(video, 'inline')}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🟢 頻道頁大頭貼：雙軌支援後避免 ID 文件沒有 avatar 時讀不到
  const getTargetChannelAvatarSrc = () => {
    const channelName = targetChannel?.name || targetChannel?.username || targetChannel?.channelName || '';
    const channelUserId = targetChannel?.userId || targetChannelUserId || '';

    if (channelName === '小葉' || channelUserId === 'shiauye_official') return avatarImage;

    // 先相信 targetChannel 的頭貼，避免誤用目前登入者頭貼或首頁其他影片頭貼。
    if (targetChannel?.avatar && targetChannel.avatar !== GUEST_AVATAR) {
      return targetChannel.avatar;
    }

    const findAvatarFromVideos = (list = []) => {
      const matchedVideo = (Array.isArray(list) ? list : []).find(video => {
        return (
          (channelUserId && String(video.userId ?? '') === String(channelUserId)) ||
          String(video.channel ?? '') === String(channelName) ||
          String(video.author ?? '') === String(channelName) ||
          String(video.creatorName ?? '') === String(channelName) ||
          String(video.username ?? '') === String(channelName) ||
          String(video.channelName ?? '') === String(channelName)
        );
      });

      return matchedVideo?.avatar || matchedVideo?.creatorAvatar || matchedVideo?.channelAvatar || '';
    };

    const channelVideoAvatar = findAvatarFromVideos(channelVideos);
    if (channelVideoAvatar) return channelVideoAvatar;

    const loadedVideoAvatar = findAvatarFromVideos(videos);
    if (loadedVideoAvatar) return loadedVideoAvatar;

    if (
      String(channelUserId || '') === String(currentUserId || '') ||
      String(channelName || '') === String(localUsername || '')
    ) {
      return unifiedAvatar || currentUserAvatar || GUEST_AVATAR;
    }

    return GUEST_AVATAR;
  };

  const getChannelVideos = (channelName) => {
// 頻道頁只使用 channelVideos；channelVideos 由上方 useEffect 針對目前頻道查詢取得。
// 不再從首頁 videos/rawFirebaseVideos 裡 filter。即使 channelName 暫時還沒還原，也要顯示已查到的 channelVideos。
if (currentView === 'channel') {
return sortVideos(Array.isArray(channelVideos) ? channelVideos : [], channelVideoSort);
}
return [];
};

  const getSubscribedChannelAvatar = (channel = {}) => {
    const channelName = channel.name || channel.username || channel.channelName || '';
    const channelUserId = channel.userId || '';

    if (channelName === '小葉' || channelUserId === 'shiauye_official') return avatarImage;

    const matchedVideo = (Array.isArray(videos) ? videos : []).find(video => {
      return (
        (channelUserId && String(video.userId ?? '') === String(channelUserId)) ||
        String(video.channel ?? '') === String(channelName) ||
        String(video.author ?? '') === String(channelName) ||
        String(video.creatorName ?? '') === String(channelName) ||
        String(video.username ?? '') === String(channelName)
      );
    });

    return channel.avatar || matchedVideo?.avatar || matchedVideo?.creatorAvatar || matchedVideo?.channelAvatar || GUEST_AVATAR;
  };

  const getSortedSubscribedChannelDetails = () => {
    const detailMap = new Map();

    (Array.isArray(subscribedChannelDetails) ? subscribedChannelDetails : []).forEach((channel, index) => {
      const channelName = channel.name || channel.username || channel.channelName;
      if (!channelName) return;
      detailMap.set(channelName, {
        ...channel,
        name: channelName,
        subscribedAt: Number(channel.subscribedAt || 0) || (Date.now() - ((index + 1) * 1000))
      });
    });

    (Array.isArray(subscribedChannels) ? subscribedChannels : []).forEach((channelName, index) => {
      if (!channelName || detailMap.has(channelName)) return;
      detailMap.set(channelName, {
        name: channelName,
        username: channelName,
        channelName,
        userId: channelName === '小葉' ? 'shiauye_official' : '',
        avatar: channelName === '小葉' ? avatarImage : GUEST_AVATAR,
        subscribedAt: Date.now() - (100000 + index)
      });
    });

    return Array.from(detailMap.values())
      .filter(channel => {
        const name = channel.name || channel.username || channel.channelName;
        return name && subscribedChannels.includes(name) && !INVALID_LEGACY_SUBSCRIPTION_CHANNELS.includes(name);
      })
      .sort((a, b) => Number(b.subscribedAt || 0) - Number(a.subscribedAt || 0))
      .slice(0, 6);
  };


  const normalizeChannelValue = (value) => String(value ?? '').trim();

  const sameChannelValue = (a, b) => normalizeChannelValue(a) !== '' && normalizeChannelValue(a) === normalizeChannelValue(b);

  const getChannelIdentityCandidates = (channel = {}) => {
    return [
      channel.userId,
      channel.id,
      channel.name,
      channel.username,
      channel.channelName,
      channel.channel,
      channel.author,
      channel.creatorName
    ]
      .map(normalizeChannelValue)
      .filter(Boolean);
  };

  const isSubscribedToChannel = (channel = {}) => {
    const candidates = getChannelIdentityCandidates(channel);
    if (candidates.length === 0) return false;

    const safeSubs = Array.isArray(subscribedChannels) ? subscribedChannels : [];
    const safeDetails = Array.isArray(subscribedChannelDetails) ? subscribedChannelDetails : [];

    return (
      safeSubs.some(item => candidates.some(candidate => sameChannelValue(item, candidate))) ||
      safeDetails.some(detail => {
        const detailCandidates = getChannelIdentityCandidates(detail);
        return detailCandidates.some(detailValue => candidates.some(candidate => sameChannelValue(detailValue, candidate)));
      })
    );
  };

  const isViewingOwnTargetChannel = () => {
    const channelCandidates = getChannelIdentityCandidates({
      ...targetChannel,
      userId: targetChannel?.userId || targetChannelUserId
    });
    const ownCandidates = getChannelIdentityCandidates({
      userId: currentUserId,
      name: localUsername,
      username: localUsername,
      channelName: localUsername
    });

    return channelCandidates.some(channelValue => ownCandidates.some(ownValue => sameChannelValue(channelValue, ownValue)));
  };


  const getTargetChannelSubscriberCount = () => {
    const channelName = targetChannel?.name || targetChannel?.username || targetChannel?.channelName || '';
    const channelUserId = targetChannel?.userId || targetChannelUserId || '';
    const targetCandidates = getChannelIdentityCandidates({
      ...targetChannel,
      userId: channelUserId,
      name: channelName,
      username: targetChannel?.username,
      channelName: targetChannel?.channelName
    });

    const allKnownVideos = [
      ...(Array.isArray(rawFirebaseVideos) ? rawFirebaseVideos : []),
      ...(Array.isArray(videos) ? videos : []),
      ...(Array.isArray(watchHistory) ? watchHistory : []),
      ...(selectedVideo ? [selectedVideo] : []),
      ...(Array.isArray(MOCK_VIDEOS) ? MOCK_VIDEOS : [])
    ];

    const matchedVideoCounts = allKnownVideos
      .filter(video => {
        const videoCandidates = getChannelIdentityCandidates(video);
        return videoCandidates.some(videoValue => targetCandidates.some(targetValue => sameChannelValue(videoValue, targetValue)));
      })
      .map(video => video?.subscriberCount);

    const matchedSubscriptionDetail = (Array.isArray(subscribedChannelDetails) ? subscribedChannelDetails : []).find(detail => {
      const detailCandidates = getChannelIdentityCandidates(detail);
      return detailCandidates.some(detailValue => targetCandidates.some(targetValue => sameChannelValue(detailValue, targetValue)));
    });

    // 不能用 ??，因為 targetChannel.subscriberCount 如果是舊的 0，會擋住 Firebase / video 裡正確的數字。
    // 這裡統一取最大可信值，避免頻道頁一直顯示 0。
    return preserveSubscriberCount(
      targetChannel?.subscriberCount,
      matchedSubscriptionDetail?.subscriberCount,
      ...matchedVideoCounts,
      isViewingOwnTargetChannel() ? liveSubscriberCount : 0
    );
  };


  /* ------------------------------
    19. Render Entry / JSX 主畫面
  ------------------------------ */
  const getPublicUserIdForDisplay = () => {
    const value = String(currentUserId || '').trim();
    const name = String(localUsername || '').trim();
    const looksLikeFirebaseUid = value && /^[A-Za-z0-9]{20,}$/.test(value) && !value.startsWith('user_');

    if (looksLikeFirebaseUid && name && name !== '載入中...') {
      return name;
    }

    return value || name || 'guest';
  };


  const getTargetChannelPublicIdForDisplay = () => {
    const cleanHandle = (value) => String(value ?? '').trim().replace(/^@+/, '');
    const looksLikeFirebaseUid = (value) => {
      const cleanValue = cleanHandle(value);
      return cleanValue && /^[A-Za-z0-9]{20,}$/.test(cleanValue) && !cleanValue.startsWith('user_');
    };

    const channelName = cleanHandle(targetChannel?.name || targetChannel?.channelName || '');
    const channelUsername = cleanHandle(targetChannel?.username || '');
    const channelUserId = cleanHandle(targetChannel?.userId || targetChannelUserId || '');

    const isOwnChannel =
      String(channelUserId || '') === String(currentUserId || '') ||
      String(channelName || '') === String(localUsername || '') ||
      String(channelUsername || '') === String(localUsername || '');

    // 自己的頻道一定跟右上角選單顯示同一個公開 ID。
    if (isOwnChannel) {
      return getPublicUserIdForDisplay();
    }

    // 別人的頻道優先顯示真正 ID，不要優先顯示頻道名稱。
    if (channelUserId && !looksLikeFirebaseUid(channelUserId)) return channelUserId;
    if (channelUsername && !looksLikeFirebaseUid(channelUsername)) return channelUsername;

    // 如果只拿到 Firebase UID，那就不要把長 UID 顯示出來，改用頻道名稱當備援。
    if (channelName) return channelName;
    if (channelUsername) return channelUsername;
    if (channelUserId) return channelUserId;

    return 'guest';
  };

  const SidebarIcon = ({ type }) => {
    const iconProps = {
      width: 22,
      height: 22,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.9,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { flexShrink: 0, opacity: 0.95 }
    };

    if (type === 'home') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <path d="M3.5 10.5 12 3.8l8.5 6.7" />
          <path d="M5.5 9.8V20h13V9.8" />
          <path d="M9.3 20v-6.1h5.4V20" />
        </svg>
      );
    }

    if (type === 'subscriptions') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <rect x="4" y="6.5" width="16" height="11" rx="2.3" />
          <path d="M10.5 10.2 15 12l-4.5 1.8v-3.6Z" fill="currentColor" stroke="none" />
          <path d="M8 3.8h8" />
        </svg>
      );
    }

    if (type === 'history') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <path d="M4.2 12a7.8 7.8 0 1 0 2.3-5.5" />
          <path d="M4.2 5.2v4h4" />
          <path d="M12 7.8V12l3 1.8" />
        </svg>
      );
    }

    if (type === 'liked') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <path d="M12 20.2s-7.2-4.4-8.8-9.1C2.1 7.8 4.1 5 7.2 5c1.8 0 3.2 1 4.1 2.3C12.2 6 13.6 5 15.4 5c3.1 0 5.1 2.8 4 6.1C17.8 15.8 12 20.2 12 20.2Z" />
        </svg>
      );
    }

    if (type === 'user') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 20c.8-4 3.2-6.2 6.5-6.2s5.7 2.2 6.5 6.2" />
        </svg>
      );
    }

    if (type === 'settings') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a8 8 0 0 0 .1-1.6l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.4-.8L15.4 6h-4l-.3 2.6c-.5.2-1 .5-1.4.8l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 1.6l-2 1.5 2 3.5 2.4-1c.4.3.9.6 1.4.8l.3 2.6h4l.3-2.6c.5-.2 1-.5 1.4-.8l2.4 1 2-3.5-2.2-1.5Z" />
        </svg>
      );
    }

    if (type === 'lock') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
          <path d="M8.5 10V7.7a3.5 3.5 0 0 1 7 0V10" />
          <path d="M12 14v2" />
        </svg>
      );
    }

    if (type === 'key') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <circle cx="7.5" cy="12.5" r="3.2" />
          <path d="M10.2 10.8 20 1.2" />
          <path d="M15.8 5.2 18.2 7.6" />
          <path d="M13.7 7.3 16 9.6" />
        </svg>
      );
    }

    if (type === 'logout') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10" />
          <path d="M14 8l4 4-4 4" />
          <path d="M18 12H9" />
        </svg>
      );
    }

    if (type === 'dice') {
      return (
        <svg {...iconProps} aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <circle cx="9" cy="9" r=".9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9" r=".9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
          <circle cx="9" cy="15" r=".9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="15" r=".9" fill="currentColor" stroke="none" />
        </svg>
      );
    }

    return null;
  };

  const SidebarMenuLabel = ({ icon, children }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      <SidebarIcon type={icon} />
      <span>{children}</span>
    </span>
  );

  const IconLabel = ({ icon, children, gap = 10, iconSize = 20 }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, minWidth: 0 }}>
      <span style={{ width: iconSize, height: iconSize, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'currentColor' }}>
        <SidebarIcon type={icon} />
      </span>
      <span>{children}</span>
    </span>
  );

  const renderCommentQuickMenu = (comment = {}, cid = '') => {
    const commentUserId = String(comment?.userId || comment?.uid || comment?.authorId || '').trim();
    const commentAuthor = String(comment?.author || comment?.username || comment?.channelName || '').trim();
    const currentId = String(currentUserId || '').trim();
    const currentName = String(localUsername || '').trim();
    const isOwnVideo = canManageVideo(selectedVideo || {});
    const isOwnComment =
      (commentUserId && currentId && currentId !== 'loading...' && commentUserId === currentId) ||
      (commentAuthor && currentName && commentAuthor === currentName);
    // 自己的影片留言區：可置頂/取消置頂/刪除任何留言；不是自己的影片：只能刪除自己的留言。
    const canPin = Boolean(comment?.id) && !comment?.isPending && isOwnVideo;
    const canDelete = Boolean(comment?.id) && !comment?.isPending && (isOwnVideo || isOwnComment);
    const isOpen = openCommentOptionsId === cid;
    const menuItemStyle = {
      width: '100%',
      border: 'none',
      background: 'transparent',
      color: '#f5f5f5',
      padding: '10px 12px',
      borderRadius: '8px',
      textAlign: 'left',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: '13px',
      whiteSpace: 'nowrap'
    };

    return (
      <div
        data-comment-options-root="true"
        style={{ position: 'absolute', top: 0, right: 0, zIndex: 90 }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="留言選項"
          title="留言選項"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenCommentOptionsId(prev => prev === cid ? null : cid);
          }}
          style={{
            width: '28px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#aaa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
            <span style={{ width: '3.5px', height: '3.5px', borderRadius: '50%', background: 'currentColor', display: 'block' }}></span>
          </span>
        </button>

        {isOpen && (
          <div
            className="comment-options-menu"
            style={{
              position: 'absolute',
              right: 0,
              top: '32px',
              minWidth: '148px',
              background: '#1b1b1b',
              border: '1px solid #333',
              borderRadius: '12px',
              boxShadow: '0 14px 32px rgba(0,0,0,0.55)',
              padding: '6px',
              zIndex: 10000
            }}
          >
            {canPin && (
              <button
                type="button"
                onClick={(e) => {
                  handleTogglePinComment(comment, e);
                  setOpenCommentOptionsId(null);
                }}
                style={menuItemStyle}
              >
                {comment.pinned ? '取消置頂' : '置頂留言'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={(e) => {
                  handleDeleteComment(comment, e);
                  setOpenCommentOptionsId(null);
                }}
                style={{ ...menuItemStyle, color: '#ff6b6b' }}
              >
                刪除留言
              </button>
            )}
            {!canPin && !canDelete && (
              <div style={{ color: '#888', padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                沒有可用操作
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const styleId = 'leafhub-overflow-menu-fix';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .video-grid,
      .video-card,
      .video-info-section,
      .search-results-list,
      .search-video-result,
      .comment-list-container,
      .single-comment-card,
      .comment-content-body,
      .watch-layout,
      .main-content {
        overflow: visible !important;
      }
      .video-options-menu,
      .comment-options-menu {
        overflow: visible !important;
      }
      [data-video-options-root="true"] button:hover,
      [data-comment-options-root="true"] button:hover {
        background: rgba(255,255,255,0.08) !important;
      }
    
      .video-info-section {
        margin-top: 4px !important;
        padding-top: 0 !important;
      }
      .video-title {
        margin-top: 0 !important;
      }

      .content-area {
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }`;
    document.head.appendChild(style);
  }, []);

  const SkeletonLine = ({ width = '100%', height = '12px', style = {} }) => (
    <div className="skeleton-text" style={{ width, height, borderRadius: '999px', margin: 0, ...style }}></div>
  );

  const SkeletonAvatar = ({ size = 40, style = {} }) => (
    <div className="skeleton-avatar" style={{ width: size, height: size, flexShrink: 0, ...style }}></div>
  );

  const VideoCardSkeleton = ({ compact = false }) => (
    <div className="video-card" style={{ pointerEvents: 'none' }}>
      <div className="skeleton-thumb" style={{ width: '100%', borderRadius: '12px' }}></div>
      <div className="video-info-section" style={{ marginTop: '8px', display: 'flex', gap: '10px' }}>
        <SkeletonAvatar size={compact ? 34 : 38} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SkeletonLine width="86%" height="16px" />
          <SkeletonLine width="48%" height="13px" />
          <SkeletonLine width="34%" height="12px" />
        </div>
      </div>
    </div>
  );

  const CommentSkeleton = () => (
    <div className="single-comment-card comment-skeleton-card" style={{ display: 'flex', gap: '12px', paddingRight: '44px', position: 'relative', overflow: 'visible' }}>
      <SkeletonAvatar size={40} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '2px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <SkeletonLine width="92px" height="14px" />
          <SkeletonLine width="48px" height="12px" />
        </div>
        <SkeletonLine width="64%" height="15px" />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SkeletonLine width="36px" height="12px" />
          <SkeletonLine width="46px" height="12px" />
        </div>
      </div>
    </div>
  );

  const CommentSkeletonList = ({ count = 4 }) => (
    <div className="comment-list-container comment-skeleton-list" aria-label="留言載入中">
      {Array.from({ length: count }).map((_, index) => (
        <CommentSkeleton key={`comment-skeleton-${index}`} />
      ))}
    </div>
  );

  const shareModalUrl = getCurrentVideoShareUrl();
const shareModalTitle = selectedVideo?.title || 'Leafhub 影片';
const shareOptions = [
  { id: 'embed', label: '嵌入', icon: '<>', action: handleCopyShareLink },
  { id: 'facebook', label: 'Facebook', icon: 'f', action: () => openShareTarget('facebook') },
  { id: 'messages', label: '訊息', icon: '💬', action: () => openShareTarget('messages') },
  { id: 'whatsapp', label: 'WhatsApp', icon: '☘', action: () => openShareTarget('whatsapp') },
  { id: 'x', label: 'X', icon: '𝕏', action: () => openShareTarget('x') },
  { id: 'email', label: '透過電子郵件', icon: '✉', action: () => openShareTarget('email') }
];
const allDisplayedComments = sortComments([...optimisticComments, ...comments], commentSort);
  const currentRouteChannelKey = routeChannelKey ? decodeURIComponent(routeChannelKey) : '';
  const visibleTargetChannelCandidates = getChannelIdentityCandidates({
    ...targetChannel,
    userId: targetChannel?.userId || targetChannelUserId
  });
const visibleTargetChannelName = String(
  targetChannel?.name ||
  targetChannel?.username ||
  targetChannel?.channelName ||
  currentRouteChannelKey ||
  targetChannel?.userId ||
  targetChannelUserId ||
  ''
).trim();
  const isChannelRouteMismatched = currentView === 'channel' && Boolean(currentRouteChannelKey) && !visibleTargetChannelName && !visibleTargetChannelCandidates.some(candidate => sameChannelValue(candidate, currentRouteChannelKey));
  const currentChannelVideosForReadyCheck = currentView === 'channel' ? getChannelVideos(targetChannel?.name || targetChannel?.channelName || targetChannel?.username || '') : [];
  const isChannelWaitingForFirebaseVideos = currentView === 'channel' && Boolean(currentRouteChannelKey) && isChannelVideosLoading;
const isChannelWaitingForVisibleVideos = currentView === 'channel' && isChannelVideosLoading && currentChannelVideosForReadyCheck.length === 0;
const shouldShowChannelSkeleton = currentView === 'channel' && (isChannelLoading || isChannelContentBuffering || isChannelRouteMismatched || isChannelWaitingForFirebaseVideos || isChannelWaitingForVisibleVideos);
  const channelVideoSkeletonItems = Array.from({ length: 8 });
const accountEmailDisplay = String(targetChannel?.email || authUser?.email || targetChannel?.emailLower || '').trim();
const hasBoundEmail = Boolean(accountEmailDisplay);
const accountProviderIds = new Set([
  ...(Array.isArray(targetChannel?.linkedProviders) ? targetChannel.linkedProviders : []),
  ...((authUser?.providerData || []).map(provider => provider?.providerId).filter(Boolean))
]);
const hasGoogleLinked = accountProviderIds.has('google') || accountProviderIds.has('google.com');
const hasPasswordLinked = hasBoundEmail || accountProviderIds.has('email') || accountProviderIds.has('password') || accountProviderIds.has('password.com');
const hasOwnerUidLocked = Boolean(targetChannel?.ownerUid);
const hasReservedLockedId = Boolean(hasBoundEmail && targetChannel?.idLocked);
const accountIdStatusText = hasOwnerUidLocked
  ? 'ID 已鎖定'
  : hasReservedLockedId
    ? 'Email 已綁定，ID 已保留'
    : hasBoundEmail
      ? 'Email 已綁定，ID 鎖定資料同步中'
      : '尚未綁定，建議綁定 Email 或 Google';
const accountIdStatusColor = hasOwnerUidLocked || hasReservedLockedId
  ? '#22c55e'
  : hasBoundEmail
    ? '#60a5fa'
    : '#ffb020';

  useEffect(() => {
    if (currentView !== 'channel') return;

    const candidateList = Array.from(new Set(getChannelIdentityCandidates({
      ...targetChannel,
      userId: targetChannel?.userId || targetChannelUserId || currentRouteChannelKey,
      id: currentRouteChannelKey
    })));

    if (candidateList.length === 0) return;

    let isActive = true;

    const readFirebaseChannelBio = async () => {
      try {
        let foundData = null;

        for (const candidate of candidateList) {
          const directSnap = await getDoc(doc(db, 'Channels', candidate));
          if (directSnap.exists()) {
            foundData = { id: directSnap.id, ...directSnap.data() };
            break;
          }
        }

        for (const fieldName of ['userId', 'name', 'username', 'channelName']) {
          if (foundData) break;
          for (const candidate of candidateList) {
            const snap = await getDocs(query(
              collection(db, 'Channels'),
              where(fieldName, '==', candidate),
              limit(1)
            ));
            if (!snap.empty) {
              const channelDoc = snap.docs[0];
              foundData = { id: channelDoc.id, ...channelDoc.data() };
              break;
            }
          }
        }

        if (!isActive || !foundData) return;

        const nextBio = getChannelBioValue(foundData);
        setTargetChannel(prev => ({
          ...(prev || {}),
          userId: foundData.userId || prev?.userId || foundData.id || '',
          name: foundData.name || foundData.username || foundData.channelName || prev?.name || '',
          username: foundData.username || foundData.name || prev?.username || '',
          channelName: foundData.channelName || foundData.name || prev?.channelName || '',
          avatar: foundData.avatar || prev?.avatar || GUEST_AVATAR,
          subscriberCount: Number(foundData.subscriberCount ?? prev?.subscriberCount ?? 0),
          bio: nextBio,
          BIO: nextBio,
          channelBio: nextBio
        }));
      } catch (error) {
        console.error('讀取 Firebase 頻道 BIO 失敗:', error);
      }
    };

    readFirebaseChannelBio();

    return () => {
      isActive = false;
    };
  }, [currentView, currentRouteChannelKey, targetChannelUserId, targetChannel?.userId, targetChannel?.name, targetChannel?.username, targetChannel?.channelName]);

  return (
    <div>
      {/* ==============================
        Navbar / 頂部導覽列
      ============================== */}
      {/* 頂部導覽列 */}
      <nav className="navbar">
        <div className="logo-hub-style" onClick={() => {
          handleHomeNavigation();
          forceScrollToTop(); 
        }}>
          <span className="logo-text-white">Leaf</span>
          <span className="logo-badge-orange">hub</span>
        </div>
        
        <div className="search-bar" style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="搜尋影片、頻道..." 
            className="search-input" 
            value={searchInputStr}
            autoComplete="off"
            onChange={(e) => {
              setSearchInputStr(e.target.value);
              setShowSearchDropdown(true);
              if (currentView !== 'watch') setCurrentView('home');
            }}
            onFocus={() => {
              setShowSearchDropdown(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowSearchDropdown(false), 160);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchSubmit();
              }
              if (e.key === 'Escape') {
                setShowSearchDropdown(false);
              }
            }}
          />
          <button
            className="search-btn"
            style={{ color: '#ff7a00' }}
            onClick={() => handleSearchSubmit()}
          >
            <svg viewBox="0 0 24 24" className="search-icon-svg">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
            </svg>
          </button>

          {showSearchDropdown && (searchInputStr.trim() || searchHistory.length > 0 || HOT_SEARCHES.length > 0) && (
            <div
              className="search-suggestions-dropdown"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: '#1f1f1f',
                border: '1px solid #333',
                borderRadius: '14px',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden',
                zIndex: 2000,
                padding: '8px 0',
                maxHeight: '70vh',
                overflowY: 'auto'
              }}
            >
              {searchInputStr.trim() && suggestions.length > 0 && (
                <div>
                  <div style={{ color: '#aaa', fontSize: '12px', fontWeight: 700, padding: '8px 16px 6px' }}>搜尋建議</div>
                  {suggestions.map((item, index) => (
                    <button
                      key={`suggestion-${item}-${index}`}
                      type="button"
                      className="search-suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSearchSubmit(item);
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', border: 0, background: 'transparent', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '15px' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span aria-hidden="true">🔍</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchHistory.length > 0 && (
                <div style={{ borderTop: searchInputStr.trim() && suggestions.length > 0 ? '1px solid #333' : 'none', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 6px' }}>
                    <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 700 }}>搜尋紀錄</span>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        clearSearchHistory();
                      }}
                      style={{ border: 0, background: 'transparent', color: '#3ea6ff', cursor: 'pointer', fontSize: '12px' }}
                    >
                      清除
                    </button>
                  </div>
                  {searchHistory.map((item, index) => (
                    <button
                      key={`history-${item}-${index}`}
                      type="button"
                      className="search-suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSearchSubmit(item);
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', border: 0, background: 'transparent', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '15px' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span aria-hidden="true">🕘</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ borderTop: (searchHistory.length > 0 || (searchInputStr.trim() && suggestions.length > 0)) ? '1px solid #333' : 'none', paddingTop: '4px' }}>
                <div style={{ color: '#aaa', fontSize: '12px', fontWeight: 700, padding: '8px 16px 6px' }}>熱門搜尋</div>
                {HOT_SEARCHES.map((item, index) => (
                  <button
                    key={`hot-${item}-${index}`}
                    type="button"
                    className="search-suggestion-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSearchSubmit(item);
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', border: 0, background: 'transparent', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '15px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span aria-hidden="true">🔥</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
          
        {/* 💡 核心修正 1：移除 style 的 gap，由 className="navbar-actions" 在 CSS 統籌控制 */}
        <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px'}}>
          <button onClick={() => setIsUploadModalOpen(true)} className="upload-video-btn">
            <span className="plus-icon">+</span> 
            {/* 💡 核心修正 2：幫文字加上專用 class 方便手機版徹底隱藏 */}
            <span className="upload-btn-text">新增影片</span>
          </button>

          <div className="avatar-container" ref={profileMenuRef}>
            <img
              src={unifiedAvatar}
              alt={localUsername}
              className="avatar"
              onClick={() =>
                setIsProfileOpen(prev => !prev)
              }
              style={{ cursor: 'pointer' }}
              onError={e => {
                e.currentTarget.src =
                  GUEST_AVATAR;
              }}
            />

            {isProfileOpen && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-user-info">
                  <img
                    src={unifiedAvatar}
                    alt="Avatar Large"
                    className="dropdown-avatar-large"
                  />

                  <div>
                    <div className="dropdown-username">
                      {localUsername}
                    </div>

                    <div className="dropdown-email">
                      @{getPublicUserIdForDisplay()}
                    </div>
                  </div>
                </div>

                <hr className="dropdown-divider" />

                <div className="dropdown-links">
                  <button
                    className="dropdown-item-btn"
                    onClick={handleMyChannelClick}
                  >
                    <IconLabel icon="user">我的頻道</IconLabel>
                  </button>

                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setInputUsername(
                        localUsername
                      );
                      setInputBio(
                        String(getChannelBioValue(targetChannel) || localStorage.getItem('device_user_bio') || '')
                      );
                      setPreviewAvatar(
                        unifiedAvatar
                      );
                      setIsSettingsModalOpen(
                        true
                      );
                      setIsProfileOpen(false);
                    }}
                  >
                    <IconLabel icon="settings">帳號設定</IconLabel>
                  </button>

                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setNewPasswordInput('');
                      setConfirmNewPasswordInput('');
                      setIsChangePasswordModalOpen(true);
                      setIsProfileOpen(false);
                    }}
                  >
                    <IconLabel icon="lock">{isIdLoggedIn ? '修改密碼' : '新增登入密碼'}</IconLabel>
                  </button>

                  {isIdLoggedIn ? (
                    <button
                      className="dropdown-item-btn"
                      onClick={handleLogoutId}
                    >
                      <IconLabel icon="logout">登出</IconLabel>
                    </button>
                  ) : (
                    <button
                      className="dropdown-item-btn"
                      onClick={() => {
                        setLoginIdInput('');
                        setLoginPasswordInput('');
                        setIsIdLoginModalOpen(true);
                        setIsProfileOpen(false);
                      }}
                    >
                      <IconLabel icon="key">登入</IconLabel>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="main-wrapper">
        {currentView !== 'watch' && (
          <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="sidebar-menu">
              <button className={`sidebar-btn ${currentView === 'home' ? 'active' : ''}`} onClick={handleHomeNavigation}>
                <SidebarMenuLabel icon="home">首頁</SidebarMenuLabel>
              </button>
              <button className={`sidebar-btn ${currentView === 'subscriptions' ? 'active' : ''}`} onClick={() => handleInternalViewNavigation('subscriptions', '/subscriptions')}>
                <SidebarMenuLabel icon="subscriptions">訂閱頻道</SidebarMenuLabel>
              </button>
              <hr style={{ border: 'none', borderTop: '1px solid #1f1f1f', margin: '12px 0' }} />
              <div className="sidebar-section-title">我的專區</div>
              <button className={`sidebar-btn ${currentView === 'history' ? 'active' : ''}`} onClick={() => handleInternalViewNavigation('history', '/history')}>
                <SidebarMenuLabel icon="history">觀看紀錄</SidebarMenuLabel>
              </button>
              <button className={`sidebar-btn ${currentView === 'liked' ? 'active' : ''}`} onClick={() => handleInternalViewNavigation('liked', '/liked')}>
                <SidebarMenuLabel icon="liked">喜歡的影片</SidebarMenuLabel>
              </button>
            </div>

            {getSortedSubscribedChannelDetails().length > 0 && (
            <div
              className="sidebar-subscriptions-panel"
              style={{
                marginTop: '18px',
                paddingTop: '14px',
                borderTop: '1px solid #1f1f1f',
                width: '100%'
              }}
            >
              <div className="sidebar-section-title" style={{ marginBottom: '8px' }}>最近訂閱</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {getSortedSubscribedChannelDetails().length > 0 ? (
                  getSortedSubscribedChannelDetails().map((channel) => {
                    const channelName = channel.name || channel.username || channel.channelName;
                    const channelAvatar = getSubscribedChannelAvatar(channel);

                    return (
                      <button
                        key={`${channel.userId || channelName}-${channel.subscribedAt || ''}`}
                        type="button"
                        className="sidebar-btn sidebar-sub-channel"
                        onClick={(e) => handleChannelNavigation(channelName, channelAvatar, e, channel.userId || '')}
                        title={channelName}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: '10px',
                          textAlign: 'left',
                          padding: '8px 10px',
                          marginLeft: '5px',
                          minWidth: 0
                        }}
                      >
                        <img
                          src={channelAvatar}
                          alt={channelName}
                          onError={(e) => { e.currentTarget.src = GUEST_AVATAR; }}
                          style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
                        />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '28px' }}>{channelName}</span>
                      </button>
                    );
                  })
                ) : (
                  <div style={{ color: '#777', fontSize: '13px', padding: '8px 10px', lineHeight: '1.5' }}>尚未訂閱頻道</div>
                )}
              </div>
            </div>
            )}
          </aside>
        )}

        {/* 💡 核心修正 3：加入 main-content 類名，確保與手機版 CSS 精準對接 */}
        <main className="content-area main-content" ref={contentAreaRef}>
          {currentView === 'home' && (
            <>
              {!searchQuery.trim() && (
                <div className="category-bar">
                  {CATEGORIES.map((category) => (
                    <button 
                      key={category} 
                      onClick={() => handleCategoryChange(category)} 
                      className={`category-btn ${activeCategory === category ? 'active' : ''}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}

              {(isPageLoading || isFirstInit) ? (
                <div className="video-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                    <div key={`skeleton-card-${num}`} className="video-card" style={{ pointerEvents: 'none' }}>
                      <div className="skeleton-thumb" style={{ width: '100%', borderRadius: '12px' }}></div>
                      <div className="video-info-section" style={{ marginTop: '12px' }}>
                        <div className="skeleton-avatar" style={{ flexShrink: 0 }}></div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div className="skeleton-text title" style={{ height: '16px', borderRadius: '4px' }}></div>
                          <div className="skeleton-text meta" style={{ height: '12px', width: '60%', borderRadius: '4px' }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                searchQuery.trim() ? (
                  <div className="search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                          { key: 'all', label: '全部' },
                          { key: 'videos', label: '影片' },
                          { key: 'channels', label: '頻道' }
                        ].map(tab => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setSearchResultType(tab.key)}
                            style={{
                              border: 0,
                              borderRadius: '999px',
                              padding: '10px 18px',
                              background: searchResultType === tab.key ? '#ff7a00' : '#222',
                              color: searchResultType === tab.key ? '#fff' : '#ddd',
                              fontWeight: 800,
                              cursor: 'pointer',
                              boxShadow: searchResultType === tab.key ? '0 0 18px rgba(255, 122, 0, 0.35)' : 'none'
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <select
                        value={searchSortType}
                        onChange={(e) => setSearchSortType(e.target.value)}
                        style={{
                          background: '#222',
                          color: '#fff',
                          border: '1px solid #ff7a00',
                          borderRadius: '999px',
                          padding: '10px 14px',
                          outline: 'none',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="relevance">最相關</option>
                        <option value="latest">最新上傳</option>
                        <option value="views">觀看次數</option>
                      </select>
                    </div>

                    {visibleSearchChannels.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {visibleSearchChannels.map(channel => (
                          <div
                            key={`search-channel-${channel.userId || channel.name}`}
                            className="search-channel-result"
                            style={{ display: 'grid', gridTemplateColumns: '170px 1fr auto', alignItems: 'center', gap: '26px', padding: '12px 0 20px', borderBottom: '1px solid #2a2a2a' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <img
                                src={channel.avatar || GUEST_AVATAR}
                                alt={channel.name}
                                onError={(e) => { e.currentTarget.src = GUEST_AVATAR; }}
                                onClick={(e) => handleChannelNavigation(channel.name, channel.avatar, e, channel.userId)}
                                style={{ width: '132px', height: '132px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                              />
                            </div>
                            <div
                              onClick={(e) => handleChannelNavigation(channel.name, channel.avatar, e, channel.userId)}
                              style={{ minWidth: 0, cursor: 'pointer' }}
                            >
                              <h2 style={{ margin: '0 0 8px', color: '#f1f1f1', fontSize: '20px', fontWeight: 700 }}>{channel.name}</h2>
                              <p style={{ margin: 0, color: '#aaa', fontSize: '13px' }}>
                                @{channel.userId || channel.name} • {formatSubscribers(channel.subscriberCount)}位訂閱者 • {channel.videoCount}部影片
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSubscribe(channel.name)}
                              style={{ border: 0, borderRadius: '999px', padding: '10px 18px', background: subscribedChannels.includes(channel.name) ? '#272727' : '#f1f1f1', color: subscribedChannels.includes(channel.name) ? '#f1f1f1' : '#0f0f0f', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {subscribedChannels.includes(channel.name) ? '已訂閱' : '訂閱'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {shouldShowSearchSkeleton ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {searchVideoSkeletonItems.map((num) => (
                          <div
                            key={`search-skeleton-${num}`}
                            className="search-video-result"
                            style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) minmax(0, 1fr)', gap: '18px', alignItems: 'start', pointerEvents: 'none' }}
                          >
                            <div className="skeleton-thumb" style={{ width: '100%', borderRadius: '12px', minHeight: '180px' }}></div>
                            <div style={{ minWidth: 0, paddingTop: '2px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div className="skeleton-text title" style={{ height: '22px', width: '78%', borderRadius: '4px' }}></div>
                              <div className="skeleton-text meta" style={{ height: '13px', width: '38%', borderRadius: '4px' }}></div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                                <div className="skeleton-avatar" style={{ width: '28px', height: '28px', flexShrink: 0 }}></div>
                                <div className="skeleton-text meta" style={{ height: '13px', width: '120px', borderRadius: '4px' }}></div>
                              </div>
                              <div className="skeleton-text meta" style={{ height: '13px', width: '88%', borderRadius: '4px' }}></div>
                              <div className="skeleton-text meta" style={{ height: '13px', width: '64%', borderRadius: '4px' }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : visibleSearchVideos.length > 0 ? (
                      visibleSearchVideos.map((video) => {
                        const displayName = getVideoDisplayName(video);
                        const avatarSrc = getVideoAvatarSrc(video);

                        return (
                          <div
                            key={`search-video-${video.id}`}
                            className="search-video-result"
                            onClick={() => handleVideoClick(video)}
                            style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) minmax(0, 1fr)', gap: '18px', alignItems: 'start', cursor: 'pointer', position: 'relative', overflow: 'visible', zIndex: openVideoOptionsId === getVideoMenuKey(video) ? 50 : 1 }}
                          >
                            {renderVideoQuickMenu(video, 'search')}
                            <div className="thumbnail-wrapper" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                              <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div style={{ minWidth: 0, paddingTop: '2px', paddingRight: '44px' }}>
                              <h3 style={{ margin: '0 0 8px', color: '#f1f1f1', fontSize: '20px', lineHeight: 1.35, fontWeight: 700 }}>
                                {video.title}
                              </h3>
                              <p style={{ margin: '0 0 12px', color: '#aaa', fontSize: '13px' }}>
                                {formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}
                              </p>
                              <div
                                onClick={(e) => handleChannelNavigation(displayName, avatarSrc, e, video.userId)}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#aaa', fontSize: '13px' }}
                              >
                                <img
                                  src={avatarSrc}
                                  alt={displayName}
                                  onError={(e) => { e.currentTarget.src = GUEST_AVATAR; }}
                                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                                <span>{displayName}</span>
                              </div>
                              <p style={{ margin: 0, color: '#aaa', fontSize: '13px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {video.description || video.summary || ''}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : visibleSearchChannels.length === 0 ? (
                      <div className="empty-state" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        🔍 找不到符合「{searchQuery}」的影片或頻道
                      </div>
                    ) : null}
                  </div>
                ) : (
                <div className="video-grid">
                  {filteredVideos.length > 0 ? (
                    filteredVideos.map((video) => renderVideoCard(video))
                  ) : (
                    searchQuery.trim() ? (
                      <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#888' }}>
                        🔍 找不到符合「{searchQuery}」的影片
                      </div>
                    ) : (
                      <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#888' }}>
                        該分類目前沒有影片
                      </div>
                    )
                  )}
                </div>

                )              )}

              {!searchQuery.trim() && !(isPageLoading || isFirstInit) && (
                <>
                  {isLoadingMoreHomeVideos && (
                    <div className="video-grid" style={{ marginTop: '22px' }}>
                      {Array.from({ length: 3 }).map((_, num) => (
                        <VideoCardSkeleton key={`load-more-skeleton-${num}`} />
                      ))}
                    </div>
                  )}

                  <div
                    ref={homeLoadMoreTriggerRef}
                    aria-hidden="true"
                    style={{ width: '100%', height: '24px', pointerEvents: 'none' }}
                  ></div>
                </>
              )}
            </>
          )}

          {currentView !== 'home' && (
            (isPageLoading && ['subscriptions', 'history', 'liked'].includes(currentView)) ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '70vh' }}>
                <div className="yt-buffering-spinner"></div>
              </div>
            ) : (
              <>
                {currentView === 'subscriptions' && (
                  <div>
                    <h2 className="view-page-title">📺 已訂閱頻道內容</h2>
                    <div className="video-grid">
                      {videos.filter(v => subscribedChannels.includes(v.channel)).length > 0 ? (
                        videos.filter(v => subscribedChannels.includes(v.channel)).map((video) => renderVideoCard(video))
                      ) : (
                        <div className="empty-state">目前訂閱的頻道還沒有發布影片。</div>
                      )}
                    </div>
                  </div>
                )}

                {currentView === 'history' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h2 className="view-page-title">🕒 我的觀看紀錄</h2>
                      {watchHistory.length > 0 && (
                        <button className="clear-btn" onClick={() => { setWatchHistory([]); localStorage.removeItem('leafhub_watchHistory'); }}>🗑️ 清除所有紀錄</button>
                      )}
                    </div>
                    <div className="video-grid">
                      {watchHistory.length > 0 ? (
                        watchHistory.map((video) => renderVideoCard(video))
                      ) : (
                        <div className="empty-state">沒有觀看紀錄。</div>
                      )}
                    </div>
                  </div>
                )}

                {currentView === 'liked' && (
                  <div>
                    <h2 className="view-page-title">🔥 我按讚的影片</h2>
                    <div className="video-grid">
                      {videos.filter(v => likedVideoIds.includes(v.id)).length > 0 ? (
                        videos.filter(v => likedVideoIds.includes(v.id)).map((video) => renderVideoCard(video))
                      ) : (
                        <div className="empty-state">還沒有按讚的影片。</div>
                      )}
                    </div>
                  </div>
                )}

                {currentView === 'account-security' && (
                  <div className="account-security-page" style={{ maxWidth: '980px', margin: '0 auto', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <h2 className="view-page-title" style={{ marginBottom: '8px' }}>帳號安全中心</h2>
                        <p style={{ color: '#888', margin: 0, lineHeight: 1.7 }}>
                          統一管理 USER ID、Email / Google 綁定、修改密碼、忘記密碼與帳號刪除。
                        </p>
                      </div>
                      <button type="button" className="clear-btn" onClick={() => handleInternalViewNavigation('home', '/')}>回首頁</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                      <div style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '14px', padding: '16px' }}>
                        <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>USER ID</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, wordBreak: 'break-word' }}>{currentUserId || '讀取中'}</div>
                      </div>
                      <div style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '14px', padding: '16px' }}>
                        <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>Email</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, wordBreak: 'break-word', color: hasBoundEmail ? '#22c55e' : '#ffb020' }}>{hasBoundEmail ? accountEmailDisplay : '尚未綁定'}</div>
                      </div>
                      <div style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '14px', padding: '16px' }}>
                        <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>ID 狀態</div>
                        <div style={{ color: accountIdStatusColor, fontWeight: 900 }}>
                          {accountIdStatusText}
                        </div>
                        {hasBoundEmail && !hasOwnerUidLocked && (
                          <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.6, marginTop: '6px' }}>
                            系統已讀到 Email。若目前 Firebase Auth 也已登入同一個 Email，會自動補寫 ownerUid 並完成 ID 鎖定。
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '18px' }}>
                      <section style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ marginTop: 0 }}>{hasBoundEmail ? 'Email 綁定狀態' : 'Email / Google 登入與綁定'}</h3>
                        {hasBoundEmail ? (
                          <div style={{ border: '1px solid #1f3d2b', background: 'rgba(34,197,94,0.08)', color: '#d6ffe4', borderRadius: '12px', padding: '14px', lineHeight: 1.7 }}>
                            Email 已綁定：<b>{accountEmailDisplay}</b>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                              <button type="button" className={emailAuthMode === 'login' ? 'sort-btn active' : 'sort-btn'} onClick={() => setEmailAuthMode('login')}>Email 登入</button>
                              <button type="button" className={emailAuthMode === 'bind' ? 'sort-btn active' : 'sort-btn'} onClick={() => { setEmailAuthMode('bind'); setEmailInput(targetChannel?.email || authUser?.email || ''); }}>綁定 Email</button>
                              <button type="button" className={emailAuthMode === 'register' ? 'sort-btn active' : 'sort-btn'} onClick={() => setEmailAuthMode('register')}>建立 Email 帳號</button>
                            </div>
                            <form onSubmit={handleEmailAuthSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', alignItems: 'end' }}>
                              <input className="comment-text-input" type="email" placeholder="Email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required />
                              <input className="comment-text-input" type="password" placeholder="密碼，至少 6 個字" value={emailPasswordInput} onChange={(e) => setEmailPasswordInput(e.target.value)} required />
                              {(emailAuthMode === 'register' || emailAuthMode === 'bind') && (
                                <input className="comment-text-input" type="password" placeholder="再次輸入密碼" value={emailPasswordConfirmInput} onChange={(e) => setEmailPasswordConfirmInput(e.target.value)} required />
                              )}
                              <button type="submit" className="comment-submit-btn" style={{ height: '40px' }}>
                                {emailAuthMode === 'bind' ? '確認綁定 Email' : emailAuthMode === 'register' ? '建立並登入' : 'Email 登入'}
                              </button>
                            </form>
                          </>
                        )}
                        {!hasBoundEmail && (
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                            {!hasGoogleLinked ? (
                              <>
                                <button type="button" className="clear-btn" onClick={() => handleGoogleAuth({ bindOnly: false })}>Google 登入</button>
                                <button type="button" className="clear-btn" onClick={() => handleGoogleAuth({ bindOnly: true })}>綁定 Google 到目前 USER ID</button>
                              </>
                            ) : (
                              <span style={{ color: '#22c55e', fontWeight: 800 }}>Google 已綁定</span>
                            )}
                          </div>
                        )}
                      </section>

                      <section style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ marginTop: 0 }}>修改密碼</h3>
                        <form onSubmit={handleChangePasswordSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', alignItems: 'end' }}>
                          <input className="comment-text-input" type="password" placeholder="新密碼，至少 6 個字" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} required />
                          <input className="comment-text-input" type="password" placeholder="再次輸入新密碼" value={confirmNewPasswordInput} onChange={(e) => setConfirmNewPasswordInput(e.target.value)} required />
                          <button type="submit" className="comment-submit-btn" style={{ height: '40px' }}>更新密碼</button>
                        </form>
                      </section>

                      <section style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ marginTop: 0 }}>修改 USER ID</h3>
                        <form onSubmit={handleChangeIdSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', alignItems: 'end' }}>
                          <input className="comment-text-input" type="text" placeholder="新的 USER ID" value={newIdInput} onChange={(e) => setNewIdInput(e.target.value)} required />
                          <button type="submit" className="comment-submit-btn" style={{ height: '40px' }}>更新 USER ID</button>
                        </form>
                      </section>

                      <section style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ marginTop: 0 }}>忘記密碼</h3>
                        <form onSubmit={handleSendPasswordResetSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: '10px', alignItems: 'end' }}>
                          <input className="comment-text-input" type="email" placeholder="輸入已綁定 Email" value={forgotPasswordEmailInput || accountEmailDisplay} onChange={(e) => setForgotPasswordEmailInput(e.target.value)} required />
                          <button type="submit" className="comment-submit-btn" style={{ height: '40px', padding: '0 16px' }}>寄送重設信</button>
                        </form>
                      </section>

                      <section style={{ background: '#120909', border: '1px solid #4a1d1d', borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ marginTop: 0, color: '#ff6b6b' }}>帳號刪除</h3>
                        <p style={{ color: '#bbb', fontSize: '13px', lineHeight: 1.7 }}>請輸入目前 USER ID：<b>{currentUserId}</b>。</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: '10px', alignItems: 'end' }}>
                          <input className="comment-text-input" placeholder="輸入目前 USER ID 確認" value={deleteAccountConfirmInput} onChange={(e) => setDeleteAccountConfirmInput(e.target.value)} />
                          <button type="button" onClick={handleDeleteAccountConfirm} className="comment-submit-btn" style={{ height: '40px', padding: '0 16px', background: '#d33', color: '#fff' }}>確認刪除</button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {currentView === 'channel' && (
                  <div className="channel-page-wrapper">
                    {shouldShowChannelSkeleton ? (
                      <div className="channel-loading-skeleton" style={{ padding: '8px' }}>
                        <div className="skeleton-thumb" style={{ width: '100%', height: '180px', borderRadius: '16px', marginBottom: '24px' }}></div>
                        <div
                          className="channel-header-info"
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '24px',
                            marginBottom: '32px',
                            paddingLeft: '8px',
                            textAlign: 'left'
                          }}
                        >
                          <div className="skeleton-avatar" style={{ width: '120px', height: '120px', flexShrink: 0 }}></div>
                          <div
                            className="channel-header-text"
                            style={{
                              minWidth: 0,
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: '12px'
                            }}
                          >
                            <div className="skeleton-text" style={{ width: '160px', height: '34px', borderRadius: '8px' }}></div>
                            <div className="skeleton-text" style={{ width: '280px', maxWidth: '70%', height: '16px', borderRadius: '4px' }}></div>
                            <div className="skeleton-text" style={{ width: '420px', maxWidth: '85%', height: '14px', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                        <div className="channel-tabs-bar" style={{ display: 'flex', justifyContent: 'flex-start', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '8px' }}>
                          <div className="skeleton-text" style={{ width: '52px', height: '28px', borderRadius: '999px' }}></div>
                          <div className="skeleton-text" style={{ width: '52px', height: '28px', borderRadius: '999px' }}></div>
                        </div>
                        <div className="sort-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 18px 8px', flexWrap: 'wrap' }}>
                          <div className="skeleton-text" style={{ width: '86px', height: '34px', borderRadius: '999px' }}></div>
                          <div className="skeleton-text" style={{ width: '86px', height: '34px', borderRadius: '999px' }}></div>
                        </div>
                        <div className="video-grid">
                          {channelVideoSkeletonItems.map((_, index) => (
                            <div key={`channel-skeleton-video-${index}`} className="skeleton-video-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div className="skeleton-thumb" style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: '14px' }}></div>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <div className="skeleton-avatar" style={{ width: '36px', height: '36px' }}></div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div className="skeleton-text" style={{ width: '92%', height: '14px', borderRadius: '4px' }}></div>
                                  <div className="skeleton-text" style={{ width: '58%', height: '12px', borderRadius: '4px' }}></div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="channel-banner" style={{ width: '100%', height: '180px', background: 'linear-gradient(135deg, #1f1f1f 0%, #111111 50%, #ff6a00 100%)', borderRadius: '16px', marginBottom: '24px', border: '1px solid #222' }}></div>
                        <div className="channel-header-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px', paddingLeft: '0', textAlign: 'center' }}>
                          <img
                            src={getTargetChannelAvatarSrc()}
                            alt="Channel Avatar"
                            style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff6a00' }}
                            onError={(e) => {
                              e.currentTarget.src = GUEST_AVATAR;
                            }}
                          />
                          <div className="channel-header-text" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div className="channel-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
                              <h1 style={{ fontSize: '32px', margin: '0', color: '#fff', textAlign: 'center' }}>{visibleTargetChannelName}</h1>
                              {!isViewingOwnTargetChannel() && (
                                <button
                                  className={`sub-action-btn ${isSubscribedToChannel({ ...targetChannel, userId: targetChannel?.userId || targetChannelUserId }) ? 'is-subbed' : ''}`}
                                  onClick={() => toggleSubscribe(visibleTargetChannelName)}
                                  style={{ padding: '8px 20px', fontSize: '14px' }}
                                >
                                  {isSubscribedToChannel({ ...targetChannel, userId: targetChannel?.userId || targetChannelUserId }) ? '✓ 已訂閱' : '訂閱'}
                                </button>
                              )}
                            </div>
                            {/* 🟢 修正：優先從 targetChannel 讀取，再用 targetChannelUserId 當作備份 */}
                            <p style={{ color: '#aaa', margin: '8px 0 6px 0', fontSize: '15px' }}>
                              @{getTargetChannelPublicIdForDisplay()} •&nbsp;
                              {formatSubscribers(getTargetChannelSubscriberCount())}位訂閱者 • {getChannelVideos(visibleTargetChannelName).length} 部影片
                            </p>
                            <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到 {visibleTargetChannelName} 的個人技術與娛樂分享空間。</p>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="channel-tabs-bar" style={{ display: 'flex', justifyContent: 'center', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '0' }}>
                      <button onClick={() => setChannelTab('videos')} style={{ background: 'transparent', border: 'none', color: channelTab === 'videos' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'videos' ? '3px solid #ff6a00' : '3px solid transparent' }}>影片</button>
                      <button onClick={() => setChannelTab('about')} style={{ background: 'transparent', border: 'none', color: channelTab === 'about' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'about' ? '3px solid #ff6a00' : '3px solid transparent' }}>關於</button>
                    </div>

                    {channelTab === 'videos' ? (
                      <>
                        <div className="sort-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 18px 8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={channelVideoSort === 'latest' ? 'sort-btn active' : 'sort-btn'}
                            onClick={() => setChannelVideoSort('latest')}
                            style={{ border: 'none', borderRadius: '999px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold', background: channelVideoSort === 'latest' ? '#ff6a00' : '#222', color: channelVideoSort === 'latest' ? '#fff' : '#ccc' }}
                          >
                            最新發布
                          </button>
                          <button
                            type="button"
                            className={channelVideoSort === 'views' ? 'sort-btn active' : 'sort-btn'}
                            onClick={() => setChannelVideoSort('views')}
                            style={{ border: 'none', borderRadius: '999px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold', background: channelVideoSort === 'views' ? '#ff6a00' : '#222', color: channelVideoSort === 'views' ? '#fff' : '#ccc' }}
                          >
                            觀看次數
                          </button>
                        </div>
                        <div className="video-grid">
                          {getChannelVideos(targetChannel?.name).map((video) => renderVideoCard(video))}
                        </div>
                      </>
                    ) : (
                      <div className="channel-about-section" style={{ padding: '16px 8px', color: '#ccc', lineHeight: '1.8', maxWidth: '800px' }}>
                        <h3>簡介</h3>
                        <p>{getChannelBioValue(targetChannel) || '這人很神祕'}</p>
                      </div>
                    )}
                  </div>
                )}

                {currentView === 'watch' && selectedVideo && (
                  <div className="watch-layout">
                    <div className="watch-main-content">
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
                        {isVideoLoading ? (
                        <div style={{ 
                          position: 'absolute', 
                          top: 0, 
                          left: 0, 
                          width: '100%', 
                          height: '100%', 
                          backgroundImage: selectedVideo ? `linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.65)), url(${selectedVideo.image || selectedVideo.thumbnail})` : '#000',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backdropFilter: 'blur(8px)', 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center', 
                          zIndex: 10,
                          transition: 'background 0.3s ease'
                        }}>
                          <div className="yt-buffering-spinner"></div>
                        </div>
                      ) : null}
                        <iframe
                          className="video-player-simulation"
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          src={`https://www.youtube.com/embed/${getYoutubeIdFromVideo(selectedVideo)}?autoplay=1&rel=0`}
                          title={selectedVideo.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen
                        ></iframe>
                      </div>

                      <h1 className="watch-video-title" style={{ marginTop: '16px' }}>{selectedVideo.title}</h1>
                      
                      <div className="watch-actions-row">
                        <div className="channel-info-block" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {/* 💡 1. 大頭貼防線：只要這部影片的頻道或作者是小葉，強制亮出精美小葉照片 */}
                          <img 
                            src={
                              selectedVideo.channel === '小葉' || selectedVideo.author === '小葉' || selectedVideo.creatorName === '小葉'
                                ? avatarImage 
                                : (selectedVideo.avatar || GUEST_AVATAR)
                            } 
                            alt="Channel" 
                            style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover' }} 
                            // 💡 2. 點擊頭貼跳轉：如果是小葉，強制把正確的 avatarImage 頭貼參數帶過去頻道頁
                            onClick={(e) => handleChannelNavigation(
                              selectedVideo.channel || '小葉', 
                              selectedVideo.channel === '小葉' ? avatarImage : (selectedVideo.avatar || GUEST_AVATAR), 
                              e,
                              selectedVideo.userId || ''
                            )} 
                          />
                          <div>
                            {/* 💡 3. 頻道名稱點擊跳轉防線 */}
                            <div 
                              className="channel-name-large channel-name-clickable" 
                              onClick={(e) => handleChannelNavigation(
                                selectedVideo.channel || '小葉', 
                                selectedVideo.channel === '小葉' ? avatarImage : (selectedVideo.avatar || GUEST_AVATAR), 
                                e
                              )} 
                              style={{ fontWeight: 'bold', color: '#fff', cursor: 'pointer' }}
                            >
                              {selectedVideo.channel || '小葉'}
                            </div>                          
                            <div className="channel-subs-count" style={{ color: '#aaa', fontSize: '12px' }}>
                              {formatSubscribers(Number(selectedVideo?.subscriberCount ?? 0))} 位訂閱者
                            </div>
                          </div>
                          {selectedVideo.channel !== localUsername && (
                            <button className={`sub-action-btn ${subscribedChannels.includes(selectedVideo.channel) ? 'is-subbed' : ''}`} onClick={() => toggleSubscribe(selectedVideo.channel)}>
                              {subscribedChannels.includes(selectedVideo.channel) ? '✓ 已訂閱' : '訂閱'}
                            </button>
                          )}
                        </div>
                        
                        <div className="video-interactions-block">
                          <button className={`like-action-btn ${likedVideoIds.includes(selectedVideo.id) ? 'is-liked' : ''}`} onClick={() => toggleLike(selectedVideo.id)}>
                            {likedVideoIds.includes(selectedVideo.id) ? '❤️ 已按讚' : '👍 給個讚'}
                          </button>
                          <button className="like-action-btn" onClick={handleShareVideo}>
                            🔗 分享
                          </button>
                          <span className="views-date-text" style={{ marginLeft: '12px', color: '#aaa' }}>{formatViews(selectedVideo.views)} • 發布於 {selectedVideo.createdAt ? formatTimeAgo(selectedVideo.createdAt) : (selectedVideo.time || '剛剛')}</span>
                        </div>
                      </div>

                      {/* 評論區 */}
                      <div className="comments-section-wrapper">
                      <h3>💬 評論區 ({allDisplayedComments.length})</h3>

                      <form onSubmit={handleAddComment} className="comment-form-box">
                        <input
                          type="text"
                          placeholder="留下你的公開評論..."
                          className="comment-text-input"
                          value={newCommentInput}
                          onChange={(e) => setNewCommentInput(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="comment-submit-btn"
                          disabled={!newCommentInput.trim()}
                        >
                          發布
                        </button>
                      </form>

                      {!isCommentsLoading && allDisplayedComments.length > 0 && (
                        <div
                          className="sort-bar comments-sort-bar"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            margin: '14px 0 12px',
                            flexWrap: 'wrap'
                          }}
                        >
                          <button
                            type="button"
                            className={commentSort === 'likes' ? 'sort-btn active' : 'sort-btn'}
                            onClick={() => setCommentSort('likes')}
                            style={{
                              border: 'none',
                              borderRadius: '999px',
                              padding: '8px 14px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              background: commentSort === 'likes' ? '#ff6a00' : '#222',
                              color: commentSort === 'likes' ? '#fff' : '#ccc'
                            }}
                          >
                            熱門留言
                          </button>

                          <button
                            type="button"
                            className={commentSort === 'latest' ? 'sort-btn active' : 'sort-btn'}
                            onClick={() => setCommentSort('latest')}
                            style={{
                              border: 'none',
                              borderRadius: '999px',
                              padding: '8px 14px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              background: commentSort === 'latest' ? '#ff6a00' : '#222',
                              color: commentSort === 'latest' ? '#fff' : '#ccc'
                            }}
                          >
                            最新留言
                          </button>
                        </div>
                      )}

                        <div className="comment-list-container">
                          {isCommentsLoading ? (
                            <CommentSkeletonList count={5} />
                          ) : (
                            allDisplayedComments.map((comment, idx) => {
                              const cid = comment.id || `comment-${idx}`;
                              const isExpanded = !!expandedReplyComments[cid];
                              const serverReplies = commentReplies[cid] || [];
                              const localPendingReplies = optimisticReplies.filter(r => r.commentId === cid);
                              const replies = [...serverReplies, ...localPendingReplies];
                              const isMock = !comment.id || comment.id.length < 10;
                              const totalReplyCount = (comment.replyCount || serverReplies.length) + localPendingReplies.length;
                              const commentChannelName = comment.author || comment.username || comment.channelName || '匿名使用者';
                              const commentUserId = comment.userId || comment.uid || comment.authorId || '';
                              const commentAvatarSrc =
                                commentChannelName === '小葉' || commentUserId === 'shiauye_official' || commentUserId === '@shiauye_official'
                                  ? avatarImage
                                  : (comment.avatar || GUEST_AVATAR);

                              return (
                                <div key={cid} className={`single-comment-card ${comment.isPending ? 'pending' : ''}`} style={{ opacity: comment.isPending ? 0.6 : 1, marginBottom: '20px', position: 'relative', overflow: 'visible', zIndex: openCommentOptionsId === cid ? 90 : 1 }}>
                                  {renderCommentQuickMenu(comment, cid)}
                                  <div style={{ display: 'flex', gap: '12px', position: 'relative', paddingRight: '44px', overflow: 'visible' }}>
                                    {/* 🟢 主留言頭貼改法：不論比對名字還是 ID，只要是小葉就上小葉頭貼 */}
                                    <img 
                                      src={commentAvatarSrc} 
                                      alt="comment-avatar" 
                                      onClick={(e) => handleChannelNavigation(commentChannelName, commentAvatarSrc, e, commentUserId)}
                                      onError={(e) => { e.currentTarget.src = GUEST_AVATAR; }}
                                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginTop: '2px', cursor: 'pointer' }} 
                                    />
                                    <div className="comment-content-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div className="comment-user-meta" style={{ display: 'flex', alignItems: 'center' }}>
                                        <span
                                          className="comment-author-name"
                                          onClick={(e) => handleChannelNavigation(commentChannelName, commentAvatarSrc, e, commentUserId)}
                                          style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                                        >
                                          {comment.author}
                                        </span>
                                        <span className="comment-time-ago" style={{ marginLeft: '8px', color: '#666', fontSize: '12px' }}>
                                          {comment.createdAt ? formatTimeAgo(comment.createdAt) : '剛剛'}
                                        </span>
                                        {comment.pinned && (
                                          <span style={{ marginLeft: '8px', color: '#ffb347', fontSize: '12px', fontWeight: 800 }}>已置頂</span>
                                        )}
                                      </div>
                                      <p className="comment-user-text" style={{ margin: '2px 0 6px 0', color: '#eee', fontSize: '14px', lineHeight: '1.5' }}>{comment.text}</p>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '2px' }}>
                                        {/* 🟢 修正後的按讚按鈕 UI */}
                                        {/* 🟢 完美水平對齊的按讚按鈕 UI */}
                                        <button 
                                          onClick={() => handleCommentLike(cid, isMock)} 
                                          style={{ 
                                            background: 'transparent', 
                                            border: 'none', 
                                            color: (comment.likedBy || []).includes(currentUserId) ? '#ff6a00' : '#aaa', 
                                            cursor: 'pointer', 
                                            fontSize: '13px', 

                                            // 💡 核心對齊修正：使用 flex 佈局並強迫垂直置中
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            verticalAlign: 'middle',
                                            gap: '6px',             // 讓 👍 和數字之間拉開一點點舒適的寬度

                                            padding: 0,
                                            fontWeight: (comment.likedBy || []).includes(currentUserId) ? 'bold' : 'normal',
                                            lineHeight: 1           // 消除預設行高造成的位移
                                          }}
                                        >
                                          {/* 💡 把大拇指和數字稍微設定一下微調 */}
                                          <span style={{ display: 'inline-block', transform: 'translateY(-1px)' }}>👍</span> 
                                          <span 
                                            style={{ 
                                              color: (comment.likedBy || []).includes(currentUserId) ? '#ff6a00' : '#888',
                                              display: 'inline-block'
                                            }}
                                          >
                                            {comment.likes || 0}
                                          </span>
                                        </button>
                                        <button onClick={() => toggleReplySection(cid)} style={{ background: 'transparent', border: 'none', color: '#ff6a00', cursor: 'pointer', fontSize: '13px', padding: 0, fontWeight: '500' }}>回覆</button>
                                      </div>

                                      {totalReplyCount > 0 && (
                                        <div style={{ marginTop: '6px' }}>
                                          <button onClick={() => toggleReplySection(cid)} style={{ background: 'transparent', border: 'none', color: '#3ea6ff', cursor: 'pointer', fontSize: '13px', padding: 0, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                            {isExpanded ? '▼ 收起回覆' : `▶ ${totalReplyCount} 則回覆`}
                                          </button>
                                        </div>
                                      )}

                                      {isExpanded && (
                                        <div style={{ paddingLeft: '20px', borderLeft: '2px solid #222', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                          {replies.map((reply) => {
                                            const replyChannelName = reply.author || reply.username || reply.channelName || '匿名使用者';
                                            const replyUserId = reply.userId || reply.uid || reply.authorId || '';
                                            const replyAvatarSrc =
                                              replyChannelName === '小葉' || replyUserId === 'shiauye_official' || replyUserId === '@shiauye_official'
                                                ? avatarImage
                                                : (reply.avatar || GUEST_AVATAR);

                                            return (
                                            <div key={reply.id} style={{ display: 'flex', gap: '10px', fontSize: '13px', background: '#0e0e0e', padding: '8px', borderRadius: '6px', opacity: reply.isPending ? 0.6 : 1 }}>
                                              <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
                                                {/* 🟢 回覆留言頭貼改法：同樣加入 ID 比對 */}
                                                <img 
                                                  src={replyAvatarSrc} 
                                                  alt="reply-avatar" 
                                                  onClick={(e) => handleChannelNavigation(replyChannelName, replyAvatarSrc, e, replyUserId)}
                                                  onError={(e) => { e.currentTarget.src = GUEST_AVATAR; }}
                                                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', display: 'block', cursor: 'pointer' }} 
                                                />
                                                {reply.isPending && (
                                                  <span style={{ position: 'absolute', right: '-4px', bottom: '-4px', fontSize: '10px', background: '#000', borderRadius: '50%', padding: '2px' }}>⏳</span>
                                                )}
                                              </div>
                                              
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span
                                                    onClick={(e) => handleChannelNavigation(replyChannelName, replyAvatarSrc, e, replyUserId)}
                                                    style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                                                  >
                                                    {reply.author}
                                                  </span>
                                                  <span style={{ color: '#666', fontSize: '11px' }}>
                                                    {reply.createdAt ? formatTimeAgo(reply.createdAt) : '剛剛'}
                                                  </span>
                                                  {reply.isPending && <span style={{ color: '#666', fontSize: '11px' }}>(傳送中...)</span>}
                                                </div>
                                                <p style={{ color: '#ccc', margin: '2px 0 0 0', lineHeight: '1.4' }}>{reply.text}</p>
                                              </div>
                                            </div>
                                            );
                                          })}
                                          <form onSubmit={(e) => handleAddReplySubmit(e, cid)} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                            <input type="text" placeholder="新增回覆..." ref={(el) => { replyInputRefs.current[cid] = el; }} value={replyInputs[cid] || ''} onChange={(e) => setReplyInputs(prev => ({ ...prev, [cid]: e.target.value }))} style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '6px 12px', borderRadius: '16px', fontSize: '13px' }} />
                                            <button type="submit" style={{ background: '#3ea6ff', color: '#000', border: 'none', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>回覆</button>
                                          </form>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="watch-sidebar-recommendations">
                      <h3 style={{ color: '#ff6a00', marginBottom: '16px', fontSize: '18px', paddingLeft: '12px' }}>▶ 接下來播放</h3>
                      {isWatchRecommendationsLoading ? (
                        Array.from({ length: 8 }).map((_, idx) => (
                          <div key={`watch-sidebar-skeleton-${idx}`} className="recommend-mini-card" style={{ pointerEvents: 'none' }}>
                            <div className="skeleton-thumb" style={{ width: '240px', aspectRatio: '16/9', borderRadius: '10px' }}></div>
                            <div className="mini-card-info" style={{ flex: 1 }}>
                              <div className="skeleton-text" style={{ width: '90%', height: '14px', borderRadius: '4px', marginBottom: '8px' }}></div>
                              <div className="skeleton-text" style={{ width: '55%', height: '12px', borderRadius: '4px', marginBottom: '8px' }}></div>
                              <div className="skeleton-text" style={{ width: '36%', height: '12px', borderRadius: '4px' }}></div>
                            </div>
                          </div>
                        ))
                      ) : (
                        watchRecommendedVideos.map((video, idx) => (
                          <div key={`sidebar-${video.id || video.youtubeId || idx}-${idx}`} className="recommend-mini-card" onClick={() => handleVideoClick(video)}>
                            <div className="mini-card-thumb-wrapper" style={{ position: 'relative' }}>
                              <img src={video.thumbnail || '/default-thumbnail.jpg'} alt={video.title} className="thumbnail-img" style={{ borderRadius: '10px', border: '1px solid #1a1a1a', width: '240px', height: 'auto', aspectRatio: '16/9', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = '/default-thumbnail.jpg'; }} />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div className="mini-card-info">
                              <h4 className="mini-card-title">{video.title}</h4>
                              <p className="mini-card-channel channel-name-clickable" onClick={(e) => handleChannelNavigation(getVideoDisplayName(video), getVideoAvatarSrc(video), e, video.userId)} style={{ cursor: 'pointer', display: 'inline-block' }}>{getVideoDisplayName(video)}</p>
                              <p className="mini-card-views">{formatViews(video.views)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          )}
          {toast.show && (
            <div className={`toast-notification ${toast.type}`}>
              <span className="toast-icon">
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✕'}
                {toast.type === 'warning' && '⚠'}
                {toast.type === 'info' && 'ℹ'}
              </span>
                    
              <span>{toast.message}</span>
            </div>
          )}
        </main>
      </div>

      {/* 上傳 Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsUploadModalOpen(false); }}>
          <div className="upload-modal-window" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>📥 上傳新影片</h2>
              <button className="close-modal-btn" onClick={() => setIsUploadModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={handleUploadVideo} className="modal-body-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>影片標題</label>
                <input
                  className="comment-text-input"
                  type="text"
                  placeholder="請輸入影片標題... (若未輸入為原影片標題)"
                  value={newVideoTitle}
                  onChange={(e) => setNewVideoTitle(e.target.value)}
                  disabled={isAnalyzing}
                />
              </div>
                  
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>YouTube 影片網址</label>
                <input
                  className="comment-text-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  disabled={isAnalyzing}
                  required
                />
              </div>
                  
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>影片類別</label>
                  
                <select
                  value={newVideoCategory}
                  onChange={(e) => setNewVideoCategory(e.target.value)}
                  disabled={isAnalyzing}
                  style={{
                    background: '#111',
                    border: '1px solid #333',
                    color: '#fff',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  {UPLOAD_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
                
              <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isAnalyzing}
                >
                  取消
                </button>
                
                <button
                  type="submit"
                  className="comment-submit-btn"
                  style={{ height: '36px' }}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '上傳中...' : '確認上傳'}
                </button>
              </div>
            </form>
                      </div>
                    </div>
                  )}

                {/* ==============================
        Settings Modal / 帳號設定彈窗
      ============================== */}
        {/* 設定 Modal */}
                  {isSettingsModalOpen && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsSettingsModalOpen(false); }}>
                      <div className="upload-modal-window" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}><IconLabel icon="settings" gap={10}>帳號設定</IconLabel></h2>
                          <button className="close-modal-btn" onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
                  <button
                    className="dropdown-item-btn"
                    onClick={handleAccountSecurityNavigation}
                  >
                    <IconLabel icon="key" gap={10}>帳號安全中心</IconLabel>
                  </button>
                        </div>
                        <form
                    onSubmit={handleUpdateUsernameSubmit}
                    className="modal-body-form"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                  
                    {/* 頭像設定 */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <img
                        src={previewAvatar || unifiedAvatar}
                        alt={localUsername}
                        className="avatar-preview"
                        onClick={() =>
                          setIsProfileOpen(prev => !prev)
                        }
                        onError={e => {
                          e.currentTarget.src =
                            GUEST_AVATAR;
                        }}
                      />

                      <button
                        type="button"
                        onClick={handleRandomAvatar}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: '#272727',
                          color: '#fff',
                          fontSize: '14px'
                        }}
                      >
                        <IconLabel icon="dice" gap={8}>隨機頭像</IconLabel>
                      </button>

                      <button
                        type="button"
                        onClick={handleAccountSecurityNavigation}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: '#272727',
                          color: '#fff',
                          fontSize: '14px'
                        }}
                      >
                        <IconLabel icon="key" gap={8}>帳號安全</IconLabel>
                      </button>
                    </div>

                    <div style={{ border: '1px solid #2a2a2a', borderRadius: '12px', padding: '12px', background: '#101010', color: '#aaa', fontSize: '13px', lineHeight: 1.6 }}>
                      帳號安全、Email / Google 綁定、修改密碼與帳號刪除已移到獨立頁面。
                      <button type="button" className="clear-btn" onClick={handleAccountSecurityNavigation} style={{ marginLeft: '10px' }}>前往帳號安全</button>
                    </div>

                    {/* 名稱設定 */}
                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label
                        style={{
                          color: '#aaa',
                          fontSize: '14px'
                        }}
                      >
                        自訂帳號名稱
                      </label>
                      
                      <input
                        className="comment-text-input"
                        type="text"
                        placeholder="請輸入您的新名稱..."
                        value={inputUsername}
                        onChange={(e) => setInputUsername(e.target.value)}
                        required
                      />
                    </div>

                    {/* 頻道簡介設定：預設不存簡介，沒有簡介時頻道頁顯示「這人很神祕」 */}
                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label
                        style={{
                          color: '#aaa',
                          fontSize: '14px'
                        }}
                      >
                        頻道簡介
                      </label>
                      <textarea
                        className="comment-text-input"
                        placeholder="留空會顯示：這人很神祕"
                        value={inputBio}
                        onChange={(e) => setInputBio(e.target.value)}
                        rows={3}
                        maxLength={160}
                        style={{ resize: 'vertical', minHeight: '82px', lineHeight: 1.5 }}
                      />
                    </div>
                      
                    <div
                      className="modal-footer-actions"
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        marginTop: '12px'
                      }}
                    >
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setIsSettingsModalOpen(false)}
                      >
                        取消
                      </button>
                    
                      <button
                        type="submit"
                        className="comment-submit-btn"
                        style={{ height: '36px' }}
                      >
                        確認儲存
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {isEmailAuthModalOpen && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsEmailAuthModalOpen(false); }}>
                <div className="upload-modal-window" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '440px', maxWidth: '92%' }}>
                  <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>{emailAuthMode === 'bind' ? '綁定 Email' : emailAuthMode === 'register' ? '建立 Email 帳號' : 'Email 登入'}</h2>
                    <button className="close-modal-btn" onClick={() => setIsEmailAuthModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
                  </div>
                  <form onSubmit={handleEmailAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input className="comment-text-input" type="email" placeholder="Email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required />
                    <input className="comment-text-input" type="password" placeholder="密碼，至少 6 個字" value={emailPasswordInput} onChange={(e) => setEmailPasswordInput(e.target.value)} required />
                    {(emailAuthMode === 'register' || emailAuthMode === 'bind') && (
                      <input className="comment-text-input" type="password" placeholder="再次輸入密碼" value={emailPasswordConfirmInput} onChange={(e) => setEmailPasswordConfirmInput(e.target.value)} required />
                    )}
                    <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.6 }}>
                      {emailAuthMode === 'bind'
                        ? '會把目前 USER ID 綁定到這個 Email，綁定前仍可用 USER ID 登入。'
                        : 'Email 登入只會登入已經綁定 Email 的頻道。舊帳號請先用 USER ID 登入再綁定 Email。'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" className="clear-btn" onClick={() => setEmailAuthMode(emailAuthMode === 'register' ? 'login' : 'register')}>{emailAuthMode === 'register' ? '改用登入' : '建立新 Email 帳號'}</button>
                      <button type="button" className="clear-btn" onClick={() => { setForgotPasswordEmailInput(emailInput); setIsForgotPasswordModalOpen(true); }}>忘記密碼</button>
                      <button type="submit" className="comment-submit-btn" style={{ height: '36px', padding: '0 16px' }}>{emailAuthMode === 'bind' ? '確認綁定' : emailAuthMode === 'register' ? '建立並登入' : '登入'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {isForgotPasswordModalOpen && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsForgotPasswordModalOpen(false); }}>
                <div className="upload-modal-window" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '420px', maxWidth: '92%' }}>
                  <h2 style={{ color: '#fff', fontSize: '18px', marginTop: 0 }}>忘記密碼</h2>
                  <form onSubmit={handleSendPasswordResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input className="comment-text-input" type="email" placeholder="輸入已綁定的 Email" value={forgotPasswordEmailInput} onChange={(e) => setForgotPasswordEmailInput(e.target.value)} required />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" className="clear-btn" onClick={() => setIsForgotPasswordModalOpen(false)}>取消</button>
                      <button type="submit" className="comment-submit-btn" style={{ height: '36px', padding: '0 16px' }}>寄送重設信</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
{isDeleteAccountModalOpen && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsDeleteAccountModalOpen(false); }}>
                <div className="upload-modal-window" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #3a1515', padding: '24px', borderRadius: '12px', width: '440px', maxWidth: '92%' }}>
                  <h2 style={{ color: '#ff6b6b', fontSize: '18px', marginTop: 0 }}>帳號刪除</h2>
                  <p style={{ color: '#ccc', fontSize: '14px', lineHeight: 1.7 }}>這會先把頻道標記為 deletedAccount。請輸入目前 USER ID：<b>{currentUserId}</b></p>
                  <input className="comment-text-input" placeholder="輸入目前 USER ID 確認" value={deleteAccountConfirmInput} onChange={(e) => setDeleteAccountConfirmInput(e.target.value)} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                    <button type="button" className="clear-btn" onClick={() => setIsDeleteAccountModalOpen(false)}>取消</button>
                    <button type="button" onClick={handleDeleteAccountConfirm} className="comment-submit-btn" style={{ height: '36px', padding: '0 16px', background: '#d33', color: '#fff' }}>確認刪除</button>
                  </div>
                </div>
              </div>
            )}

            {/* ==============================
              Set Password Modal / 上傳後設定密碼提示
            ============================== */}
            {isShareModalOpen && (
              <div
                className="modal-overlay"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setIsShareModalOpen(false);
                }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.68)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  padding: '20px'
                }}
              >
                <div
                  className="share-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '560px',
                    maxWidth: '94vw',
                    background: '#212121',
                    color: '#fff',
                    borderRadius: '18px',
                    border: '1px solid #333',
                    boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
                    padding: '20px 24px 24px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    className="share-modal-header"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '18px'
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>分享</h2>
                    <button
                      type="button"
                      aria-label="關閉分享視窗"
                      onClick={() => setIsShareModalOpen(false)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'transparent',
                        color: '#ddd',
                        fontSize: '24px',
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div
                    className="share-options-row"
                    style={{
                      display: 'flex',
                      gap: '22px',
                      overflowX: 'auto',
                      padding: '2px 2px 22px',
                      marginBottom: '16px'
                    }}
                  >
                    {shareOptions.map((option) => {
                      const isFacebook = option.id === 'facebook';
                      const isMessages = option.id === 'messages';
                      const isWhatsapp = option.id === 'whatsapp';
                      const isX = option.id === 'x';
                      const isEmail = option.id === 'email';
                      const isEmbed = option.id === 'embed';

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={option.action}
                          title={option.label}
                          style={{
                            minWidth: '76px',
                            border: 'none',
                            background: 'transparent',
                            color: '#e8e8e8',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: 700,
                            fontSize: '14px'
                          }}
                        >
                          <span
                            style={{
                              width: '72px',
                              height: '72px',
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isEmbed ? '30px' : '34px',
                              fontWeight: 900,
                              color: '#fff',
                              background: isFacebook
                                ? '#34559a'
                                : isMessages
                                  ? '#f5f5f5'
                                  : isWhatsapp
                                    ? '#22d366'
                                    : isX
                                      ? '#000'
                                      : isEmail
                                        ? '#333'
                                        : '#f5f5f5',
                              border: isMessages ? '6px solid #fff' : '1px solid rgba(255,255,255,0.08)',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                            }}
                          >
                            <span style={{ color: isEmbed ? '#555' : isMessages ? '#2b72ff' : '#fff' }}>
                              {option.icon}
                            </span>
                          </span>
                          <span style={{ lineHeight: 1.25, whiteSpace: isEmail ? 'normal' : 'nowrap' }}>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="share-link-copy-box"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: '#121212',
                      border: '1px solid #444',
                      borderRadius: '16px',
                      padding: '12px 12px 12px 18px'
                    }}
                  >
                    <div
                      title={shareModalTitle}
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#f5f5f5',
                        fontSize: '16px',
                        fontWeight: 700
                      }}
                    >
                      {shareModalUrl}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      style={{
                        flexShrink: 0,
                        border: '1px solid #666',
                        background: '#1f1f1f',
                        color: '#fff',
                        borderRadius: '999px',
                        padding: '10px 18px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: '15px'
                      }}
                    >
                      {shareCopied ? '已複製' : '複製'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isSetPasswordModalOpen && (
              <div
                className="modal-overlay"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setIsSetPasswordModalOpen(false); }}
              >
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#141414',
                    border: '1px solid #222',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '450px',
                    maxWidth: '90%'
                  }}
                >
                  <div
                    className="modal-header"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '20px'
                    }}
                  >
                    <h2
                      style={{
                        color: '#fff',
                        fontSize: '18px',
                        margin: 0
                      }}
                    >
                      <IconLabel icon="lock" gap={10}>要新增使用者 ID 和密碼嗎？</IconLabel>
                    </h2>

                    <button
                      className="close-modal-btn"
                      onClick={() => {
                        setIsSetPasswordModalOpen(false);
                        setPasswordUserId('');
                        setPasswordInput('');
                        setConfirmPasswordInput('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#aaa',
                        fontSize: '24px',
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <p
                    style={{
                      color: '#aaa',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      marginBottom: '18px'
                    }}
                  >
                    影片已經上傳成功。你可以現在設定使用者 ID 和密碼，
                    之後就能用這組 ID 登入，不會遺失你的頻道和影片。
                  </p>

                  <form
                    onSubmit={handleSetPasswordAfterUpload}
                    className="modal-body-form"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label
                        style={{
                          color: '#aaa',
                          fontSize: '14px'
                        }}
                      >
                        使用者 ID
                      </label>

                      <input
                        className="comment-text-input"
                        type="text"
                        placeholder="請輸入使用者 ID，例如 user_1234..."
                        value={passwordUserId}
                        onChange={(e) => setPasswordUserId(e.target.value)}
                        required
                      />
                    </div>

                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label
                        style={{
                          color: '#aaa',
                          fontSize: '14px'
                        }}
                      >
                        設定密碼
                      </label>

                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="請輸入密碼，至少 6 個字..."
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        required
                      />
                    </div>

                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label
                        style={{
                          color: '#aaa',
                          fontSize: '14px'
                        }}
                      >
                        再次輸入密碼
                      </label>

                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="請再次輸入密碼..."
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        required
                      />
                    </div>

                    <div
                      className="modal-footer-actions"
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        marginTop: '12px'
                      }}
                    >
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => {
                          setIsSetPasswordModalOpen(false);
                          setPasswordUserId('');
                          setPasswordInput('');
                          setConfirmPasswordInput('');
                        }}
                      >
                        先不要
                      </button>

                      <button
                        type="submit"
                        className="comment-submit-btn"
                        style={{
                          height: '36px'
                        }}
                      >
                        設定密碼
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {/* ==============================
              ID Login Modal / 輸入 ID 登入
            ============================== */}
            {isIdLoginModalOpen && (
              <div
                className="modal-overlay"
                onMouseDown={(e) => { if (e.target === e.currentTarget) { setIsIdLoginModalOpen(false); setLoginPasswordInput(''); } }}
              >
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#141414',
                    border: '1px solid #222',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '450px',
                    maxWidth: '90%'
                  }}
                >
                  <div
                    className="modal-header"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '20px'
                    }}
                  >
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>
                      <IconLabel icon="key" gap={10}>登入現有帳號</IconLabel>
                    </h2>

                    <button
                      className="close-modal-btn"
                      onMouseDown={(e) => { if (e.target === e.currentTarget) { setIsIdLoginModalOpen(false); setLoginPasswordInput(''); } }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#aaa',
                        fontSize: '24px',
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <p
                    style={{
                      color: '#aaa',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      marginBottom: '18px'
                    }}
                  >
                    請輸入帳號 ID 和密碼，密碼正確才可以登入。
                  </p>

                  <form
                    onSubmit={handleIdLoginSubmit}
                    className="modal-body-form"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label style={{ color: '#aaa', fontSize: '14px' }}>
                        使用者 ID
                      </label>

                      <input
                        className="comment-text-input"
                        type="text"
                        placeholder="例如：user_1234"
                        value={loginIdInput}
                        onChange={(e) => setLoginIdInput(e.target.value)}
                        required
                      />
                    </div>

                    <div
                      className="form-group"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <label style={{ color: '#aaa', fontSize: '14px' }}>
                        密碼
                      </label>

                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="請輸入密碼"
                        value={loginPasswordInput}
                        onChange={(e) => setLoginPasswordInput(e.target.value)}
                        required
                      />
                    </div>

                    <div
                      className="modal-footer-actions"
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        marginTop: '12px'
                      }}
                    >
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => {
                          setIsIdLoginModalOpen(false);
                          setLoginIdInput('');
                          setLoginPasswordInput('');
                        }}
                      >
                        取消
                      </button>

                      <button
                        type="submit"
                        className="comment-submit-btn"
                        style={{ height: '36px' }}
                      >
                        登入
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}


            {/* ==============================
              Account Edit Modal / 修改 ID 與密碼
            ============================== */}
            {isChangeIdModalOpen && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsChangeIdModalOpen(false); }}>
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}
                >
                  <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}><IconLabel icon="key" gap={10}>修改 ID / 密碼</IconLabel></h2>
                    <button className="close-modal-btn" onClick={() => setIsChangeIdModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
                  </div>

                  <form onSubmit={handleChangeIdSubmit} className="modal-body-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>新 ID</label>
                      <input
                        className="comment-text-input"
                        type="text"
                        placeholder="請輸入新的 ID..."
                        value={newIdInput}
                        onChange={(e) => setNewIdInput(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>新密碼</label>
                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="不修改密碼可留空"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>再次輸入新密碼</label>
                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="不修改密碼可留空"
                        value={confirmNewPasswordInput}
                        onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                      />
                    </div>

                    <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => {
                          setIsChangeIdModalOpen(false);
                          setNewIdInput('');
                          setNewPasswordInput('');
                          setConfirmNewPasswordInput('');
                        }}
                      >
                        取消
                      </button>
                      <button type="submit" className="comment-submit-btn" style={{ height: '36px' }}>{isIdLoggedIn ? '確認修改' : '新增密碼'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ==============================
              Change Password Modal / 修改密碼
            ============================== */}
            {isChangePasswordModalOpen && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsChangePasswordModalOpen(false); }}>
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}
                >
                  <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}><IconLabel icon="lock" gap={10}>{isIdLoggedIn ? '修改密碼' : '新增登入密碼'}</IconLabel></h2>
                    <button className="close-modal-btn" onClick={() => setIsChangePasswordModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
                  </div>

                  <form onSubmit={handleChangePasswordSubmit} className="modal-body-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!isIdLoggedIn && (
                      <div style={{ background: '#1f1f1f', border: '1px solid #333', color: '#ddd', padding: '12px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.6 }}>
                        目前是訪客帳號。設定密碼後，這個 ID 會變成可用「ID + 密碼」登入的帳號。你的公開 ID 是：<strong style={{ color: '#fff' }}>{currentUserId}</strong>
                      </div>
                    )}

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>新密碼</label>
                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="請輸入新密碼，至少 6 個字..."
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>再次輸入新密碼</label>
                      <input
                        className="comment-text-input"
                        type="password"
                        placeholder="請再次輸入新密碼..."
                        value={confirmNewPasswordInput}
                        onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                        required
                      />
                    </div>

                    <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => {
                          setIsChangePasswordModalOpen(false);
                          setNewPasswordInput('');
                          setConfirmNewPasswordInput('');
                        }}
                      >
                        取消
                      </button>
                      <button type="submit" className="comment-submit-btn" style={{ height: '36px' }}>確認修改</button>
                    </div>
                  </form>
                </div>
              </div>
            )}


            {/* ==============================
              Edit Video Title Modal / 修改影片標題
            ============================== */}
            {isEditVideoTitleModalOpen && videoToEditTitle && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancelEditVideoTitle(); }}>
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: '#141414', border: '1px solid #2a2a2a', padding: '24px', borderRadius: '12px', width: '460px', maxWidth: '90%' }}
                >
                  <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>修改影片標題</h2>
                    <button
                      className="close-modal-btn"
                      disabled={isUpdatingVideoTitle}
                      onClick={handleCancelEditVideoTitle}
                      style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: isUpdatingVideoTitle ? 'not-allowed' : 'pointer' }}
                    >
                      ×
                    </button>
                  </div>

                  <form onSubmit={handleConfirmEditVideoTitle} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px' }}>影片標題</label>
                      <input
                        className="comment-text-input"
                        type="text"
                        value={editVideoTitleInput}
                        onChange={(e) => setEditVideoTitleInput(e.target.value)}
                        placeholder="請輸入新的影片標題..."
                        disabled={isUpdatingVideoTitle}
                        autoFocus
                        required
                      />
                    </div>

                    <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button
                        type="button"
                        className="clear-btn"
                        disabled={isUpdatingVideoTitle}
                        onClick={handleCancelEditVideoTitle}
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        className="comment-submit-btn"
                        disabled={isUpdatingVideoTitle}
                        style={{ height: '36px', opacity: isUpdatingVideoTitle ? 0.65 : 1 }}
                      >
                        {isUpdatingVideoTitle ? '更新中...' : '確認修改'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ==============================
              Delete Video Confirm Modal / 刪除影片確認
            ============================== */}
            {isDeleteVideoModalOpen && videoToDelete && (
              <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancelDeleteVideo(); }}>
                <div
                  className="upload-modal-window"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: '#141414', border: '1px solid #2a2a2a', padding: '24px', borderRadius: '12px', width: '460px', maxWidth: '90%' }}
                >
                  <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>確認刪除影片？</h2>
                    <button
                      className="close-modal-btn"
                      disabled={isDeletingVideo}
                      onClick={handleCancelDeleteVideo}
                      style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: isDeletingVideo ? 'not-allowed' : 'pointer' }}
                    >
                      ×
                    </button>
                  </div>

                  <p style={{ color: '#ccc', lineHeight: 1.7, margin: '0 0 10px' }}>
                    你確定要刪除這支影片嗎？
                  </p>
                  <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 10px' }}>
                    {videoToDelete.title}
                  </p>
                  <p style={{ color: '#888', fontSize: '13px', lineHeight: 1.6, margin: '0 0 20px' }}>
                    刪除後，這支影片會從你的頻道頁、首頁列表、觀看紀錄和喜歡的影片中移除。這個動作不能復原。
                  </p>

                  <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                      type="button"
                      className="clear-btn"
                      disabled={isDeletingVideo}
                      onClick={handleCancelDeleteVideo}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="comment-submit-btn"
                      disabled={isDeletingVideo}
                      onClick={handleConfirmDeleteVideo}
                      style={{ height: '36px', background: '#d93025', opacity: isDeletingVideo ? 0.65 : 1 }}
                    >
                      {isDeletingVideo ? '刪除中....' : '確認刪除'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        );
      }