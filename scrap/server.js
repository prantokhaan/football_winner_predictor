const express = require('express');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const stringSimilarity = require('string-similarity');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 5000;

// Paths
const HTML_FILE = path.resolve('./test.html');
const MATCHES_CSV = path.resolve('../matches_updated.csv');
const OUTPUT_CSV = path.resolve('./matches_with_referee.csv');

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

        console.log('Taking screenshot for debugging...');
        await page.screenshot({ path: 'fbref_page.png', fullPage: true });
        console.log('Screenshot saved as fbref_page.png');

        // Selectors to find match events
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

        if (!eventElements) {
            console.log('No event selectors worked. Saving page source for inspection...');
            const pageContent = await page.content();
            fs.writeFileSync('fbref_page_source.html', pageContent);
            console.log('Page source saved as fbref_page_source.html');
        } else {
            // Extract events
            eventData = await page.evaluate((selector) => {
                const events = document.querySelectorAll(selector);
                const result = [];
                events.forEach((event, index) => {
                    result.push({
                        index: index + 1,
                        outerHTML: event.outerHTML,
                        textContent: event.textContent.trim(),
                        className: event.className
                    });
                });
                return result;
            }, usedSelector);

            fs.writeFileSync('match_events.json', JSON.stringify(eventData, null, 2));
            console.log('Event data saved to match_events.json');
        }

        // --- Extract homeScorers and awayScorers ---
        const homeScorers = [];
const awayScorers = [];

eventData.forEach(event => {
    if (event.className.includes('event') && event.outerHTML.includes('event_icon goal')) {
        const lines = event.textContent.split('\n').map(line => line.trim()).filter(Boolean);

        lines.forEach(line => {
            const playerName = line.split('·')[0].trim();

            // Skip if the scorer has (P)
            if (playerName.includes('(P)')) return;

            if (event.outerHTML.includes('id="a"')) homeScorers.push(playerName);
            else if (event.outerHTML.includes('id="b"')) awayScorers.push(playerName);
        });
    }
});


        const finalResult = {
            homeScorers,
            awayScorers
        };

        fs.writeFileSync('match_goals.json', JSON.stringify(finalResult, null, 2));
        console.log('Home and away scorers saved to match_goals.json');
        console.log("home scorers: ", finalResult.homeScorers);

        return finalResult;

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

app.get('/go', async (req, res) => {
    try {
        // 1️⃣ Extract data from test.html
        const html = fs.readFileSync(HTML_FILE, 'utf8');
        const $ = cheerio.load(html);

        const scrapedData = [];
        $('table tbody tr').each(async (i, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 12) {
              let url = $(cells[11]).find('a').attr('href') || '';

              let scorer = await scrapeGoalEvents(url);
                scrapedData.push({
                    homeTeam: $(cells[3]).text().trim(),
                    awayTeam: $(cells[7]).text().trim(),
                    homeXG: $(cells[4]).text().trim(),
                    awayXG: $(cells[6]).text().trim(),
                    referee: $(cells[10]).text().trim(),
                    matchReportUrl: $(cells[11]).find('a').attr('href') || '',
                    homeScorers: scorer.homeScorers || [],
                    awayScorers: scorer.awayScorers || []
                });
            }
        });

        // 2️⃣ Read matches_updated.csv and update Referee column using fuzzy matching
        const matches = [];
        fs.createReadStream(MATCHES_CSV)
            .pipe(csv())
            .on('data', (row) => {
                // Find best match for home and away team in scrapedData
                const homeNames = scrapedData.map(m => m.homeTeam);
                const awayNames = scrapedData.map(m => m.awayTeam);

                const bestHomeMatch = stringSimilarity.findBestMatch(row.HomeTeam, homeNames);
                const bestAwayMatch = stringSimilarity.findBestMatch(row.AwayTeam, awayNames);

                // Find the match with best similarity
                const matched = scrapedData.find(m => 
                    m.homeTeam === bestHomeMatch.bestMatch.target && 
                    m.awayTeam === bestAwayMatch.bestMatch.target
                );

                if (matched) {
                    row.Referee = matched.referee;
                    row.HomeScorers = matched.homeScorers.join('; ');
                    row.AwayScorers = matched.awayScorers.join('; ');
                }

                matches.push(row);
            })
            .on('end', async () => {
                // 3️⃣ Write updated CSV
                if (matches.length > 0) {
                    const headers = Object.keys(matches[0]);
                    const csvWriter = createObjectCsvWriter({
                        path: OUTPUT_CSV,
                        header: headers.map(h => ({ id: h, title: h }))
                    });

                    await csvWriter.writeRecords(matches);
                    console.log(`Updated CSV saved as ${OUTPUT_CSV}`);
                }

                // 4️⃣ Return scraped JSON
                res.json({ success: true, data: scrapedData });
            })
            .on('error', (err) => {
                console.error('Error reading CSV:', err);
                res.status(500).json({ success: false, message: 'Failed to read matches.csv' });
            });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ success: false, message: 'Failed to extract table data or update CSV' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
