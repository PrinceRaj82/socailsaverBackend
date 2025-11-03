import axios from "axios";
// Utility: extract clean video ID
export function getVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    return url;
  } catch (e) {
    return url;
  }
}

// Extract playlist ID
export function getPlaylistId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get("list");
  } catch (e) {
    return null;
  }
}

// Fetch transcript for one video
export async function fetchTranscript(videoId, lang = "en") {
  try {
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
    if (!tracks || tracks.length === 0)
      return { videoId, transcript: [], error: "No captions found" };

    const track = tracks.find((t) => t.languageCode === lang) || tracks[0];
    const captionRes = await axios.get(track.baseUrl + "&fmt=json3");

    const transcript = captionRes.data.events
      ?.filter((e) => e.segs)
      .map((e) => ({
        start: e.tStartMs / 1000,
        duration: e.dDurationMs / 1000,
        text: e.segs.map((s) => s.utf8).join(""),
      }));

    return { videoId, transcript };
  } catch (err) {
    return { videoId, transcript: [], error: err.message };
  }
}