// routes/ai.js
import express from "express";
import fetch from "node-fetch"; // or 'axios'

const router = express.Router();
const API_KEY = process.env.GEMINI_API_KEY;

router.post("/", async (req, res) => {
  try {
    const prompt = req.body.message;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta2/models/gemini-2.5-flash:generateText?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: { text: prompt }
        })
      }
    );
    const data = await response.json();
    const reply = data.candidates?.[0]?.output || "AI could not respond";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "AI server error" });
  }
});

export default router;
