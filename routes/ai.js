const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

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
        body: JSON.stringify({
          prompt: { text: prompt },
          temperature: 0.7,
          candidate_count: 1
        })
      }
    );

    const data = await response.json();
    console.log("Gemini Response:", JSON.stringify(data, null, 2)); // Debug

    // Try multiple paths
    let reply = "AI could not respond";
    if (data.candidates?.length > 0) {
      if (data.candidates[0].content?.length > 0) {
        reply = data.candidates[0].content[0].text;
      } else if (data.candidates[0].output?.length > 0) {
        reply = data.candidates[0].output[0].text;
      }
    }

    res.json({ reply });

  } catch (err) {
    console.error("AI Route Error:", err);
    res.status(500).json({ reply: "AI server error" });
  }
});

module.exports = router;
