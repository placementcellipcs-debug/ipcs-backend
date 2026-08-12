const connectSheet = require('../config/db');
const axios = require('axios');

// Helper Function: Get Microsoft Access Token
const getMsAccessToken = async () => {
    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const data = new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });

    const response = await axios.post(tokenUrl, data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
};

// 1. Fetch the list of materials for the student
const getStudyMaterialsList = async (req, res) => {
    try {
        const { email, course } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // Verify Student Access in Data Tab (Column AE / Index 30)
        const dataSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AE" });
        const userDataRows = dataSheet.data.values || [];
        let hasAccess = false;
        let studentCourse = course || "";

        for (let i = userDataRows.length - 1; i >= 1; i--) {
            if (userDataRows[i][3] && userDataRows[i][3].toLowerCase() === email.toLowerCase()) {
                const accessVal = (userDataRows[i][30] || "no").toString().trim().toLowerCase(); 
                if (accessVal === "yes" || accessVal === "true") hasAccess = true;
                if (!studentCourse) studentCourse = userDataRows[i][7] || ""; 
                break;
            }
        }

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Access Restricted: You do not have permission to view Study Materials." });
        }

        // Fetch Materials
        let materials = [];
        const matSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Study_Materials!A:G" });
        const matData = matSheet.data.values || [];
        const cleanStudentCourse = (studentCourse || "").toString().trim().toLowerCase();

        for (let i = 1; i < matData.length; i++) {
            const rowStatus = (matData[i][6] || "active").toLowerCase();
            if (rowStatus.includes("inactive") || rowStatus === "false") continue;

            const rowCourse = (matData[i][1] || "all").toLowerCase();
            let isMatch = false;

            if (rowCourse.includes("all") || rowCourse === "") isMatch = true;
            else if (cleanStudentCourse && rowCourse.includes(cleanStudentCourse)) isMatch = true;
            else if (cleanStudentCourse) isMatch = cleanStudentCourse.split(" ").some(w => w.length > 3 && rowCourse.includes(w));

            if (isMatch) {
                materials.push({
                    id: matData[i][0] || `MAT-${i}`,
                    course: matData[i][1] || "All",
                    topic: matData[i][2] || "General",
                    title: matData[i][3] || "Study Material",
                    fileType: matData[i][4] || "PPTX",
                    oneDriveLink: matData[i][5] || ""
                });
            }
        }

        res.status(200).json({ success: true, materials });
    } catch (error) {
        console.error("Get Study Materials Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch study materials." });
    }
};

// 2. Secretly Download, Convert to PDF, and Stream
const streamMaterialPdf = async (req, res) => {
    try {
        const { oneDriveLink, email } = req.body;
        
        if (!oneDriveLink || !oneDriveLink.startsWith('http')) {
            return res.status(400).json({ success: false, message: "Invalid Link Format in Database. The URL must start with http/https." });
        }
        
        if (oneDriveLink.includes('drive.google.com')) {
            return res.status(400).json({ success: false, message: "Google Drive links should be handled directly by the frontend." });
        }

        // Generate Microsoft Authorization Token
        const token = await getMsAccessToken();

        // Encode the OneDrive Share Link into Microsoft Graph format
        const encodedUrl = Buffer.from(oneDriveLink)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\//g, '_')
            .replace(/\+/g, '-');
        
        const shareId = "u!" + encodedUrl;

        // Tell Microsoft to grab the file and convert it to a PDF instantly
        const graphUrl = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/content?format=pdf`;

        const pdfResponse = await axios({
            method: 'GET',
            url: graphUrl,
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'stream'
        });

        // Set headers so the frontend knows it's receiving a raw PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="Secure_Study_Material.pdf"');
        
        // Pipe the raw PDF data directly to the frontend
        pdfResponse.data.pipe(res);

    } catch (error) {
        console.error("PDF Conversion Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Microsoft rejected the link. Ensure it is a valid OneDrive Share Link." });
    }
};

module.exports = { getStudyMaterialsList, streamMaterialPdf };