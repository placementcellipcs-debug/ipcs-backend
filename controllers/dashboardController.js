const connectSheet = require('../config/db');


// Helper function to check if a string date matches today
function isSameDay(dateStr, now) {
    if (!dateStr) return false;
    const parsedDate = new Date(dateStr.toString().replace(/,/g, '').replace(/\s+/g, ' ').trim());
    if (!isNaN(parsedDate.getTime())) {
        return (parsedDate.getDate() === now.getDate() &&
               parsedDate.getMonth() === now.getMonth() &&
               parsedDate.getFullYear() === now.getFullYear());
    }
    return false;
}


// Haversine formula for GPS distance
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}


const getDashboardData = async (req, res) => {
    try {
        const { email, branch } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;


        // 1. FETCH LIVE USER INFO (MAPPED EXACTLY TO IMAGE)
        let userInfo = {};
        try {
            const dataSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AD" });
            const userDataRows = dataSheet.data.values || [];
            for (let i = 1; i < userDataRows.length; i++) {
                if (userDataRows[i][3] && userDataRows[i][3].toLowerCase() === email.toLowerCase()) {
                    userInfo = {
                        name: userDataRows[i][1] || "Student",
                        phone: userDataRows[i][2] || "N/A",
                        email: userDataRows[i][3] || email,
                        rollNo: userDataRows[i][5] || "N/A",
                        course: userDataRows[i][7] || "N/A",
                        branch: userDataRows[i][8] || "Bangalore",
                        photo: userDataRows[i][9] || "",
                        homeTown: userDataRows[i][10] || "N/A",
                        qualification: userDataRows[i][11] || "N/A",
                        stream: userDataRows[i][12] || "N/A",
                        fresherStatus: userDataRows[i][13] || "N/A",
                        linkedin: userDataRows[i][14] || "N/A",
                        instagram: userDataRows[i][15] || "N/A",
                        placementReq: userDataRows[i][16] || "N/A",
                        resume: userDataRows[i][21] || "N/A", // Column V is 21
                        parentName: userDataRows[i][22] || "N/A",
                        parentContact: userDataRows[i][23] || "N/A",
                        studyStatus: userDataRows[i][24] || "Currently Studying",
                        completedDate: userDataRows[i][25] || "N/A",
                        age: userDataRows[i][26] || "N/A",
                        gender: userDataRows[i][27] || "N/A",
                        certificate: userDataRows[i][28] || "N/A", // Column AC is 28
                        vacancyOpen: userDataRows[i][29] || "No" // Column AD is 29
                    };
                    break;
                }
            }
        } catch(e) { console.log("User Fetch Error"); }


        let appliedJobs = [];
        let stats = { applied: 0, interviews: 0, offers: 0, attended: 0, totalConducted: 0, onLeave: 0 };
       
        // 2. Fetch Applied Jobs
        try {
            const applySheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Opening_Applied!A:O" });
            const appData = applySheet.data.values || [];
            if (appData.length > 1) {
                for (let i = 1; i < appData.length; i++) {
                    if (appData[i][3] && appData[i][3].toLowerCase() === email.toLowerCase()) {
                        let status = appData[i][13] || "Applied"; // Status is N (index 13)
                        stats.applied++;
                        if (status.toLowerCase().includes("interview")) stats.interviews++;
                        if (status.toLowerCase().includes("offer") || status.toLowerCase().includes("hired") || status.toLowerCase().includes("placed")) stats.offers++;
                       
                        appliedJobs.push({
                            jobId: appData[i][9] || "N/A",
                            company: appData[i][10] || "Unknown",
                            status: status,
                            date: appData[i][0] || "Recently"
                        });
                    }
                }
            }
        } catch(e) { console.log("No Opening_Applied sheet found yet."); }


        // 3. Fetch Events
        let events = [];
        try {
            const eventSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Event!A:G" });
            const evData = eventSheet.data.values || [];
            if (evData.length > 1) {
                for (let i = 1; i < evData.length; i++) {
                    let evBranch = (evData[i][1] || "all").toLowerCase();
                    if (evBranch.includes("all") || evBranch.includes((branch || "Bangalore").toLowerCase())) {
                        events.push({
                            date: evData[i][0] || "TBA",
                            title: evData[i][3] || "Event",
                            description: evData[i][4] || "",
                            time: evData[i][5] || "",
                            location: evData[i][6] || "",
                            type: evData[i][2] || "GENERAL"
                        });
                    }
                }
            }
        } catch(e) { console.log("No Event sheet found yet."); }


        // 4. Fetch Attendance & Schedule Check
        let attendanceHistory = [];
        let hasMarkedToday = false;
        let isScheduledToday = false;
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-GB');


        try {
            const schedSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" });
            const schedData = schedSheet.data.values || [];
            for (let i = 1; i < schedData.length; i++) {
                const schedBranch = (schedData[i][2] || "").toLowerCase();
                if (schedBranch.includes((branch || "bangalore").toLowerCase())) {
                    stats.totalConducted++;
                    if (isSameDay(schedData[i][0], now)) {
                        isScheduledToday = true;
                    }
                }
            }


            const attSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" });
            const attData = attSheet.data.values || [];
            for (let i = 1; i < attData.length; i++) {
                if (attData[i][1] && attData[i][1].toLowerCase() === email.toLowerCase()) {
                    stats.attended++;
                    let recDate = attData[i][8] || "";
                    let numRating = parseInt((attData[i][6] || "0").charAt(0)) || 0;
                   
                    attendanceHistory.push({ timestamp: attData[i][0], rating: numRating, dateStr: recDate });
                    if (recDate === todayStr || attData[i][0].includes(now.toLocaleDateString())) {
                        hasMarkedToday = true;
                    }
                }
            }
            attendanceHistory.reverse();
            stats.onLeave = Math.max(0, stats.totalConducted - stats.attended);
        } catch(e) { console.log("Attendance/Schedule Error"); }


        // 5. Fetch Job Vacancies
        let vacancies = [];
        try {
            const nlSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" });
            const nlData = nlSheet.data.values || [];
           
            const cleanStudentCourse = (userInfo.course || "").trim().toLowerCase();
            const itCoursesList = ["python and data science", "artificial intelligence", "python full stack", "java full stack", "mern stack", "cyber security"];
            const isStudentIT = itCoursesList.includes(cleanStudentCourse);


            for (let i = 1; i < nlData.length; i++) {
                let status = (nlData[i][18] || "yes").toLowerCase(); // Column S (index 18)
                if (status.includes("no") || status.includes("closed") || status === "false") continue;


                let rowCourse = (nlData[i][16] || "all").toLowerCase(); // Column Q (index 16)
                let isCourseMatch = false;


                if (rowCourse.includes("all") || rowCourse === "") isCourseMatch = true;
                else if (cleanStudentCourse && rowCourse.includes(cleanStudentCourse)) isCourseMatch = true;
                else if (isStudentIT && rowCourse.includes("information technology")) isCourseMatch = true;
                else if (cleanStudentCourse) {
                    isCourseMatch = cleanStudentCourse.split(" ").some(w => w.length > 3 && rowCourse.includes(w));
                }


                if (!isCourseMatch) continue;


                let company = nlData[i][2] || "Placement Partner";
                let position = nlData[i][4] || "Technical Role";
                if (!company && !position) continue;


                vacancies.push({
                    date: nlData[i][1] || "",
                    company: company,
                    position: position,
                    state: nlData[i][5] || "OTHER STATES",
                    location: nlData[i][6] || "Multiple Locations",
                    modeOfWork: nlData[i][7] || "On-site",
                    openings: nlData[i][8] || "01-02",
                    qualification: nlData[i][9] || "Degree",
                    description: nlData[i][10] || "",
                    experience: nlData[i][11] || "Fresher",
                    salary: nlData[i][12] || "Market Standard",
                    interviewDate: nlData[i][14] || "Will inform once scheduled",
                    lastDate: nlData[i][15] || "Open",
                    course: nlData[i][16] || "All",
                    newsletterId: nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}`
                });
            }
        } catch (e) { console.log("Vacancies Error"); }


        // 6. Fetch TPO Info
        let tpoInfo = { name: "Placement Officer", email: "placement@ipcsglobal.com", phone: "N/A", sittingBranch: "N/A" };
        try {
            const contactSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Contact!A:H" });
            const contactData = contactSheet.data.values || [];
            for (let k = 1; k < contactData.length; k++) {
                const assignedBranchesRaw = (contactData[k][4] || "").toLowerCase();
                if (assignedBranchesRaw.includes((branch || "Bangalore").toLowerCase())) {
                    tpoInfo = {
                        name: contactData[k][0] || "Placement Officer",
                        phone: contactData[k][1] || "N/A",
                        email: contactData[k][2] || "placement@ipcsglobal.com",
                        sittingBranch: contactData[k][3] || "N/A"
                    };
                    break;
                }
            }
        } catch (e) { console.log("TPO Info Error"); }


        res.status(200).json({ success: true, userInfo, stats, appliedJobs, events, attendanceHistory, isScheduledToday, hasMarkedToday, vacancies, tpoInfo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error fetching dashboard." });
    }
};


const markAttendance = async (req, res) => {
    try {
        const { email, name, branch, course, rating, location, feedback, userLat, userLng } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const now = new Date();
        const timestamp = now.toLocaleString();
        const dateOnly = now.toLocaleDateString('en-GB');


        // 1. Validate Time (9:30 AM to 7:00 PM)
        const currentTimeMins = now.getHours() * 60 + now.getMinutes();
        const isTimeValid = (currentTimeMins >= (9 * 60 + 30) && currentTimeMins <= (19 * 60));


        // 2. Validate Schedule for Today & Branch
        let isScheduledToday = false;
        const schedSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" });
        const schedData = schedSheet.data.values || [];
        for (let i = 1; i < schedData.length; i++) {
            const schedBranch = (schedData[i][2] || "").toLowerCase();
            if (schedBranch.includes((branch || "").toLowerCase()) && isSameDay(schedData[i][0], now)) {
                isScheduledToday = true;
                break;
            }
        }


        // 3. Validate Geofence (150 meters)
        const defaultLat = 12.9097, defaultLng = 77.5732;
        let isWithinGeofence = false;
        if (userLat && userLng) {
            const distance = calculateDistanceInMeters(parseFloat(userLat), parseFloat(userLng), defaultLat, defaultLng);
            if (distance <= 150) isWithinGeofence = true;
        }


        // 4. Validate Already Marked
        let alreadyMarked = false;
        const attSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" });
        const attData = attSheet.data.values || [];
        for (let i = 1; i < attData.length; i++) {
            if (attData[i][1] && attData[i][1].toLowerCase() === email.toLowerCase()) {
                if (attData[i][8] === dateOnly || attData[i][0].includes(now.toLocaleDateString())) {
                    alreadyMarked = true;
                    break;
                }
            }
        }


        // EXECUTE STRICT REJECTIONS
        if (alreadyMarked) return res.status(400).json({ success: false, message: "Attendance already marked for today." });
        if (!isScheduledToday) return res.status(400).json({ success: false, message: "No active session scheduled today for your branch." });
        if (!isTimeValid) return res.status(400).json({ success: false, message: "Attendance allowed only between 9:30 AM and 7:00 PM." });
        if (!isWithinGeofence) return res.status(400).json({ success: false, message: `Location Restriction: Must be within 150m of campus.` });


        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Talentino_Attendance!A:J", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, email, name, branch, course, location, `${rating} / 5 Stars`, feedback || "None", dateOnly, "None"]] },
        });


        res.status(200).json({ success: true, message: "Attendance marked successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to submit attendance." });
    }
};


const applyForJob = async (req, res) => {
    try {
        const { email, jobId, companyName, name, phone, rollNo, course, branch, qualification, resume } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString();


        let position = "N/A";
        let placementOfficer = "TPO Auto-Assigned";
        try {
            const nlSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" });
            const nlData = nlSheet.data.values || [];
            for (let i = 1; i < nlData.length; i++) {
                let currentId = nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}`;
                if (currentId.toString().trim() === jobId.toString().trim()) {
                    position = nlData[i][4] || "N/A";
                    placementOfficer = nlData[i][17] || "TPO Auto-Assigned";
                    break;
                }
            }
        } catch (e) { }


        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Opening_Applied!A:N", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, name, phone, email, rollNo, course, branch, qualification || "N/A", resume || "N/A", jobId, companyName || "N/A", position, placementOfficer, "Applied"]] },
        });


        res.status(200).json({ success: true, message: "Applied successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to apply for job." });
    }
};


