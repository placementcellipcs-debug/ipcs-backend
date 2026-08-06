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

// Middleware
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Initialize Google Sheet Connection
connectSheet();

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Set in .env
        pass: process.env.EMAIL_PASS  // Set App Password in .env
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health Check Endpoint
app.get('/', (req, res) => {
    res.status(200).send('IPCS Portal Backend connected to Google Sheets!');
});

// --- PLACEMENT DRIVE RESPONSE & EMAIL ENDPOINT ---
app.post('/api/dashboard/drive-response', async (req, res) => {
    const { 
        driveId, 
        title, 
        name, 
        phone, 
        email, 
        course, 
        branch, 
        resume, 
        qualification, 
        status, 
        tpoBranch 
    } = req.body;

    if (!email || !driveId) {
        return res.status(400).json({ success: false, message: 'Drive ID and Student Email are required.' });
    }

    try {
        // 1. Record response in Google Sheets via Apps Script Bridge
        if (process.env.APPS_SCRIPT_URL) {
            await axios.post(process.env.APPS_SCRIPT_URL, {
                action: 'recordDriveResponse',
                data: { driveId, name, phone, email, course, branch, resume, qualification, status }
            });
        }

        // 2. Send Invitation Email if Status is Registered
        if (status === 'Registered') {
            let tpoEmail = "placement@ipcsglobal.com"; 
            if (tpoBranch && tpoBranch.toLowerCase().includes('bangalore')) {
                tpoEmail = "bangalore.tpo@ipcsglobal.com";
            }

            const mailOptions = {
                from: '"IPCS Placement Cell" <placement@ipcsglobal.com>',
                to: email,
                cc: tpoEmail,
                subject: `Drive Registration Confirmed: ${title || 'Placement Drive'}`,
                html: `
                  <div style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc;">
                    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 10px; border-top: 5px solid #38bdf8;">
                      <h2 style="color: #0f172a; margin-top: 0;">Registration Successful! 🎉</h2>
                      <p style="color: #475569; font-size: 16px;">Dear <strong>${name || 'Student'}</strong>,</p>
                      <p style="color: #475569; font-size: 16px;">You have successfully registered for the placement drive: <strong style="color: #3b82f6;">${title || 'Technical Drive'}</strong>.</p>
                      
                      <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;">
                        <p style="margin: 5px 0;"><strong>Drive ID:</strong> ${driveId}</p>
                        <p style="margin: 5px 0;"><strong>Branch Location:</strong> ${tpoBranch || branch || 'As Scheduled'}</p>
                      </div>

                      <p style="color: #475569; font-size: 16px;">Please ensure you carry a printed copy of your resume and report on time. Formal business attire is required.</p>
                      <br/>
                      <p style="color: #94a3b8; font-size: 14px;">Best regards,<br/><strong>IPCS Global Placement Cell</strong></p>
                    </div>
                  </div>
                `
            };

            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                await transporter.sendMail(mailOptions);
            } else {
                console.log("Email skipped: EMAIL_USER or EMAIL_PASS missing in .env");
            }
        }

        return res.status(200).json({ success: true, message: 'Response recorded successfully!' });
    } catch (error) {
        console.error("Error recording drive response:", error);
        return res.status(500).json({ success: false, message: 'Failed to record drive response.' });
    }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});