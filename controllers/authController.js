const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const NodeCache = require('node-cache');
const axios = require('axios');

// 10-minute cache for static metadata to conserve Google Sheets API read quota
const authCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

const withRetry = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); } 
        catch (error) {
            if (i === retries - 1 || (error.code !== 429 && !error.message?.includes('quota') && !error.message?.includes('rate limit'))) throw error;
            await new Promise(res => setTimeout(res, delay));
            delay *= 2; 
        }
    }
};

const getCachedSheet = async (googleSheets, auth, spreadsheetId, range) => {
    const cacheKey = `SHEET_${range}`;
    let data = authCache.get(cacheKey);
    if (data) return data; 

    const response = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range }));
    data = response.data.values || [];
    authCache.set(cacheKey, data); 
    return data;
};

function getVal(row, headers, possibleNames, fallbackIndex = -1, defaultValue = "N/A") {
    if (headers && headers.length > 0) {
        for (let name of possibleNames) {
            const idx = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes(name.toLowerCase()));
            if (idx !== -1 && row[idx] !== undefined && row[idx] !== "") return row[idx].toString().trim();
        }
    }
    if (fallbackIndex !== -1 && row[fallbackIndex] !== undefined && row[fallbackIndex] !== "") return row[fallbackIndex].toString().trim();
    return defaultValue;
}

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const rows = await getCachedSheet(googleSheets, auth, spreadsheetId, 'Data!A:AG');
        let userObj = null;

        for (let i = rows.length - 1; i > 0; i--) {
            const row = rows[i];
            if (row[3] && row[3].toString().trim().toLowerCase() === email.toString().trim().toLowerCase()) {
                let isMatch = false;
                if (row[4] === password) isMatch = true;
                else { try { isMatch = await bcrypt.compare(password, row[4]); } catch(e) {} }

                if (isMatch) {
                    userObj = {
                        name: row[1] || "Student", phone: row[2] || "N/A", email: row[3], rollNo: row[5] || "N/A",
                        joiningDate: row[6] || "N/A", course: row[7] || "N/A", branch: row[8] || "Bangalore",
                        photo: row[9] || "", homeTown: row[10] || "N/A", qualification: row[11] || "N/A",
                        stream: row[12] || "N/A", fresherStatus: row[13] || "N/A", linkedin: row[14] || "N/A",
                        instagram: row[15] || "N/A", placementReq: row[16] || "N/A", friend1Name: row[17] || "N/A",
                        friend1Phone: row[18] || "N/A", friend2Name: row[19] || "N/A", friend2Phone: row[20] || "N/A",
                        resume: row[21] || "N/A", parentName: row[22] || "N/A", parentContact: row[23] || "N/A",
                        studyStatus: row[24] || "Currently Studying", completedDate: row[25] || "N/A", age: row[26] || "N/A",
                        gender: row[27] || "N/A", certificate: row[28] || "N/A", vacancyOpen: row[29] || "", techExamAccess: row[32] || "No"
                    };
                    break; 
                }
            }
        }

        if (!userObj) return res.status(404).json({ success: false, message: "Account not found or incorrect password." });
        
        const token = jwt.sign(
            { email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch },
            process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026',
            { expiresIn: '7d' }
        );
        return res.status(200).json({ success: true, message: "Login successful!", token, user: userObj });
    } catch (error) { return res.status(500).json({ success: false, message: "Server error during login." }); }
};

