// api/ai.js
import express from "express";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY, // Ensure this is set in your environment
});

// POST /api/ai
router.post("/", async (req, res) => {
  try {
    const userText = req.body.message || req.body.text;
    if (!userText) {
      return res.status(400).json({ reply: "Message missing" });
    }

    // Call Gemini 3 Flash Preview model
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: userText }] }],
      temperature: 0.7,
      candidateCount: 1
    });

    console.log("Gemini full response:", JSON.stringify(response, null, 2));

    // Extract AI reply safely
    const reply =
      response.candidates?.[0]?.content?.[0]?.parts?.[0]?.text ||
      response.candidates?.[0]?.output_text ||
      response.candidates?.[0]?.text ||
      "AI could not respond";

    res.json({ reply });

  } catch (err) {
    console.error("AI SERVER ERROR:", err);
    res.status(500).json({ reply: "Internal AI server error" });
  }
});

export default router;
