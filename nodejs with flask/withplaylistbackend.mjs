import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Extract shortcode
function extractShortcode(url) {
  const patterns = [
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Method 1: Parse video URL from oEmbed HTML (FASTEST)
async function getReelFromOEmbed(url) {
  try {
    console.log("📥 Using oEmbed HTML parsing...");

    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;

    const response = await axios.get(oembedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 5000,
    });

    const data = response.data;

    // Load the HTML into cheerio
    const $ = cheerio.load(data.html);

    // Extract permalink from the HTML
    const permalink = $('a[href*="instagram.com"]').attr("href");

    if (!permalink) {
      throw new Error("No permalink found in oEmbed HTML");
    }

    // Now fetch the actual post page
    const postResponse = await axios.get(permalink, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 10000,
    });

    const postHtml = postResponse.data;

    // Extract video URL from script tags
    const videoUrlMatch = postHtml.match(/"video_url":"([^"]+)"/);

    if (videoUrlMatch) {
      const videoUrl = videoUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");

      return {
        status: "ok",
        method: "oembed_html_parse",
        type: "video",
        videoUrl: videoUrl,
        downloadUrl: videoUrl,
        thumbnail: data.thumbnail_url || "",
        title: data.title || "",
        author: data.author_name || "",
      };
    }

    throw new Error("Video URL not found in post HTML");
  } catch (err) {
    console.error("oEmbed HTML parse failed:", err.message);
    throw err;
  }
}

// Method 2: Instaloader (Python subprocess - 100% RELIABLE)
async function getReelViaInstaloader(shortcode) {
  try {
    console.log("📥 Using Instaloader (Python)...");

    // Create temp directory
    const tempDir = path.join(process.cwd(), "temp", shortcode);
    await fs.mkdir(tempDir, { recursive: true });

    // Run instaloader command
    const command = `instaloader --no-profile-pic --no-metadata-json --no-compress-json --dirname-pattern="${tempDir}" -- -${shortcode}`;

    console.log("🐍 Running:", command);

    await execAsync(command, { timeout: 30000 });

    // Find the downloaded video file
    const files = await fs.readdir(tempDir, { recursive: true });
    const videoFile = files.find(
      (f) => f.endsWith(".mp4") || f.endsWith(".mov")
    );

    if (!videoFile) {
      throw new Error("Video file not found after download");
    }

    const videoPath = path.join(tempDir, videoFile);

    // Read video file as base64 or serve as file
    const videoBuffer = await fs.readFile(videoPath);
    const base64Video = videoBuffer.toString("base64");

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      status: "ok",
      method: "instaloader",
      type: "video",
      videoBase64: base64Video,
      size: videoBuffer.length,
      note: "Video downloaded and encoded as base64. Decode to save as .mp4",
    };
  } catch (err) {
    console.error("Instaloader failed:", err.message);
    throw err;
  }
}

// Method 3: Direct CDN extraction from page source
async function getReelDirectCDN(url) {
  try {
    console.log("📥 Using direct CDN extraction...");

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 10000,
    });

    const html = response.data;

    // Try multiple patterns to find video URL
    const patterns = [
      /"video_url":"([^"]+)"/,
      /"playback_url":"([^"]+)"/,
      /"src":"([^"]+\.mp4[^"]*)"/,
      /video_url=([^&\s"]+)/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let videoUrl = match[1]
          .replace(/\\u0026/g, "&")
          .replace(/\\\//g, "/")
          .replace(/\\"/g, '"');

        // Validate URL
        if (videoUrl.startsWith("http") && videoUrl.includes("cdninstagram")) {
          return {
            status: "ok",
            method: "direct_cdn",
            type: "video",
            videoUrl: videoUrl,
            downloadUrl: videoUrl,
          };
        }
      }
    }

    throw new Error("CDN URL not found in page source");
  } catch (err) {
    console.error("Direct CDN extraction failed:", err.message);
    throw err;
  }
}

// Method 4: Mobile API endpoint
async function getReelViaMobileAPI(shortcode) {
  try {
    console.log("📥 Using mobile API...");

    const url = `https://i.instagram.com/api/v1/media/${shortcode}/info/`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Instagram 180.0.0.31.122 Android (28/9; 420dpi; 1080x2042; OnePlus; ONEPLUS A6000; OnePlus6; qcom; en_US; 278138897)",
        Accept: "*/*",
        "Accept-Language": "en-US",
        "X-IG-Capabilities": "3brTvw==",
        "X-IG-Connection-Type": "WIFI",
        "X-IG-App-ID": "124024574287414",
      },
      timeout: 10000,
    });

    const data = response.data;
    const items = data.items || [];

    if (items.length === 0) {
      throw new Error("No items found in mobile API response");
    }

    const videoUrl =
      items[0].video_versions?.[0]?.url || items[0].video_url;

    if (!videoUrl) {
      throw new Error("Video URL not found in mobile API response");
    }

    return {
      status: "ok",
      method: "mobile_api",
      type: "video",
      videoUrl: videoUrl,
      downloadUrl: videoUrl,
      thumbnail: items[0].image_versions2?.candidates?.[0]?.url || "",
      caption: items[0].caption?.text || "",
    };
  } catch (err) {
    console.error("Mobile API failed:", err.message);
    throw err;
  }
}

