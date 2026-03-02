const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

router.post("/", async (req, res) => {
  try {
    const userMessage = req.body.message;

    if (!userMessage) {
      return res.status(400).json({ reply: "Message is required" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage }]
        }
      ]
    });

    const reply =
      response?.text || "Sorry, I could not generate a response.";

    res.json({ reply });

  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ reply: "AI server error" });
  }
});

module.exports = router;
