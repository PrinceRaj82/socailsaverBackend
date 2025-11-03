import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/index.js"; // ✅ FIXED import path

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({ message: "Main Node backend running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Node backend running on port ${PORT}`));
