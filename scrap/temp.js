const express = require('express');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 5000;

// Paths
const HTML_FILE = path.resolve('./test.html');
const MATCHES_CSV = path.resolve('../matches_updated.csv');
const OUTPUT_CSV = path.resolve('./matches_with_referee.csv');
const JSON_FILE = path.resolve('../data/24_25_laliga.json');

// ✅ Team name mapping
const teamNameMap = {
    "Athletic Club": "Ath Bilbao",
    "Getafe": "Getafe",
    "Betis": "Betis",
    "Celta Vigo": "Celta",
    "Girona": "Girona",
    "Alavés": "Alaves",
    "Las palmas": "Las palmas",
    "Sevilla": "Sevilla",
    "Osasuna": "Osasuna",
    "Valencia": "Valencia",
    "Barcelona": "Barcelona",
    "Leganés": "Leganes",
    "Real Sociedad": "Sociedad",
    "Rayo Vallecano": "Vallecano",
    "Valladolid": "Valladolid",
    "Espanyol": "Espanol",
    "Villarreal": "Villarreal",
    "Atlético Madrid": "Ath Madrid",
    "Mallorca": "Mallorca",
    "Real Madrid": "Real Madrid"
};

// Normalize function
function normalizeTeamName(name) {
    return teamNameMap[name] || name;
}

async function scrapeGoalEvents(matchReportUrl) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    try {
        console.log('Navigating to match report page...');
        await page.goto(`https://fbref.com/${matchReportUrl}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        const possibleSelectors = [
            '.event',
            '[data-event]',
            '.events .event',
            'div[class*="event"]',
            '.match-events .event',
            'table#events tbody tr',
            '#events tbody tr',
            '.shots_all tbody tr',
            'table.stats_table tbody tr',
            '.events tbody tr',
            'div.event_a, div.event_h',
            '.match_events tbody tr'
        ];

        let eventElements = null;
        let usedSelector = null;

        for (const selector of possibleSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    eventElements = elements;
                    usedSelector = selector;
                    console.log(`Using selector: ${selector} (${elements.length} elements found)`);
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        let eventData = [];

        if (eventElements) {
            eventData = await page.evaluate((selector) => {
                const events = Array.from(document.querySelectorAll(selector)).slice(0, 2);
                return Array.from(events).map((event, index) => ({
                    index: index + 1,
                    outerHTML: event.outerHTML,
                    textContent: event.textContent.trim(),
                    className: event.className
                }));
            }, usedSelector);
        }

        // console.log("Event Data:", eventData);

const homeScorers = [];
const awayScorers = [];

eventData.forEach(event => {
    if (!event.className.includes('event')) return;

    const $ = cheerio.load(event.outerHTML);

    $('div > div').each((i, div) => {
        const divElem = $(div);

        let eventType = '';
        if (divElem.find('.event_icon.goal').length) eventType = 'goal';
        else if(divElem.find('.event_icon.penalty_goal').length) eventType = 'penalty';
        else return;

        const aTag = divElem.find('a').first();
        if (!aTag.length) return;

        let playerName = aTag.text().trim();

        if (playerName.includes('(OG)')) return;
        playerName = playerName.replace(/\(P\)/g, '').trim();

        // const finalEntry = `${playerName} (${eventType})`;

        if (event.outerHTML.includes('id="a"')) homeScorers.push(playerName);
        else if (event.outerHTML.includes('id="b"')) awayScorers.push(playerName);
    });
});

// console.log('Home Scorers:', homeScorers);
// console.log('Away Scorers:', awayScorers);

        return { homeScorers, awayScorers };
    } catch (error) {
        console.error('Error scraping match:', error);
        return { homeScorers: [], awayScorers: [] };
    } finally {
        await browser.close();
    }
}

app.get('/go', async (req, res) => {
    try {
        const html = fs.readFileSync(HTML_FILE, 'utf8');
        const $ = cheerio.load(html);

        console.log(req.query);

        // return res.json({ success: false, message: "No matches found" });

        const start = parseInt(req.query.start) || 1;
        const end = parseInt(req.query.end) || 10;
        const rows = $('table tbody tr').slice(start-1, end);

        console.log("Rows to scrape:", rows.length);

        let scrapedData = [];

        // --- Scrape each row in range ---
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = $(row).find('td');
            if (cells.length < 12) continue;

            const url = $(cells[11]).find('a').attr('href') || '';
            console.log("Going for data: ", start+i);
            const scorer = await scrapeGoalEvents(url);

            scrapedData.push({
                homeTeam: normalizeTeamName($(cells[3]).text().trim()),
                awayTeam: normalizeTeamName($(cells[7]).text().trim()),
                homeXG: $(cells[4]).text().trim(),
                awayXG: $(cells[6]).text().trim(),
                referee: $(cells[10]).text().trim(),
                matchReportUrl: url,
                homeScorers: scorer.homeScorers || [],
                awayScorers: scorer.awayScorers || []
            });
        }

        if (scrapedData.length === 0) {
            return res.json({ success: false, message: "No matches found" });
        }

        // --- Read CSV ---
        const matches = [];
        fs.createReadStream(MATCHES_CSV)
            .pipe(csv())
            .on('data', (row) => {
                scrapedData.forEach(match => {
                    if (normalizeTeamName(row.HomeTeam) === match.homeTeam &&
                        normalizeTeamName(row.AwayTeam) === match.awayTeam) {
                        row.Referee = match.referee;
                        row.HomeScored = match.homeScorers.join('; ');
                        row.AwayScored = match.awayScorers.join('; ');
                    }
                });
                matches.push(row);
            })
            .on('end', async () => {
                // --- Write updated CSV ---
                const headers = Object.keys(matches[0]);
                const csvWriter = createObjectCsvWriter({
                    path: OUTPUT_CSV,
                    header: headers.map(h => ({ id: h, title: h }))
                });
                await csvWriter.writeRecords(matches);
                console.log(`Updated CSV saved as ${OUTPUT_CSV}`);

                // --- Update JSON ---
                let jsonData = [];
                if (fs.existsSync(JSON_FILE)) {
                    jsonData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
                }

                scrapedData.forEach(match => {
                    jsonData = jsonData.map(m => {
                        if (normalizeTeamName(m.HomeTeam) === match.homeTeam &&
                            normalizeTeamName(m.AwayTeam) === match.awayTeam) {
                            return {
                                ...m,
                                Referee: match.referee,
                                Scorers: {
                                    HomeScored: match.homeScorers,
                                    AwayScored: match.awayScorers
                                }
                            };
                        }
                        return m;
                    });
                });

                fs.writeFileSync(JSON_FILE, JSON.stringify(jsonData, null, 4), 'utf-8');
                console.log(`Updated JSON saved as ${JSON_FILE}`);

                res.json({ success: true, data: scrapedData });
            })
            .on('error', (err) => {
                console.error('Error reading CSV:', err);
                res.status(500).json({ success: false, message: 'Failed to read matches.csv' });
            });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
