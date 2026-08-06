const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios'); // <-- Added missing axios
const nodemailer = require('nodemailer'); // <-- Added for emails
const connectSheet = require('./config/db');
const authRoutes = require('./routes/authRoutes'); 
const dashboardRoutes = require('./routes/dashboardRoutes');

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(cors());

connectSheet();

// Setup Nodemailer for automated emails
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Add your IPCS email in .env
        pass: process.env.EMAIL_PASS  // Add your App Password in .env
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
    res.send('IPCS Portal Backend connected to Google Sheets!');
});

// --- NEW PLACEMENT DRIVE RESPONSE & EMAIL ENDPOINT ---
app.post('/api/dashboard/drive-response', async (req, res) => {
  const { driveId, title, name, phone, email, course, branch, resume, qualification, status, tpoBranch } = req.body;

  try {
    // 1. Append to 'Drive_Registration' sheet
    await axios.post(process.env.APPS_SCRIPT_URL, {
      action: 'recordDriveResponse',
      data: {
        driveId, name, phone, email, course, branch, resume, qualification, status
      }
    });

    // 2. If Registered, send Invitation Email
    if (status === 'Registered') {
      
      let tpoEmail = "placement@ipcsglobal.com"; 
      if (tpoBranch && tpoBranch.toLowerCase().includes('bangalore')) {
          tpoEmail = "bangalore.tpo@ipcsglobal.com"; // Example routing
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
              <p style="color: #475569; font-size: 16px;">You have successfully registered for the placement drive: <strong style="color: #3b82f6;">${title}</strong> (Drive ID: ${driveId}).</p>
              
              <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;">
                <p style="margin: 5px 0;"><strong>Drive ID:</strong> ${driveId}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> ${tpoBranch}</p>
              </div>

              <p style="color: #475569; font-size: 16px;">Please ensure you carry a physical copy of your resume and arrive on time. Dress in formal professional attire.</p>
              <br/>
              <p style="color: #94a3b8; font-size: 14px;">Best regards,<br/>IPCS Global Placement Cell</p>
            </div>
          </div>
        `
      };
      // Send email
      if(process.env.EMAIL_USER) {
        await transporter.sendMail(mailOptions);
      } else {
        console.log("Email skipped: EMAIL_USER missing in .env");
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