// src/mockComments.js

const CHANNEL_NAME = "小葉"; 
// 💡 注意：由於圖片在 App.jsx 引入，這裡我們先預留 avatar 欄位，稍後在 App 中統一對齊頭像
const CHANNEL_AVATAR = null; 

// 🛠️ 乾淨、正確無雙重轉譯的 YouTube ID 提取正則表達式
function extractYoutubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

// 靜態影片資料結構產生器
const createMockVideo = (id, title, videoUrl, views, time, duration) => {
  const ytId = extractYoutubeId(videoUrl);
  return {
    id,
    title,
    channel: CHANNEL_NAME,
    views,
    time,
    duration,
    avatar: CHANNEL_AVATAR, // 稍後在 App.jsx 補上圖片
    videoUrl,
    youtubeId: ytId,
    thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`
  };
};

/* ==========================================================================
   📦 導出的靜態影片資料 (MOCK_VIDEOS)
   ========================================================================== */
export const MOCK_VIDEOS = [
  createMockVideo('1', '這幕我看過最糟糕的騙讚直播', 'https://www.youtube.com/watch?v=mK25i1yx0-M', '14.8萬次', '1 年前', '02:56'),
  createMockVideo('2', '這是我看過最扯的釣魚直播...(把觀眾當白痴)', 'https://www.youtube.com/watch?v=_25Lw6RxrLE', '3.1萬次', '1 個月前', '03:00'),
  createMockVideo('3', 'YouTube竟然推出語音留言功能功能了！？', 'https://www.youtube.com/watch?v=7y1oQWOjCF0', '9100次', '1 個月前', '01:38'),
  createMockVideo('4', '這個YouTube功能竟然沒人知道...（粉絲推薦有什麼意義？🤦‍♂️）', 'https://www.youtube.com/watch?v=5R9l6qutBbk', '1.7萬次', '3 個月前', '02:12'),
  createMockVideo('5', '我把今年的迷因排名...(這世代完蛋了🤦‍♂️)', 'https://www.youtube.com/watch?v=2cITOYrfq-4', '1.2萬次', '4 個月前', '05:20'),
  createMockVideo('6', '我的Spotify年度回顧是NPC😭😭😭', 'https://www.youtube.com/watch?v=knMguT5wWBQ', '8500次', '5 個月前', '04:15'),
  createMockVideo('7', '臭屁超人到底是誰？？(Incredible Gassy)', 'https://www.youtube.com/watch?v=1WsVANRj6bk', '2.3萬次', '半年 前', '08:10'),
  createMockVideo('8', 'these IG short comments are killing me PT.3', 'https://www.youtube.com/watch?v=HPaOabWw5xw', '4.5萬次', '7 個月前', '03:19'),
  createMockVideo('9', '你就是這樣被他釣怒的 (Rage-bait是怎麼運作的)', 'https://www.youtube.com/watch?v=fHTCwxn8-4Y', '3.6萬次', '8 個月前', '03:10'),
  createMockVideo('10', '這些IG短片的留言快笑死我了', 'https://www.youtube.com/watch?v=a-q-sp1kZIc', '15.5萬次', '9 個月前', '03:31'),
  createMockVideo('11', '為什麼我的IG都是這個小丑😭😭😭', 'https://www.youtube.com/watch?v=AwfSJ4EU-_E', '1.2萬次', '10 個月前', '04:19'),
  createMockVideo('12', '這人被釣怒到直接開炸我伺服器🤦‍♂️（YT頻道還差點沒了）', 'https://www.youtube.com/watch?v=CLRFLIO1IJs', '6.5萬次', '10 個月前', '03:01'),
  createMockVideo('13', '這些AI迷因已經超出了我的認知', 'https://www.youtube.com/watch?v=kOb_IOxmhQE', '1.6萬次', '11 個月前', '02:02')
];

/* ==========================================================================
   💬 導出的靜態評論資料 (mockComments)
   ========================================================================== */
export const mockComments = [
  // 影片 7：臭屁超人到底是誰？？（在 App.jsx 裡是 MOCK_VIDEOS[6]，ID 為 '7'）
  {
    id: "c1",
    videoId: "7",
    author: "迷因考察家",
    text: "沒想到居然有人認真做了一期影片來考察臭屁超人，這真的是近期最瘋狂的迷因了 😂",
    isPending: false
  },
  {
    id: "c2",
    videoId: "7",
    author: "童年崩壞",
    text: "看到麥當勞叔叔出現在畫面上，我真的整個人都不好了，這到底是什麼魔幻連動...",
    isPending: false
  },

  // 影片 9：你就是這樣被他釣怒的 (Rage-bait)（在 App.jsx 裡是 MOCK_VIDEOS[8]，ID 為 '9'）
  {
    id: "c3",
    videoId: "9",
    author: "網路清流",
    text: "這集真的太中肯！現在很多短影音故意講錯常識或表現得很無腦，真的都是為了騙留言區的流量，大家真的不要再上當了。",
    isPending: false
  },
  {
    id: "c4",
    videoId: "9",
    author: "不小心上鉤的人",
    text: "看完這期真的默默把剛剛去別人留言區吵架的字刪掉...原來我就是那個提供互動率的盤子 🤦‍♂️",
    isPending: false
  },

  // 影片 11：為什麼我的IG都是這個小丑😭😭😭（在 App.jsx 裡是 MOCK_VIDEOS[10]，ID 為 '11'）
  {
    id: "c5",
    videoId: "11",
    author: "演算法受害者",
    text: "我的天，我以為只有我被這個小丑洗板！現在只要一滑到短影片就是他的臉，音樂還超級洗腦，救命！",
    isPending: false
  },
  {
    id: "c6",
    videoId: "11",
    author: "迷因小鬼",
    text: "現在每天晚上睡覺腦袋裡都有聲音 😭",
    isPending: false
  },

  // 影片 10：這些IG短片的留言快笑死我了（在 App.jsx 裡是 MOCK_VIDEOS[9]，ID 為 '10'）
  {
    id: "c7",
    videoId: "10",
    author: "脆友日常",
    text: "地獄梗發源地現在根本移居到短影音留言區了，有時候看留言比看影片本身還要精彩好幾倍！",
    isPending: false
  },
  {
    id: "c8",
    videoId: "10",
    author: "功德林常客",
    text: "看完這期影片，我覺得我這輩子積的功德又全部歸零了，留言區那些人真的太壞了 🤣",
    isPending: false
  },

  // 影片 2：這是我看過最扯的釣魚直播...（在 App.jsx 裡是 MOCK_VIDEOS[1]，ID 為 '2'）
  {
    id: "c9",
    videoId: "2",
    author: "反詐騙先鋒",
    text: "每次滑到那種一直重複播放錄影、畫面字體寫著『不點讚不放手』的直播，我都直接檢舉。感謝小葉出來踢爆！",
    isPending: false
  },
  {
    id: "c10",
    videoId: "2",
    author: "吃瓜群眾",
    text: "最扯的是還有一堆人在那裡刷跑車，這世界的智商稅真的收不完 🤦‍♂️",
    isPending: false
  }
];