const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeGoalEvents() {
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
        await page.goto('https://fbref.com/en/matches/f13e982e/Real-Betis-Girona-August-15-2024-La-Liga', {
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
                const playerName = event.textContent.split('·')[0].trim();
                if (event.outerHTML.includes('id="a"')) {
                    homeScorers.push(playerName);
                } else if (event.outerHTML.includes('id="b"')) {
                    awayScorers.push(playerName);
                }
            }
        });

        const finalResult = {
            events: eventData,
            homeScorers,
            awayScorers
        };

        fs.writeFileSync('match_goals.json', JSON.stringify(finalResult, null, 2));
        console.log('Home and away scorers saved to match_goals.json');
        console.log("home scorers: ", finalResult.homeScorers);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

scrapeGoalEvents().catch(console.error);
