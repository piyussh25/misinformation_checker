
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', async (req, res) => {
  try {
    const { text } = req.body;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an AI misinformation educator.
Input: A claim and its verdict (e.g., Misleading, Contradicted).
Task: Explain in **simple, non-technical language** why the claim is misleading or suspicious.
Give:
1. A one-line summary
2. A short explanation (max 3 bullet points)
3. A tip for spotting similar misinformation in the future

Output in Markdown.

Claim: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysis = await response.text();

    res.json({ analysis });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze text' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
