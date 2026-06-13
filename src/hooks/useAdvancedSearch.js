import { useMemo } from "react";

// ✅ 簡單模糊比對（不用裝套件）
const fuzzyMatch = (text, query) => {
  if (!text || !query) return false;

  text = text.toLowerCase();
  query = query.toLowerCase();

  let tIndex = 0;
  let qIndex = 0;

  while (tIndex < text.length && qIndex < query.length) {
    if (text[tIndex] === query[qIndex]) {
      qIndex++;
    }
    tIndex++;
  }

  return qIndex === query.length;
};

// ✅ 計算搜尋分數（排序核心）
const calculateScore = (video, query) => {
  if (!query) return 0;

  const lowerQuery = query.toLowerCase();

  const title = (video.title || "").toLowerCase();
  const channel = (
    video.channel ||
    video.author ||
    video.creatorName ||
    video.username ||
    ""
  ).toLowerCase();

  let score = 0;

  // ✅ 精準 match（權重最高）
  if (title.includes(lowerQuery)) score += 100;
  if (channel.includes(lowerQuery)) score += 60;

  // ✅ 模糊 match
  if (fuzzyMatch(title, lowerQuery)) score += 40;
  if (fuzzyMatch(channel, lowerQuery)) score += 20;

  // ✅ 熱度加權
  const views = Number(video.views || video.viewCount || 0);
  const likes = Number(video.likes || video.likeCount || 0);

  score += Math.log10(views + 1) * 10;
  score += Math.log10(likes + 1) * 5;

  return score;
};

// ✅ 主 hook
export const useAdvancedSearch = ({
  videos,
  searchQuery,
  activeCategory,
  isVideoVisible
}) => {

  const result = useMemo(() => {
    let filtered = Array.isArray(videos) ? [...videos] : [];

    // ✅ 可見性
    filtered = filtered.filter(v => isVideoVisible(v));

    // ✅ 分類
    if (activeCategory !== "全部") {
      filtered = filtered.filter(v => v.category === activeCategory);
    }

    // ✅ 沒搜尋 → 直接回傳
    if (!searchQuery) return filtered;

    const query = searchQuery.trim().toLowerCase();

    // ✅ 打分數
    const scored = filtered.map(video => ({
      video,
      score: calculateScore(video, query)
    }));

    // ✅ 過濾掉完全不相關
    const valid = scored.filter(item => item.score > 0);

    // ✅ 排序
    valid.sort((a, b) => b.score - a.score);

    return valid.map(item => item.video);
  }, [videos, searchQuery, activeCategory]);

  return result;
};

// ✅ 搜尋建議（dropdown）
export const getSearchSuggestions = (videos, query) => {
  if (!query) return [];

  const lowerQuery = query.toLowerCase();

  const suggestions = new Set();

  videos.forEach(v => {
    const title = v.title || "";
    const channel =
      v.channel ||
      v.author ||
      v.creatorName ||
      v.username ||
      "";

    if (title.toLowerCase().includes(lowerQuery)) {
      suggestions.add(title);
    }

    if (channel.toLowerCase().includes(lowerQuery)) {
      suggestions.add(channel);
    }
  });

  return Array.from(suggestions).slice(0, 8);
};