/**
 * 黄金波浪理论+黄金分割实时分析脚本
 * 功能：获取实时黄金价格和1小时K线数据，基于波浪理论和黄金分割计算后续走势
 * @author xsy
 * @version 2.0.0
 *
 * 用法示例：
 *   node goldWaveAnalysis.js --price 4820
 *   node goldWaveAnalysis.js --price 4820 --timeframe 4h          # 按4小时推理
 *   node goldWaveAnalysis.js --price 4820 --timeframe d1          # 按日线推理
 *   node goldWaveAnalysis.js --price 4820 --from "2026-01-22 16:00:00"
 *   node goldWaveAnalysis.js --wave --timeframe 4h                # 波浪模式用4小时
 */

// 导入所有模块
const { DATA_FILE, FIBONACCI_RATIOS, DATA_CONFIG, REFERENCE_POINTS, TIMEFRAME_CONFIG } = require('./src/config/config');
const {
  getCurrentGoldPrice,
  fetchFromURL,
  fetchFromAPI,
  fetchHistoricalKlineFromAPI,
  fetchKlineData,
  updateKlineData,
  saveKlineDataToFile,
  loadKlineDataFromFile,
  loadGoldDataFromFile,
  fetchOrLoadGoldData,
  appendCurrentPriceToFile,
  getLatestClosePrice,
  updateHourlyKlineData,
  computeDailyChangeStats
} = require('./src/data/data');
const {
  calculateRetracementLevels,
  calculateBounceLevels,
  calculateExtensionLevels
} = require('./src/fibonacci/fibonacci');
const {
  identifyKeyPoints,
  identifyWave1,
  identifyWave2,
  identifyWaves12345AndABC,
  assignWaveLabelsToKeyPoints,
  inferWaveStructure,
  analyzeWave2,
  identifyContractingTriangle,
  validateContractingTriangle,
  buildElliottChannel,
  validateWaveInternalStructure,
  validateImpulseRules,
  identifyWXY
} = require('./src/wave/wave');
const { judgeTrend } = require('./src/trend/trend');
const {
  fetchMultiTimeframeData,
  analyzeMultiTimeframe,
  analyzeSingleTimeframe,
  judgeMultiTimeframeTrend
} = require('./src/multi-timeframe/multi-timeframe');
const { formatOutputCompact, formatOutput, formatWavePointsOutput } = require('./src/output/output');
const { GOLD_HISTORY_DATA_FILE } = require('./src/config/config');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 时间范围解析与过滤 ====================

/**
 * 解析时间字符串为毫秒时间戳
 * 支持格式：2026-01-22 16:00:00 或 2026-01-22T16:00:00
 * @param {string} str - 时间字符串
 * @returns {number|null} 毫秒时间戳，解析失败返回 null
 */
