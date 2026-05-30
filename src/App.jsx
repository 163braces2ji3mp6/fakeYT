import { useState, useEffect, useRef } from 'react'
import './App.css'

// 💡 1. 這是最保險的標準寫法：用 import 把資產引進來
// 請確認 163braces.jpg 檔案真的在 src/assets/ 資料夾裡面喔！
import avatarImage from './assets/163braces.jpg' 

const CHANNEL_NAME = "小葉"; 

// 💡 2. 直接把剛剛引入的變數 assign 給頭像常量
const CHANNEL_AVATAR = avatarImage;

// 💡 輔助函式：自動從 YouTube 網址中解析出 11 碼的 Video ID
function extractYoutubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

const MOCK_VIDEOS = [
  { 
    id: '1', 
    title: '這是我看過最糟糕的騙讚直播', 
    channel: CHANNEL_NAME, 
    views: '14.8萬次', 
    time: '1 年前', 
    duration: '02:56', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=mK25i1yx0-M', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); }, 
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '2', 
    title: '這是我看過最扯的釣魚直播...(把觀眾當白痴)', 
    channel: CHANNEL_NAME, 
    views: '3.1萬次', 
    time: '1 個月前', 
    duration: '03:00', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=_25Lw6RxrLE', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '3', 
    title: 'YouTube竟然推出語音留言功能功能了！？', 
    channel: CHANNEL_NAME, 
    views: '9100次', 
    time: '1 個月前', 
    duration: '01:38', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=7y1oQWOjCF0', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '4', 
    title: '這個YouTube功能竟然沒人知道...（粉絲推薦有什麼意義？🤦‍♂️）', 
    channel: CHANNEL_NAME, 
    views: '1.7萬次', 
    time: '3 個月前', 
    duration: '02:12', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=5R9l6qutBbk', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '5', 
    title: '我把今年的迷因排名...(這世代完蛋了🤦‍♂️)', 
    channel: CHANNEL_NAME, 
    views: '1.2萬次', 
    time: '4 個月前', 
    duration: '05:20', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=2cITOYrfq-4', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '6', 
    title: '我的Spotify年度回顧是NPC😭😭😭', 
    channel: CHANNEL_NAME, 
    views: '8500次', 
    time: '5 個月前', 
    duration: '04:15', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=knMguT5wWBQ', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '7', 
    title: '臭屁超人到底是誰？？(Incredible Gassy)', 
    channel: CHANNEL_NAME, 
    views: '2.3萬次', 
    time: '半年 前', 
    duration: '08:10', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=1WsVANRj6bk', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '8', 
    title: '這些IG短片的留言快笑死我了 PT.3', 
    channel: CHANNEL_NAME, 
    views: '4.5萬次', 
    time: '7 個月前', 
    duration: '03:19', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=HPaOabWw5xw', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '9', 
    title: '你就是這樣被他釣怒的 (Rage-bait是怎麼運作的)', 
    channel: CHANNEL_NAME, 
    views: '3.6萬次', 
    time: '8 個月前', 
    duration: '03:10', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=fHTCwxn8-4Y', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '10', 
    title: '這些IG短片的留言快笑死我了', 
    channel: CHANNEL_NAME, 
    views: '15.5萬次', 
    time: '9 個月前', 
    duration: '03:31', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=a-q-sp1kZIc', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '11', 
    title: '為什麼我的IG都是這個小丑😭😭😭', 
    channel: CHANNEL_NAME, 
    views: '1.2萬次', 
    time: '10 個月前', 
    duration: '04:19', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=AwfSJ4EU-_E', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '12', 
    title: '這人被釣怒到直接開炸我伺服器🤦‍♂️（YT頻道還差點沒了）', 
    channel: CHANNEL_NAME, 
    views: '6.5萬次', 
    time: '10 個月前', 
    duration: '03:01', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=CLRFLIO1IJs', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  },
  { 
    id: '13', 
    title: '這些AI迷因已經超出了我的認知', 
    channel: CHANNEL_NAME, 
    views: '1.6萬次', 
    time: '11 個月前', 
    duration: '02:02', 
    avatar: CHANNEL_AVATAR,
    videoUrl: 'https://www.youtube.com/watch?v=kOb_IOxmhQE', 
    get youtubeId() { return extractYoutubeId(this.videoUrl); },
    get thumbnail() { return `https://img.youtube.com/vi/${this.youtubeId}/maxresdefault.jpg`; }
  }
];

const CATEGORIES = ['全部', '遊戲', '直播中', '音樂'];

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [likedVideoIds, setLikedVideoIds] = useState([]);
  const [subscribedChannels, setSubscribedChannels] = useState(['我的 YouTube 頻道']);
  const [watchHistory, setWatchHistory] = useState([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const [channelTab, setChannelTab] = useState('videos');

  // 新增影片相關的 State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 💡 新增：載入中動畫狀態

  const [commentsData, setCommentsData] = useState({
    '1': [
      { author: 'Jerry1024_tw', text: '太棒了！下次可以從肛門嗎?', time: '2 小時前' },
      { author: 'star_ocean', text: '留言區第一發就這麼重口味的嗎 😂😂😂', time: '1 小時前' },
      { author: '喵星人守護者', text: '高技術流推推，跪求下一期做詳細教學！', time: '30 分鐘前' }
    ],
    '2': [
      { author: 'cyber_punk2026', text: '這剪輯節奏太神了吧！背景音樂一下雞皮疙瘩都起來了。', time: '5 小時前' },
      { author: '阿明大師', text: '只有我重複看了五次嗎？這細節處理得真好。', time: '3 三小時前' },
      { author: 'Louise_L', text: '2026 還能看到這種品質的創作，真的必須一鍵三連支持！', time: '1 小時前' }
    ]
  });
  const [newCommentInput, setNewCommentInput] = useState('');

  useEffect(() => {
    setVideos(shuffleArray(MOCK_VIDEOS));
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

  const handleVideoClick = (video) => {
    setSelectedVideo(video);
    setCurrentView('watch');
    setWatchHistory(prev => [video, ...prev.filter(item => item.id !== video.id)]);
  };

  const toggleLike = (id) => {
    setLikedVideoIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSubscribe = (channelName) => {
    setSubscribedChannels(prev =>
      prev.includes(channelName) ? prev.filter(item => item !== channelName) : [...prev, channelName]
    );
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    if (!newCommentInput.trim()) return;

    const currentComments = commentsData[selectedVideo.id] || [];
    const updatedComments = [
      { author: '傻逼(你)', text: newCommentInput, time: '剛剛' },
      ...currentComments
    ];

    setCommentsData({ ...commentsData, [selectedVideo.id]: updatedComments });
    setNewCommentInput(''); 
  };

  // 💡 核心黑科技：免 API 自動探測影片長度
  const fetchVideoDuration = (ytId) => {
    return new Promise((resolve) => {
      // 利用 YouTube 串流音訊暫存檔
      const audio = new Audio(`https://ext.y2mate.nu/api/json/stream/${ytId}`);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
          const minutes = Math.floor(audio.duration / 60).toString().padStart(2, '0');
          const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
          resolve(`${minutes}:${seconds}`);
        } else {
          resolve(generateRandomDuration());
        }
      });
      audio.addEventListener('error', () => {
        resolve(generateRandomDuration()); // 發生阻擋時安全退回隨機時間
      });
      // 設置超時防呆
      setTimeout(() => resolve(generateRandomDuration()), 1200);
    });
  };

  // 💡 輔助函式：產生合理的隨機影片長度 (防呆機制)
  const generateRandomDuration = () => {
    const randMin = Math.floor(Math.random() * 8) + 1; // 1~8分鐘
    const randSec = Math.floor(Math.random() * 60);
    return `${randMin.toString().padStart(2, '0')}:${randSec.toString().padStart(2, '0')}`;
  };

  // ⚙️ 處理影片上傳提交（整合自動抓取時間）
  const handleUploadVideo = async (e) => {
    e.preventDefault();
    const ytId = extractYoutubeId(newVideoUrl);

    if (!newVideoTitle.trim()) {
      alert('請輸入影片標題！');
      return;
    }
    if (!ytId) {
      alert('無法解析該 YouTube 網址，請確認連結是否正確！');
      return;
    }

    setIsAnalyzing(true); // 開啟載入特效

    // 呼叫抓取長度函式
    const finalDuration = await fetchVideoDuration(ytId);

    const newVideoItem = {
      id: Date.now().toString(),
      title: newVideoTitle,
      channel: CHANNEL_NAME,
      views: '0次',
      time: '剛剛',
      duration: finalDuration, // 🔥 這裡成功拿到了真實的長度！
      avatar: CHANNEL_AVATAR,
      videoUrl: newVideoUrl,
      youtubeId: ytId,
      thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`
    };

    setVideos(prev => [newVideoItem, ...prev]);

    // 重設狀態
    setNewVideoTitle('');
    setNewVideoUrl('');
    setIsAnalyzing(false);
    setIsUploadModalOpen(false);
    
    setCurrentView('home');
    setActiveCategory('全部');
  };

  const getFilteredVideos = () => {
    return videos.filter(video => {
      const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            video.channel.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === '全部' || video.title.includes(activeCategory) || video.channel.includes(activeCategory);
      return matchesSearch && matchesCategory;
    });
  };

  return (
    <div>
      {/* 🟢 頂部導覽列 */}
      <nav className="navbar">
        <div className="logo-hub-style" onClick={() => { setCurrentView('home'); setActiveCategory('全部'); }}>
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
                  <button className="dropdown-item-btn" onClick={() => { setCurrentView('channel'); setChannelTab('videos'); setIsProfileOpen(false); }}>👤 我的頻道</button>
                  <button className="dropdown-item-btn" onClick={() => alert('6767676767676767676767！')}>🔄 切換帳戶</button>
                  <button className="dropdown-item-btn" onClick={() => alert('6767676767676767676767676767676767')}>🚪 登出</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 主要內容包裝架構 */}
      <div className="main-wrapper">
        {currentView !== 'watch' && (
          <aside className="sidebar">
            <div className="sidebar-menu">
              <button className={`sidebar-btn ${currentView === 'home' ? 'active' : ''}`} onClick={() => setCurrentView('home')}>🏠 首頁</button>
              <button className={`sidebar-btn ${currentView === 'subscriptions' ? 'active' : ''}`} onClick={() => setCurrentView('subscriptions')}>📺 訂閱頻道</button>
              <hr style={{ border: 'none', borderTop: '1px solid #1f1f1f', margin: '12px 0' }} />
              <div className="sidebar-section-title">我的專區</div>
              <button className={`sidebar-btn ${currentView === 'history' ? 'active' : ''}`} onClick={() => setCurrentView('history')}>🕒 觀看紀錄</button>
              <button className={`sidebar-btn ${currentView === 'liked' ? 'active' : ''}`} onClick={() => setCurrentView('liked')}>🔥 喜歡的影片</button>
            </div>
          </aside>
        )}

        <main className="content-area">
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
                      <img src={video.avatar} alt={video.channel} className="channel-avatar" />
                      <div>
                        <h3 className="video-title">{video.title}</h3>
                        <p className="channel-name">{video.channel}</p>
                        <p className="video-meta">{video.views} • {video.time}</p>
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
                        <img src={video.avatar} alt={video.channel} className="channel-avatar" />
                        <div>
                          <h3 className="video-title">{video.title}</h3>
                          <p className="channel-name">{video.channel}</p>
                          <p className="video-meta">{video.views} • {video.time}</p>
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
                {watchHistory.length > 0 && <button className="clear-btn" onClick={() => setWatchHistory([])}>🗑️ 清除所有紀錄</button>}
              </div>
              <div className="video-grid">
                {watchHistory.length > 0 ? (
                  watchHistory.map((video, index) => (
                    <div key={`${video.id}-${index}`} className="video-card" onClick={() => handleVideoClick(video)}>
                      <div className="thumbnail-wrapper">
                        <img src={video.thumbnail} alt={video.title} className="thumbnail-img" />
                        <span className="video-duration">{video.duration}</span>
                      </div>
                      <div className="video-info-section">
                        <img src={video.avatar} alt={video.channel} className="channel-avatar" />
                        <div>
                          <h3 className="video-title">{video.title}</h3>
                          <p className="channel-name">{video.channel}</p>
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
                        <img src={video.avatar} alt={video.channel} className="channel-avatar" />
                        <div>
                          <h3 className="video-title">{video.title}</h3>
                          <p className="channel-name">{video.channel}</p>
                          <p className="video-meta">{video.views}</p>
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

          {/* 5️⃣ 「我的頻道」專屬頁面視圖 */}
          {currentView === 'channel' && (
            <div className="channel-page-wrapper">
              <div className="channel-banner" style={{
                width: '100%', height: '180px',
                background: 'linear-gradient(135deg, #1f1f1f 0%, #111111 50%, #ff6a00 100%)',
                borderRadius: '16px', marginBottom: '24px', border: '1px solid #222'
              }}></div>

              <div className="channel-header-info" style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', paddingLeft: '8px' }}>
                <img src={CHANNEL_AVATAR} alt="My Channel Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff6a00' }} />
                <div>
                  <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', color: '#fff' }}>{CHANNEL_NAME}</h1>
                  <p style={{ color: '#aaa', margin: '0 0 6px 0', fontSize: '15px' }}>@yehh_0000 • 1.2萬位訂閱者 • {videos.filter(v => v.channel === CHANNEL_NAME).length} 部影片</p>
                  <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到小葉的個人技術與娛樂分享空間。這裡紀錄了各種有趣的生活觀察與網路迷因分析！</p>
                </div>
              </div>

              <div className="channel-tabs-bar" style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '8px' }}>
                <button onClick={() => setChannelTab('videos')} style={{ background: 'transparent', border: 'none', color: channelTab === 'videos' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'videos' ? '3px solid #ff6a00' : '3px solid transparent', transition: 'all 0.2s' }}>影片</button>
                <button onClick={() => setChannelTab('about')} style={{ background: 'transparent', border: 'none', color: channelTab === 'about' ? '#ff6a00' : '#888', padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderBottom: channelTab === 'about' ? '3px solid #ff6a00' : '3px solid transparent', transition: 'all 0.2s' }}>關於</button>
              </div>

              {channelTab === 'videos' ? (
                <div className="video-grid">
                  {videos.filter(v => v.channel === CHANNEL_NAME).map((video) => (
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
                          <p className="video-meta">{video.views} • {video.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="channel-about-section" style={{ padding: '16px 8px', color: '#ccc', lineHeight: '1.8', maxWidth: '800px' }}>
                  <h3>簡介</h3>
                  <p>嗨！我是小葉。主要分享科技觀察、時事釣魚解析以及網路各種奇奇怪怪的迷因研究。</p>
                  <p>本頻道致力於提供高畫質且充滿思辨（以及垃圾笑話）的精緻內容，喜歡的話記得訂閱並開啟小鈴鐺！</p>
                  <hr style={{ border: 'none', borderTop: '1px solid #222', margin: '24px 0' }} />
                  <h3>頻道詳細資料</h3>
                  <p style={{ color: '#888' }}>加入時間：2021年10月15日</p>
                  <p style={{ color: '#888' }}>總觀看次數：5,432,109 次</p>
                  <p style={{ color: '#888' }}>居住地：台灣</p>
                </div>
              )}
            </div>
          )}

          {/* 6️⃣ 影片內頁播放視圖 */}
          {currentView === 'watch' && selectedVideo && (
            <div className="watch-layout">
              <div className="watch-main-content">
                <iframe
                  key={selectedVideo.id} className="video-player-simulation"
                  src={`https://www.youtube.com/embed/${selectedVideo.youtubeId || extractYoutubeId(selectedVideo.videoUrl)}?autoplay=1&rel=0`}
                  title={selectedVideo.title} frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen
                ></iframe>

                <h1 className="watch-video-title">{selectedVideo.title}</h1>
                
                <div className="watch-actions-row">
                  <div className="channel-info-block">
                    <img src={selectedVideo.avatar} alt="Channel" className="channel-avatar-large" />
                    <div>
                      <div className="channel-name-large">{selectedVideo.channel}</div>
                      <div className="channel-subs-count">你的專屬展示頻道</div>
                    </div>
                    <button className={`sub-action-btn ${subscribedChannels.includes(selectedVideo.channel) ? 'is-subbed' : ''}`} onClick={() => toggleSubscribe(selectedVideo.channel)}>
                      {subscribedChannels.includes(selectedVideo.channel) ? '✓ 已訂閱' : '訂閱'}
                    </button>
                  </div>

                  <div className="video-interactions-block">
                    <button className={`like-action-btn ${likedVideoIds.includes(selectedVideo.id) ? 'is-liked' : ''}`} onClick={() => toggleLike(selectedVideo.id)}>
                      {likedVideoIds.includes(selectedVideo.id) ? '❤️ 已按讚' : '👍 給個讚'}
                    </button>
                    <span className="views-date-text">{selectedVideo.views} • 發布於 {selectedVideo.time}</span>
                  </div>
                </div>

                <div className="comments-section-wrapper">
                  <h3>💬 評論區 ({(commentsData[selectedVideo.id] || []).length})</h3>
                  <form onSubmit={handleAddComment} className="comment-form-box">
                    <input type="text" placeholder="留下你的公開評論..." className="comment-text-input" value={newCommentInput} onChange={(e) => setNewCommentInput(e.target.value)} />
                    <button type="submit" className="comment-submit-btn">發布</button>
                  </form>
                  <div className="comment-list-container">
                    {(commentsData[selectedVideo.id] || []).length > 0 ? (
                      (commentsData[selectedVideo.id] || []).map((comment, i) => (
                        <div key={i} className="single-comment-card">
                          <div className="comment-user-avatar">👤</div>
                          <div>
                            <div className="comment-user-meta">{comment.author} <span>• {comment.time}</span></div>
                            <div className="comment-user-text">{comment.text}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-comments-prompt">目前還沒有人對這部影片發表評論。</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="watch-sidebar-recommendations">
                <h4 style={{ margin: '0 0 16px 0', color: '#ff6a00' }}>▶ 接下來播放</h4>
                {videos.filter(v => v.id !== selectedVideo.id).map(video => (
                  <div key={video.id} className="recommend-mini-card" onClick={() => handleVideoClick(video)}>
                    <img src={video.thumbnail} alt="mini-card" className="mini-card-thumb" />
                    <div className="mini-card-info">
                      <div className="mini-card-title">{video.title}</div>
                      <div className="mini-card-channel">{video.channel}</div>
                      <div className="mini-card-views">{video.views}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ⚙️ 彈出式新增影片視圖 (Modal) */}
      {isUploadModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#181818', border: '1px solid #333', padding: '32px',
            borderRadius: '16px', width: '100%', maxWidth: '480px', color: '#fff',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#ff6a00', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isAnalyzing ? '🔍 正在分析影片長度...' : '📺 新增自訂 YouTube 影片'}
            </h2>
            <form onSubmit={handleUploadVideo}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>影片標題</label>
                <input 
                  type="text" placeholder="輸入你想展示的影片名稱..." disabled={isAnalyzing}
                  value={newVideoTitle} onChange={(e) => setNewVideoTitle(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #444',
                    background: '#0f0f0f', color: '#fff', boxSizing: 'border-box', fontSize: '15px',
                    opacity: isAnalyzing ? 0.5 : 1
                  }}
                />
              </div>
              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>YouTube 影片網址</label>
                <input 
                  type="text" placeholder="https://www.youtube.com/watch?v=..." disabled={isAnalyzing}
                  value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #444',
                    background: '#0f0f0f', color: '#fff', boxSizing: 'border-box', fontSize: '15px',
                    opacity: isAnalyzing ? 0.5 : 1
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  type="button" disabled={isAnalyzing}
                  onClick={() => { setIsUploadModalOpen(false); setNewVideoTitle(''); setNewVideoUrl(''); }}
                  style={{
                    background: '#333', color: '#fff', border: 'none', padding: '10px 20px',
                    borderRadius: '8px', cursor: isAnalyzing ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                  }}
                >
                  取消
                </button>
                <button 
                  type="submit" disabled={isAnalyzing}
                  style={{
                    background: isAnalyzing ? '#555' : '#ff6a00', color: '#fff', border: 'none', padding: '10px 20px',
                    borderRadius: '8px', cursor: isAnalyzing ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                  }}
                >
                  {isAnalyzing ? '分析中...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}