// --- NEW FEATURES (Profile, Documents, Settings, Issues) ---


const updateProfile = async (req, res) => {
    try {
        const { email, age, gender, parentName, parentContact, studyStatus, completedDate, stream, homeTown, fresherStatus, qualification, linkedin, instagram, placementReq } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;


        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
       
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                targetRowIndex = i + 1; // 1-based index
                break;
            }
        }


        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });


        // Batch Update perfectly mapped to the correct columns
        await googleSheets.spreadsheets.values.batchUpdate({
            auth, spreadsheetId,
            resource: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: `Data!K${targetRowIndex}:Q${targetRowIndex}`, values: [[homeTown, qualification, stream, fresherStatus, linkedin, instagram, placementReq]] },
                    { range: `Data!W${targetRowIndex}:Z${targetRowIndex}`, values: [[parentName, parentContact, studyStatus, completedDate || "N/A"]] },
                    { range: `Data!AA${targetRowIndex}:AB${targetRowIndex}`, values: [[age, gender]] }
                ]
            }
        });


        // Fetch updated user to send back
        const updatedRow = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: `Data!A${targetRowIndex}:AD${targetRowIndex}` });
        const user = updatedRow.data.values[0];


        res.status(200).json({ success: true, message: "Profile updated successfully!", user: {
            homeTown: user[10] || "N/A", qualification: user[11] || "N/A", stream: user[12] || "N/A",
            fresherStatus: user[13] || "N/A", linkedin: user[14] || "N/A", instagram: user[15] || "N/A",
            placementReq: user[16] || "N/A", parentName: user[22] || "N/A", parentContact: user[23] || "N/A",
            studyStatus: user[24] || "Currently Studying", completedDate: user[25] || "N/A",
            age: user[26] || "N/A", gender: user[27] || "N/A"
        } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
};


const uploadDocument = async (req, res) => {
    try {
        const { email, rollNo, base64, docType } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;


        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                targetRowIndex = i + 1; break;
            }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found" });


        const filename = `${rollNo}_${docType}.pdf`;
       
        const response = await fetch(process.env.APPS_SCRIPT_PHOTO_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: base64.replace(/^data:application\/pdf;base64,/, ""),
                filename: filename,
                folderId: process.env.DRIVE_FOLDER_ID
            })
        });
        const result = await response.json();
       
        if (!result.success) return res.status(500).json({ success: false, message: "Drive upload failed" });


        // Resume is V (index 21), Certificate is AC (index 28)
        const col = docType === 'Resume' ? 'V' : 'AC';
        await googleSheets.spreadsheets.values.update({
            auth, spreadsheetId, range: `Data!${col}${targetRowIndex}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[result.url]] }
        });


        res.status(200).json({ success: true, message: `${docType} uploaded successfully!`, url: result.url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to upload document." });
    }
};


const updatePassword = async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;


        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                if (rows[i][4] !== currentPassword) return res.status(400).json({ success: false, message: "Incorrect current password." });
                targetRowIndex = i + 1; break;
            }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });


        await googleSheets.spreadsheets.values.update({
            auth, spreadsheetId, range: `Data!E${targetRowIndex}`, valueInputOption: "USER_ENTERED",
            resource: { values: [[newPassword]] }
        });
        res.status(200).json({ success: true, message: "Password updated successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update password." });
    }
};


const submitIssue = async (req, res) => {
    try {
        const { email, name, branch, course, issueDetails } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString();


        // Issues Sheet: Timestamp | Name | Roll No | Email | Branch | Course | GPS | Issue | Status
        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Issues!A:I", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, name, "N/A", email, branch, course, "N/A", issueDetails, "Pending"]] },
        });
        res.status(200).json({ success: true, message: "Issue reported successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to submit issue." });
    }
};


module.exports = {
    getDashboardData,
    markAttendance,
    applyForJob,
    updateProfile,
    uploadDocument,
    updatePassword,
    submitIssue
};
