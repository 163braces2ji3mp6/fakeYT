import { useState, useEffect, useRef } from 'react'
import './App.css'
// 💡 引入 Firebase 服務層
import { subscribeToVideos, uploadVideoToFirebase, incrementVideoViews } from './firebaseService';
// 🟢 從你的 mockShite 同時引入留言與影片
import { mockComments, MOCK_VIDEOS } from './mockShite';
// 💡 引入 Firebase Firestore 核心元件來處理評論
import { db } from './firebase'; 
import { collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, increment } from 'firebase/firestore';

import avatarImage from './assets/163braces.jpg' 

// 1. 🟢 定義標準訪客的預設灰色頭貼 (採用內聯 SVG，100% 支援且不需額外載入外部圖片檔案)
const GUEST_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%232a2a2a'/><circle cx='16' cy='13' r='5' fill='%23888888'/><path d='M16 20c-4.5 0-8 2.5-8 5v1h16v-1c0-2.5-3.5-5-8-5z' fill='%23888888'/></svg>";

const getInitialUserInfo = () => {
  // 先檢查這台裝置的瀏覽器本地儲存 (localStorage) 是否已經有帳號紀錄
  const savedName = localStorage.getItem('device_user_name');

  // 1. 自動辨識你目前的開發裝置：如果是本機環境 (localhost 或 127.0.0.1)
  const isMyDevelopDevice = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // 2. 貼心備用功能：如果未來部署到線上，網址後方加上 ?user=小葉 就能強制切換
  const urlParams = new URLSearchParams(window.location.search);
  const isForcedMe = urlParams.get('user') === '小葉';

  // 如果是你本機、或是強制指定、或是本來就記錄為小葉
  if (isMyDevelopDevice || isForcedMe || savedName === '小葉') {
    localStorage.setItem('device_user_name', '小葉');
    return { name: '小葉', avatar: avatarImage };
  }

  // 3. 如果是其他裝置，且之前已經來過並生成過訪客名稱，直接沿用
  if (savedName) {
    return { name: savedName, avatar: GUEST_AVATAR };
  }

  // 4. 其他全新進來的裝置：隨機組合出「不重複」的趣味中文暱稱
  const adjectives = ["熱心的", "潛水的", "路過的", "機智的", "佛系的", "神祕的", "愛看片的", "吃飽的", "打瞌睡的", "隨和的"];
  const nouns = ["小柴犬", "貓咪君", "水豚拉", "小企鵝", "太空人", "大熊貓", "珍奶控", "魔法師", "乾飯人", "小樹懶"];
  
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  // 加上 3 位數隨機數字尾碼，確保不同裝置之間產生的名字「絕對不會重複」
  const randomNum = Math.floor(100 + Math.random() * 900);
  const uniqueChineseName = `${randomAdj}${randomNoun}_${randomNum}`; // 例如：神祕的小柴犬_582

  localStorage.setItem('device_user_name', uniqueChineseName);
  return { name: uniqueChineseName, avatar: GUEST_AVATAR };
};

// 執行初始化並獲取當前裝置的身分
const userInfo = getInitialUserInfo();

// 🟢 重點：維持原本的變數名稱不變，下方所有 LAYOUT 元件和 Firebase 參照完全不用動！
const CHANNEL_NAME = userInfo.name; 
const CHANNEL_AVATAR = userInfo.avatar;

// 🛠️ 這裡單純保留給上傳按鈕解析 YouTube URL 使用
function extractYoutubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

/* ==========================================================================
   🚀 核心功能：Firebase 評論即時同步與 Mock 資料混合邏輯
   ========================================================================== */

/**
 * 💡 貼心功能：即時監聽目前影片的 Firebase 評論，如果雲端沒有，就拿獨立檔案的 mockComments 當基底！
 */
