const connectSheet = require('../config/db');

const withRetry = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); } 
        catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
};

// 1. Fetch & Gamify Questions by Levels
const getAptitudeTest = async (req, res) => {
    try {
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Aptitude_Questions!A:K" })
        );

        const rows = getRows.data.values || [];
        let levels = { 1: [], 2: [], 3: [] };

        for (let i = 1; i < rows.length; i++) {
            const status = (rows[i][9] || "active").toLowerCase().trim();
            if (status.includes("inactive") || status === "false") continue;

            let level = parseInt(rows[i][10]) || 1; // Column K is the Level
            if (level < 1 || level > 3) level = 1;

            levels[level].push({
                id: rows[i][0] || `Q-${i}`,
                category: rows[i][1] || "General",
                question: rows[i][2] || "",
                options: {
                    A: rows[i][3] || "",
                    B: rows[i][4] || "",
                    C: rows[i][5] || "",
                    D: rows[i][6] || ""
                }
            });
        }

        // Shuffle questions within each level to prevent cheating
        for (let l = 1; l <= 3; l++) {
            levels[l] = levels[l].sort(() => Math.random() - 0.5);
        }

        return res.status(200).json({ 
            success: true, 
            levels, 
            timeLimits: { 1: 10, 2: 15, 3: 20 } // Minutes per level
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to load aptitude engine." });
    }
};

// 2. Submit Final Score
const submitAptitudeTest = async (req, res) => {
    try {
        const { email, name, rollNo, branch, totalScore, totalQuestions, finalLevel, totalTimeSeconds } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const percentage = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
        const minutes = Math.floor((totalTimeSeconds || 0) / 60);
        const seconds = (totalTimeSeconds || 0) % 60;
        const timeTakenFormatted = `${minutes}m ${seconds}s`;

        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        
        const newResultRow = [
            timestamp,
            rollNo || "N/A",
            name || "Student",
            email || "N/A",
            branch || "Bangalore",
            String(totalScore),
            String(totalQuestions),
            `${percentage}%`,
            timeTakenFormatted,
            `Reached Level ${finalLevel}`
        ];

        await withRetry(() =>
            googleSheets.spreadsheets.values.append({
                auth,
                spreadsheetId,
                range: "Aptitude_Results!A:J",
                valueInputOption: "USER_ENTERED",
                resource: { values: [newResultRow] }
            })
        );

        return res.status(200).json({ success: true, message: "Score registered." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to save score." });
    }
};

// 3. Generate Leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Aptitude_Results!A:J" })
        );

        const rows = getRows.data.values || [];
        let allScores = [];

        // Skip headers
        for (let i = 1; i < rows.length; i++) {
            const score = parseInt(rows[i][5]) || 0;
            const timeStr = rows[i][8] || "0m 0s";
            
            // Convert time string "Xm Ys" to total seconds for tie-breaking
            const timeParts = timeStr.match(/(\d+)m\s*(\d+)s/);
            let timeInSeconds = 9999;
            if (timeParts) {
                timeInSeconds = (parseInt(timeParts[1]) * 60) + parseInt(timeParts[2]);
            }

            allScores.push({
                name: rows[i][2] || "Student",
                branch: rows[i][4] || "Unknown",
                score: score,
                percentage: rows[i][7] || "0%",
                levelReached: rows[i][9] || "Level 1",
                timeSeconds: timeInSeconds
            });
        }

        // Sort by Highest Score -> Then by Lowest Time Taken
        allScores.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeSeconds - b.timeSeconds;
        });

        // Return Top 10
        const top10 = allScores.slice(0, 10);

        return res.status(200).json({ success: true, leaderboard: top10 });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch leaderboard." });
    }
};

