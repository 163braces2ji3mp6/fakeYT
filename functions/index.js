const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const YOUTUBE_API_KEY = defineSecret("YOUTUBE_API_KEY");

function formatYouTubeDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return "00:00";

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isRegionBlocked(contentDetails, regionCode = "TW") {
  const regionRestriction = contentDetails?.regionRestriction;

  if (!regionRestriction) return false;

  if (Array.isArray(regionRestriction.blocked)) {
    return regionRestriction.blocked.includes(regionCode);
  }

  if (Array.isArray(regionRestriction.allowed)) {
    return !regionRestriction.allowed.includes(regionCode);
  }

  return false;
}

exports.getYoutubeVideoInfo = onRequest(
  { secrets: [YOUTUBE_API_KEY] },
  async (req, res) => {
    try {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      const videoId = String(req.query.videoId || "").trim();

      if (!videoId) {
        return res.status(400).json({
          ok: false,
          reason: "missing_video_id",
        });
      }

      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails,status,snippet");
      url.searchParams.set("id", videoId);
      url.searchParams.set("key", YOUTUBE_API_KEY.value());

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          ok: false,
          reason: "youtube_api_error",
          detail: data,
        });
      }

      const item = data.items?.[0];

      if (!item) {
        return res.json({
          ok: true,
          playable: false,
          reason: "not_found_or_private_or_deleted",
        });
      }

      const privacyStatus = item.status?.privacyStatus;
      const embeddable = item.status?.embeddable;
      const regionBlocked = isRegionBlocked(item.contentDetails, "TW");

      const playable =
        privacyStatus === "public" &&
        embeddable !== false &&
        regionBlocked === false;

      const durationIso = item.contentDetails?.duration || "PT0S";

      return res.json({
        ok: true,
        playable,
        reason: playable ? "ok" : "not_playable",
        videoId,
        title: item.snippet?.title || "",
        duration: formatYouTubeDuration(durationIso),
        durationIso,
        privacyStatus,
        embeddable,
        regionBlocked,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        reason: "server_error",
        message: error.message,
      });
    }
  }
);