const express = require('express');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 5000;

// Input & Output
const HTML_FILE = path.resolve('./ucl_24_25.html');
const JSON_FILE = path.resolve('./copa_24_25.json');

// ✅ Your original Spain clubs map (unchanged)
const spainNameMap = {
    "Ath Bilbao": "Ernesto Valverde",
    "Getafe": "José Bordalás",
    "Betis": "Manuel Pellegrini",
    "Girona": "Míchel",
    "Celta": "Claudio Giráldez",
    "Alaves": "Eduardo Coudet",
    "Las Palmas": "Diego Martínez",
    "Sevilla": "Joaquín Caparrós",
    "Osasuna": "Vicente Moreno",
    "Leganes": "Borja Jiménez",
    "Valencia": "Carlos Corberán",
    "Barcelona": "Hansi Flick",
    "Sociedad": "Imanol Alguacil",
    "Vallecano": "Iñigo Pérez",
    "Mallorca": "Jagoba Arrasate",
    "Real Madrid": "Carlo Ancelotti",
    "Valladolid": "Álvaro Rubio",
    "Espanol": "Manolo González",
    "Villarreal": "Marcelino",
    "Ath Madrid": "Diego Simeone"
};

// Normalize team name
function normalizeTeamName($, cell) {
    const link = $(cell).find('a');
    const teamName = link.text().trim();
    const titleAttr = $(cell).find('span[title]').attr('title') || "";

    if (titleAttr === "Spain" && spainNameMap[teamName]) {
        return teamName; // ✅ keep your map’s keys as final team names
    }
    return teamName;
}

app.get('/go', async (req, res) => {
    try {
        const html = fs.readFileSync(HTML_FILE, 'utf8');
        const $ = cheerio.load(html);

        const start = parseInt(req.query.start) || 1;
        const end = parseInt(req.query.end) || 10;
        const rows = $('table tbody tr');

        let scrapedData = [];

        rows.each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 13) return;

            const date = $(cells[1]).text().trim();
            const homeTeam = normalizeTeamName($, cells[3]);
            const scoreText = $(cells[5]).text().trim().replace(/\s/g, '');
            const awayTeam = normalizeTeamName($, cells[7]);
            const referee = $(cells[10]).text().trim();

            let homeGoals = null;
            let awayGoals = null;
            let result = "D";

            if (scoreText.includes("–") || scoreText.includes("-")) {
                const parts = scoreText.split(/–|-/).map(s => s.trim());
                if (parts.length === 2) {
                    homeGoals = parseInt(parts[0], 10);
                    awayGoals = parseInt(parts[1], 10);

                    if (homeGoals > awayGoals) result = "H";
                    else if (awayGoals > homeGoals) result = "A";
                }
            }

            scrapedData.push({
                date,
                homeTeam,
                awayTeam,
                result,
                homeGoals,
                awayGoals,
                referee,
                league: "copa",
                season: "2024-25"
            });
        });

        if (scrapedData.length === 0) {
            return res.json({ success: false, message: "No matches found" });
        }

        fs.writeFileSync(JSON_FILE, JSON.stringify(scrapedData, null, 4), 'utf-8');
        console.log(`Saved ${scrapedData.length} matches to ${JSON_FILE}`);

        res.json({ success: true, data: scrapedData });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