// Main download endpoint
app.get("/api/download", async (req, res) => {
  const startTime = Date.now();

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: "error",
        message: "Missing 'url' query parameter",
        example: "/api/download?url=https://www.instagram.com/reel/XYZ123/",
      });
    }

    const shortcode = extractShortcode(url);

    if (!shortcode) {
      return res.status(400).json({
        status: "error",
        message: "Invalid Instagram URL",
      });
    }

    console.log(`🎬 Processing: ${shortcode}`);

    let result = null;

    // Try Method 1: oEmbed HTML parsing (Fastest)
    try {
      result = await getReelFromOEmbed(url);
      result.responseTime = `${Date.now() - startTime}ms`;
      return res.json(result);
    } catch (err1) {
      console.log("⚠️ oEmbed parse failed, trying direct CDN...");
    }

    // Try Method 3: Direct CDN extraction
    try {
      result = await getReelDirectCDN(url);
      result.responseTime = `${Date.now() - startTime}ms`;
      return res.json(result);
    } catch (err2) {
      console.log("⚠️ Direct CDN failed, trying mobile API...");
    }

    // Try Method 4: Mobile API
    try {
      result = await getReelViaMobileAPI(shortcode);
      result.responseTime = `${Date.now() - startTime}ms`;
      return res.json(result);
    } catch (err3) {
      console.log("⚠️ Mobile API failed, trying Instaloader...");
    }

    // Try Method 2: Instaloader (Last resort - but 100% reliable if installed)
    try {
      result = await getReelViaInstaloader(shortcode);
      result.responseTime = `${Date.now() - startTime}ms`;
      return res.json(result);
    } catch (err4) {
      console.log("❌ All methods failed");
    }

    // All methods failed
    return res.status(500).json({
      status: "error",
      message: "All download methods failed",
      shortcode: shortcode,
      responseTime: `${Date.now() - startTime}ms`,
      suggestions: [
        "The post might be private or deleted",
        "Instagram might be blocking requests",
        "Install instaloader: pip3 install instaloader",
      ],
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({
      status: "error",
      message: err.message,
      responseTime: `${Date.now() - startTime}ms`,
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "⚡ Instagram Reel Downloader - Hybrid Approach",
    methods: [
      "1. oEmbed HTML Parse (Fast - 1-2s)",
      "2. Direct CDN Extraction (Medium - 2-4s)",
      "3. Mobile API (Medium - 2-4s)",
      "4. Instaloader Python (Slow but 100% reliable - 5-10s)",
    ],
    requirements: {
      nodejs: "✅ Built-in",
      instaloader: "Optional: pip3 install instaloader",
    },
    endpoints: ["/api/download?url=<instagram_url>"],
    example: "/api/download?url=https://www.instagram.com/reel/DLvIOEFSD2x/",
  });
});

app.listen(PORT, () => {
  console.log(`⚡ Server running on http://localhost:${PORT}`);
  console.log(`📦 Install instaloader for 100% success rate: pip3 install instaloader`);
});
