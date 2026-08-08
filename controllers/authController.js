const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const response = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AD" });
        const rows = response.data.values || [];
        if (rows.length <= 1) return res.status(404).json({ success: false, message: "No registered users found." });

        let foundUser = null;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toString().trim().toLowerCase() === email.trim().toLowerCase()) {
                if (rows[i][4] === password) { foundUser = rows[i]; break; } 
                else return res.status(401).json({ success: false, message: "Incorrect password." });
            }
        }

        if (!foundUser) return res.status(404).json({ success: false, message: "Account not found." });

        const userObj = {
            name: foundUser[1] || "Student",
            phone: foundUser[2] || "N/A",
            email: foundUser[3] || email,
            rollNo: foundUser[5] || "N/A",
            course: foundUser[7] || "N/A",
            branch: foundUser[8] || "Bangalore",
            photo: foundUser[9] || "",
            homeTown: foundUser[10] || "N/A",
            qualification: foundUser[11] || "N/A",
            stream: foundUser[12] || "N/A",
            fresherStatus: foundUser[13] || "N/A",
            linkedin: foundUser[14] || "N/A",
            instagram: foundUser[15] || "N/A",
            placementReq: foundUser[16] || "N/A",
            friend1Name: foundUser[17] || "N/A",
            friend1Phone: foundUser[18] || "N/A",
            friend2Name: foundUser[19] || "N/A",
            friend2Phone: foundUser[20] || "N/A",
            resume: foundUser[21] || "N/A",
            parentName: foundUser[22] || "N/A",
            parentContact: foundUser[23] || "N/A",
            studyStatus: foundUser[24] || "Currently Studying",
            completedDate: foundUser[25] || "N/A",
            age: foundUser[26] || "N/A",
            gender: foundUser[27] || "N/A",
            certificate: foundUser[28] || "N/A",
            vacancyOpen: foundUser[29] || "No"
        };

        const token = jwt.sign({ email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch }, process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', { expiresIn: '7d' });
        return res.status(200).json({ success: true, message: "Login successful!", token, user: userObj });
    } catch (error) { return res.status(500).json({ success: false, message: "Server error." }); }
};

const registerUser = async (req, res) => {
    try {
        const formData = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toString().trim().toLowerCase() === formData.email.trim().toLowerCase()) {
                return res.status(400).json({ success: false, message: "An account with this email already exists." });
            }
        }

        let photoUrl = "";
        if (formData.photoBase64) {
             try {
                 const photoResponse = await fetch(process.env.APPS_SCRIPT_PHOTO_URL, {
                     method: 'POST',
                     body: JSON.stringify({
                         action: "uploadOnly",
                         base64: formData.photoBase64.replace(/^data:image\/\w+;base64,/, ""),
                         filename: `${formData.rollNo}_Profile.jpg`,
                         folderName: "Profile Photo",
                         mimeType: "image/jpeg"
                     })
                 });
                 const photoResult = await photoResponse.json();
                 if (photoResult.success) photoUrl = photoResult.url;
             } catch(e) { console.log("Photo upload failed:", e); }
        }

        const newRow = [
            new Date().toLocaleString('en-GB'), 
            formData.name || "N/A",             
            formData.phone || "N/A",            
            formData.email,                     
            formData.password,                  
            formData.rollNo || "N/A",           
            formData.joiningDate || "N/A",      
            formData.course || "N/A",           
            formData.branch || "N/A",           
            photoUrl || "",                     
            formData.homeTown || "N/A",         
            formData.qualification || "N/A",    
            formData.stream || "N/A",           
            formData.fresherStatus || "N/A",    
            formData.linkedin || "N/A",         
            formData.instagram || "N/A",        
            formData.placementReq || "N/A",     
            formData.friend1Name || "N/A",      
            formData.friend1Phone || "N/A",     
            formData.friend2Name || "N/A",      
            formData.friend2Phone || "N/A",     
            "N/A",                              
            formData.parentName || "N/A",       
            formData.parentContact || "N/A",    
            "Currently Studying",               
            "N/A",                              
            formData.age || "N/A",              
            formData.gender || "N/A",           
            "N/A",                              
            "No"                                
        ];

        await googleSheets.spreadsheets.values.append({ auth, spreadsheetId, range: "Data!A:AD", valueInputOption: "USER_ENTERED", resource: { values: [newRow] } });

        const token = jwt.sign({ email: formData.email, rollNo: formData.rollNo, branch: formData.branch }, process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', { expiresIn: '7d' });
        const userObj = { name: formData.name, email: formData.email, rollNo: formData.rollNo, branch: formData.branch, course: formData.course, photo: photoUrl };

        return res.status(200).json({ success: true, message: "Account created!", token, user: userObj });
    } catch (error) { return res.status(500).json({ success: false, message: "Server error during registration." }); }
};

module.exports = { loginUser, registerUser };