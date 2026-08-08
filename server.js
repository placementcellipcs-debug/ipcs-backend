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

// --- 1. CORS CONFIGURATION FOR PRODUCTION & LOCALHOST ---
const allowedOrigins = [
  'https://placement.ipcsglobal.info',
  'http://placement.ipcsglobal.info',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive fallback
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

connectSheet();

// --- 2. NODEMAILER TRANSPORTER ---
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

// --- 3. PLACEMENT DRIVE RESPONSE & EMAIL ENDPOINT ---
app.post('/api/dashboard/drive-response', async (req, res) => {
  const { driveId, title, name, phone, email, course, branch, resume, qualification, status, tpoBranch } = req.body;

  try {
    // Append to 'Drive_Registration' sheet
    await axios.post(process.env.APPS_SCRIPT_URL, {
      action: 'recordDriveResponse',
      data: {
        driveId: driveId || 'N/A', // Includes Drive ID for easy TPO sorting
        name, phone, email, course, branch, resume, qualification, status
      }
    });

    // Send invitation email if registered
    if (status === 'Registered') {
      let tpoEmail = "placement@ipcsglobal.com"; 
      if (tpoBranch && tpoBranch.toLowerCase().includes('bangalore')) {
          tpoEmail = "bangalore.tpo@ipcsglobal.com";
      }

      const mailOptions = {
        from: '"IPCS Placement Cell" <placement@ipcsglobal.com>',
        to: email,
        cc: tpoEmail,
        subject: `Drive Registration Confirmed: ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 10px; border-top: 5px solid #38bdf8;">
              <h2 style="color: #0f172a;">Registration Successful! 🎉</h2>
              <p style="color: #475569; font-size: 16px;">Dear <strong>${name}</strong>,</p>
              <p style="color: #475569; font-size: 16px;">You have successfully registered for the placement drive: <strong style="color: #3b82f6;">${title}</strong>.</p>
              
              <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;">
                <p style="margin: 5px 0;"><strong>Drive ID:</strong> ${driveId || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> ${tpoBranch}</p>
              </div>

              <p style="color: #475569; font-size: 16px;">Please carry a physical copy of your resume and arrive on time in formal attire.</p>
              <br/>
              <p style="color: #94a3b8; font-size: 14px;">Best regards,<br/>IPCS Global Placement Cell</p>
            </div>
          </div>
        `
      };

      if (process.env.EMAIL_USER) {
        await transporter.sendMail(mailOptions);
      }
    }

    res.json({ success: true, message: 'Response recorded' });
  } catch (error) {
    console.error("Error recording drive response:", error);
    res.status(500).json({ success: false, message: 'Failed to record response.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});