const registerUser = async (req, res) => {
    try {
        const formData = req.body;
        if (!formData?.email || !formData?.password) return res.status(400).json({ success: false, message: "Email and password are required." });

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const rows = await getCachedSheet(googleSheets, auth, spreadsheetId, "Data!A:AG");
        const headers = rows[0] || [];
        const cleanEmail = formData.email.toString().trim().toLowerCase();

        for (let i = rows.length - 1; i >= 1; i--) {
            const existingEmail = getVal(rows[i], headers, ["email", "mail"], 3, "");
            if (existingEmail && existingEmail.toLowerCase() === cleanEmail) {
                return res.status(400).json({ success: false, message: "An account with this email already exists." });

            }
        }

        let photoUrl = "";
        if (formData.photoBase64) {
             try {
                 const response = await axios.post(process.env.APPS_SCRIPT_PHOTO_URL, {
                     action: "uploadOnly", 
                     base64: formData.photoBase64.replace(/^data:image\/\w+;base64,/, ""), 
                     filename: `${formData.rollNo || 'Profile'}_Profile.jpg`, 
                     folderName: "Profile Photo", 
                     mimeType: "image/jpeg",
                     folderId: process.env.DRIVE_FOLDER_ID,
                     parentFolderId: process.env.DRIVE_FOLDER_ID
                 }, { timeout: 30000 });
                 
                 if (response.data && response.data.success) {
                     photoUrl = response.data.url;
                 } else {
                     console.error("Drive upload failed:", response.data);
                 }
             } catch(e) {
                 console.error("Photo upload error during registration:", e.message);
             }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(formData.password, salt);

        const newRow = [
            new Date().toLocaleString('en-GB'), String(formData.name || "N/A"), String(formData.phone || "N/A"), String(formData.email || "").trim(),           
            String(hashedPassword), String(formData.rollNo || "N/A"), String(formData.joiningDate || "N/A"), String(formData.course || "N/A"),              
            String(formData.branch || "Bangalore"), String(photoUrl || ""), String(formData.homeTown || "N/A"), String(formData.qualification || "N/A"),       
            String(formData.stream || "N/A"), String(formData.fresherStatus || "N/A"), String(formData.linkedin || "N/A"), String(formData.instagram || "N/A"),           
            String(formData.placementReq || "N/A"), String(formData.friend1Name || "N/A"), String(formData.friend1Phone || "N/A"), String(formData.friend2Name || "N/A"),         
            String(formData.friend2Phone || "N/A"), "N/A", String(formData.parentName || "N/A"), String(formData.parentContact || "N/A"),       
            "Currently Studying", "N/A", String(formData.age || "N/A"), String(formData.gender || "N/A"), "N/A", "", "", "Pending"                                          
        ];

        await withRetry(() => googleSheets.spreadsheets.values.append({ auth, spreadsheetId, range: "Data!A:AG", valueInputOption: "USER_ENTERED", resource: { values: [newRow] } }));
        authCache.flushAll();

        const token = jwt.sign({ email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore" }, process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', { expiresIn: '7d' });
        const userObj = { name: formData.name || "Student", email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore", course: formData.course || "N/A", photo: photoUrl || "", vacancyOpen: "" };

        return res.status(200).json({ success: true, message: "Account created!", token, userObj });
    } catch (error) { return res.status(500).json({ success: false, message: error.message || "Server error during registration." }); }
};

const getCourses = async (req, res) => {
    try {
        const { googleSheets, auth } = await connectSheet();
        const rows = await getCachedSheet(googleSheets, auth, process.env.SPREADSHEET_ID, "Courses!A:B");
        let groupedCourses = [];
        let currentCategory = "General";
        for (let i = 0; i < rows.length; i++) {
            const colA = rows[i][0] ? rows[i][0].toString().trim() : "";
            const colB = rows[i][1] ? rows[i][1].toString().trim() : "";
            if (colA !== "") {
                currentCategory = colA.replace(/^\d+\.\s*/, '').trim();
                groupedCourses.push({ category: currentCategory, courses: [] });
            } else if (colB !== "" && groupedCourses.length > 0) {
                groupedCourses[groupedCourses.length - 1].courses.push(colB);
            }
        }
        return res.status(200).json({ success: true, groupedCourses });
    } catch (error) { return res.status(500).json({ success: false, message: "Server error fetching courses." }); }
};

const getBranches = async (req, res) => {
    try {
        const { googleSheets, auth } = await connectSheet();
        const rows = await getCachedSheet(googleSheets, auth, process.env.SPREADSHEET_ID, "Branches!B:C");
        let groupedBranches = [];
        for (let i = 1; i < rows.length; i++) {
            const region = rows[i][0] ? rows[i][0].toString().trim() : "";
            const branchName = rows[i][1] ? rows[i][1].toString().trim() : "";
            if (region !== "") {
                let regionObj = groupedBranches.find(g => g.region === region);
                if (!regionObj) {
                    regionObj = { region: region, branches: [] };
                    groupedBranches.push(regionObj);
                }
                if (branchName !== "") regionObj.branches.push(branchName);
            }
        }
        return res.status(200).json({ success: true, groupedBranches });
    } catch (error) { return res.status(500).json({ success: false, message: "Server error fetching branches." }); }
};

module.exports = { loginUser, registerUser, getCourses, getBranches };