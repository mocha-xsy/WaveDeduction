/**
 * 黄金历史数据抓取脚本
 *
 * 使用 Playwright 请求 tvc4.investing.com 的 history API。为规避 Cloudflare：
 * - 使用系统安装的 Chrome（channel: 'chrome'）并持久化用户目录，首次可用 --no-headless 弹窗通过验证，后续复用 Cookie
 * - 或从浏览器 Network 复制 history 请求 URL 中的 token 更新 TVC_API_CONFIG
 *
 * 前置：npm install playwright && npx playwright install chromium
 *       使用原生 Chrome 时需已安装 Chrome 浏览器
 *
 * 用法：node fetch_year_data.js [开始日期] [--no-headless]
 * 示例：node fetch_year_data.js 2025-01-01
 *       node fetch_year_data.js 2025-01-01 --no-headless   # 首次建议用可见浏览器通过 Cloudflare
 */
const fs = require('fs');
const path = require('path');

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

function parseArgs() {
    const argv = process.argv.slice(2);
    const noHeadless = argv.includes('--no-headless') || argv.includes('--visible');
    const startDate = argv.find(a => !a.startsWith('--')) || '2025-01-01';
    return { noHeadless, startDate };
}

async function fetchDataViaPlaywright(ranges, options = {}) {
    const { noHeadless = false } = options;
    let playwright;
    try {
        playwright = require('playwright');
    } catch (e) {
        throw new Error('请先安装 playwright: npm install playwright --save-dev && npx playwright install chromium');
    }

    const { tokenPart1, tokenPart2, referer } = TVC_API_CONFIG;
    const userDataDir = path.join(__dirname, '.investing-playwright-profile');
    const contextOptions = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'zh-CN',
        extraHTTPHeaders: { Referer: referer },
        headless: !noHeadless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    let context;
    let browserToClose = null;
    try {
        context = await playwright.chromium.launchPersistentContext(userDataDir, {
            channel: 'chrome',
            ...contextOptions
        });
    } catch (e) {
        console.warn('未找到系统 Chrome，改用 Chromium:', e.message);
        browserToClose = await playwright.chromium.launch({
            headless: !noHeadless,
            args: contextOptions.args
        });
        context = await browserToClose.newContext({
            userAgent: contextOptions.userAgent,
            viewport: contextOptions.viewport,
            locale: contextOptions.locale,
            extraHTTPHeaders: contextOptions.extraHTTPHeaders
        });
    }

    const allData = [];
    try {
        const page = await context.newPage();

        for (let i = 0; i < ranges.length; i++) {
            const { from: f, to: t } = ranges[i];
            const url = `https://tvc4.investing.com/${tokenPart1}/${tokenPart2}/6/6/28/history?symbol=68&resolution=60&from=${f}&to=${t}`;
            console.log(`[${i + 1}/${ranges.length}] 请求 ${url.substring(0, 90)}...`);

            let batch = null;
            let responseStatus = null;
            let responseBodyPreview = '';
            try {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                if (response) {
                    responseStatus = response.status();
                    const text = await response.text();
                    responseBodyPreview = text.slice(0, 600);
                    if (response.ok()) {
                        try {
                            if (text.trim().startsWith('{')) batch = JSON.parse(text);
                        } catch (parseErr) {
                            console.warn(`  JSON 解析失败: ${parseErr.message}`);
                        }
                    }
                    if (!response.ok() || !(batch && batch.t && batch.t.length > 0)) {
                        console.warn(`  无数据 [HTTP ${responseStatus}]`);
                        console.warn(`  响应预览: ${responseBodyPreview.replace(/\n/g, ' ')}`);
                    }
                }
            } catch (e) {
                console.warn(`  请求失败: ${e.message}`);
            }

            if (batch && batch.t && batch.t.length > 0) {
                allData.push(batch);
                console.log(`  成功: ${batch.t.length} 条`);
            }

            await page.waitForTimeout(800);
        }
    } finally {
        await context.close();
        if (browserToClose) await browserToClose.close();
    }
    return allData;
}

async function main() {
    try {
        const { noHeadless, startDate: startDateString } = parseArgs();
        console.log('Starting to fetch gold data (Playwright)...');
        if (noHeadless) console.log('使用可见浏览器（--no-headless），首次可手动通过 Cloudflare 验证，会话将保存到 .investing-playwright-profile');

        const from = parseStartDate(startDateString);
        const to = Math.floor(Date.now() / 1000);

        console.log(`时间范围: ${new Date(from * 1000).toISOString()} ~ ${new Date(to * 1000).toISOString()}`);

        const ranges = getBatchRanges(from, to);
        console.log(`共 ${ranges.length} 批`);

        const allData = await fetchDataViaPlaywright(ranges, { noHeadless });

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
            console.error('未获取到有效数据，不生成模拟数据。请检查：');
            console.error('  若上方响应预览为 "Just a moment..." 则为 Cloudflare 拦截（常见 HTTP 403）：用本机浏览器打开 https://www.investing.com 黄金历史数据，通过验证后，在 Network 里找到 tvc4.investing.com 的 history 请求，复制 URL 中两段 token 更新本文件 TVC_API_CONFIG 的 tokenPart1、tokenPart2；或把 launch 里 headless 改为 false 用可见浏览器跑一次。');
            console.error('  1) 更新 TVC_API_CONFIG 的 tokenPart1/tokenPart2（从浏览器 history 请求 URL 复制）');
            console.error('  2) 请求时间范围是否合理（from/to 为 Unix 秒）');
            console.error('  3) 根据上方「响应预览」确认接口实际返回内容');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