function parseTimeToMs(str) {
  if (!str || typeof str !== 'string') return null;
  const normalized = str.replace(' ', 'T');
  const ms = new Date(normalized).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * 获取 K 线数据条目的时间（毫秒）
 * 支持 timestamp（秒/ISO字符串）和 time（毫秒）
 */
function getKlineTimeMs(d) {
  if (d.timestamp != null) {
    if (typeof d.timestamp === 'string') return new Date(d.timestamp).getTime();
    return d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000;
  }
  const t = d.time;
  return t != null && t > 1e12 ? t : (t || 0) * 1000;
}

/**
 * 按时间范围过滤 K 线数据
 * @param {Array} klineData - K 线数据数组
 * @param {number} startMs - 起始时间（毫秒）
 * @param {number} [endMs] - 结束时间（毫秒），不传则到最新
 * @returns {Array} 过滤后的 K 线数据
 */
function filterKlineByTimeRange(klineData, startMs, endMs) {
  if (!klineData || klineData.length === 0) return [];
  const end = endMs ?? Infinity;
  return klineData.filter(d => {
    const t = getKlineTimeMs(d);
    return !isNaN(t) && t >= startMs && t <= end;
  });
}

/**
 * 从命令行解析时间范围参数
 * 支持：--from "2026-01-22 16:00:00" [--to "2026-02-01 12:00:00"]
 *   或：--range "2026-01-22 16:00:00" ["2026-02-01 12:00:00"]
 * 当 --watch 且未指定时间范围时，默认取最近 7 天的 1 小时数据作为推理基数
 * @param {boolean} [isWatchMode] - 是否处于 watch 模式
 * @returns {{ startMs: number, endMs: number|null }|null}
 */
function parseTimeRangeFromArgs(isWatchMode = false) {
  const args = process.argv.slice(2);
  let startMs = null;
  let endMs = null;

  const fromIdx = args.findIndex(a => a === '--from' || a === '-f');
  if (fromIdx !== -1 && args[fromIdx + 1]) {
    startMs = parseTimeToMs(args[fromIdx + 1]);
  }
  const toIdx = args.findIndex(a => a === '--to' || a === '-t');
  if (toIdx !== -1 && args[toIdx + 1]) {
    endMs = parseTimeToMs(args[toIdx + 1]);
  }
  const rangeIdx = args.findIndex(a => a === '--range' || a === '-r');
  if (rangeIdx !== -1 && args[rangeIdx + 1]) {
    startMs = parseTimeToMs(args[rangeIdx + 1]);
    if (args[rangeIdx + 2] && !args[rangeIdx + 2].startsWith('--')) {
      endMs = parseTimeToMs(args[rangeIdx + 2]);
    }
  }

  // watch 模式默认：最近 7 天 1 小时数据
  if (isWatchMode && !startMs) {
    endMs = Date.now();
    startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    return { startMs, endMs };
  }

  if (!startMs) return null;
  return { startMs, endMs };
}

/**
 * 从命令行解析推理周期
 * 支持：--timeframe h1|4h|d1 或 -T h1|4h|d1
 * @returns {'H1'|'H4'|'D1'}
 */
function parseTimeframeFromArgs() {
  const args = process.argv.slice(2);
  const idx = args.findIndex(a => a === '--timeframe' || a === '-T');
  if (idx === -1 || !args[idx + 1]) return 'H1';
  const v = String(args[idx + 1]).toLowerCase();
  if (v === '4h' || v === 'h4') return 'H4';
  if (v === 'd1' || v === '1d' || v === '24h') return 'D1';
  return 'H1';
}

/**
 * 将 identifyWaves12345AndABC 的返回结果转换为 waveStructure 格式（供 analyzeWave2 使用）
 * 支持识别出的推动浪 1-2-3-4-5 和调整浪 a-b-c
 * @param {Object} waveResult - identifyWaves12345AndABC 的返回值
 * @returns {Object|null} { wave1: { start, end }, wave2: { currentLow }, keyPoints }
 */
function waveResultToStructure(waveResult) {
  if (!waveResult || !waveResult.impulse || !waveResult.impulse.wave1) return null;
  const imp = waveResult.impulse;
  const corr = waveResult.corrective || {};
  const w1Start = imp.wave1?.startPrice ?? imp.wave1?.start?.price;
  const w1End = imp.wave5?.endPrice ?? imp.wave3?.endPrice ?? imp.wave1?.endPrice;
  if (!w1Start || !w1End) return null;
  const currentLow = corr.waveC?.endPrice ?? corr.waveA?.endPrice ?? imp.wave4?.endPrice ?? imp.wave2?.endPrice ?? w1End;
  return {
    wave1: { start: w1Start, end: w1End, range: w1End - w1Start },
    wave2: { start: w1End, currentLow },
    keyPoints: waveResult.keyPoints || []
  };
}

// ==================== 波浪点位模式（基于 gold_1year_data_real.json） ====================
// 基于《黄金波浪理论推理文档》《波浪理论核心算法提炼》最新逻辑

/**
 * 波浪点位模式：基于历史数据识别推动浪 1-2-3-4-5 和调整浪 a-b-c
 * 含驱动浪规则验证（2浪不破100%、3浪超1浪终点、4浪不切入1浪、3浪非最短）
 * 支持 W-X-Y 联合形调整识别
 * 用法：node goldWaveAnalysis.js --wave [开始日期] [--fetch] [--chart]
 *       node goldWaveAnalysis.js --wave --timeframe 4h [--from "2026-01-22 16:00:00"]
 */
async function runWaveMode() {
  const args = process.argv.slice(2);
  const waveIdx = args.findIndex(a => a === '--wave' || a === '-W');
  const startDate = waveIdx >= 0 && args[waveIdx + 1] && !args[waveIdx + 1].startsWith('--')
    ? args[waveIdx + 1] : '2025-01-01';
  const doFetch = args.includes('--fetch');
  const genChart = args.includes('--chart');
  const timeRange = parseTimeRangeFromArgs();
  const timeframe = parseTimeframeFromArgs();
  const cfg = TIMEFRAME_CONFIG[timeframe];
  const tfName = cfg?.NAME ?? timeframe;

  console.log(`\n📊 波浪点位模式（${tfName}）`);
  if (timeRange) {
    console.log(`   时间范围: ${new Date(timeRange.startMs).toLocaleString('zh-CN')} 至 ${timeRange.endMs ? new Date(timeRange.endMs).toLocaleString('zh-CN') : '最新'}`);
  } else {
    console.log(`   时间范围: 从 ${startDate} 起`);
  }
  if (doFetch) console.log('   将自动抓取最新数据（若不足）');
  if (genChart && timeframe === 'H1') {
    console.log('   生成图表前自动抓取最新数据...');
  }

  let klineData;
  if (timeframe === 'H1') {
    // 生成图表时默认抓取最新数据，确保图表包含到今天的 K 线
    if (genChart) {
      const fetchStart = timeRange ? new Date(timeRange.startMs).toISOString().slice(0, 10) : startDate;
      try {
        console.log(`   🔄 抓取最新数据（${fetchStart} ~ 当前）...`);
        execSync(`node fetch_year_data.js ${fetchStart}`, { cwd: __dirname, stdio: 'inherit' });
      } catch (e) {
        console.warn('   ⚠️ 抓取失败，使用本地已有数据:', e.message);
      }
    } else if (doFetch) {
      const loaded = loadGoldDataFromFile();
      if (loaded.length < 500) {
        await fetchOrLoadGoldData(startDate);
      }
    }
    klineData = loadGoldDataFromFile();
  } else {
    // H4 / D1：从对应周期文件加载
    const filePath = cfg?.FILE_PATH;
    klineData = filePath && fs.existsSync(filePath) ? loadKlineDataFromFile(filePath) : [];
    if (klineData.length > 0) {
      klineData = klineData.map(d => ({
        ...d,
        price: d.close ?? d.price,
        timestamp: d.timestamp ?? (d.time ? d.time / 1000 : null)
      }));
    }
  }

  if (klineData.length > 0) {
    if (timeRange) {
      klineData = filterKlineByTimeRange(klineData, timeRange.startMs, timeRange.endMs);
    } else if (timeframe === 'H1') {
      const startTs = new Date(startDate).getTime() / 1000;
      klineData = klineData.filter(d => (d.timestamp || d.time / 1000) >= startTs);
    }
  }

  if (!klineData || klineData.length === 0) {
    const hint = timeframe === 'H1' ? 'node fetch_year_data.js 2025-01-01' : `node goldWaveAnalysis.js --price 4820（先运行以生成${tfName}数据）`;
    console.error(`❌ ${tfName}历史数据为空。请先运行: ${hint}`);
    process.exit(1);
  }

  console.log(`   加载 ${klineData.length} 条 ${tfName} K 线数据`);

  // 波浪识别：始终用最近 5 天数据，保证驱动浪/调整浪一致（排除更早的回调浪如 1-29，无论显示范围如何）
  const BARS_PER_DAY = timeframe === 'H1' ? 24 : timeframe === 'H4' ? 6 : 1;
  const waveBars = Math.min(klineData.length, BARS_PER_DAY * 5);
  const waveData = klineData.slice(-waveBars);
  console.log(`   波浪识别使用最近 ${waveBars} 条（约 ${(waveBars / BARS_PER_DAY).toFixed(1)} 天）`);
  const waveResult = identifyWaves12345AndABC(waveData);
  if (!waveResult) {
    console.error('❌ 无法识别波浪结构');
    process.exit(1);
  }

  formatWavePointsOutput(waveResult);

  if (genChart) {
    const chartPath = path.join(__dirname, 'wave_chart.html');
    generateWaveChartHTML(klineData, waveResult, chartPath);
    console.log(`📈 图表已生成: ${chartPath}`);
  }
}

/**
 * 生成波浪图表 HTML 文件（含 X/Y 轴、悬停显示时间与价格）
 */
function generateWaveChartHTML(klineData, waveResult, outputPath) {
  const sorted = [...klineData].sort((a, b) => (a.time || a.timestamp) - (b.time || b.timestamp));
  const prices = sorted.map(d => d.close || d.price);
  const times = sorted.map(d => d.time || d.timestamp * 1000);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const padding = { left: 70, right: 40, top: 30, bottom: 55 };
  const chartWidth = 1200 - padding.left - padding.right;
  const chartHeight = 400 - padding.top - padding.bottom;

  const points = [];
  const { impulse, corrective, continuation } = waveResult;
  const addPointFromKp = (kp, label) => {
    const t = kp.time || kp.timestamp * 1000;
    const p = kp.price ?? kp.close;
    const idx = times.findIndex(tm => tm >= t);
    const x = padding.left + (idx >= 0 ? (idx / Math.max(times.length - 1, 1)) * chartWidth : 0);
    const y = padding.top + chartHeight - ((p - minP) / range) * chartHeight;
    points.push({ x, y, p, label, time: new Date(t).toLocaleString('zh-CN'), t, isStart: label === '起点' });
  };
  // 任何被识别的高点和低点都用算法标记浪点
  const lp = klineData.length < 300 ? 4 : 6;
  const fullKeyPoints = identifyKeyPoints(klineData, lp);
  const w1StartTime = impulse.wave1?.start?.time || impulse.wave1?.start?.timestamp * 1000;
  const tStart = times[0];
  let labeledKeyPoints;
  if (w1StartTime != null && tStart != null && w1StartTime > tStart && klineData.length >= 32) {
    const beforeKline = klineData.filter(d => {
      const t = d.time || (d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000);
      return t >= tStart && t < w1StartTime;
    });
    const beforeKeyPoints = fullKeyPoints.filter(kp => {
      const t = kp.time || kp.timestamp * 1000;
      return t >= tStart && t < w1StartTime;
    }).sort((a, b) => (a.time || a.timestamp * 1000) - (b.time || b.timestamp * 1000));
    const mainKeyPoints = fullKeyPoints.filter(kp => {
      const t = kp.time || kp.timestamp * 1000;
      return t >= w1StartTime;
    }).sort((a, b) => (a.time || a.timestamp * 1000) - (b.time || b.timestamp * 1000));
    const beforeWaveResult = beforeKline.length >= 32 ? identifyWaves12345AndABC(beforeKline, lp) : null;
    const beforeLabels = beforeWaveResult ? assignWaveLabelsToKeyPoints(beforeKeyPoints, beforeWaveResult) : beforeKeyPoints.map(kp => ({ point: kp, label: kp.type === 'high' ? '高' : '低' }));
    const mainLabels = assignWaveLabelsToKeyPoints(mainKeyPoints, waveResult);
    labeledKeyPoints = [...beforeLabels, ...mainLabels].sort((a, b) => ((a.point.time || a.point.timestamp * 1000) - (b.point.time || b.point.timestamp * 1000)));
  } else {
    labeledKeyPoints = assignWaveLabelsToKeyPoints(fullKeyPoints.sort((a, b) => (a.time || a.timestamp * 1000) - (b.time || b.timestamp * 1000)), waveResult);
  }
  labeledKeyPoints.forEach(({ point, label }) => addPointFromKp(point, label));
  // 浪c 之后无实际延续浪时，添加预测性点位（基于黄金分割）
  const hasContinuation = continuation && (continuation.wave1 || continuation.wave2 || continuation.wave3);
  if (corrective.waveC && corrective.waveC.end && !hasContinuation) {
    const cLow = corrective.waveC.endPrice ?? corrective.waveC.end?.price ?? corrective.waveC.end?.close;
    const lastTime = times[times.length - 1] || Date.now();
    const w5High = impulse.wave5?.endPrice ?? impulse.wave5?.end?.price;
    const bHigh = corrective.waveB?.endPrice ?? corrective.waveB?.end?.price;
    const bounceTarget = [w5High, bHigh].filter(Boolean).reduce((a, b) => Math.max(a, b), 0) || w5High || bHigh;
    const bounceLevels = bounceTarget != null ? calculateBounceLevels(cLow, bounceTarget) : null;
    if (bounceLevels) {
      const addPredicted = (price, label, xRatio) => {
        const x = padding.left + chartWidth * (xRatio ?? 1);
        const y = padding.top + chartHeight - ((price - minP) / range) * chartHeight;
        points.push({ x, y, p: price, label, time: new Date(lastTime).toLocaleString('zh-CN'), isPredicted: true, t: lastTime });
      };
      addPredicted(bounceLevels[0.382], '预期浪1\' 0.382', 0.92);
      addPredicted(bounceLevels[0.5], '预期浪1\' 0.5', 0.96);
      addPredicted(bounceLevels[0.618], '预期浪3\' 0.618', 1);
    }
  }

  // 按时间排序，确保浪路径连线正确（含前期关键点、起点、浪1-5、a-b-c、延续浪、预测点）
  points.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

  const pathStr = sorted.map((d, i) => {
    const p = d.close || d.price;
    const x = padding.left + (i / Math.max(sorted.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((p - minP) / range) * chartHeight;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // 浪点位之间用直线相连（浪1→浪2→浪3→浪4→浪5→浪a→浪b→浪c，含预测性点位）
  const firstPredictedIdx = points.findIndex(p => p.isPredicted);
  const solidPts = firstPredictedIdx >= 0 ? points.slice(0, firstPredictedIdx) : points;
  const predPts = firstPredictedIdx >= 0 ? points.slice(firstPredictedIdx - 1) : []; // 含浪c，保证连线
  const wavePathStr = solidPts.length > 0
    ? solidPts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
    : '';
  const wavePathPredStr = predPts.length > 1
    ? predPts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
    : '';

  // 回调/顶部点位平行线（仅保留常用：0.382、0.5、0.618）
  const COMMON_RATIOS = [0.382, 0.5, 0.618];
  const levelLines = [];
  const w1 = impulse.wave1;
  const w5 = impulse.wave5;
  if (w1) {
    const startP = w1.startPrice != null ? w1.startPrice : (w1.start?.price ?? w1.start?.close);
    const endP = w1.endPrice != null ? w1.endPrice : (w1.end?.price ?? w1.end?.close);
    const highP = Math.max(startP, endP);
    const lowP = Math.min(startP, endP);
    const ret = calculateRetracementLevels(highP, lowP);
    COMMON_RATIOS.forEach((ratio) => {
      const price = ret[ratio];
      if (price != null && price >= minP - range * 0.1 && price <= maxP + range * 0.1) {
        levelLines.push({ price, type: 'retracement', ratio });
      }
    });
  }
  if (w5 && w1) {
    const lowP = w5.endPrice ?? w5.end?.price ?? w5.end?.close;
    const highP = w1.startPrice ?? w1.start?.price ?? w1.start?.close;
    const bounce = calculateBounceLevels(lowP, highP);
    COMMON_RATIOS.forEach((ratio) => {
      const price = bounce[ratio];
      if (price != null && price >= minP - range * 0.1 && price <= maxP + range * 0.1) {
        levelLines.push({ price, type: 'bounce', ratio });
      }
    });
  }
  // 去重：相近价位合并为一条线（避免重叠）
  const merged = [];
  const threshold = range * 0.005;
  levelLines.forEach((item) => {
    const near = merged.find(m => Math.abs(m.price - item.price) < threshold);
    if (near) near.labels.push(`${item.type === 'retracement' ? '回撤' : '反弹'}${item.ratio}`);
    else merged.push({ price: item.price, labels: [`${item.type === 'retracement' ? '回撤' : '反弹'}${item.ratio}`] });
  });
  const levelLinesHtml = merged.map(({ price, labels }) => {
    const y = padding.top + chartHeight - ((price - minP) / range) * chartHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" stroke="#ff9800" stroke-width="1" opacity="0.7"/>
<text x="${padding.left + chartWidth + 4}" y="${y + 4}" font-size="10" fill="#e65100">${labels.join('/')}</text>`;
  }).join('\n');

  // 预期走势虚线（浪2-浪4连线延长为通道下轨，浪5-浪a延长为预期反弹）
  const chartTop = padding.top;
  const chartBottom = padding.top + chartHeight;
  const chartRight = padding.left + chartWidth;
  const clampY = (y) => Math.max(chartTop - 20, Math.min(chartBottom + 20, y));
  let trendLineHtml = '';
  const pt2 = points.find(p => p.label === '浪2');
  const pt4 = points.find(p => p.label === '浪4');
  const pt5 = points.find(p => p.label === '浪5');
  const ptA = points.find(p => p.label === '浪a');
  if (pt2 && pt4 && pt4.x > pt2.x) {
    const slope = (pt4.y - pt2.y) / (pt4.x - pt2.x);
    const extendX = chartRight;
    const extendY = clampY(pt4.y + slope * (extendX - pt4.x));
    trendLineHtml += `<line x1="${pt2.x}" y1="${pt2.y}" x2="${extendX}" y2="${extendY}" stroke="#9c27b0" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.8"/>`;
  }
  if (pt5 && ptA && ptA.x > pt5.x) {
    const slope = (ptA.y - pt5.y) / (ptA.x - pt5.x);
    const extendX = chartRight;
    const extendY = clampY(ptA.y + slope * (extendX - ptA.x));
    trendLineHtml += `<line x1="${pt5.x}" y1="${pt5.y}" x2="${extendX}" y2="${extendY}" stroke="#2196F3" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.8"/>`;
  }

  // Y 轴刻度（价格）
  const yTicks = 6;
  const yAxisHtml = Array.from({ length: yTicks }, (_, i) => {
    const p = minP + (range * i) / (yTicks - 1);
    const y = padding.top + chartHeight - ((p - minP) / range) * chartHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" stroke="#e0e0e0" stroke-dasharray="2,2"/>
<text x="${padding.left - 8}" y="${y + 4}" font-size="11" fill="#666" text-anchor="end">${p.toFixed(0)}</text>`;
  }).join('\n');

  // X 轴刻度（时间）
  const xTicks = 6;
  const xAxisHtml = Array.from({ length: xTicks }, (_, i) => {
    const idx = Math.round((i / (xTicks - 1)) * (times.length - 1));
    const t = times[Math.min(idx, times.length - 1)];
    const x = padding.left + (idx / Math.max(times.length - 1, 1)) * chartWidth;
    const timeStr = new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + chartHeight}" stroke="#e0e0e0" stroke-dasharray="2,2"/>
<text x="${x}" y="${padding.top + chartHeight + 20}" font-size="11" fill="#666" text-anchor="middle">${timeStr}</text>`;
  }).join('\n');

  const pointsHtml = points.map((pt, i) => {
    const isPredicted = pt.isPredicted === true;
    const fill = isPredicted ? '#ff9800' : 'red';
    const r = pt.isStart ? 5 : 8;
    return `<g class="point" data-index="${i}">
  <circle cx="${pt.x}" cy="${pt.y}" r="${r}" fill="${fill}" stroke="white" stroke-width="2" style="cursor:pointer"/>
  <text x="${pt.x}" y="${pt.y - 14}" font-size="12" fill="${fill}" text-anchor="middle">${pt.label} ${pt.p.toFixed(0)}</text>
</g>`;
  }).join('\n');

  const pointsData = points.map(p => ({ time: p.time, price: p.p.toFixed(2), label: p.label }));

  // 完整 K 线数据（用于整图悬停时显示最近点位的时间与价格）
  const chartData = sorted.map((d, i) => ({
    time: new Date(d.time || d.timestamp * 1000).toLocaleString('zh-CN'),
    price: (d.close ?? d.price).toFixed(2),
    open: d.open != null ? d.open.toFixed(2) : null,
    high: d.high != null ? d.high.toFixed(2) : null,
    low: d.low != null ? d.low.toFixed(2) : null,
    close: (d.close ?? d.price).toFixed(2)
  }));

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>黄金波浪点位图</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; padding: 0; font-family: sans-serif; overflow: hidden; }
  body { display: flex; flex-direction: column; }
  #header { flex-shrink: 0; padding: 8px 20px; background: #f5f5f5; border-bottom: 1px solid #ddd; }
  #header h2 { margin: 0 0 4px 0; font-size: 18px; }
  #header p { margin: 0; font-size: 12px; color: #666; }
  #chart-wrap { flex: 1; min-height: 0; padding: 0; }
  #chart-wrap svg { width: 100%; height: 100%; display: block; }
  #tooltip { position: fixed; background: rgba(0,0,0,0.85); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 13px; pointer-events: none; display: none; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .point:hover circle { opacity: 0.9; }
</style>
</head>
<body>
<div id="header">
<h2>黄金1小时K线 - 艾略特波浪点位</h2>
<p>数据范围: ${new Date(times[0]).toLocaleString('zh-CN')} ~ ${new Date(times[times.length - 1]).toLocaleString('zh-CN')} | 橙色: 回撤/反弹位 | 紫色虚线: 通道线 | 蓝色虚线: 预期走势</p>
</div>
<div id="tooltip"></div>
<div id="chart-wrap">
<svg viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid meet" style="border:1px solid #ccc">
  <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="#fafafa"/>
  ${yAxisHtml}
  ${xAxisHtml}
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#333" stroke-width="1"/>
  <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}" stroke="#333" stroke-width="1"/>
  ${levelLinesHtml}
  <path d="${pathStr}" fill="none" stroke="#2196F3" stroke-width="2"/>
  ${wavePathStr ? `<path d="${wavePathStr}" fill="none" stroke="#95a5a6" stroke-width="1.5"/>` : ''}
  ${wavePathPredStr ? `<path d="${wavePathPredStr}" fill="none" stroke="#ff9800" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.9"/>` : ''}
  ${trendLineHtml}
  <line id="crosshair-v" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#999" stroke-width="1" stroke-dasharray="4,4" style="display:none; pointer-events:none"/>
  <line id="crosshair-h" x1="${padding.left}" y1="${padding.top}" x2="${padding.left + chartWidth}" y2="${padding.top}" stroke="#999" stroke-width="1" stroke-dasharray="4,4" style="display:none; pointer-events:none"/>
  <rect id="chart-overlay" x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="transparent" style="cursor:crosshair"/>
  ${pointsHtml}
</svg>
</div>
<script>
  const pts = ${JSON.stringify(pointsData)};
  const chartData = ${JSON.stringify(chartData)};
  const PADDING = ${JSON.stringify(padding)};
  const CHART_WIDTH = ${chartWidth};
  const CHART_HEIGHT = ${chartHeight};
  const tooltip = document.getElementById('tooltip');
  const crosshairV = document.getElementById('crosshair-v');
  const crosshairH = document.getElementById('crosshair-h');
  const overlay = document.getElementById('chart-overlay');
  const svg = document.querySelector('svg');

  const TOOLTIP_OFFSET = 12;
  function positionTooltipInViewport(x, y) {
    tooltip.style.left = (x + TOOLTIP_OFFSET) + 'px';
    tooltip.style.top = (y + TOOLTIP_OFFSET) + 'px';
    const rect = tooltip.getBoundingClientRect();
    let left = x + TOOLTIP_OFFSET;
    let top = y + TOOLTIP_OFFSET;
    if (rect.right > window.innerWidth) left = x - rect.width - TOOLTIP_OFFSET;
    if (rect.bottom > window.innerHeight) top = y - rect.height - TOOLTIP_OFFSET;
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function getMouseX(e) {
    const rect = svg.getBoundingClientRect();
    const scaleX = 1200 / rect.width;
    return (e.clientX - rect.left) * scaleX;
  }
  function getMouseY(e) {
    const rect = svg.getBoundingClientRect();
    const scaleY = 460 / rect.height;
    return (e.clientY - rect.top) * scaleY;
  }

  function showKlineTooltip(e) {
    const x = getMouseX(e);
    if (x < PADDING.left || x > PADDING.left + CHART_WIDTH) return;
    const t = (x - PADDING.left) / CHART_WIDTH;
    const idx = Math.round(t * (chartData.length - 1));
    const d = chartData[Math.min(idx, chartData.length - 1)];
    let html = '时间: ' + d.time + '<br/>收盘: ' + d.price;
    if (d.open != null) html += '<br/>开盘: ' + d.open;
    if (d.high != null) html += ' 最高: ' + d.high;
    if (d.low != null) html += ' 最低: ' + d.low;
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    positionTooltipInViewport(e.clientX, e.clientY);
    crosshairV.setAttribute('x1', x);
    crosshairV.setAttribute('x2', x);
    crosshairV.style.display = 'block';
    const y = getMouseY(e);
    crosshairH.setAttribute('y1', y);
    crosshairH.setAttribute('y2', y);
    crosshairH.setAttribute('x1', PADDING.left);
    crosshairH.setAttribute('x2', PADDING.left + CHART_WIDTH);
    crosshairH.style.display = 'block';
  }

  overlay.addEventListener('mouseenter', showKlineTooltip);
  overlay.addEventListener('mousemove', function(e) {
    showKlineTooltip(e);
  });
  overlay.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
    crosshairV.style.display = 'none';
    crosshairH.style.display = 'none';
  });

  document.querySelectorAll('.point').forEach((g, i) => {
    g.addEventListener('mouseenter', function(e) {
      tooltip.innerHTML = '<strong>' + pts[i].label + '</strong><br/>时间: ' + pts[i].time + '<br/>价格: ' + pts[i].price;
      tooltip.style.display = 'block';
      positionTooltipInViewport(e.clientX, e.clientY);
      crosshairV.style.display = 'none';
      crosshairH.style.display = 'none';
    });
    g.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });
    g.addEventListener('mousemove', function(e) {
      positionTooltipInViewport(e.clientX, e.clientY);
    });
  });
</script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}

// ==================== 主执行函数 ====================

/**
 * 主执行函数
 */
async function main(compactMode = false) {
  try {
    // 获取当前价格（优先级：命令行参数 > 环境变量 > API > K线数据）
    const args = process.argv.slice(2);
    const hasManualPrice = args.includes('--price') || args.includes('-p') || process.env.GOLD_PRICE;

    // 可选：用户持仓信息（成本价 & 金额）
    let userCostUsd = null;
    let userAmountCny = null;

    const costIdx = args.findIndex(arg => arg === '--cost-usd' || arg === '--costUsd');
    if (costIdx !== -1 && args[costIdx + 1]) {
      const costVal = parseFloat(args[costIdx + 1]);
      if (!isNaN(costVal) && costVal > 0) {
        userCostUsd = costVal;
      }
    }

    const amtIdx = args.findIndex(arg => arg === '--amount-cny' || arg === '--amountCny');
    if (amtIdx !== -1 && args[amtIdx + 1]) {
      const amtVal = parseFloat(args[amtIdx + 1]);
      if (!isNaN(amtVal) && amtVal > 0) {
        userAmountCny = amtVal;
      }
    }
    
    let currentPrice;
    let priceSource = '';
    if (hasManualPrice) {
      // 如果手动指定了价格，直接使用（会处理命令行参数和环境变量）
      currentPrice = await getCurrentGoldPrice();
      priceSource = '手动输入';
      // 手动输入的价格也追加到文件（静默模式）
      appendCurrentPriceToFile(currentPrice, true);
    } else {
      // 否则必须从API获取真实价格
      if (!compactMode) {
        console.log('🔄 未指定手动价格，尝试从API获取真实价格...');
      }
      try {
        currentPrice = await getCurrentGoldPrice();
        // 注意：getCurrentGoldPrice 内部已经自动追加了价格，这里不需要再次追加
        priceSource = 'API';
        if (!compactMode) {
          console.log(`✅ 从API获取当前价格: ${currentPrice.toFixed(2)} USD/盎司`);
        }
      } catch (error) {
        // API获取失败，尝试从K线数据获取（但必须是合理范围）
        if (!compactMode) {
          console.warn('⚠️  API获取失败，尝试从K线数据获取...');
        }
        // 先获取1小时数据
        const h1Data = await updateKlineData(TIMEFRAME_CONFIG.H1, false, true);
        const klinePrice = getLatestClosePrice(h1Data);
        if (klinePrice && klinePrice >= 4000 && klinePrice <= 6000) {
          currentPrice = klinePrice;
          priceSource = 'K线数据';
          // 从K线数据获取的价格不追加（因为已经是历史数据）
          if (!compactMode) {
            console.log(`✅ 从K线数据获取价格: ${currentPrice.toFixed(2)} USD/盎司`);
          }
        } else {
          // K线数据价格也不合理，必须手动输入
          throw new Error('无法获取真实价格，请使用 --price 参数手动输入价格');
        }
      }
    }
    
    // 验证价格合理性
    if (!currentPrice || currentPrice < 4000 || currentPrice > 6000) {
      throw new Error(`价格${currentPrice}不在合理范围(4000-6000)，请检查数据源或使用 --price 参数`);
    }
    
    // 获取多周期数据
    if (!compactMode) {
      console.log('\n🔄 正在获取多周期K线数据...');
    }
    let multiTimeframeData = await fetchMultiTimeframeData(false, compactMode);

    // 时间范围过滤（若指定 --from/--range；watch 模式默认 7 天 1 小时数据）
    const isWatchMode = args.includes('--watch') || args.includes('-w');
    const timeRange = parseTimeRangeFromArgs(isWatchMode);
    if (timeRange) {
      const { startMs, endMs } = timeRange;
      if (multiTimeframeData.H1?.length) {
        multiTimeframeData = { ...multiTimeframeData };
        multiTimeframeData.H1 = filterKlineByTimeRange(multiTimeframeData.H1, startMs, endMs);
      }
      if (multiTimeframeData.H4?.length) {
        multiTimeframeData.H4 = filterKlineByTimeRange(multiTimeframeData.H4, startMs, endMs);
      }
      if (multiTimeframeData.D1?.length) {
        multiTimeframeData.D1 = filterKlineByTimeRange(multiTimeframeData.D1, startMs, endMs);
      }
      if (!compactMode) {
        const startStr = new Date(startMs).toLocaleString('zh-CN');
        const endStr = endMs ? new Date(endMs).toLocaleString('zh-CN') : '最新';
        const tf = parseTimeframeFromArgs();
        const count = multiTimeframeData[tf]?.length ?? 0;
        const tfName = TIMEFRAME_CONFIG[tf]?.NAME ?? tf;
        console.log(`\n📅 时间范围推理: ${startStr} 至 ${endStr}（${tfName} 共 ${count} 条）`);
      }
    }
    
    // 多周期综合分析（watch 模式下仅分析 H1，避免 H4/D1 数据不足告警）
    if (!compactMode) {
      console.log('\n🔍 正在进行多周期综合分析...');
    }
    const dataForAnalysis = isWatchMode
      ? { H1: multiTimeframeData.H1 }
      : multiTimeframeData;
    const analysisResult = analyzeMultiTimeframe(currentPrice, dataForAnalysis);

    // 推理周期：H1(1小时) / H4(4小时) / D1(日线)
    const inferenceTimeframe = parseTimeframeFromArgs();
    const inferenceData = multiTimeframeData[inferenceTimeframe];
    const timeframeName = TIMEFRAME_CONFIG[inferenceTimeframe]?.NAME ?? inferenceTimeframe;

    let waveStructure = null;
    let analysis = null;
    let trend = null;
    let wxyStructure = null;

    if (inferenceData && inferenceData.length > 0) {
      if (!compactMode) {
        console.log(`\n📊 推理周期: ${timeframeName}（共 ${inferenceData.length} 条 K 线）`);
      }
      // 优先使用 identifyWaves12345AndABC 识别多浪结构（与 wave_chart 一致，需 ≥32 条）
      let waveResult = null;
      if (inferenceData.length >= 32) {
        try {
          waveResult = identifyWaves12345AndABC(inferenceData);
          const converted = waveResultToStructure(waveResult);
          if (converted) {
            waveStructure = converted;
            if (!compactMode && waveResult?.wxy?.waveW && waveResult.wxy.waveX && waveResult.wxy.waveY) {
              wxyStructure = waveResult.wxy;
            }
          }
        } catch (_) { /* 识别失败时静默跳过 */ }
      }
      if (!waveStructure) {
        waveStructure = inferWaveStructure(inferenceData);
      }
      analysis = analyzeWave2(currentPrice, waveStructure);
      trend = judgeTrend(currentPrice, analysis);
    } else {
      analysis = analyzeWave2(currentPrice, null);
      trend = judgeTrend(currentPrice, analysis);
    }

    // 计算日内涨跌 & 持仓收益（仍用 H1 数据）
    const dailyStats = computeDailyChangeStats(multiTimeframeData.H1, currentPrice);
    let stats = dailyStats ? { ...dailyStats } : null;

    if (userCostUsd && userAmountCny) {
      const ratio = currentPrice / userCostUsd;
      const pnlPct = (ratio - 1) * 100;
      const pnlCny = userAmountCny * (ratio - 1);

      if (!stats) stats = {};
      stats.costUsd = userCostUsd;
      stats.amountCny = userAmountCny;
      stats.pnlCny = pnlCny;
      stats.pnlPct = pnlPct;
    }
    
    // 输出结果（根据模式选择详细或简洁输出）
    if (compactMode) {
      formatOutputCompact({ currentPrice, ...analysis }, trend, stats);
    } else {
      formatOutput({ currentPrice, ...analysis }, trend, waveStructure, stats, analysisResult, wxyStructure, timeframeName);
    }
    
    // 显示K线数据统计（仅在非简洁模式）
    if (!compactMode && inferenceData && inferenceData.length > 0) {
      const sorted = [...inferenceData].sort((a, b) => {
        const timeA = getKlineTimeMs(a);
        const timeB = getKlineTimeMs(b);
        return timeA - timeB;
      });
      const firstTime = new Date(getKlineTimeMs(sorted[0]));
      const lastTime = new Date(getKlineTimeMs(sorted[sorted.length - 1]));
      console.log(`\n📊 数据统计:`);
      console.log(`   推理周期: ${timeframeName}，K线数据条数: ${inferenceData.length}`);
      console.log(`   数据时间范围: ${firstTime.toLocaleString('zh-CN')} 至 ${lastTime.toLocaleString('zh-CN')}`);
      console.log(`   1小时数据文件: ${TIMEFRAME_CONFIG.H1.FILE_PATH}`);
      console.log(`   4小时数据文件: ${TIMEFRAME_CONFIG.H4.FILE_PATH}`);
      console.log(`   日线数据文件: ${TIMEFRAME_CONFIG.D1.FILE_PATH}`);
      if (waveStructure?.keyPoints) {
        console.log(`   关键点位数量: ${waveStructure.keyPoints.length}`);
      }
    }
    
    // 显示多周期分析结果（仅在非简洁模式）
    if (!compactMode && analysisResult) {
      console.log(`\n📊 多周期分析结果:`);
      console.log(`   主导趋势: ${analysisResult.comprehensiveJudgment.dominantTrend}`);
      console.log(`   建议操作: ${analysisResult.comprehensiveJudgment.dominantAction}`);
      console.log(`   信心度: ${(analysisResult.comprehensiveJudgment.confidence * 100).toFixed(0)}%`);
      console.log(`   各周期趋势:`);
      analysisResult.comprehensiveJudgment.individualTrends.forEach(item => {
        console.log(`     ${item.timeframe}: ${item.trend} - ${item.action}`);
      });
    }
    
    // 对比参考点位和推理点位（仅在非简洁模式）
    if (!compactMode && waveStructure && analysis && analysis.inferred) {
      console.log(`\n📊 参考点位对比:`);
      console.log(`   参考第一浪: ${REFERENCE_POINTS.WAVE_1.START} → ${REFERENCE_POINTS.WAVE_1.END}`);
      console.log(`   推理第一浪: ${analysis.wave1.start.toFixed(2)} → ${analysis.wave1.end.toFixed(2)}`);
      console.log(`   参考生命线: ${REFERENCE_POINTS.LIFE_LINE}`);
      console.log(`   推理生命线: ${analysis.monitorPoints.LIFE_LINE.toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ==================== 定时执行 ====================

/**
 * 定时执行分析（可选）
 * @param {number} intervalMinutes - 间隔分钟数
 */
function startPeriodicAnalysis(intervalMinutes = 5) {
  console.log(`⏰ 启动定时分析，每${intervalMinutes}分钟执行一次（简洁模式）\n`);
  
  // 立即执行一次（首次执行使用详细模式）
  main(false);
  
  // 定时执行（使用简洁模式）
  setInterval(() => {
    main(true);
  }, intervalMinutes * 60 * 1000);
}

// ==================== 命令行参数处理 ====================

// 如果直接运行此脚本
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--wave') || args.includes('-W')) {
    runWaveMode();
  } else if (args.includes('--watch') || args.includes('-w')) {
    const interval = parseInt(args[args.indexOf('--interval') + 1] || args[args.indexOf('-i') + 1] || '5');
    startPeriodicAnalysis(interval);
  } else {
    main();
  }
}

// 导出函数供其他模块使用
module.exports = {
  getCurrentGoldPrice,
  fetchFromURL,
  fetchFromAPI,
  fetchHistoricalKlineFromAPI,
  fetchKlineData,
  updateKlineData,
  saveKlineDataToFile,
  loadKlineDataFromFile,
  loadGoldDataFromFile,
  fetchOrLoadGoldData,
  appendCurrentPriceToFile,
  getLatestClosePrice,
  updateHourlyKlineData,
  computeDailyChangeStats,
  calculateRetracementLevels,
  calculateBounceLevels,
  calculateExtensionLevels,
  identifyKeyPoints,
  identifyWave1,
  identifyWave2,
  identifyWaves12345AndABC,
  inferWaveStructure,
  analyzeWave2,
  identifyContractingTriangle,
  validateContractingTriangle,
  buildElliottChannel,
  validateWaveInternalStructure,
  judgeTrend,
  fetchMultiTimeframeData,
  analyzeMultiTimeframe,
  analyzeSingleTimeframe,
  judgeMultiTimeframeTrend,
  formatOutputCompact,
  formatOutput,
  formatWavePointsOutput,
  parseTimeToMs,
  getKlineTimeMs,
  filterKlineByTimeRange,
  parseTimeRangeFromArgs,
  parseTimeframeFromArgs,
  main,
  runWaveMode,
  startPeriodicAnalysis,
  generateWaveChartHTML,
  DATA_FILE,
  FIBONACCI_RATIOS,
  DATA_CONFIG,
  TIMEFRAME_CONFIG,
  REFERENCE_POINTS
};
