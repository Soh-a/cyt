// api/ai.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

const API_KEY = process.env.GEMINI_API_KEY;

// POST /api/ai
router.post("/", async (req, res) => {
  try {
    // Get the user input
    const userText = req.body.message || req.body.text;
    if (!userText) {
      return res.status(400).json({ reply: "Message missing" });
    }

    // Call Gemini 1.5 Flash model
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          temperature: 0.7,        // Optional: adjust creativity
          candidate_count: 1       // Return 1 response
        })
      }
    );

    const data = await response.json();
    console.log("Gemini full response:", JSON.stringify(data, null, 2));

    let reply = "AI could not respond";

    // Robustly extract the text
    if (data.candidates?.length > 0) {
      const candidate = data.candidates[0];

      if (candidate.content?.[0]?.parts?.[0]?.text) {
        reply = candidate.content[0].parts[0].text;
      } else if (candidate.output_text) {
        reply = candidate.output_text;
      } else if (typeof candidate === "string") {
        reply = candidate;
      }
    }

    res.json({ reply });

  } catch (err) {
    console.error("AI SERVER ERROR:", err);
    res.status(500).json({ reply: "Internal AI server error" });
  }
});

module.exports = router;
