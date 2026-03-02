import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = "AIzaSyDc2LT4VfCMj9g3tHtXLoOusToDpgUvhTo";

app.post("/ai", async (req, res) => {
  try {
    const userText = req.body.text;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userText }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I couldn't generate a response.";

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "AI server error" });
  }
});

app.listen(3000, () => {
  console.log("Gemini AI running on port 3000");
});
