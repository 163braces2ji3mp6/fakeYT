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
  
  // 💡 用於控制個人頻道頁面內部的標籤切換 ('videos' | 'about')
  const [channelTab, setChannelTab] = useState('videos');

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
    ],
    '3': [
      { author: 'Kobe_fans_no1', text: '這絕對是今年看過最扯的企劃，經費在燃燒的聲音 💸', time: '1 天前' },
      { author: '吃貨小可', text: '看到一半肚子突然好餓，等等去買宵夜...。', time: '18 小時前' },
      { author: '夜貓子00', text: '封面騙進來的，但內容超燃，收藏了！', time: '12 小時前' }
    ],
    '4': [
      { author: 'Tech_Geek_99', text: '這次的評測很客觀，剛好在猶豫要不要入手，感謝課長排雷！', time: '2 天前' },
      { author: '不爭氣地笑了', text: '笑死，12:45 那個翻車現場到底是怎樣啦哈哈哈！', time: '1 天前' },
      { author: '路過的水母', text: '聽說這部影片有隱藏彩蛋，有人找到了嗎？', time: '4 小時前' }
    ],
    '5': [
      { author: 'Gamer_Life', text: '大推！這關卡我卡了三天，看完你的走位直接一把過！', time: '3 天前' },
      { author: '敲碗大隊長', text: '更新速度太慢了啦～生產線的驢都不敢這樣歇，快點更新！', time: '2 天前' },
      { author: '潛水密探', text: '默默關注很久了，這集真的封神，期待突破百萬訂閱。', time: '6 小時前' }
    ],
    '6': [
      { author: 'Vibe_Master', text: '戴上耳機聽直接原地升天，這音質跟調音太舒服了 🎧', time: '4 天前' },
      { author: 'Chill_Guy_Taiwan', text: '適合深夜工作或開車的時候聽，整個人都放鬆下來了。', time: '2 天前' },
      { author: '莎莎醬', text: '雖然看得似懂非懂，但反正先點讚就對了！👍', time: '10 小時前' }
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
        {/* 這裡修改了 Logo 的 HTML 結構，使其符合黑橘潮流風格 */}
        <div className="logo-hub-style" onClick={() => { setCurrentView('home'); setActiveCategory('全部'); }}>
          <span className="logo-text-white">Leaf</span>
          <span className="logo-badge-orange">hub</span>
        </div>

        <div className="search-bar">
          <input 
            type="text" 
            placeholder="搜尋影片標題..." 
            className="search-input" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (currentView !== 'watch') setCurrentView('home');
            }}
          />
        </div>
          
        <div className="avatar-container" ref={profileMenuRef}>
          <img 
            src={CHANNEL_AVATAR} 
            alt="Avatar" 
            className="avatar" 
            onClick={() => setIsProfileOpen(!isProfileOpen)} 
            style={{ cursor: 'pointer' }}
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
      </nav>

      {/* 主要內容包裝架構 */}
      <div className="main-wrapper">
        
        {/* 🔵 左側導覽欄：💡 當進入觀看影片頁面時，將左側欄隱藏 */}
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

        {/* 🟡 主要內容區 */}
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

          {/* ⚙️ 5️⃣ 新增：「我的頻道」專屬頁面視圖 */}
          {currentView === 'channel' && (
            <div className="channel-page-wrapper">
              {/* 頻道橫幅 Banner */}
              <div className="channel-banner" style={{
                width: '100%',
                height: '180px',
                background: 'linear-gradient(135deg, #1f1f1f 0%, #111111 50%, #ff6a00 100%)',
                borderRadius: '16px',
                marginBottom: '24px',
                border: '1px solid #222'
              }}></div>

              {/* 頻道頭像與基本資訊 */}
              <div className="channel-header-info" style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', paddingLeft: '8px' }}>
                <img src={CHANNEL_AVATAR} alt="My Channel Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff6a00' }} />
                <div>
                  <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', color: '#fff' }}>{CHANNEL_NAME}</h1>
                  <p style={{ color: '#aaa', margin: '0 0 6px 0', fontSize: '15px' }}>@yehh_0000 • 1.2萬位訂閱者 • {MOCK_VIDEOS.length} 部影片</p>
                  <p style={{ color: '#666', margin: '0', fontSize: '14px' }}>歡迎來到小葉的個人技術與娛樂分享空間。這裡紀錄了各種有趣的生活觀察與網路迷因分析！</p>
                </div>
              </div>

              {/* 頻道分頁標籤按鈕 */}
              <div className="channel-tabs-bar" style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #222', marginBottom: '24px', paddingLeft: '8px' }}>
                <button 
                  onClick={() => setChannelTab('videos')} 
                  style={{
                    background: 'transparent', border: 'none', color: channelTab === 'videos' ? '#ff6a00' : '#888',
                    padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
                    borderBottom: channelTab === 'videos' ? '3px solid #ff6a00' : '3px solid transparent', transition: 'all 0.2s'
                  }}
                >
                  影片
                </button>
                <button 
                  onClick={() => setChannelTab('about')} 
                  style={{
                    background: 'transparent', border: 'none', color: channelTab === 'about' ? '#ff6a00' : '#888',
                    padding: '12px 0', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
                    borderBottom: channelTab === 'about' ? '3px solid #ff6a00' : '3px solid transparent', transition: 'all 0.2s'
                  }}
                >
                  關於
                </button>
              </div>

              {/* 分頁內容切換 */}
              {channelTab === 'videos' ? (
                <div className="video-grid">
                  {/* 精準撈出所有屬於這個頻道的創作影片 */}
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
                  <h3 style={{ color: '#fff', marginBottom: '12px' }}>簡介</h3>
                  <p>嗨！我是小葉。主要分享科技觀察、時事釣魚解析以及網路各種奇奇怪怪的迷因研究。</p>
                  <p>本頻道致力於提供高畫質且充滿思辨（以及垃圾笑話）的精緻內容，喜歡的話記得訂閱並開啟小鈴鐺！</p>
                  <hr style={{ border: 'none', borderTop: '1px solid #222', margin: '24px 0' }} />
                  <h3 style={{ color: '#fff', marginBottom: '12px' }}>頻道詳細資料</h3>
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
                  key={selectedVideo.id}
                  className="video-player-simulation"
                  src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0`}
                  title={selectedVideo.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>

                <h1 className="watch-video-title">{selectedVideo.title}</h1>
                
                <div className="watch-actions-row">
                  <div className="channel-info-block">
                    <img src={selectedVideo.avatar} alt="Channel" className="channel-avatar-large" />
                    <div>
                      <div className="channel-name-large">{selectedVideo.channel}</div>
                      <div className="channel-subs-count">你的專屬展示頻道</div>
                    </div>
                    <button 
                      className={`sub-action-btn ${subscribedChannels.includes(selectedVideo.channel) ? 'is-subbed' : ''}`}
                      onClick={() => toggleSubscribe(selectedVideo.channel)}
                    >
                      {subscribedChannels.includes(selectedVideo.channel) ? '✓ 已訂閱' : '訂閱'}
                    </button>
                  </div>

                  <div className="video-interactions-block">
                    <button 
                      className={`like-action-btn ${likedVideoIds.includes(selectedVideo.id) ? 'is-liked' : ''}`}
                      onClick={() => toggleLike(selectedVideo.id)}
                    >
                      {likedVideoIds.includes(selectedVideo.id) ? '❤️ 已按讚' : '👍 給個讚'}
                    </button>
                    <span className="views-date-text">{selectedVideo.views} • 發布於 {selectedVideo.time}</span>
                  </div>
                </div>

                {/* 評論區 */}
                <div className="comments-section-wrapper">
                  <h3>💬 評論區 ({(commentsData[selectedVideo.id] || []).length})</h3>
                  <form onSubmit={handleAddComment} className="comment-form-box">
                    <input 
                      type="text" 
                      placeholder="留下你的公開評論..." 
                      className="comment-text-input"
                      value={newCommentInput}
                      onChange={(e) => setNewCommentInput(e.target.value)}
                    />
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

              {/* 右側推薦欄 */}
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
    </div>
  );
}