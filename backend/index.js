
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/misinformation-checker', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Search History Schema
const searchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  analysis: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Email transporter
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Authentication Routes
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or username already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username or email
    const user = await User.findOne({ 
      $or: [{ username }, { email: username }] 
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

app.post('/auth/forgot-username', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'No account found with this email' 
      });
    }

    // Send username via email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Script Kiddos Username',
      text: `Your username is: ${user.username}`
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Username sent to your email'
    });
  } catch (error) {
    console.error('Forgot username error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { username, email } = req.body;

    const user = await User.findOne({ username, email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'No account found with this username and email combination' 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send reset email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset - Script Kiddos',
      text: `Click this link to reset your password: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Password reset instructions sent to your email'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Search History Routes
app.get('/api/search-history', authenticateToken, async (req, res) => {
  try {
    const history = await SearchHistory.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch search history' });
  }
});

app.delete('/api/search-history', authenticateToken, async (req, res) => {
  try {
    await SearchHistory.deleteMany({ userId: req.user.userId });
    res.json({ success: true, message: 'Search history cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear search history' });
  }
});

// Updated analyze route with authentication and history tracking
app.post('/analyze', authenticateToken, async (req, res) => {
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

    // Save to search history
    const searchHistory = new SearchHistory({
      userId: req.user.userId,
      text: text.substring(0, 500), // Limit text length
      analysis
    });
    await searchHistory.save();

    res.json({ analysis });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze text' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
