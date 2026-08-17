const connectSheet = require('../config/db');

// Exponential Backoff Retry Function to handle Google Sheets API limits
const withRetry = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            // If it's the last retry, or the error IS NOT a rate limit, throw it immediately
            if (i === retries - 1 || (error.code !== 429 && !error.message?.includes('quota') && !error.message?.includes('rate limit'))) {
                throw error;
            }
            console.log(`Google API Rate Limit hit. Retrying in ${delay}ms... (Attempt ${i + 1} of ${retries})`);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2; // Double the wait time on each failure (1s, 2s, 4s, 8s)
        }
    }
};

// 1. Fetch the list of materials for the student
const getStudyMaterialsList = async (req, res) => {
    try {
        const { email, course } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // WRAPPED WITH RETRY: Verify Student Access in Data Tab (Column AE / Index 30)
        const dataSheet = await withRetry(() => 
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AE" })
        );
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

        // WRAPPED WITH RETRY: Fetch Materials
        let materials = [];
        const matSheet = await withRetry(() => 
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Study_Materials!A:G" })
        );
        const matData = matSheet.data.values || [];
        const cleanStudentCourse = (studentCourse || "").toString().trim().toLowerCase();

        for (let i = 1; i < matData.length; i++) {
            const rowStatus = (matData[i][6] || "active").toLowerCase();
            if (rowStatus.includes("inactive") || rowStatus === "false") continue;

            const rowCourse = (matData[i][1] || "all").toLowerCase().trim();
            let isMatch = false;

            // NEW STRICT FILTERING LOGIC
            if (rowCourse.includes("all") || rowCourse === "") {
                isMatch = true;
            } else if (cleanStudentCourse === rowCourse) {
                isMatch = true;
            } else if (cleanStudentCourse.includes(rowCourse) || rowCourse.includes(cleanStudentCourse)) {
                isMatch = true;
            }

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

// 2. Format Link for Secure Iframe Embedding
const streamMaterialPdf = async (req, res) => {
    try {
        const { oneDriveLink } = req.body;
        
        if (!oneDriveLink || !oneDriveLink.startsWith('http')) {
            return res.status(400).json({ success: false, message: "Invalid Link Format in Database." });
        }

        let embedUrl = oneDriveLink;

        // --- FORMAT GOOGLE DRIVE LINKS ---
        if (embedUrl.includes('drive.google.com') || embedUrl.includes('docs.google.com')) {
            const fileIdMatch = embedUrl.match(/(?:id=|\/d\/)([\w-]+)/);
            if (fileIdMatch && fileIdMatch[1]) {
                embedUrl = `https://docs.google.com/presentation/d/${fileIdMatch[1]}/embed?start=false&loop=false`;
            }
        } 
        // --- FORMAT ONEDRIVE / SHAREPOINT LINKS ---
        else if (embedUrl.includes('onedrive.live.com') || embedUrl.includes('sharepoint.com')) {
            // Force embedview and prepare it for our custom slide controller
            if (embedUrl.includes('?')) {
                embedUrl = embedUrl.replace(/action=\w+/, 'action=embedview');
                embedUrl = embedUrl.replace(/&wdStartOn=\d+/, ''); // Strip old slide numbers
            } else {
                embedUrl += '?action=embedview';
            }
        }

        return res.status(200).json({ success: true, embedUrl });

    } catch (error) {
        console.error("Material Viewer Error:", error);
        res.status(500).json({ success: false, message: "Failed to process the document link." });
    }
};

module.exports = { getStudyMaterialsList, streamMaterialPdf };