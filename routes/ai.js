// routes/ai.js
const express = require("express");
const fetch = require("node-fetch"); // if using Node >= 18, you can use global fetch
const router = express.Router();

const API_KEY = process.env.GEMINI_API_KEY;

router.post("/", async (req, res) => {
  try {
    const prompt = req.body.message;
    if (!prompt) return res.status(400).json({ reply: "No prompt provided" });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta2/models/gemini-2.5-flash:generateText?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: { text: prompt } })
      }
    );

    const data = await response.json();

    // Debugging: log raw response if needed
    console.log("Gemini Response:", data);

    const reply = data.candidates?.[0]?.output || "AI could not respond";
    res.json({ reply });
  } catch (err) {
    console.error("AI Route Error:", err);
    res.status(500).json({ reply: "AI server error" });
  }
});

module.exports = router;
