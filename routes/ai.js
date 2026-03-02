import express from "express";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();
const ai = new GoogleGenAI({});

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ reply: "No message provided" });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: message }] }],
    });

    const reply =
      response.candidates?.[0]?.content?.[0]?.text ||
      "AI could not generate a response.";

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "AI server error" });
  }
});

export default router;
