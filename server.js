const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const connectSheet = require('./config/db');
const authRoutes = require('./routes/authRoutes'); 
const dashboardRoutes = require('./routes/dashboardRoutes');

dotenv.config();

const app = express();

// --- ALLOW FRONTEND ORIGINS ---
const allowedOrigins = [
  'https://placement.ipcsglobal.info',
  'http://placement.ipcsglobal.info',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://ipcs-frontend-b5wi-five.vercel.app' // ADD YOUR VERCEL URL HERE
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

connectSheet();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
    res.send('IPCS Portal Backend connected to Google Sheets!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});