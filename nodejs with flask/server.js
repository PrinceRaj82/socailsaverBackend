import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/index.js"; // ✅ FIXED import path
import axios from "axios";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.get("/", (req, res) => {
  async function getYoutubeKey() {
    const res = await axios.get("https://www.youtube.com/watch?v=mwYsapR6cYk");
    const html = res.data;
    const versionMatch = html.match(
      /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([0-9\.]+)"/
    );
    const clientVersion = versionMatch ? versionMatch[1] : "2.20240214.01.00";

    // Regex to extract key
    const match = html.match(/"INNERTUBE_API_KEY":"([A-Za-z0-9_\-]+)"/);
    if (match) return [match[1], versionMatch, clientVersion];
    return null;
  }

  getYoutubeKey().then(console.log);
  
  res.json({ message: "Main Node backend running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Node backend running on port ${PORT}`));
