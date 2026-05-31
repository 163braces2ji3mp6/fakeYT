import { useState, useEffect, useRef } from 'react'
import './App.css'
// 💡 引入 Firebase 服務層
import { 
  subscribeToVideos, 
  uploadVideoToFirebase, 
  incrementVideoViews,
  subscribeToChannelData,
  toggleChannelSubscription,
  formatTimeAgo
} from './firebaseService';
// 🟢 從你的 mockShite 同時引入留言、影片，以及隨機簡介產生器
import { mockComments, MOCK_VIDEOS, getRandomBio, getRandomUsername} from './mockShite';
// 💡 引入 Firebase Firestore 核心元件來處理評論與使用者資料
import { db } from './firebase'; 
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, increment, getDocs, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

import avatarImage from './assets/163braces.jpg' 

// 1. 定義標準訪客的預設灰色頭貼
const GUEST_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%232a2a2a'/><circle cx='16' cy='13' r='5' fill='%23888888'/><path d='M16 20c-4.5 0-8 2.5-8 5v1h16v-1c0-2.5-3.5-5-8-5z' fill='%23888888'/></svg>";

// 🟢 整合版：建立新訪客識別碼（統一用 ID 做為唯一綁定）
  const generateRandomIdentity = () => {
    const randomChineseName = getRandomUsername();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    
    const uniqueChineseName = `${randomChineseName}_${randomNum}`; 
    // 🎯 產生一組長度固定的用戶專屬隨機 ID (例: user_ab12)
    const randomHex = Math.random().toString(16).substring(2, 6); 
    const uniqueId = `user_${randomHex}`;

    return { name: uniqueChineseName, id: uniqueId };
  };

function extractYoutubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

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

