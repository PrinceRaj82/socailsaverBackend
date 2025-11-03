import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getVideoId, getPlaylistId, fetchTranscript } from "../utils/youtubeUtils.js"; // ✅ correct relative path


dotenv.config();
const router = express.Router();
const FLASK_URL = process.env.FLASK_URL;
const API_KEY = process.env.API_KEY;
const YT_API_KEY = process.env.YT_API_KEY

router.post("/meta", async (req, res) => {
  try {
    const { url, fields } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing 'url' in body" });
    }

    const response = await axios.post(
      `${FLASK_URL}/api/youtube/meta`,
      { url, fields },
      { headers: { "x-api-key": API_KEY } }
    );

    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video', async (req, res) => {
  const { url, lang } = req.query;
  if (!url) return res.status(400).json({ error: 'YouTube URL required' });

  const videoId = getVideoId(url);
  const transcript = await fetchTranscript(videoId, lang || 'en');
  res.json({ videoId, transcript });
});

router.get("/transcript", async (req, res) => {
  try {
    const { url, lang } = req.query;
    if (!url) return res.status(400).json({ error: "YouTube URL is required" });

    const videoId = getVideoId(url);

    // Fetch player info (for caption metadata)
    const playerRes = await axios.post(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyA7XLvKjJ3D2xjVuhf1wLHu7R9A3zGzE0s",
      {
        context: {
          client: { clientName: "WEB", clientVersion: "2.20240214.01.00" },
        },
        videoId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    const tracks =
      playerRes.data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ error: "No captions found for this video" });
    }

    // ✅ CASE 1: User wants all languages
    if (lang && lang.toLowerCase() === "all") {
      const allLangs = [];

      for (const track of tracks) {
        try {
          const captionUrl = track.baseUrl + "&fmt=json3";
          const captionRes = await axios.get(captionUrl);

          const transcript = captionRes.data?.events
            ?.map((event) => event.segs?.map((seg) => seg.utf8).join(""))
            .filter(Boolean)
            .join(" ");

          allLangs.push({
            language: track.languageCode,
            name: track.name?.simpleText || track.languageName || "Unknown",
            transcript: transcript || null,
          });
        } catch (e) {
          allLangs.push({
            language: track.languageCode,
            error: "Failed to fetch transcript for this language",
          });
        }
      }

      return res.json({
        videoId,
        totalLanguages: allLangs.length,
        availableLanguages: tracks.map((t) => ({
          code: t.languageCode,
          name: t.name?.simpleText || "Unknown",
        })),
        transcripts: allLangs,
      });
    }

    // ✅ CASE 2: User requested a specific language
    let selectedTrack;
    if (lang) {
      selectedTrack = tracks.find(
        (t) =>
          t.languageCode.toLowerCase() === lang.toLowerCase() ||
          (t.name?.simpleText || "")
            .toLowerCase()
            .includes(lang.toLowerCase())
      );
    }

    // ✅ CASE 3: No language provided or not found → fallback to default
    if (!selectedTrack) {
      selectedTrack = tracks[0];
      if (lang) {
        console.log(
          `⚠️ Language "${lang}" not found. Using default: ${selectedTrack.languageCode}`
        );
      }
    }

    // Fetch caption data for the chosen language
    const captionUrl = selectedTrack.baseUrl + "&fmt=json3";
    const captionRes = await axios.get(captionUrl);

    const transcript = captionRes.data?.events
      ?.map((event) => event.segs?.map((seg) => seg.utf8).join(""))
      .filter(Boolean)
      .join(" ");

    if (!transcript) {
      return res.status(404).json({
        error: "Transcript could not be parsed",
        language: selectedTrack.languageCode,
      });
    }

    res.json({
      videoId,
      requestedLanguage: lang || "default",
      usedLanguage: selectedTrack.languageCode,
      availableLanguages: tracks.map((t) => ({
        code: t.languageCode,
        name: t.name?.simpleText || "Unknown",
      })),
      transcript,
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/playlist", async (req, res) => {
  const { url, lang } = req.query;
  if (!url) return res.status(400).json({ error: "Playlist URL required" });

  const playlistId = getPlaylistId(url);
  if (!playlistId)
    return res.status(400).json({ error: "Invalid playlist URL" });

  try {
    // Fetch all video IDs from playlist
    let videoIds = [];
    let nextPageToken = "";
    do {
      const data = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${playlistId}&part=contentDetails&maxResults=50&pageToken=${nextPageToken}&key=${YT_API_KEY}`
      );
      console.log("code run");
      videoIds.push(
        ...data.data.items.map((item) => item.contentDetails.videoId)
      );
      nextPageToken = data.data.nextPageToken || "";
    } while (nextPageToken);

    // Set headers for streaming
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Send each video transcript as soon as it's fetched
    for (const videoId of videoIds) {
      const transcript = await fetchTranscript(videoId, lang || "en");
      res.write(JSON.stringify(transcript) + "\n"); // stream each line
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/languages', async (req, res) => {
  res.json({
    supported: [
      'en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'ru', 'zh', 'hi'
      // add more as needed
    ]
  });
});

export default router;
