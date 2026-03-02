app.post("/api/ai", async (req, res) => {
  try {
    const userText = req.body.message || req.body.text;

    if (!userText) {
      return res.status(400).json({ reply: "Message missing" });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(500).json({
        reply: "Gemini API failed"
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response generated";

    res.json({ reply });

  } catch (err) {
    console.error("AI SERVER ERROR:", err);
    res.status(500).json({ reply: "Internal AI server error" });
  }
});
