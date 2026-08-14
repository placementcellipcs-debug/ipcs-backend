const connectSheet = require('../config/db');

// Exponential Backoff Retry Function
const withRetry = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1 || (error.code !== 429 && !error.message?.includes('quota'))) {
                throw error;
            }
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
};

// 1. Fetch Questions for the Test (Hides correct answers from initial load)
const getAptitudeTest = async (req, res) => {
    try {
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Aptitude_Questions!A:J" })
        );

        const rows = getRows.data.values || [];
        let questions = [];

        for (let i = 1; i < rows.length; i++) {
            const status = (rows[i][9] || "active").toLowerCase().trim();
            if (status.includes("inactive") || status === "false") continue;

            questions.push({
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

        // Shuffle questions for fairness
        questions = questions.sort(() => Math.random() - 0.5);

        return res.status(200).json({ 
            success: true, 
            questions, 
            timeLimitMinutes: 20 // 20 minutes default duration
        });
    } catch (error) {
        console.error("Fetch Aptitude Error:", error);
        return res.status(500).json({ success: false, message: "Failed to load aptitude test." });
    }
};

// 2. Validate Answers, Compute Score & Save to Sheet
const submitAptitudeTest = async (req, res) => {
    try {
        const { email, name, rollNo, branch, userAnswers, timeSpentSeconds } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Aptitude_Questions!A:J" })
        );

        const rows = getRows.data.values || [];
        const questionBank = {};

        for (let i = 1; i < rows.length; i++) {
            const qId = rows[i][0];
            if (qId) {
                questionBank[qId] = {
                    category: rows[i][1] || "General",
                    question: rows[i][2] || "",
                    options: { A: rows[i][3], B: rows[i][4], C: rows[i][5], D: rows[i][6] },
                    correct: (rows[i][7] || "").toUpperCase().trim(),
                    explanation: rows[i][8] || "No explanation provided."
                };
            }
        }

        let totalScore = 0;
        let totalQuestions = Object.keys(userAnswers || {}).length;
        let reviewList = [];
        let categoryStats = {};

        Object.entries(userAnswers || {}).forEach(([qId, selectedOption]) => {
            const q = questionBank[qId];
            if (!q) return;

            const isCorrect = q.correct === selectedOption;
            if (isCorrect) totalScore++;

            if (!categoryStats[q.category]) {
                categoryStats[q.category] = { correct: 0, total: 0 };
            }
            categoryStats[q.category].total++;
            if (isCorrect) categoryStats[q.category].correct++;

            reviewList.push({
                id: qId,
                category: q.category,
                question: q.question,
                options: q.options,
                selectedOption,
                correctOption: q.correct,
                isCorrect,
                explanation: q.explanation
            });
        });

        const percentage = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
        const minutes = Math.floor((timeSpentSeconds || 0) / 60);
        const seconds = (timeSpentSeconds || 0) % 60;
        const timeTakenFormatted = `${minutes}m ${seconds}s`;

        const categoryBreakdownStr = Object.entries(categoryStats)
            .map(([cat, stat]) => `${cat}: ${stat.correct}/${stat.total}`)
            .join(' | ');

        // Save Attempt to Google Sheet
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
            categoryBreakdownStr
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

        return res.status(200).json({
            success: true,
            results: {
                totalScore,
                totalQuestions,
                percentage,
                timeTakenFormatted,
                categoryStats,
                reviewList
            }
        });
    } catch (error) {
        console.error("Submit Aptitude Error:", error);
        return res.status(500).json({ success: false, message: "Failed to evaluate assessment." });
    }
};

// 3. Fetch Student Past Test History
const getTestHistory = async (req, res) => {
    try {
        const { email } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() =>
            googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Aptitude_Results!A:J" })
        );

        const rows = getRows.data.values || [];
        const history = [];

        for (let i = rows.length - 1; i >= 1; i--) {
            if (rows[i][3] && rows[i][3].toLowerCase() === (email || "").toLowerCase()) {
                history.push({
                    date: rows[i][0],
                    score: rows[i][5],
                    total: rows[i][6],
                    percentage: rows[i][7],
                    timeTaken: rows[i][8],
                    breakdown: rows[i][9]
                });
            }
        }

        return res.status(200).json({ success: true, history });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch test history." });
    }
};

module.exports = { getAptitudeTest, submitAptitudeTest, getTestHistory };