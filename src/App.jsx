import { useState } from 'react' // 或者是你原本有的 import 項目...
import './App.css'
import myAvatar from './src/assets/163braces.jpg'

const CHANNEL_NAME = "小葉"; 
const CHANNEL_AVATAR = myAvatar; 

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
    videoUrl: 'https://www.youtube.com/watch?v=mK25i1yx0-M', // 👈 這裡可以直接貼網址了！
    get youtubeId() { return extractYoutubeId(this.videoUrl); }, // 自動保留原本的 youtubeId 屬性，避免前端其他地方壞掉
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
    videoUrl: 'https://www.youtube.com/watch?v=_25Lw6RxrLE', // 👈 範例：https://youtu.be/xxxxxx
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
  }
];

const CATEGORIES = ['全部', '熱門音樂', '遊戲直播', '程式設計', '旅遊 Vlog', '美食烹飪'];

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [likedVideoIds, setLikedVideoIds] = useState([]);
  const [subscribedChannels, setSubscribedChannels] = useState(['我的 YouTube 頻道']);
  const [watchHistory, setWatchHistory] = useState([]);
  
  const [commentsData, setCommentsData] = useState({
    '1': [{ author: '忠實觀眾', text: '太棒了！終於等到新片！', time: '2 小時前' }]
  });
  const [newCommentInput, setNewCommentInput] = useState('');

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
      { author: '隨機訪客(你)', text: newCommentInput, time: '剛剛' },
      ...currentComments
    ];

    setCommentsData({ ...commentsData, [selectedVideo.id]: updatedComments });
    setNewCommentInput('');
  };

  const getFilteredVideos = () => {
    return MOCK_VIDEOS.filter(video => {
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
        <div className="logo" onClick={() => { setCurrentView('home'); setActiveCategory('全部'); }}>
          <span className="logo-badge">▶</span> VHub
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
        
        <div>
          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop" alt="Avatar" className="avatar" />
        </div>
      </nav>

      {/* 主要內容包裝架構 */}
      <div className="main-wrapper">
        
        {/* 🔵 左側導覽欄 */}
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
                {MOCK_VIDEOS.filter(v => subscribedChannels.includes(v.channel)).length > 0 ? (
                  MOCK_VIDEOS.filter(v => subscribedChannels.includes(v.channel)).map((video) => (
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
                {MOCK_VIDEOS.filter(v => likedVideoIds.includes(v.id)).length > 0 ? (
                  MOCK_VIDEOS.filter(v => likedVideoIds.includes(v.id)).map((video) => (
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

          {/* 5️⃣ 影片內頁播放視圖（💡 這裡進化成 YouTube 嵌入播放器 💡） */}
          {currentView === 'watch' && selectedVideo && (
            <div className="watch-layout">
              <div className="watch-main-content">
                
                {/* 📺 呼叫 YouTube 官方播放器（不佔流量與空間，且具備流暢快轉與畫質調整） */}
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
                      {subscribedChannels.includes(selectedVideo.channel) ? '✓ 已訂閱' : '🔔 訂閱頻道'}
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
                {MOCK_VIDEOS.filter(v => v.id !== selectedVideo.id).map(video => (
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