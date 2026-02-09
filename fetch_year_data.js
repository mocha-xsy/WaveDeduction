/**
 * 黄金历史数据抓取脚本
 *
 * 使用 Playwright 模拟浏览器请求 tvc4.investing.com 的 history API，绕过 Cloudflare 限制。
 *
 * 前置：npm install && npx playwright install chromium
 *
 * 用法：node fetch_year_data.js [开始日期]
 * 示例：node fetch_year_data.js 2025-01-01
 */
const fs = require('fs');

// Investing.com TVC API 配置
// token 会过期，若请求失败请从浏览器 Network 面板复制最新 history 请求 URL 中的 token 更新
const TVC_API_CONFIG = {
    tokenPart1: '8ec1d14e6f65b8b2460e786b59a7ba71',
    tokenPart2: '1770517558',
    referer: 'https://tvc-cncdn-cf.investing.com/',
};

function parseStartDate(dateString) {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

function getBatchRanges(from, to) {
    const ranges = [];
    const batchSize = 30 * 24 * 60 * 60;
    let currentFrom = from;
    while (currentFrom < to) {
        const currentTo = Math.min(currentFrom + batchSize, to);
        ranges.push({ from: currentFrom, to: currentTo });
        currentFrom = currentTo + 1;
    }
    return ranges;
}

function convertToChinaTime(timestamp) {
    const date = new Date(timestamp * 1000);
    date.setHours(date.getHours() + 8);
    return date;
}

function formatChinaTimeString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function generateMockData(from, to) {
    const dataPoints = [];
    const current = new Date(from * 1000);
    current.setMinutes(0, 0, 0);
    const end = new Date(to * 1000);
    let basePrice = 4950 + Math.random() * 10;

    while (current <= end) {
        const timestamp = Math.floor(current.getTime() / 1000);
        const open = parseFloat((basePrice + Math.random() * 5 - 2.5).toFixed(2));
        const high = parseFloat((open + Math.random() * 15).toFixed(2));
        const low = parseFloat((open - Math.random() * 10).toFixed(2));
        const close = parseFloat((low + Math.random() * (high - low)).toFixed(2));
        dataPoints.push({
            timestamp,
            open,
            high,
            low,
            close,
            volume: Math.floor(Math.random() * 10000)
        });
        current.setHours(current.getHours() + 1);
        basePrice = close;
    }
    return dataPoints;
}

function processData(allData) {
    const mergedData = { t: [], c: [], o: [], h: [], l: [], v: [] };
    allData.forEach(batch => {
        if (batch && batch.t && batch.t.length > 0) {
            mergedData.t = [...mergedData.t, ...batch.t];
            mergedData.c = [...mergedData.c, ...batch.c];
            mergedData.o = [...mergedData.o, ...batch.o];
            mergedData.h = [...mergedData.h, ...batch.h];
            mergedData.l = [...mergedData.l, ...batch.l];
            mergedData.v = [...mergedData.v, ...(batch.v || Array(batch.t.length).fill(0))];
        }
    });
    const timePriceObjects = mergedData.t.map((timestamp, index) => {
        const chinaDate = convertToChinaTime(timestamp);
        return {
            timestamp,
            time: formatChinaTimeString(chinaDate),
            chinaTime: chinaDate.toISOString(),
            open: mergedData.o[index],
            high: mergedData.h[index],
            low: mergedData.l[index],
            close: mergedData.c[index],
            volume: mergedData.v[index] || 'n/a'
        };
    });
    return {
        symbol: 68,
        resolution: 60,
        from: mergedData.t[0] || 0,
        to: mergedData.t[mergedData.t.length - 1] || 0,
        data: timePriceObjects
    };
}

async function fetchDataViaPlaywright(ranges) {
    let playwright;
    try {
        playwright = require('playwright');
    } catch (e) {
        throw new Error('请先安装 playwright: npm install playwright --save-dev && npx playwright install chromium');
    }

    const { tokenPart1, tokenPart2, referer } = TVC_API_CONFIG;
    const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const allData = [];
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'zh-CN',
            extraHTTPHeaders: { Referer: referer }
        });

        const page = await context.newPage();

        for (let i = 0; i < ranges.length; i++) {
            const { from: f, to: t } = ranges[i];
            const url = `https://tvc4.investing.com/${tokenPart1}/${tokenPart2}/6/6/28/history?symbol=68&resolution=60&from=${f}&to=${t}`;
            console.log(`[${i + 1}/${ranges.length}] 请求 ${url.substring(0, 90)}...`);

            let batch = null;
            try {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                if (response && response.ok()) {
                    batch = await response.json();
                }
            } catch (e) {
                console.warn(`  请求失败: ${e.message}`);
            }

            if (batch && batch.t && batch.t.length > 0) {
                allData.push(batch);
                console.log(`  成功: ${batch.t.length} 条`);
            } else {
                console.warn(`  无数据`);
            }

            await page.waitForTimeout(800);
        }
    } finally {
        await browser.close();
    }
    return allData;
}

async function main() {
    try {
        console.log('Starting to fetch gold data (Playwright)...');

        const startDateString = process.argv[2] || '2025-01-01';
        const from = parseStartDate(startDateString);
        const to = Math.floor(Date.now() / 1000);

        console.log(`时间范围: ${new Date(from * 1000).toISOString()} ~ ${new Date(to * 1000).toISOString()}`);

        const ranges = getBatchRanges(from, to);
        console.log(`共 ${ranges.length} 批`);

        const allData = await fetchDataViaPlaywright(ranges);

        if (allData.length > 0) {
            const finalData = processData(allData);
            const outputPath = 'gold_1year_data_real.json';
            fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2));
            console.log(`\n数据已保存: ${outputPath}`);
            console.log(`共 ${finalData.data.length} 条`);
            if (finalData.data.length > 0) {
                console.log(`时间范围: ${finalData.data[0].time} ~ ${finalData.data[finalData.data.length - 1].time}`);
            }
        } else {
            console.warn('未获取到有效数据，生成模拟数据...');
            const mockData = ranges.map(r => {
                const points = generateMockData(r.from, r.to);
                return {
                    t: points.map(p => p.timestamp),
                    c: points.map(p => p.close),
                    o: points.map(p => p.open),
                    h: points.map(p => p.high),
                    l: points.map(p => p.low),
                    v: points.map(p => p.volume)
                };
            });
            const finalData = processData(mockData);
            fs.writeFileSync('gold_1year_data_mock.json', JSON.stringify(finalData, null, 2));
            console.log('模拟数据已保存: gold_1year_data_mock.json');
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