export function subscribeToComments(selectedVideo, setCommentsCallback) {
  if (!selectedVideo?.id) return () => {};

  const videoId = selectedVideo.id;
  const youtubeId = selectedVideo.youtubeId;

  const commentsQuery = query(
    collection(db, 'comments'),
    where('videoId', '==', videoId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(commentsQuery, (snapshot) => {
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
}

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; 
  }
  return arr;
};

const CATEGORIES = ['全部', '遊戲', '直播中', '音樂'];

function formatViews(views) {
  if (views === undefined || views === null) return '0次';
  if (typeof views === 'string') return views; 
  const numViews = Number(views);
  if (numViews >= 10000) {
    return `${(numViews / 10000).toFixed(1)}萬次`;
  }
  return `${numViews}次`;
}

const generateRandomName = () => {
  const adjectives = ['憤怒的', '迷路的', '臭屁的', '優雅的', '超頂的', '可憐啊', '傲嬌的', '被釣魚的', '瘋狂的', '純情的'];
  const nouns = ['地瓜球', '脆皮豬', '小丑', 'NPC', '超人', '卡皮巴拉', '可樂餅', '傻逼', '工程師', '潛水員'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000); 
  
  return `${adj}${noun}#${randomNum}`;
};

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [videos, setVideos] = useState([]); 
  const [rawFirebaseVideos, setRawFirebaseVideos] = useState([]);
  
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // 💡 用於動態渲染被點擊的頻道資訊（點擊不同人的影片能進入該作者的頻道頁）
  const [targetChannel, setTargetChannel] = useState({
    name: CHANNEL_NAME,
    avatar: CHANNEL_AVATAR
  });

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

  const [localUsername] = useState(() => {
    const savedName = localStorage.getItem('leafhub_username');
    if (savedName) return savedName;
    const newName = generateRandomName();
    localStorage.setItem('leafhub_username', newName);
    return newName;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const contentAreaRef = useRef(null);
  const [channelTab, setChannelTab] = useState('videos');

  // 💡 用來儲存多個子回覆輸入框的動態 Refs
  const replyInputRefs = useRef({});

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false); 

  const [comments, setComments] = useState([]);
  const [newCommentInput, setNewCommentInput] = useState('');
  
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [expandedReplyComments, setExpandedReplyComments] = useState({}); 
  const [replyInputs, setReplyInputs] = useState({}); 
  const [commentReplies, setCommentReplies] = useState({}); 

  const [optimisticComments, setOptimisticComments] = useState([]);
  const [optimisticReplies, setOptimisticReplies] = useState([]);

  // 💡 自動對齊補上圖片頭像：因為 MOCK_VIDEOS 移到了外部，在這裡統一注入本地引入的圖片
  useEffect(() => {
    if (Array.isArray(MOCK_VIDEOS)) {
      MOCK_VIDEOS.forEach(video => {
        if (!video.avatar) {
          video.avatar = CHANNEL_AVATAR;
        }
      });
    }
  }, []);

  const forceScrollToTop = () => {
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    if (contentAreaRef.current) contentAreaRef.current.scrollTop = 0;
    const wrapper = document.querySelector('.main-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
  };

  const triggerBufferAndReload = () => {
    setIsPageLoading(true);
    const mixedVideos = shuffleArray([...rawFirebaseVideos, ...MOCK_VIDEOS]);
    setVideos(mixedVideos);
    setTimeout(() => {
      setIsPageLoading(false);
    }, 600);
  };

  const handleHomeNavigation = () => {
    setSearchQuery('');
    setActiveCategory('全部');

    if (currentView === 'watch') {
      setVideos(shuffleArray([...rawFirebaseVideos, ...MOCK_VIDEOS]));
      setCurrentView('home');
    } else {
      setCurrentView('home');
      triggerBufferAndReload();
    }
  };

  const handleMyChannelClick = () => {
    setTargetChannel({
      name: CHANNEL_NAME,
      avatar: CHANNEL_AVATAR
    });
    setCurrentView('channel'); 
    setChannelTab('videos'); 
    setIsProfileOpen(false); 
    forceScrollToTop(); 
  };

  // 💡 跳轉至特定頻道的共享觸發方法
  const handleChannelNavigation = (channelName, channelAvatar, e) => {
    if (e) e.stopPropagation(); // 防止觸發外層卡片的 onClick 事件
    setTargetChannel({
      name: channelName || CHANNEL_NAME,
      avatar: channelAvatar || CHANNEL_AVATAR
    });
    setCurrentView('channel');
    setChannelTab('videos');
    forceScrollToTop();
  };

  useEffect(() => {
    if (currentView === 'watch') {
      forceScrollToTop();
      requestAnimationFrame(forceScrollToTop);
    }
  }, [currentView, selectedVideo]);

  // ✨ 留言即時同步 Effect
  useEffect(() => {
    if (!selectedVideo?.id) return;

    setIsCommentsLoading(true);
    setOptimisticComments([]);
    setOptimisticReplies([]); 
    setExpandedReplyComments({});

    const unsubscribe = subscribeToComments(selectedVideo, (mixedComments) => {
      setComments(mixedComments);
      setIsCommentsLoading(false);
      
      setOptimisticComments(prev => 
        prev.filter(localComment => 
          !mixedComments.some(serverComment => 
            serverComment.text === localComment.text && serverComment.author === localComment.author
          )
        )
      );
    });

    return () => unsubscribe();
  }, [selectedVideo]);

  // 子回覆即時監聽機制 Effect
  useEffect(() => {
    const activeCommentIds = Object.keys(expandedReplyComments).filter(id => expandedReplyComments[id]);
    if (activeCommentIds.length === 0) return;

    const unsubscribes = activeCommentIds.map(commentId => {
      if (commentId.startsWith('temp-') || commentId.length < 10) {
        return () => {};
      }

      const replyQuery = query(
        collection(db, 'replies'),
        where('commentId', '==', commentId),
        orderBy('createdAt', 'asc')
      );

      return onSnapshot(replyQuery, (snapshot) => {
        const repliesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCommentReplies(prev => ({ ...prev, [commentId]: repliesList }));

        setOptimisticReplies(prev => 
          prev.filter(localReply => 
            !(localReply.commentId === commentId && repliesList.some(serverReply => 
              serverReply.text === localReply.text && serverReply.author === localReply.author
            ))
          )
        );
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [expandedReplyComments]);

  // 💡 Firebase 串接監聽點
  useEffect(() => {
    const unsubscribe = subscribeToVideos((firebaseVideos) => {
      const validFirebaseVideos = Array.isArray(firebaseVideos) ? firebaseVideos : [];
      setRawFirebaseVideos(validFirebaseVideos);
      const mixedVideos = shuffleArray([...validFirebaseVideos, ...MOCK_VIDEOS]);
      setVideos(mixedVideos);
      setIsPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
    }, 1200);

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

  const toggleSubscribe = (channelName) => {
    setSubscribedChannels(prev => {
      const nextSubs = prev.includes(channelName) ? prev.filter(item => item !== channelName) : [...prev, channelName];
      localStorage.setItem('leafhub_subscriptions', JSON.stringify(nextSubs));
      return nextSubs;
    });
  };

  const handleCommentLike = async (commentId, isMock) => {
    if (isMock || commentId.startsWith('temp-')) {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c));
      return;
    }
    try {
      const commentRef = doc(db, 'comments', commentId);
      await updateDoc(commentRef, {
        likes: increment(1)
      });
    } catch (error) {
      console.error("更新留言按讚失敗:", error);
    }
  };

  // 💡 切換展開狀態時，若變為展開，則自動將焦點 Focus 到對應的 input 上
  const toggleReplySection = (commentId) => {
    setExpandedReplyComments(prev => {
      const nextState = {
        ...prev,
        [commentId]: !prev[commentId]
      };

      if (nextState[commentId]) {
        setTimeout(() => {
          if (replyInputRefs.current[commentId]) {
            replyInputRefs.current[commentId].focus();
          }
        }, 50); // 短暫延遲確保 DOM 已成功展開並渲染
      }

      return nextState;
    });
  };

  const handleAddReplySubmit = async (e, commentId) => {
    e.preventDefault();
    const replyText = replyInputs[commentId]?.trim();
    if (!replyText) return;

    const isMockComment = commentId.startsWith('temp-') || commentId.length < 10;

    const temporaryLocalReply = {
      id: `temp-reply-${Date.now()}`,
      commentId,
      author: localUsername,
      text: replyText,
      isPending: !isMockComment, 
      createdAt: new Date().toISOString()
    };

    setOptimisticReplies(prev => [...prev, temporaryLocalReply]);
    setReplyInputs(prev => ({ ...prev, [commentId]: '' }));

    if (isMockComment) {
      return;
    }

    try {
      await addDoc(collection(db, 'replies'), {
        commentId,
        author: localUsername,
        text: replyText,
        createdAt: new Date().toISOString()
      });

      const commentRef = doc(db, 'comments', commentId);
      await updateDoc(commentRef, {
        replyCount: increment(1)
      });
    } catch (error) {
      console.error("發布回覆失敗:", error);
      setOptimisticReplies(prev => prev.filter(item => item.id !== temporaryLocalReply.id));
      alert("回覆雲端儲存失敗！");
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
        avatar: CHANNEL_AVATAR, // 🟢 💡 新增這行：讓送出留言的頭貼跟目前頻道身分完全同步！
        text: textToSend,
        likes: 0,
        replyCount: 0,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("發布評論到 Firebase 失敗：", error);
      setOptimisticComments(prev => prev.filter(item => item.id !== temporaryLocalComment.id));
      alert("留言發布失敗，請檢查網路連線！");
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
      alert('請輸入完整資訊！');
      return;
    }

    setIsAnalyzing(true); 
    const finalDuration = await fetchVideoDuration(ytId);

    try {
      const dataToUpload = {
        title: newVideoTitle,
        channel: CHANNEL_NAME,
        views: 0,            
        time: "剛剛",            
        duration: finalDuration, 
        avatar: CHANNEL_AVATAR,
        videoUrl: newVideoUrl,
        youtubeId: ytId,
        thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`
      };
      
      await uploadVideoToFirebase(dataToUpload);

      setNewVideoTitle('');
      setNewVideoUrl('');
      setIsUploadModalOpen(false);
      
      setSearchQuery('');
      setActiveCategory('全部');
      setCurrentView('home');
      alert("上傳成功！");
    } catch (error) {
      console.error("❌ 雲端上傳嚴重失敗：", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getFilteredVideos = () => {
    const currentVideos = Array.isArray(videos) ? videos : [];
    return currentVideos.filter(video => {
      const matchesSearch = video.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            video.channel?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === '全部' || video.title?.includes(activeCategory) || video.channel?.includes(activeCategory);
      return matchesSearch && matchesCategory;
    });
  };

  const allDisplayedComments = [...optimisticComments, ...comments];

  return (
    <div>
      {/* 🟢 頂部導覽列 */}
      <nav className="navbar">
        <div className="logo-hub-style" onClick={handleHomeNavigation}>
          <span className="logo-text-white">Leaf</span>
          <span className="logo-badge-orange">hub</span>
        </div>

        <div className="search-bar">
          <input 
            type="text" 
            placeholder="搜尋" 
            className="search-input" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (currentView !== 'watch') setCurrentView('home');
            }}
          />
          <button className="search-btn" onClick={() => alert(`正在搜尋: ${searchQuery}`)}>
            <svg viewBox="0 0 24 24" className="search-icon-svg">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
            </svg>
          </button>
        </div>
          
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#aaa', fontSize: '12px', background: '#222', padding: '6px 12px', borderRadius: '12px' }}>
            🏷️ 訪客：{localUsername}
          </span>

          <button 
            onClick={() => setIsUploadModalOpen(true)}
            style={{
              background: '#ff6a00', color: '#fff', border: 'none', padding: '8px 16px',
              borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '6px', fontSize: '14px',
              boxShadow: '0 2px 8px rgba(255, 106, 0, 0.4)', transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span>➕</span> 新增影片
          </button>

          <div className="avatar-container" ref={profileMenuRef}>
            <img 
              src={CHANNEL_AVATAR} alt="Avatar" className="avatar" 
              onClick={() => setIsProfileOpen(!isProfileOpen)} style={{ cursor: 'pointer' }}
            />
            {isProfileOpen && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-user-info">
                  <img src={CHANNEL_AVATAR} alt="Avatar Large" className="dropdown-avatar-large" />
                  <div>
                    <div className="dropdown-username">{CHANNEL_NAME}</div>
                    <div className="dropdown-email">@yehh_0000</div>
                  </div>
                </div>
                <hr className="dropdown-divider" />
                <div className="dropdown-links">
                  <button className="dropdown-item-btn" onClick={handleMyChannelClick}>👤 我的頻道</button>
                  <button className="dropdown-item-btn" onClick={() => alert('切換帳戶中！')}>🔄 切換帳戶</button>
                  <button className="dropdown-item-btn" onClick={() => alert('登出成功！')}>🚪 登出</button>
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
              <button 
                className={`sidebar-btn ${currentView === 'home' ? 'active' : ''}`} 
                onClick={handleHomeNavigation}
              >
                🏠 首頁
              </button>
              <button className={`sidebar-btn ${currentView === 'subscriptions' ? 'active' : ''}`} onClick={() => setCurrentView('subscriptions')}>📺 訂閱頻道</button>
              <hr style={{ border: 'none', borderTop: '1px solid #1f1f1f', margin: '12px 0' }} />
              <div className="sidebar-section-title">我的專區</div>
              <button className={`sidebar-btn ${currentView === 'history' ? 'active' : ''}`} onClick={() => setCurrentView('history')}>🕒 觀看紀錄</button>
              <button className={`sidebar-btn ${currentView === 'liked' ? 'active' : ''}`} onClick={() => setCurrentView('liked')}>🔥 喜歡的影片</button>
            </div>
          </aside>
        )}

        <main className="content-area" ref={contentAreaRef}>
          {isPageLoading ? (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              width: '100%', height: '70vh'
            }}>
              <div className="yt-buffering-spinner"></div>
            </div>
          ) : (
            <>
              {/* 1️⃣ 首頁視圖 */}
              {currentView === 'home' && (
                <>
                  <div className="category-bar">
                    {CATEGORIES.map((category) => (
                      <button key={category} onClick={() => setActiveCategory(category)} className={`category-btn ${activeCategory === category ? 'active' : ''}`}>{category}</button>
                    ))}
                  </div>
                  <div className="video-grid">
                    {getFilteredVideos().map((video) => (
                      <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                        <div className="thumbnail-wrapper">
                          <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                          <span className="video-duration">{video.duration}</span>
                        </div>
                        <div className="video-info-section">
                          {/* 💡 點擊頭貼進入頻道 */}
                          <img 
                            src={video.avatar} 
                            alt={video.channel} 
                            className="channel-avatar channel-avatar-clickable" 
                            onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <h3 className="video-title">{video.title}</h3>
                            {/* 💡 點擊頻道名稱進入頻道 */}
                            <p 
                              className="channel-name channel-name-clickable"
                              onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                              style={{ cursor: 'pointer', display: 'inline-block' }}
                            >
                              {video.channel}
                            </p>
                            <p className="video-meta">{formatViews(video.views)} • {video.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 2️⃣ 訂閱頻道視圖 */}
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
                            {/* 💡 點擊頭貼進入頻道 */}
                            <img 
                              src={video.avatar} 
                              alt={video.channel} 
                              className="channel-avatar channel-avatar-clickable" 
                              onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <h3 className="video-title">{video.title}</h3>
                              {/* 💡 點擊名稱進入頻道 */}
                              <p 
                                className="channel-name channel-name-clickable"
                                onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                              >
                                {video.channel}
                              </p>
                              <p className="video-meta">{formatViews(video.views)} • {video.time}</p>
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

              {/* 3️⃣ 觀看紀錄視圖 */}
              {currentView === 'history' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 className="view-page-title">🕒 我的觀看紀錄</h2>
                    {watchHistory.length > 0 && (
                      <button className="clear-btn" onClick={() => {
                        setWatchHistory([]);
                        localStorage.removeItem('leafhub_watchHistory');
                      }}>
                        🗑️ 清除所有紀錄
                      </button>
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
                            {/* 💡 點擊頭貼進入頻道 */}
                            <img 
                              src={video.avatar} 
                              alt={video.channel} 
                              className="channel-avatar channel-avatar-clickable" 
                              onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <h3 className="video-title">{video.title}</h3>
                              {/* 💡 點擊名稱進入頻道 */}
                              <p 
                                className="channel-name channel-name-clickable"
                                onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                              >
                                {video.channel}
                              </p>
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

              {/* 4️⃣ 喜歡的影片視圖 */}
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
                            {/* 💡 點擊頭貼進入頻道 */}
                            <img 
                              src={video.avatar} 
                              alt={video.channel} 
                              className="channel-avatar channel-avatar-clickable" 
                              onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <h3 className="video-title">{video.title}</h3>
                              {/* 💡 點擊名稱進入頻道 */}
                              <p 
                                className="channel-name channel-name-clickable"
                                onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                              >
                                {video.channel}
                              </p>
                              <p className="video-meta">{formatViews(video.views)}</p>
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

              {/* 5️⃣ 動態「頻道」專屬頁面視圖 */}
              {currentView === 'channel' && (
                <div className="channel-page-wrapper">
                  <div className="channel-banner" style={{
                    width: '100%', height: '180px',
                    background: 'linear-gradient(135deg, #1f1f1f 0%, #111111 50%, #ff6a00 100%)',
                    borderRadius: '16px', marginBottom: '24px', border: '1px solid #222'
                  }}></div>

                  <div className="channel-header-info" style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', paddingLeft: '8px' }}>
                    <img src={targetChannel.avatar} alt="Channel Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff6a00' }} />
                    <div>
                      <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', color: '#fff' }}>{targetChannel.name}</h1>
                      <p style={{ color: '#aaa', margin: '0 0 6px 0', fontSize: '15px' }}>
                        @{targetChannel.name === CHANNEL_NAME ? 'yehh_0000' : 'user_' + Math.floor(Math.random() * 10000)} • 1.2萬位訂閱者 • {videos.filter(v => v.channel === targetChannel.name).length} 部影片
                      </p>
                      <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到 {targetChannel.name} 的個人技術與娛樂分享空間。</p>
                    </div>
                  </div>

                  <div className="channel-tabs-bar" style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '8px' }}>
                    <button onClick={() => setChannelTab('videos')} style={{ background: 'transparent', border: 'none', color: channelTab === 'videos' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'videos' ? '3px solid #ff6a00' : '3px solid transparent' }}>影片</button>
                    <button onClick={() => setChannelTab('about')} style={{ background: 'transparent', border: 'none', color: channelTab === 'about' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'about' ? '3px solid #ff6a00' : '3px solid transparent' }}>關於</button>
                  </div>

                  {channelTab === 'videos' ? (
                    <div className="video-grid">
                      {videos.filter(v => v.channel === targetChannel.name).map((video) => (
                        <div key={video.id} className="video-card" onClick={() => handleVideoClick(video)}>
                          <div className="thumbnail-wrapper">
                            <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                            <span className="video-duration">{video.duration}</span>
                          </div>
                          <div className="video-info-section">
                            <img src={video.avatar} alt={video.channel} className="channel-avatar" />
                            <div>
                              <h3 className="video-title">{video.title}</h3>
                              <p className="channel-name">{video.channel}</p>
                              <p className="video-meta">{formatViews(video.views)} • {video.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="channel-about-section" style={{ padding: '16px 8px', color: '#ccc', lineHeight: '1.8', maxWidth: '800px' }}>
                      <h3>簡介</h3>
                      <p>嗨！我是 {targetChannel.name}。主要分享科技觀察與網路各種奇奇怪怪的迷因研究。</p>
                    </div>
                  )}
                </div>
              )}

              {/* 6️⃣ 影片內頁播放視圖 */}
              {currentView === 'watch' && selectedVideo && (
                <div className="watch-layout">
                  <div className="watch-main-content">
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
                      {isVideoLoading ? (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10
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
                        {/* 💡 內頁點擊頭貼進入頻道 */}
                        <img 
                          src={selectedVideo.avatar} 
                          alt="Channel" 
                          className="channel-avatar-large channel-avatar-clickable" 
                          onClick={(e) => handleChannelNavigation(selectedVideo.channel, selectedVideo.avatar, e)}
                          style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }} 
                        />
                        <div>
                          {/* 💡 內頁點擊名稱進入頻道 */}
                          <div 
                            className="channel-name-large channel-name-clickable" 
                            onClick={(e) => handleChannelNavigation(selectedVideo.channel, selectedVideo.avatar, e)}
                            style={{ fontWeight: 'bold', color: '#fff', cursor: 'pointer' }}
                          >
                            {selectedVideo.channel}
                          </div>
                          <div className="channel-subs-count" style={{ color: '#aaa', fontSize: '12px' }}>你的專屬展示頻道</div>
                        </div>
                        <button className={`sub-action-btn ${subscribedChannels.includes(selectedVideo.channel) ? 'is-subbed' : ''}`} onClick={() => toggleSubscribe(selectedVideo.channel)}>
                          {subscribedChannels.includes(selectedVideo.channel) ? '✓ 已訂閱' : '訂閱'}
                        </button>
                      </div>

                      <div className="video-interactions-block">
                        <button className={`like-action-btn ${likedVideoIds.includes(selectedVideo.id) ? 'is-liked' : ''}`} onClick={() => toggleLike(selectedVideo.id)}>
                          {likedVideoIds.includes(selectedVideo.id) ? '❤️ 已按讚' : '👍 給個讚'}
                        </button>
                        <span className="views-date-text" style={{ marginLeft: '12px', color: '#aaa' }}>{formatViews(selectedVideo.views)} • 發布於 {selectedVideo.time}</span>
                      </div>
                    </div>

                    {/* 💬 評論區區塊 */}
                    <div className="comments-section-wrapper">
                      <h3>💬 評論區 ({allDisplayedComments.length})</h3>
                      <form onSubmit={handleAddComment} className="comment-form-box">
                        <input 
                          type="text" 
                          placeholder="留下你的公開評論..." 
                          className="comment-text-input" value={newCommentInput}
                          onChange={(e) => setNewCommentInput(e.target.value)}
                        />
                        <button type="submit" className="comment-submit-btn" disabled={!newCommentInput.trim()}>發布</button>
                      </form>

                      {/* 💬 評論列表區塊 */}
                      <div className="comment-list-container">
                        {isCommentsLoading ? (
                          <div style={{
                            display: 'flex', flexDirection: 'column', justifyContent: 'center', 
                            alignItems: 'center', padding: '40px 0', gap: '12px', color: '#888'
                          }}>
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
                                  <div className="comment-user-avatar" style={{ marginTop: '2px' }}>👤</div>
                                  
                                  {/* 名稱與留言內容垂直對齊的容器 */}
                                  <div className="comment-content-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    
                                    {/* 使用者名稱與時間 */}
                                    <div className="comment-user-meta" style={{ display: 'flex', alignItems: 'center' }}>
                                      <span className="comment-author-name" style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{comment.author}</span>
                                      <span className="comment-time-ago" style={{ marginLeft: '8px', color: '#666', fontSize: '12px' }}>
                                        {comment.isPending ? '傳送中...' : '剛剛'}
                                      </span>
                                    </div>
                                    
                                    {/* 留言內文：排列在名字正下方 */}
                                    <p className="comment-user-text" style={{ margin: '2px 0 6px 0', color: '#eee', fontSize: '14px', lineHeight: '1.5' }}>{comment.text}</p>
                                    
                                    {/* 👍 按讚按鈕 與 💬 回覆按鈕功能列 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '2px' }}>
                                      <button 
                                        onClick={() => handleCommentLike(cid, isMock)}
                                        style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                      >
                                        👍 <span style={{ color: '#888' }}>{comment.likes || 0}</span>
                                      </button>
                                      
                                      <button 
                                        onClick={() => toggleReplySection(cid)}
                                        style={{ background: 'transparent', border: 'none', color: '#ff6a00', cursor: 'pointer', fontSize: '13px', padding: 0, fontWeight: '500' }}
                                      >
                                        回覆
                                      </button>
                                    </div>

                                    {/* 🔄 展開回覆區的下拉觸發按鈕 */}
                                    {(totalReplyCount > 0) && (
                                      <div style={{ marginTop: '6px' }}>
                                        <button 
                                          onClick={() => toggleReplySection(cid)}
                                          style={{ background: 'transparent', border: 'none', color: '#3ea6ff', cursor: 'pointer', fontSize: '13px', padding: 0, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                                        >
                                          {isExpanded ? '▼ 收起回覆' : `▶ ${totalReplyCount} 則回覆`}
                                        </button>
                                      </div>
                                    )}

                                    {/* 📂 被展開的子回覆清單與子輸入框 */}
                                    {isExpanded && (
                                      <div style={{ paddingLeft: '20px', borderLeft: '2px solid #222', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* 子回覆列表 */}
                                        {replies.map((reply) => (
                                          <div key={reply.id} style={{ display: 'flex', gap: '10px', fontSize: '13px', background: '#0e0e0e', padding: '8px', borderRadius: '6px', opacity: reply.isPending ? 0.6 : 1 }}>
                                            <div style={{ color: '#888' }}>{reply.isPending ? '⏳' : '👤'}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <div>
                                                <span style={{ color: '#fff', fontWeight: 'bold' }}>{reply.author}</span>
                                                {reply.isPending && <span style={{ color: '#666', fontSize: '11px', marginLeft: '6px' }}>(傳送中...)</span>}
                                              </div>
                                              <p style={{ color: '#ccc', margin: '2px 0 0 0', lineHeight: '1.4' }}>{reply.text}</p>
                                            </div>
                                          </div>
                                        ))}

                                        {/* 子回覆輸入表單 */}
                                        <form onSubmit={(e) => handleAddReplySubmit(e, cid)} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                          <input 
                                            type="text" 
                                            placeholder="新增回覆..." 
                                            // 💡 綁定動態 Ref 節點
                                            ref={(el) => { replyInputRefs.current[cid] = el; }}
                                            value={replyInputs[cid] || ''}
                                            onChange={(e) => setReplyInputs(prev => ({ ...prev, [cid]: e.target.value }))}
                                            style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '6px 12px', borderRadius: '16px', fontSize: '13px' }}
                                          />
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

                  {/* ➡️ 右側側邊欄推薦影片列表 */}
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
                          {/* 💡 推薦側欄點擊名稱進入頻道 */}
                          <p 
                            className="mini-card-channel channel-name-clickable"
                            onClick={(e) => handleChannelNavigation(video.channel, video.avatar, e)}
                            style={{ cursor: 'pointer', display: 'inline-block' }}
                          >
                            {video.channel}
                          </p>
                          <p className="mini-card-views">{formatViews(video.views)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 📥 彈出式影片上傳視窗模態框 */}
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
              <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="clear-btn" onClick={() => setIsUploadModalOpen(false)} disabled={isAnalyzing}>取消</button>
                <button type="submit" className="comment-submit-btn" style={{ height: '36px' }} disabled={isAnalyzing}>
                  {isAnalyzing ? '⚡ 正在解析影片結構...' : '確認上傳'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}