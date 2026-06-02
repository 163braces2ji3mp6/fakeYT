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
import { mockComments, MOCK_VIDEOS, getRandomBio, getRandomUsername} from './mockShite';
import { db } from './firebase'; 
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, increment, getDocs, setDoc, getDoc, deleteDoc, writeBatch, deleteField } from 'firebase/firestore';

import avatarImage from './assets/163braces.jpg' 

/* ==============================
  02. Constants / 共用常數
============================== */
const GUEST_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%232a2a2a'/><circle cx='16' cy='13' r='5' fill='%23888888'/><path d='M16 20c-4.5 0-8 2.5-8 5v1h16v-1c0-2.5-3.5-5-8-5z' fill='%23888888'/></svg>";

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
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const uniqueChineseName = `${randomChineseName}_${randomNum}`; 
    const randomHex = Math.random().toString(16).substring(2, 6); 
    const uniqueId = `user_${randomHex}`;
    return { name: uniqueChineseName, id: uniqueId };
};


/* ==============================
  04. YouTube Helpers / 影片網址解析
============================== */
function extractYoutubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
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

  if (sortType === 'latest') {
    return list.sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));
  }

  return list.sort((a, b) => getLikeCount(b) - getLikeCount(a));
};


/* =========================================================
  07. Main App Component / 主元件
========================================================= */
export default function App() {

  /* ------------------------------
    07-1. Toast State / 全域通知狀態
  ------------------------------ */
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success'
  });
  const migrateChannelAvatars = async () => {
  try {
    const channelsSnapshot = await getDocs(collection(db, 'Channels'));
    const videosSnapshot = await getDocs(collection(db, 'Videos'));

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
  const [currentView, setCurrentView] = useState(() => {
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

  const [videos, setVideos] = useState([]); 
  const [rawFirebaseVideos, setRawFirebaseVideos] = useState([]);
  
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isFirstInit, setIsFirstInit] = useState(true);

  const [selectedVideo, setSelectedVideo] = useState(() => {
    const savedVideo = localStorage.getItem('leafhub_selectedVideo');
    return savedVideo ? JSON.parse(savedVideo) : null;
  });

  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isChannelLoading, setIsChannelLoading] = useState(false);


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
    };

    initUserIdentity();
  }, []);


  /* ------------------------------
    07-4. Modal / Channel State
  ------------------------------ */
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [inputUsername, setInputUsername] = useState('');

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
    return savedSubs ? JSON.parse(savedSubs) : ['我的 YouTube 頻道', '小葉'];
  }); 

  const [watchHistory, setWatchHistory] = useState(() => {
    const savedHistory = localStorage.getItem('leafhub_watchHistory');
    return savedHistory ? JSON.parse(savedHistory) : [];
  });


  /* ------------------------------
    07-6. UI Refs / Upload / Comment State
  ------------------------------ */
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const contentAreaRef = useRef(null);
  const [channelTab, setChannelTab] = useState('videos');
  // 🟢 排序系統：頻道影片預設最新；留言預設最多讚
  const [channelVideoSort, setChannelVideoSort] = useState('latest');
  const [commentSort, setCommentSort] = useState('likes');

  const replyInputRefs = useRef({});

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoCategory, setNewVideoCategory] = useState('未分類'); 
  const [isAnalyzing, setIsAnalyzing] = useState(false); 

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
    if (currentView !== 'home') return;

    if (!searchInputStr.trim()) {
      return;
    }

    setIsPageLoading(true);

    const delayDebounceFn = setTimeout(() => {
      setSearchQuery(searchInputStr);
      setIsPageLoading(false);
    }, 350);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInputStr, currentView]);


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

    const unsubscribe = subscribeToChannelData(activeChannelInfo, (channelData) => {
      if (channelData) {
        setLiveSubscriberCount(Number(channelData.subscriberCount ?? 0));
        setTargetChannelUserId(channelData.userId || activeChannelInfo.userId || '');

        if (currentView === 'channel') {
          setTargetChannel(prev => ({
            ...prev,
            ...channelData,
            name: channelData.name || prev?.name || activeChannelInfo.name,
            avatar: channelData.avatar || prev?.avatar || activeChannelInfo.avatar || GUEST_AVATAR
          }));
        }

        setTimeout(() => {
          setIsChannelLoading(false);
        }, 350);
      }
    });

    return () => unsubscribe();
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

    if (isSameUsername && avatarUrl === currentUserAvatar) {
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
      const idDocRef = doc(db, 'Channels', currentUserId);
      const oldNameDocRef = doc(db, 'Channels', oldUsername);

      // 🟢 關鍵修正：改名時訂閱數一定優先從 Channels/{userId} 讀
      // 舊版 Channels/{username} 只當 fallback，避免舊名字文件 subscriberCount = 0 把正確訂閱數覆蓋掉
      const idDocSnap = await getDoc(idDocRef);
      const oldNameDocSnap = await getDoc(oldNameDocRef);

      const idChannelData = idDocSnap.exists() ? idDocSnap.data() : {};
      const oldNameChannelData = oldNameDocSnap.exists() ? oldNameDocSnap.data() : {};
      const baseChannelData = idDocSnap.exists() ? idChannelData : oldNameChannelData;

      const getSafeSubscriberCount = (...values) => {
        for (const value of values) {
          if (value !== undefined && value !== null && value !== '') {
            const num = Number(value);
            if (!Number.isNaN(num)) return num;
          }
        }
        return 0;
      };

      const preservedSubscriberCount = getSafeSubscriberCount(
        idChannelData.subscriberCount,
        idChannelData.subscribers,
        idChannelData.subsCount,
        oldNameChannelData.subscriberCount,
        oldNameChannelData.subscribers,
        oldNameChannelData.subsCount,
        liveSubscriberCount,
        0
      );

      const channelPayload = {
        ...baseChannelData,
        name: newUsername,
        username: newUsername,
        channelName: newUsername,
        avatar: avatarUrl,
        userId: currentUserId,
        subscriberCount: preservedSubscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString()
      };

      // 🟢 新資料只寫入 Channels/{userId}
      await setDoc(idDocRef, channelPayload, { merge: true });

      await syncCurrentUserProfileEverywhere({
        avatarUrl,
        fromName: oldUsername,
        fromUserId: currentUserId,
        toName: newUsername,
        toUserId: currentUserId,
        subscriberCount: preservedSubscriberCount,
        rename: !isSameUsername
      });

      // 🟡 先保留舊版 Channels/{username} 文件，不刪除。
      // 舊文件會繼續當 fallback；確認遷移穩定後再手動清理。
      // if (
      //   !isSameUsername &&
      //   oldNameDocSnap.exists() &&
      //   String(oldNameDocRef.id) !== String(currentUserId)
      // ) {
      //   await deleteDoc(oldNameDocRef);
      // }

      setCurrentUserAvatar(avatarUrl);
      setLiveSubscriberCount(preservedSubscriberCount);

      setTargetChannel(prev =>
        prev && (
          prev.name === oldUsername ||
          prev.userId === currentUserId
        )
          ? {
              ...prev,
              name: newUsername,
              username: newUsername,
              channelName: newUsername,
              avatar: avatarUrl,
              userId: currentUserId,
              subscriberCount: preservedSubscriberCount
            }
          : prev
      );

      setLocalUsername(newUsername);
      setInputUsername(newUsername);

      localStorage.setItem('device_user_name', newUsername);
      localStorage.setItem('device_user_avatar', avatarUrl);
      localStorage.setItem('device_user_id', currentUserId);

      setSubscribedChannels(prev => {
        const nextSubs = prev.map(name =>
          name === oldUsername ? newUsername : name
        );
        localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
        return nextSubs;
      });

      showToast(
        isSameUsername ? '頭貼已更新！' : '帳號名稱與頭貼已同步更新！',
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

  const handleHomeNavigation = () => {
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

  const handleMyChannelClick = () => {
    setIsChannelLoading(true); 
    setTargetChannel({
      userId: currentUserId,
      name: localUsername,
      username: localUsername,
      channelName: localUsername,
      avatar: unifiedAvatar, // 💡 確保這裡是用目前最新的 currentUserAvatar
      bio: getRandomBio(),
      subscriberCount: liveSubscriberCount
    });
    setTargetChannelUserId(currentUserId);
    setCurrentView('channel'); 
    setChannelTab('videos'); 
    setIsProfileOpen(false); 
    forceScrollToTop(); 
  };

  // 🟢 雙軌版：頻道導覽優先用 userId，找不到才 fallback 到舊版 username 文件
  // 第 4 個參數 providedUserId 很重要：其他帳號從影片卡片點進頻道時，可以直接讀到正確 userId
  const handleChannelNavigation = async (channelName, channelAvatar, e, providedUserId = '') => {
    if (e) e.stopPropagation();

    setIsChannelLoading(true);
    setCurrentView('channel');
    setChannelTab('videos');
    forceScrollToTop();

    const startTime = Date.now();
    const finalName = channelName || localUsername;
    const finalAvatar = channelAvatar || GUEST_AVATAR;
    const initialBio = getRandomBio();

    if (finalName === '小葉') {
      const shiauyeChannel = {
        name: '小葉',
        username: '小葉',
        channelName: '小葉',
        avatar: avatarImage,
        bio: '這是小葉的官方頻道 ✨ 歡迎訂閱！',
        userId: 'shiauye_official'
      };
      setTargetChannel(shiauyeChannel);
      setTargetChannelUserId('shiauye_official');
      localStorage.setItem('leafhub_targetChannel', JSON.stringify(shiauyeChannel));
      setIsChannelLoading(false);
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
      userId: hintedUserId
    };
    setTargetChannel(initialChannelData);

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
          : `user_${Math.random().toString(16).substring(2, 6)}`;
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

      resolvedSubscriberCount = pickSubscriberCount(
        idData.subscriberCount,
        idData.subscribers,
        idData.subsCount,
        legacyData.subscriberCount,
        legacyData.subscribers,
        legacyData.subsCount,
        matchedLocalVideo?.subscriberCount,
        liveSubscriberCount
      );

      // 6) 關鍵修正：只要解析出 finalId，就把舊帳號 avatar / subscriberCount 合併回 Channels/{userId}
      await setDoc(doc(db, 'Channels', finalId), {
        ...idData,
        name: idData.name || legacyData.name || finalName,
        username: idData.username || legacyData.username || legacyData.name || finalName,
        channelName: idData.channelName || legacyData.channelName || legacyData.name || finalName,
        avatar: resolvedAvatar,
        userId: finalId,
        subscriberCount: resolvedSubscriberCount,
        subscribers: deleteField(),
        subsCount: deleteField(),
        updatedAt: new Date().toISOString(),
        createdAt: idData.createdAt || legacyData.createdAt || new Date().toISOString()
      }, { merge: true });

      // 🟡 先保留舊版 Channels/{username}，但補上 canonicalChannelId / userId / subscriberCount，方便 fallback 讀到新版資料
      if (legacyDocId && String(legacyDocId) !== String(finalId)) {
        await setDoc(doc(db, 'Channels', legacyDocId), {
          ...legacyData,
          canonicalChannelId: finalId,
          userId: legacyData.userId || finalId,
          avatar: legacyData.avatar || resolvedAvatar,
          subscriberCount: pickSubscriberCount(legacyData.subscriberCount, resolvedSubscriberCount),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 7) 舊影片補 userId / avatar，讓其他帳號以後點同頻道可以直接讀到正確 userId
      const videosSnapshot = await getDocs(collection(db, 'Videos'));
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

    setTargetChannelUserId(finalId);
    const updatedChannelData = {
      name: finalName,
      username: finalName,
      channelName: finalName,
      avatar: resolvedAvatar,
      bio: initialBio,
      userId: finalId,
      subscriberCount: resolvedSubscriberCount
    };
    setTargetChannel(updatedChannelData);
    localStorage.setItem('leafhub_targetChannel', JSON.stringify(updatedChannelData));

    const minimumDelay = 650;
    const elapsedTime = Date.now() - startTime;
    const remainingTime = minimumDelay - elapsedTime;

    if (remainingTime > 0) {
      setTimeout(() => setIsChannelLoading(false), remainingTime);
    } else {
      setIsChannelLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'watch') {
      forceScrollToTop();
    }
  }, [currentView, selectedVideo]);


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
  const unsubscribe = subscribeToVideos((firebaseVideos) => {
    const validFirebaseVideos = Array.isArray(firebaseVideos) ? firebaseVideos : [];
    setRawFirebaseVideos(validFirebaseVideos);
    
    // 💡 核心改進點：只有在第一次初始化（isFirstInit 為 true）時才進行洗牌（shuffle）
    if (isFirstInit) {
      let shuffledAll = shuffleArray([...validFirebaseVideos, ...MOCK_VIDEOS]);
      if (justUploadedVideo) {
        shuffledAll = shuffledAll.filter(v => v.id !== justUploadedVideo.id);
        shuffledAll = [justUploadedVideo, ...shuffledAll];
      }
      setVideos(shuffledAll);
      
      setIsFirstInit(false); // 💡 立即防重，避免這段時間內 Firebase 重複觸發
      
      setTimeout(() => {
        setIsPageLoading(false);
      }, 1); 
    } else {
      // 💡 重點：如果不是第一次（代表是使用者在點影片、點讚或增加觀看數而觸發更新）
      // 我們要維持本來的影片排序，只去更新被點擊影片的數據（例如觀看次數），絕對不重新洗牌！
      setVideos((prevVideos) => {
        return prevVideos.map((currentVideo) => {
          // 在剛下載的最新 Firebase 資料中，找找看有沒有對應的這部影片
          const updatedInfo = validFirebaseVideos.find(v => v.id === currentVideo.id);
          // 如果有找到更新的數據，就把它融合進去（更新觀看數），但留在原位；沒找到就維持原樣
          return updatedInfo ? { ...currentVideo, ...updatedInfo } : currentVideo;
        });
      });
    }
  });
  
  return () => unsubscribe();
}, [justUploadedVideo, isFirstInit]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  /* ------------------------------
    14. Video Actions / 觀看、按讚、訂閱
  ------------------------------ */
  const handleVideoClick = async (video) => {
    setIsVideoLoading(true); 
    setSelectedVideo(video);
    setCurrentView('watch');
    forceScrollToTop();

    setTimeout(() => {
      setIsVideoLoading(false);
    }, 450);

    setWatchHistory(prev => {
      const nextHistory = [video, ...prev.filter(item => item.id !== video.id)];
      localStorage.setItem('leafhub_watchHistory', JSON.stringify(nextHistory));
      return nextHistory;
    });

    const isMockVideo = ['1','2','3','4','5','6','7','8','9','10','11','12','13'].includes(video.id);
    if (!isMockVideo) {
      try {
        await incrementVideoViews(video.id);
      } catch (error) {
        console.error("無法更新觀看次數：", error);
      }
    }
  };

  const toggleLike = (id) => {
    setLikedVideoIds(prev => {
      const nextLikes = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
      localStorage.setItem('leafhub_likedVideos', JSON.stringify(nextLikes));
      return nextLikes;
    });
  };

  const toggleSubscribe = async (channelName) => {
    const isCurrentlySubbed = subscribedChannels.includes(channelName);

    const channelInfo =
      targetChannel?.name === channelName
        ? {
            userId: targetChannel?.userId || targetChannelUserId,
            name: targetChannel?.name,
            username: targetChannel?.username || targetChannel?.name,
            channelName: targetChannel?.channelName || targetChannel?.name,
            avatar: targetChannel?.avatar || getTargetChannelAvatarSrc?.() || unifiedAvatar
          }
        : selectedVideo?.channel === channelName
          ? {
              userId: selectedVideo?.userId,
              name: selectedVideo?.channel,
              username: selectedVideo?.username || selectedVideo?.channel,
              channelName: selectedVideo?.channel,
              avatar: selectedVideo?.avatar || selectedVideo?.creatorAvatar
            }
          : {
              userId: targetChannel?.userId || targetChannelUserId || selectedVideo?.userId || '',
              name: channelName,
              username: channelName,
              channelName,
              avatar: targetChannel?.avatar || selectedVideo?.avatar || selectedVideo?.creatorAvatar || unifiedAvatar
            };

    setSubscribedChannels(prev => {
      const nextSubs = isCurrentlySubbed ? prev.filter(item => item !== channelName) : [...prev, channelName];
      localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
      return nextSubs;
    });

    await toggleChannelSubscription(channelInfo, !isCurrentlySubbed);
  };


  /* ------------------------------
    15. Comment Like Logic / 留言按讚
    注意：下方 mock 分支目前呼叫 setMockCommentsState，
    若專案沒有宣告此 state，點 mock 留言讚會發生 ReferenceError。
  ------------------------------ */
  // 🟢 修正後的防重複點讚邏輯
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
      const videosSnapshot = await getDocs(collection(db, 'Videos'));

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
  const fetchVideoDuration = (ytId) => {
    return new Promise((resolve) => {
      const randMin = Math.floor(Math.random() * 8) + 1; 
      const randSec = Math.floor(Math.random() * 60);
      const duration = `${randMin.toString().padStart(2, '0')}:${randSec.toString().padStart(2, '0')}`;
      resolve(duration);
    });
  };

  const handleUploadVideo = async (e) => {
    e.preventDefault();
    const ytId = extractYoutubeId(newVideoUrl);

    if (!newVideoTitle.trim() || !ytId) {
      showToast('請輸入完整資訊！');
      return;
    }

    setIsAnalyzing(true)
    const finalDuration = await fetchVideoDuration(ytId);

    try {
      const dataToUpload = {
        title: newVideoTitle,
        channel: localUsername,
        creatorName: localUsername,
        username: localUsername,
        channelName: localUsername,
        author: localUsername,
        userId: currentUserId,
        views: 0,            
        time: "剛剛",            
        duration: finalDuration, 
        avatar: unifiedAvatar,
        creatorAvatar: unifiedAvatar,
        channelAvatar: unifiedAvatar,
        subscriberCount: liveSubscriberCount,
        videoUrl: newVideoUrl,
        youtubeId: ytId,
        category: newVideoCategory, 
        thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`
      };
      
      await uploadVideoToFirebase(dataToUpload);
      setJustUploadedVideo(dataToUpload); 
    
      setNewVideoTitle('');
      setNewVideoUrl('');
      setNewVideoCategory('未分類'); 
      setIsUploadModalOpen(false); 
      setSearchInputStr('');
      setSearchQuery('');
      setActiveCategory('全部');
      setCurrentView('home');
      showToast("上傳成功！", "success");
    } catch (error) {
      console.error("上傳失敗：", error);
      showToast("上傳失敗，請稍後再試！", "error");
    } finally {
      setIsAnalyzing(false); 
    }
  };


  /* ------------------------------
    18. Render Helpers / 篩選、頭貼、影片卡片
  ------------------------------ */
  const getFilteredVideos = () => {
    const currentVideos = Array.isArray(videos) ? videos : [];
    return currentVideos.filter(video => {
      const matchesSearch = !searchQuery.trim() || 
                            video.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            video.channel?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = activeCategory === '全部' || 
                              (video.category ? video.category === activeCategory : (video.title?.includes(activeCategory) || video.channel?.includes(activeCategory)));
      
      return matchesSearch && matchesCategory;
    });
  };

  const isSameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

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

  const renderVideoCard = (video) => {
    const displayName = getVideoDisplayName(video);
    const avatarSrc = getVideoAvatarSrc(video);

    return (
      <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
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
        <div className="video-info-section">
          <img
            src={avatarSrc}
            alt={displayName}
            className="channel-avatar channel-avatar-clickable"
            onClick={(e) => handleChannelNavigation(displayName, avatarSrc, e, video.userId)}
            style={{ cursor: 'pointer' }}
            onError={(e) => {
              e.currentTarget.src = GUEST_AVATAR;
            }}
          />
          <div>
            <h3 className="video-title">{video.title}</h3>
            <p
              className="channel-name channel-name-clickable"
              onClick={(e) => handleChannelNavigation(displayName, avatarSrc, e, video.userId)}
              style={{ cursor: 'pointer', display: 'inline-block' }}
            >
              {displayName}
            </p>
            <p className="video-meta">
              {formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 🟢 頻道頁大頭貼：雙軌支援後避免 ID 文件沒有 avatar 時讀不到
  const getTargetChannelAvatarSrc = () => {
    const channelName = targetChannel?.name || targetChannel?.username || targetChannel?.channelName || '';
    const channelUserId = targetChannel?.userId || targetChannelUserId || '';

    if (channelName === '小葉') return avatarImage;

    if (
      String(channelUserId || '') === String(currentUserId || '') ||
      String(channelName || '') === String(localUsername || '')
    ) {
      return unifiedAvatar || currentUserAvatar || GUEST_AVATAR;
    }

    if (targetChannel?.avatar && targetChannel.avatar !== GUEST_AVATAR) {
      return targetChannel.avatar;
    }

    const matchedVideo = (Array.isArray(videos) ? videos : []).find(video => {
      return (
        (channelUserId && String(video.userId ?? '') === String(channelUserId)) ||
        String(video.channel ?? '') === String(channelName) ||
        String(video.author ?? '') === String(channelName) ||
        String(video.creatorName ?? '') === String(channelName) ||
        String(video.username ?? '') === String(channelName)
      );
    });

    return (
      matchedVideo?.avatar ||
      matchedVideo?.creatorAvatar ||
      targetChannel?.avatar ||
      GUEST_AVATAR
    );
  };

  const getChannelVideos = (channelName) => {
    if (!channelName) return [];

    const channelVideos = videos.filter(video =>
      channelName === '小葉'
        ? (
            String(video.channel) === '小葉' ||
            String(video.author) === '小葉' ||
            String(video.creatorName) === '小葉' ||
            String(video.username) === '小葉'
          )
        : String(video.channel) === String(channelName)
    );

    return sortVideos(channelVideos, channelVideoSort);
  };


  /* ------------------------------
    19. Render Entry / JSX 主畫面
  ------------------------------ */
  const allDisplayedComments = sortComments([...optimisticComments, ...comments], commentSort);

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
        
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="搜尋影片、頻道..." 
            className="search-input" 
            value={searchInputStr}
            onChange={(e) => {
              setSearchInputStr(e.target.value);
              if (currentView !== 'watch') setCurrentView('home');
            }}
          />
          <button
            className="search-btn"
            onClick={() => showToast(`正在搜尋：${searchQuery}`, 'info')}
          >
            <svg viewBox="0 0 24 24" className="search-icon-svg">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
            </svg>
          </button>
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
                      @{currentUserId}
                    </div>
                  </div>
                </div>

                <hr className="dropdown-divider" />

                <div className="dropdown-links">
                  <button
                    className="dropdown-item-btn"
                    onClick={handleMyChannelClick}
                  >
                    👤 我的頻道
                  </button>

                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setInputUsername(
                        localUsername
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
                    ⚙️ 帳號設定
                  </button>

                  <button
                    className="dropdown-item-btn"
                    onClick={handleRandomizeUser}
                  >
                    🚪 隨機換帳號登出
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="main-wrapper">
        {currentView !== 'watch' && (
          <aside className="sidebar">
            <div className="sidebar-menu">
              <button className={`sidebar-btn ${currentView === 'home' ? 'active' : ''}`} onClick={handleHomeNavigation}>🏠 首頁</button>
              <button className={`sidebar-btn ${currentView === 'subscriptions' ? 'active' : ''}`} onClick={() => setCurrentView('subscriptions')}>📺 訂閱頻道</button>
              <hr style={{ border: 'none', borderTop: '1px solid #1f1f1f', margin: '12px 0' }} />
              <div className="sidebar-section-title">我的專區</div>
              <button className={`sidebar-btn ${currentView === 'history' ? 'active' : ''}`} onClick={() => setCurrentView('history')}>🕒 觀看紀錄</button>
              <button className={`sidebar-btn ${currentView === 'liked' ? 'active' : ''}`} onClick={() => setCurrentView('liked')}>🔥 喜歡的影片</button>
            </div>
          </aside>
        )}

        {/* 💡 核心修正 3：加入 main-content 類名，確保與手機版 CSS 精準對接 */}
        <main className="content-area main-content" ref={contentAreaRef}>
          {currentView === 'home' && (
            <>
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
                <div className="video-grid">
                  {getFilteredVideos().length > 0 ? (
                    getFilteredVideos().map((video) => (
                      <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                        <div className="thumbnail-wrapper">
                          <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                          <span className="video-duration">{video.duration}</span>
                        </div>
                          {/* 🟢 修正後的無敵保險版（完美解決小葉舊上傳影片無頭貼問題） */}
                          <div className="video-info-section">
                          <img
                            src={
                              isShiauyeAsset(video)
                                ? avatarImage
                                : isCurrentUserAsset(video)
                                ? unifiedAvatar
                                : (video.avatar || video.creatorAvatar || GUEST_AVATAR)
                            }
                            alt={video.channel || video.author}
                            className="channel-avatar channel-avatar-clickable"
                            onClick={(e) =>
                              handleChannelNavigation(
                                video.channel || video.author,
                                null,
                                e
                              )
                            }
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <h3 className="video-title">{video.title}</h3>
                            <p 
                              className="channel-name channel-name-clickable"
                              onClick={(e) =>
                                handleChannelNavigation(
                                  video.channel,
                                  null,
                                  e
                                )
                              }
                              style={{ cursor: 'pointer', display: 'inline-block' }}
                            >
                              {video.channel}
                            </p>
                            <p className="video-meta">
                              {formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
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
              )}
            </>
          )}

          {currentView !== 'home' && (
            isPageLoading ? (
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

                {currentView === 'channel' && (
                  <div className="channel-page-wrapper">
                    {isChannelLoading ? (
                      <div className="channel-loading-skeleton" style={{ padding: '8px' }}>
                        <div className="skeleton-thumb" style={{ width: '100%', height: '180px', borderRadius: '16px', marginBottom: '24px' }}></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                          <div className="skeleton-avatar" style={{ width: '120px', height: '120px' }}></div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="skeleton-text" style={{ width: '250px', height: '28px', borderRadius: '6px' }}></div>
                            <div className="skeleton-text" style={{ width: '380px', height: '16px', borderRadius: '4px' }}></div>
                            <div className="skeleton-text" style={{ width: '450px', height: '14px', borderRadius: '4px' }}></div>
                          </div>
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
                              <h1 style={{ fontSize: '32px', margin: '0', color: '#fff', textAlign: 'center' }}>{targetChannel?.name}</h1>
                              {targetChannel?.name !== localUsername && (
                                <button className={`sub-action-btn ${subscribedChannels.includes(targetChannel?.name) ? 'is-subbed' : ''}`} onClick={() => toggleSubscribe(targetChannel?.name)} style={{ padding: '8px 20px', fontSize: '14px' }}>
                                  {subscribedChannels.includes(targetChannel?.name) ? '✓ 已訂閱' : '訂閱'}
                                </button>
                              )}
                            </div>
                            {/* 🟢 修正：優先從 targetChannel 讀取，再用 targetChannelUserId 當作備份 */}
                            <p style={{ color: '#aaa', margin: '8px 0 6px 0', fontSize: '15px' }}>
                              @{targetChannel?.userId || targetChannelUserId} •&nbsp;
                              {formatSubscribers(liveSubscriberCount)}位訂閱者 • {getChannelVideos(targetChannel?.name).length} 部影片
                            </p>
                            <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到 {targetChannel?.name} 的個人技術與娛樂分享空間。</p>
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
                        <p>嗨！我是 {targetChannel?.name}。{targetChannel?.name === '小葉' ? '這是小葉的官方頻道 ✨ 歡迎訂閱！' : (targetChannel?.bio || "主要分享科技觀察與網路各種奇奇怪怪的迷因研究。")}</p>
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
                          src={`https://www.youtube.com/embed/${selectedVideo.youtubeId || extractYoutubeId(selectedVideo.videoUrl)}?autoplay=1&rel=0`}
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
                              e
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
                              {formatSubscribers(liveSubscriberCount)} 位訂閱者
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
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 0', gap: '12px', color: '#888' }}>
                              <div className="yt-buffering-spinner" style={{ width: '32px', height: '32px' }}></div>
                              <span style={{ fontSize: '14px', letterSpacing: '1px' }}>正在讀取社群留言...</span>
                            </div>
                          ) : (
                            allDisplayedComments.map((comment, idx) => {
                              const cid = comment.id || `comment-${idx}`;
                              const isExpanded = !!expandedReplyComments[cid];
                              const serverReplies = commentReplies[cid] || [];
                              const localPendingReplies = optimisticReplies.filter(r => r.commentId === cid);
                              const replies = [...serverReplies, ...localPendingReplies];
                              const isMock = !comment.id || comment.id.length < 10;
                              const totalReplyCount = (comment.replyCount || serverReplies.length) + localPendingReplies.length;

                              return (
                                <div key={cid} className={`single-comment-card ${comment.isPending ? 'pending' : ''}`} style={{ opacity: comment.isPending ? 0.6 : 1, marginBottom: '20px' }}>
                                  <div style={{ display: 'flex', gap: '12px' }}>
                                    {/* 🟢 主留言頭貼改法：不論比對名字還是 ID，只要是小葉就上小葉頭貼 */}
                                    <img 
                                      src={
                                        comment.author === '小葉' || comment.userId === 'shiauye_official' || comment.userId === '@shiauye_official'
                                          ? avatarImage 
                                          : (comment.avatar || GUEST_AVATAR)
                                      } 
                                      alt="comment-avatar" 
                                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginTop: '2px' }} 
                                    />
                                    <div className="comment-content-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div className="comment-user-meta" style={{ display: 'flex', alignItems: 'center' }}>
                                        <span className="comment-author-name" style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{comment.author}</span>
                                        <span className="comment-time-ago" style={{ marginLeft: '8px', color: '#666', fontSize: '12px' }}>
                                          {comment.createdAt ? formatTimeAgo(comment.createdAt) : '剛剛'}
                                        </span>
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
                                          {replies.map((reply) => (
                                            <div key={reply.id} style={{ display: 'flex', gap: '10px', fontSize: '13px', background: '#0e0e0e', padding: '8px', borderRadius: '6px', opacity: reply.isPending ? 0.6 : 1 }}>
                                              <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
                                                {/* 🟢 回覆留言頭貼改法：同樣加入 ID 比對 */}
                                                <img 
                                                  src={
                                                    reply.author === '小葉' || reply.userId === 'shiauye_official' || reply.userId === '@shiauye_official'
                                                      ? avatarImage 
                                                      : (reply.avatar || GUEST_AVATAR)
                                                  } 
                                                  alt="reply-avatar" 
                                                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', display: 'block' }} 
                                                />
                                                {reply.isPending && (
                                                  <span style={{ position: 'absolute', right: '-4px', bottom: '-4px', fontSize: '10px', background: '#000', borderRadius: '50%', padding: '2px' }}>⏳</span>
                                                )}
                                              </div>
                                              
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span style={{ color: '#fff', fontWeight: 'bold' }}>{reply.author}</span>
                                                  <span style={{ color: '#666', fontSize: '11px' }}>
                                                    {reply.createdAt ? formatTimeAgo(reply.createdAt) : '剛剛'}
                                                  </span>
                                                  {reply.isPending && <span style={{ color: '#666', fontSize: '11px' }}>(傳送中...)</span>}
                                                </div>
                                                <p style={{ color: '#ccc', margin: '2px 0 0 0', lineHeight: '1.4' }}>{reply.text}</p>
                                              </div>
                                            </div>
                                          ))}
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
                      {videos.filter(v => v.id !== selectedVideo.id).map((video, idx) => (
                        <div key={`sidebar-${video.id}-${idx}`} className="recommend-mini-card" onClick={() => handleVideoClick(video)}>
                          <div className="mini-card-thumb-wrapper" style={{ position: 'relative' }}>
                            <img src={video.thumbnail} alt={video.title} className="thumbnail-img" style={{ borderRadius: '10px', border: '1px solid #1a1a1a', width: '240px', height: 'auto', aspectRatio: '16/9', objectFit: 'cover' }} />
                            <span className="video-duration">{video.duration}</span>
                          </div>
                          <div className="mini-card-info">
                            <h4 className="mini-card-title">{video.title}</h4>
                            <p className="mini-card-channel channel-name-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer', display: 'inline-block' }}>{video.channel}</p>
                            <p className="mini-card-views">{formatViews(video.views)}</p>
                          </div>
                        </div>
                      ))}
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
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div className="upload-modal-window" onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}>
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
                  placeholder="請輸入吸引人的影片標題..."
                  value={newVideoTitle}
                  onChange={(e) => setNewVideoTitle(e.target.value)}
                  disabled={isAnalyzing}
                  required
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
                    <div className="modal-overlay" onClick={() => setIsSettingsModalOpen(false)}>
                      <div className="upload-modal-window" onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>⚙️ 帳號設定</h2>
                          <button className="close-modal-btn" onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
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
                        🎲 隨機頭像
                      </button>
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
          </div>
        );
      }