export default function App() {
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success'
  });

  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'success') => {

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
    }, 3000);
  };
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

  // 🟢 狀態同步：設定目前登入的使用者帳號狀態
  const [localUsername, setLocalUsername] = useState('載入中...');
  const [currentUserId, setCurrentUserId] = useState('loading...');
  const [currentUserAvatar, setCurrentUserAvatar] = useState(GUEST_AVATAR);

  // 🟢 新增狀態：用來動態儲存「正在瀏覽的頻道主」的真實 Firebase 資料
  const [targetChannelUserId, setTargetChannelUserId] = useState('');

  // 🟢 核心功能：初始化使用者身份，並同步寫入 Firebase 資料庫
  // 🟢 找到這個 useEffect 並替換它
  useEffect(() => {
    const initUserIdentity = async () => {
      let savedName = localStorage.getItem('device_user_name');
      let savedId = localStorage.getItem('device_user_id');
      let savedAvatar = localStorage.getItem('device_user_avatar'); 
      let avatar = savedAvatar || GUEST_AVATAR;

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
        avatar = GUEST_AVATAR; 
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

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [inputUsername, setInputUsername] = useState('');

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
      setTargetChannel(prev => ({ ...prev, name: localUsername, avatar: currentUserAvatar }));
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

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const contentAreaRef = useRef(null);
  const [channelTab, setChannelTab] = useState('videos');

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
  const checkUsernameExists = async (username) => {
  const channelRef = doc(db, "Channels", username);
  const channelSnap = await getDoc(channelRef);

  return channelSnap.exists();
  };
  useEffect(() => {
    if (currentView !== 'home') return;
    if (searchInputStr.trim()) {
      setIsPageLoading(true);
    }
    const delayDebounceFn = setTimeout(() => {
      setSearchQuery(searchInputStr);
      setIsPageLoading(false);
    }, 350); 
    return () => clearTimeout(delayDebounceFn);
  }, [searchInputStr, currentView]);

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
    let activeChannelName = null;
    if (currentView === 'channel' && targetChannel?.name) {
      activeChannelName = targetChannel.name;
    } else if (currentView === 'watch' && selectedVideo?.channel) {
      activeChannelName = selectedVideo.channel;
    }

    if (!activeChannelName) return;

    const unsubscribe = subscribeToChannelData(activeChannelName, (channelData) => {
      if (channelData && channelData.subscriberCount !== undefined) {
        setLiveSubscriberCount(channelData.subscriberCount);
        setTimeout(() => {
          setIsChannelLoading(false);
        }, 350); 
      }
    });

    return () => unsubscribe();
  }, [currentView, targetChannel?.name, selectedVideo?.channel]);

  const handleUpdateUsernameSubmit = async (e) => {
  e.preventDefault();

  if (!inputUsername.trim()) {
    showToast('請輸入名稱', 'warning');
    return;
  }

  const oldUsername = localUsername;
  const newUsername = inputUsername.trim();

  if (oldUsername === newUsername) {
    setIsSettingsModalOpen(false);
    return;
  }

  // ⭐ 新增這段
  const usernameExists = await checkUsernameExists(newUsername);

  if (usernameExists) {
    showToast('此名稱已被使用', 'error');
    return;
  }

  try {
      // 1. 先抓出舊中文檔案裡的資料（例如訂閱數等等）
      const oldDocRef = doc(db, 'Channels', oldUsername);
      const oldDocSnap = await getDoc(oldDocRef);
      let currentSubCount = 0;

      if (oldDocSnap.exists()) {
        currentSubCount = oldDocSnap.data().subscriberCount || 0;
        // 2. 刪除舊的中文檔名檔案
        await deleteDoc(oldDocRef);
      }

      // 3. 用「新中文名字」當作文件 ID，建立全新的漂亮檔案，並把舊訂閱數無縫搬過來！
      const newDocRef = doc(db, 'Channels', newUsername);
      await setDoc(newDocRef, {
        channelName: newUsername,
        avatar: GUEST_AVATAR,
        userId: currentUserId,
        subscriberCount: currentSubCount, // 訂閱數完美繼承！
        createdAt: new Date().toISOString()
      });

      // 同步網頁狀態
      setLocalUsername(newUsername);
      setIsSettingsModalOpen(false);
      showToast('帳號名稱已成功變更，資料庫檔案已同步更新為中文檔名！');

    } catch (err) {
      console.error("改名並搬移中文檔案失敗:", err);
    }
  };

  // 🟢 當點擊隨機換帳號登出時，同步建立一組全新的資料庫對應關係
  const handleRandomizeUser = async () => {
    const randomUser = generateRandomIdentity();
    setLocalUsername(randomUser.name);
    setInputUsername(randomUser.name);
    setCurrentUserId(randomUser.id);
    setCurrentUserAvatar(GUEST_AVATAR);
    localStorage.setItem('device_user_avatar', GUEST_AVATAR);
    localStorage.setItem('device_user_name', randomUser.name);
    localStorage.setItem('device_user_id', randomUser.id);
    
    setIsProfileOpen(false); 
    showToast(`已為您切換並固定新身份：\n名稱：${randomUser.name}\nID：${randomUser.id}`);
  };

  useEffect(() => {
    if (Array.isArray(MOCK_VIDEOS)) {
      MOCK_VIDEOS.forEach(video => {
        if (!video.avatar) {
          video.avatar = currentUserAvatar;
        }
      });
    }
  }, [currentUserAvatar]);

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
      name: localUsername,
      avatar: currentUserAvatar, // 💡 確保這裡是用目前最新的 currentUserAvatar
      bio: getRandomBio() 
    });
    setCurrentView('channel'); 
    setChannelTab('videos'); 
    setIsProfileOpen(false); 
    forceScrollToTop(); 
  };

  // 🟢 中文檔名完美版：統一用中文帳號名稱當作 Firebase 的文件 ID
  const handleChannelNavigation = async (channelName, channelAvatar, e) => {
    if (e) e.stopPropagation(); 
    
    setIsChannelLoading(true); 
    setCurrentView('channel');
    setChannelTab('videos');
    forceScrollToTop();

    const startTime = Date.now();
    const finalName = channelName || localUsername;
    const finalAvatar = channelAvatar || GUEST_AVATAR;

    // 1. 小葉官方帳號固定設定
    if (finalName === '小葉') {
      const shiauyeChannel = {
        name: '小葉',
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

    const initialBio = getRandomBio();
    const initialChannelData = { name: finalName, avatar: finalAvatar, bio: initialBio, userId: '' };
    setTargetChannel(initialChannelData);

    let finalId = '';

    try {
      const isMyOwnChannel = (finalName === localUsername);

      // 🎯 核心修正：不管是自己還是別人，統一用「中文名字 (finalName)」直接當作文件 ID 去尋找！
      const docRef = doc(db, 'Channels', finalName);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // 👍 如果文件已經存在，直接讀取裡面的資料
        const channelData = docSnap.data();
        finalId = channelData.userId || `user_${Math.random().toString(16).substring(2, 6)}`;
      } else {
        // 🆕 如果不存在（全新帳號或別人新頻道），直接用中文名字建立文件，配給他一組背景識別 ID
        if (isMyOwnChannel) {
          finalId = currentUserId; // 自己的話維持你原本的 currentUserId 確保前後一致
        } else {
          finalId = `user_${Math.random().toString(16).substring(2, 6)}`;
        }

        await setDoc(docRef, {
          channelName: finalName,
          avatar: finalAvatar,
          userId: finalId,
          subscriberCount: 0,
          createdAt: new Date().toISOString()
        });
        console.log(`✨ [新建成功] 已成功建立中文文件名檔案：Channels/${finalName}`);
      }

    } catch (err) {
      console.error("Firebase Channels 讀取或寫入失敗:", err);
      const suffix = finalName.split('_')[1] || 'temp';
      finalId = `user_${suffix}`;
    }

    // 2. 同步 React 狀態與 localStorage 快取
    setTargetChannelUserId(finalId);
    const updatedChannelData = {
      name: finalName,
      avatar: finalAvatar,
      bio: initialBio,
      userId: finalId
    };
    setTargetChannel(updatedChannelData);
    localStorage.setItem('leafhub_targetChannel', JSON.stringify(updatedChannelData));

    // 3. 最低轉圈延遲控制（650ms）
    const minimumDelay = 650;
    const elapsedTime = Date.now() - startTime;
    const remainingTime = minimumDelay - elapsedTime;

    if (remainingTime > 0) {
      setTimeout(() => { setIsChannelLoading(false); }, remainingTime);
    } else {
      setIsChannelLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'watch') {
      forceScrollToTop();
    }
  }, [currentView, selectedVideo]);

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
      
      let shuffledAll = shuffleArray([...validFirebaseVideos, ...MOCK_VIDEOS]);
      if (justUploadedVideo) {
        shuffledAll = shuffledAll.filter(v => v.id !== justUploadedVideo.id);
        shuffledAll = [justUploadedVideo, ...shuffledAll];
      }
      setVideos(shuffledAll);
      setIsPageLoading(false);
      setIsFirstInit(false); 
    });
    return () => unsubscribe();
  }, [justUploadedVideo]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setSubscribedChannels(prev => {
      const nextSubs = isCurrentlySubbed ? prev.filter(item => item !== channelName) : [...prev, channelName];
      localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
      return nextSubs;
    });
    await toggleChannelSubscription(channelName, !isCurrentlySubbed);
  };

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
      avatar: currentUserAvatar, 
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
        avatar: currentUserAvatar, 
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

    const temporaryLocalComment = {
      id: `temp-${Date.now()}`, 
      videoId: selectedVideo.id,
      author: localUsername,
      avatar: currentUserAvatar, 
      text: textToSend,
      likes: 0,
      replyCount: 0,
      isPending: true, 
      createdAt: new Date().toISOString()
    };

    setOptimisticComments(prev => [temporaryLocalComment, ...prev]);
    setNewCommentInput(''); 

    try {
      await addDoc(collection(db, 'comments'), {
        videoId: selectedVideo.id,
        author: localUsername,
        avatar: currentUserAvatar, 
        text: textToSend,
        likes: 0,
        replyCount: 0,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("發布評論到 Firebase 失敗：", error);
      setOptimisticComments(prev => prev.filter(item => item.id !== temporaryLocalComment.id));
      showToast("留言發布失敗，請檢查網路連線！", "error");
    }
  };

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
        views: 0,            
        time: "剛剛",            
        duration: finalDuration, 
        avatar: currentUserAvatar,
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

  const allDisplayedComments = [...optimisticComments, ...comments];

  return (
    <div>
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
          
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setIsUploadModalOpen(true)} className="upload-video-btn">
            <span className="plus-icon">+</span> 新增影片
          </button>

          <div className="avatar-container" ref={profileMenuRef}>
            <img 
              src={currentUserAvatar} alt="Avatar" className="avatar" 
              onClick={() => setIsProfileOpen(!isProfileOpen)} style={{ cursor: 'pointer' }}
            />
            {isProfileOpen && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-user-info">
                  <img src={currentUserAvatar} alt="Avatar Large" className="dropdown-avatar-large" />
                  <div>
                    <div className="dropdown-username">{localUsername}</div>
                    <div className="dropdown-email">@{currentUserId}</div>
                  </div>
                </div>
                <hr className="dropdown-divider" />
                <div className="dropdown-links">
                  <button className="dropdown-item-btn" onClick={handleMyChannelClick}>👤 我的頻道</button>
                  <button className="dropdown-item-btn" onClick={() => {
                    setInputUsername(localUsername);
                    setIsSettingsModalOpen(true);
                    setIsProfileOpen(false);
                  }}>
                    ⚙️ 帳號設定
                  </button>
                  <button className="dropdown-item-btn" onClick={handleRandomizeUser}>
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

        <main className="content-area" ref={contentAreaRef}>
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
                              // 🟢 檢查所有名字相關欄位，只要有小葉，就給小葉頭貼
                              video.author === '小葉' || 
                              video.channel === '小葉' || 
                              video.creatorName === '小葉' || 
                              video.username === '小葉'
                                ? avatarImage 
                                : (video.avatar || video.creatorAvatar || GUEST_AVATAR)
                            } 
                            alt={video.channel || video.author} 
                            className="channel-avatar channel-avatar-clickable" 
                            // 💡 點擊事件維持你原本的，但名字傳送多做幾層保險
                            onClick={(e) => handleChannelNavigation(video.channel || video.author || video.creatorName || '小葉', video.avatar || video.creatorAvatar || GUEST_AVATAR, e)}
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <h3 className="video-title">{video.title}</h3>
                            <p 
                              className="channel-name channel-name-clickable"
                              onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
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
                        videos.filter(v => subscribedChannels.includes(v.channel)).map((video) => (
                          <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                            <div className="thumbnail-wrapper">
                              <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div className="video-info-section">
                              <img src={video.avatar} alt={video.channel} className="channel-avatar channel-avatar-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer' }} />
                              <div>
                                <h3 className="video-title">{video.title}</h3>
                                <p className="channel-name channel-name-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer', display: 'inline-block' }}>{video.channel}</p>
                                <p className="video-meta">{formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}</p>
                              </div>
                            </div>
                          </div>
                        ))
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
                        watchHistory.map((video, idx) => (
                          <div key={`history-${video.id}-${idx}`} className="video-card" onClick={() => handleVideoClick(video)}>
                            <div className="thumbnail-wrapper">
                              <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div className="video-info-section">
                              <img src={video.avatar} alt={video.channel} className="channel-avatar channel-avatar-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer' }} />
                              <div>
                                <h3 className="video-title">{video.title}</h3>
                                <p className="channel-name channel-name-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer', display: 'inline-block' }}>{video.channel}</p>
                                <p className="video-meta">上次觀看過</p>
                              </div>
                            </div>
                          </div>
                        ))
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
                        videos.filter(v => likedVideoIds.includes(v.id)).map((video) => (
                          <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                            <div className="thumbnail-wrapper">
                              <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div className="video-info-section">
                              <img src={video.avatar} alt={video.channel} className="channel-avatar channel-avatar-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer' }} />
                              <div>
                                <h3 className="video-title">{video.title}</h3>
                                <p className="channel-name channel-name-clickable" onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)} style={{ cursor: 'pointer', display: 'inline-block' }}>{video.channel}</p>
                                <p className="video-meta">{formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}</p>
                              </div>
                            </div>
                          </div>
                        ))
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
                        <div className="channel-header-info" style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', paddingLeft: '8px' }}>
                          <img src={targetChannel?.avatar} alt="Channel Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff6a00' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                              <h1 style={{ fontSize: '32px', margin: '0 -20px 0 0', color: '#fff' }}>{targetChannel?.name}</h1>
                              {targetChannel?.name !== localUsername && (
                                <button className={`sub-action-btn ${subscribedChannels.includes(targetChannel?.name) ? 'is-subbed' : ''}`} onClick={() => toggleSubscribe(targetChannel?.name)} style={{ padding: '8px 20px', fontSize: '14px' }}>
                                  {subscribedChannels.includes(targetChannel?.name) ? '✓ 已訂閱' : '訂閱'}
                                </button>
                              )}
                            </div>
                            {/* 🟢 修正：優先從 targetChannel 讀取，再用 targetChannelUserId 當作備份 */}
                            <p style={{ color: '#aaa', margin: '8px 0 6px 0', fontSize: '15px' }}>
                              @{targetChannel?.userId || targetChannelUserId} •&nbsp;
                              {formatSubscribers(liveSubscriberCount)}位訂閱者 • {videos.filter(v => v.channel === targetChannel?.name).length} 部影片
                            </p>
                            <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到 {targetChannel?.name} 的個人技術與娛樂分享空間。</p>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="channel-tabs-bar" style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '8px' }}>
                      <button onClick={() => setChannelTab('videos')} style={{ background: 'transparent', border: 'none', color: channelTab === 'videos' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'videos' ? '3px solid #ff6a00' : '3px solid transparent' }}>影片</button>
                      <button onClick={() => setChannelTab('about')} style={{ background: 'transparent', border: 'none', color: channelTab === 'about' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'about' ? '3px solid #ff6a00' : '3px solid transparent' }}>關於</button>
                    </div>

                    {channelTab === 'videos' ? (
                      <div className="video-grid">
                        {videos.filter(video => 
                          // 💡 1. 多重過濾防線：如果當前在看小葉頻道，只要影片任何欄位有寫小葉，就全部抓出來！
                          targetChannel?.name === '小葉' 
                            ? (String(video.channel) === '小葉' || String(video.author) === '小葉' || String(video.creatorName) === '小葉' || String(video.username) === '小葉')
                            : (video.channel === targetChannel?.name)
                        ).map((video) => (
                          <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                            <div className="thumbnail-wrapper">
                              <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                              <span className="video-duration">{video.duration}</span>
                            </div>
                            <div className="video-info-section">
                              {/* 💡 2. 大頭貼防線：當前是小葉頻道，或者影片作者是小葉，百分之百強制亮出小葉精美頭貼 */}
                              <img 
                                src={
                                  targetChannel?.name === '小葉' || String(video.author) === '小葉' || String(video.channel) === '小葉' || String(video.creatorName) === '小葉'
                                    ? avatarImage 
                                    : (video.avatar || video.creatorAvatar || GUEST_AVATAR)
                                } 
                                alt={video.channel} 
                                className="channel-avatar" 
                              />
                              <div>
                                <h3 className="video-title">{video.title}</h3>
                                {/* 💡 3. 名稱欄位防錯修正 */}
                                <p className="channel-name">{video.channel || video.author || '小葉'}</p>
                                <p className="video-meta">{formatViews(video.views)} • {video.createdAt ? formatTimeAgo(video.createdAt) : (video.time || '剛剛')}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                              {/* 💡 4. 如果是小葉，可以強行給一個好看的固定訂閱數（12.8萬），如果是其他人則走原本的 live 數據 */}
                              {selectedVideo.channel === '小葉' ? '12.8萬' : formatSubscribers(liveSubscriberCount)} 位訂閱者
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
                          <input type="text" placeholder="留下你的公開評論..." className="comment-text-input" value={newCommentInput} onChange={(e) => setNewCommentInput(e.target.value)} />
                          <button type="submit" className="comment-submit-btn" disabled={!newCommentInput.trim()}>發布</button>
                        </form>

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
                <input className="comment-text-input" type="text" placeholder="請輸入吸引人的影片標題..." value={newVideoTitle} onChange={(e) => setNewVideoTitle(e.target.value)} disabled={isAnalyzing} required />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>YouTube 影片網址</label>
                <input className="comment-text-input" type="url" placeholder="https://www.youtube.com/watch?v=..." value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} disabled={isAnalyzing} required />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>影片類別</label>
                <select value={newVideoCategory} onChange={(e) => setNewVideoCategory(e.target.value)} disabled={isAnalyzing} style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: '8px', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                  {UPLOAD_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="clear-btn" onClick={() => setIsUploadModalOpen(false)} disabled={isAnalyzing}>取消</button>
                <button type="submit" className="comment-submit-btn" style={{ height: '36px' }} disabled={isAnalyzing}>
                  {isAnalyzing ? '上傳中...' : '確認上傳'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 設定 Modal */}
      {isSettingsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsModalOpen(false)}>
          <div className="upload-modal-window" onClick={(e) => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #222', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>⚙️ 帳號設定</h2>
              <button className="close-modal-btn" onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={handleUpdateUsernameSubmit} className="modal-body-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '14px' }}>自訂帳號名稱</label>
                <input className="comment-text-input" type="text" placeholder="請輸入您的新名稱..." value={inputUsername} onChange={(e) => setInputUsername(e.target.value)} required />
              </div>
              <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="clear-btn" onClick={() => setIsSettingsModalOpen(false)}>取消</button>
                <button type="submit" className="comment-submit-btn" style={{ height: '36px' }}>確認儲存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}