// 4. Get Student History (UPDATED TO FETCH ALL 3 SHEETS)
const getTestHistory = async (req, res) => {
    try {
        const { email } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const fetchSheet = async (range) => {
            try {
                const response = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range }));
                return response.data.values || [];
            } catch (e) { return []; }
        };

        const aptRows = await fetchSheet("Aptitude_Results!A:J");
        const talRows = await fetchSheet("Talentino_Results!A:J");
        const techRows = await fetchSheet("Tech_Results!A:J");

        const history = [];

        const parseRows = (rows, type) => {
            for (let i = rows.length - 1; i >= 1; i--) {
                if (rows[i][3] && rows[i][3].toLowerCase() === (email || "").toLowerCase()) {
                    if (type === 'aptitude') {
                        history.push({ date: rows[i][0], score: rows[i][5], timeTaken: rows[i][8], levelReached: rows[i][9], type: 'aptitude' });
                    } else {
                        history.push({ date: rows[i][0], levelReached: rows[i][5], score: rows[i][6], timeTaken: rows[i][9], type: type });
                    }
                }
            }
        };

        parseRows(aptRows, 'aptitude');
        parseRows(talRows, 'talentino');
        parseRows(techRows, 'technical');

        return res.status(200).json({ success: true, history });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch test history." });
    }
};

// --- NEW: FETCH TALENTINO / TECH EXAM ---
const getSpecificTest = async (req, res) => {
    try {
        const { type, course, testNum } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const sheetName = type === 'talentino' ? "Talentino_Questions!A:K" : "Tech_Questions!A:K";
        
        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: sheetName })
        );

        const rows = getRows.data.values || [];
        let questions = [];

        for (let i = 1; i < rows.length; i++) {
            const status = (rows[i][9] || "active").toLowerCase().trim();
            if (status.includes("inactive") || status === "false") continue;

            if (type === 'talentino') {
                const rowTestNum = parseInt(rows[i][1]) || 1;
                if (rowTestNum === testNum) {
                    questions.push({ id: rows[i][0] || `Q-${i}`, category: `Test ${testNum}`, question: rows[i][2], options: { A: rows[i][3], B: rows[i][4], C: rows[i][5], D: rows[i][6] } });
                }
            } else if (type === 'technical') {
                const rowCourse = (rows[i][1] || "").toLowerCase().trim();
                if (rowCourse === course.toLowerCase().trim()) {
                    questions.push({ id: rows[i][0] || `Q-${i}`, category: course, question: rows[i][2], options: { A: rows[i][3], B: rows[i][4], C: rows[i][5], D: rows[i][6] } });
                }
            }
        }

        // Shuffle questions
        questions = questions.sort(() => Math.random() - 0.5);

        return res.status(200).json({ success: true, levels: { 1: questions }, timeLimits: { 1: type === 'technical' ? 45 : 20 } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to load exam engine." });
    }
};

// --- NEW: SUBMIT TALENTINO / TECH EXAM ---
const submitSpecificTest = async (req, res) => {
    try {
        const { type, email, name, rollNo, branch, course, totalScore, totalQuestions, totalTimeSeconds, testNum } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const percentage = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
        const timeTakenFormatted = `${Math.floor((totalTimeSeconds || 0) / 60)}m ${(totalTimeSeconds || 0) % 60}s`;
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        
        let sheetName = type === 'talentino' ? "Talentino_Results!A:J" : "Tech_Results!A:J";
        let specificCol = type === 'talentino' ? `Test ${testNum}` : course;

        const newResultRow = [ timestamp, rollNo || "N/A", name || "Student", email, branch || "N/A", specificCol, String(totalScore), String(totalQuestions), `${percentage}%`, timeTakenFormatted ];

        await withRetry(() =>
            googleSheets.spreadsheets.values.append({ auth, spreadsheetId, range: sheetName, valueInputOption: "USER_ENTERED", resource: { values: [newResultRow] } })
        );

        return res.status(200).json({ success: true, message: "Score registered." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to save score." });
    }
};

module.exports = { getAptitudeTest, submitAptitudeTest, getTestHistory, getLeaderboard, getSpecificTest, submitSpecificTest };