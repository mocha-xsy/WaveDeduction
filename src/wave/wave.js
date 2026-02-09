/**
 * 波浪识别与分析模块
 * 包含识别波浪结构和分析波浪的函数
 */

const { REFERENCE_POINTS } = require('../config/config');
const { calculateRetracementLevels, calculateBounceLevels, calculateExtensionLevels } = require('../fibonacci/fibonacci');

/**
 * 从K线数据中识别关键高低点（用于波浪识别）
 * @param {Array} klineData - K线数据数组（已按时间排序）
 * @param {number} lookbackPeriod - 回看周期（用于识别局部高低点）
 * @returns {Array} 关键点位数组 [{type: 'high'|'low', price, time, index}]
 */
function identifyKeyPoints(klineData, lookbackPeriod = 5) {
  if (!klineData || klineData.length < lookbackPeriod * 2) {
    return [];
  }
  
  const keyPoints = [];
  const sorted = [...klineData].sort((a, b) => {
    const timeA = a.time || new Date(a.timestamp).getTime();
    const timeB = b.time || new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
  
  for (let i = lookbackPeriod; i < sorted.length - lookbackPeriod; i++) {
    const current = sorted[i];
    const currentHigh = current.high || current.close || current.price;
    const currentLow = current.low || current.close || current.price;
    
    // 检查是否为局部高点
    let isLocalHigh = true;
    let isLocalLow = true;
    
    for (let j = i - lookbackPeriod; j <= i + lookbackPeriod; j++) {
      if (j === i) continue;
      const compareHigh = sorted[j].high || sorted[j].close || sorted[j].price;
      const compareLow = sorted[j].low || sorted[j].close || sorted[j].price;
      
      if (compareHigh >= currentHigh) isLocalHigh = false;
      if (compareLow <= currentLow) isLocalLow = false;
    }
    
    if (isLocalHigh) {
      keyPoints.push({
        type: 'high',
        price: currentHigh,
        time: current.time || new Date(current.timestamp).getTime(),
        timestamp: current.timestamp,
        index: i
      });
    }
    
    if (isLocalLow) {
      keyPoints.push({
        type: 'low',
        price: currentLow,
        time: current.time || new Date(current.timestamp).getTime(),
        timestamp: current.timestamp,
        index: i
      });
    }
  }
  
  // 按时间排序
  keyPoints.sort((a, b) => a.time - b.time);
  
  return keyPoints;
}

/**
 * 从关键点位中识别第一浪（寻找最大的上升推动浪）
 * @param {Array} keyPoints - 关键点位数组
 * @param {Array} klineData - K线数据数组
 * @returns {Object|null} 第一浪结构 {start, end, startTime, endTime, range}
 */
function identifyWave1(keyPoints, klineData) {
  if (!keyPoints || keyPoints.length < 2) {
    return null;
  }
  
  const sorted = [...klineData].sort((a, b) => {
    const timeA = a.time || new Date(a.timestamp).getTime();
    const timeB = b.time || new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
  
  // 找到全局最低点和最高点
  let globalLow = Infinity;
  let globalHigh = -Infinity;
  let lowIndex = -1;
  let highIndex = -1;
  
  sorted.forEach((item, index) => {
    const low = item.low || item.close || item.price;
    const high = item.high || item.close || item.price;
    
    if (low < globalLow) {
      globalLow = low;
      lowIndex = index;
    }
    
    if (high > globalHigh) {
      globalHigh = high;
      highIndex = index;
    }
  });
  
  // 确保最低点在最高点之前
  if (lowIndex === -1 || highIndex === -1 || lowIndex >= highIndex) {
    return null;
  }
  
  // 构建第一浪结构
  const wave1 = {
    start: globalLow,
    end: globalHigh,
    startTime: sorted[lowIndex].time || new Date(sorted[lowIndex].timestamp).getTime(),
    endTime: sorted[highIndex].time || new Date(sorted[highIndex].timestamp).getTime(),
    range: globalHigh - globalLow
  };
  
  return wave1;
}

/**
 * 识别第二浪
 * @param {Object} wave1 - 第一浪结构
 * @param {Array} keyPoints - 关键点位数组
 * @param {Array} klineData - K线数据数组
 * @returns {Object|null} 第二浪结构
 */
function identifyWave2(wave1, keyPoints, klineData) {
  if (!wave1 || !keyPoints || keyPoints.length < 3) {
    return null;
  }
  
  // 按时间排序
  const sortedKeyPoints = [...keyPoints].sort((a, b) => a.time - b.time);
  
  // 找到第一浪终点之后的关键点
  const postWave1Points = sortedKeyPoints.filter(point => point.time > wave1.endTime);
  
  if (postWave1Points.length < 2) {
    return null;
  }
  
  // 寻找第二浪的低点和反弹高点
  let wave2Low = Infinity;
  let wave2LowTime = -1;
  let maxHigh = -Infinity;
  let maxHighTime = -1;
  
  postWave1Points.forEach(point => {
    if (point.type === 'low' && point.price < wave2Low) {
      wave2Low = point.price;
      wave2LowTime = point.time;
    }
    if (point.type === 'high' && point.price > maxHigh) {
      maxHigh = point.price;
      maxHighTime = point.time;
    }
  });
  
  if (wave2Low === Infinity || maxHigh === -Infinity) {
    return null;
  }
  
  // 构建第二浪结构
  const wave2 = {
    start: wave1.end,
    currentLow: wave2Low,
    maxHigh: maxHigh,
    startTime: wave1.endTime,
    lowTime: wave2LowTime,
    highTime: maxHighTime
  };
  
  return wave2;
}

/**
 * 推理波浪结构
 * @param {Array} klineData - K线数据数组
 * @returns {Object|null} 波浪结构
 */
function inferWaveStructure(klineData) {
  if (!klineData || klineData.length < 100) {
    console.warn('⚠️  K线数据不足，无法进行波浪识别');
    return null;
  }
  
  // 识别关键点位
  const keyPoints = identifyKeyPoints(klineData, 5);
  console.log(`📊 识别出 ${keyPoints.length} 个关键点位`);
  
  // 识别第一浪
  const wave1 = identifyWave1(keyPoints, klineData);
  
  if (!wave1) {
    console.warn('⚠️  无法识别第一浪结构');
    return null;
  }
  
  console.log(`✅ 识别出第一浪: ${wave1.start.toFixed(2)} → ${wave1.end.toFixed(2)} (涨幅: ${wave1.range.toFixed(2)})`);
  
  // 识别第二浪
  const wave2 = identifyWave2(wave1, keyPoints, klineData);
  
  // 识别收缩三角形
  const triangle = identifyContractingTriangle(keyPoints, klineData);
  if (triangle) {
    console.log(`✅ 识别出收缩三角形: ${triangle.type} type`);
  }
  
  const structure = {
    wave1: wave1,
    wave2: wave2,
    triangle: triangle,
    keyPoints: keyPoints,
    dataPoints: klineData.length
  };
  
  return structure;
}

/**
 * 分析第二浪
 * @param {number} currentPrice - 当前价格
 * @param {Object} waveStructure - 波浪结构
 * @returns {Object} 分析结果
 */
function analyzeWave2(currentPrice, waveStructure) {
  // 如果没有波浪结构，使用参考点位
  if (!waveStructure || !waveStructure.wave1) {
    console.log('📌 使用参考点位进行分析');
    
    const wave1Start = REFERENCE_POINTS.WAVE_1.START;
    const wave1End = REFERENCE_POINTS.WAVE_1.END;
    const wave1Range = REFERENCE_POINTS.WAVE_1.RANGE;
    
    // 计算回撤水平
    const retracementLevels = calculateRetracementLevels(wave1Start, wave1End);
    
    // 计算反弹水平（基于当前低点）
    const currentLow = REFERENCE_POINTS.WAVE_2.CURRENT_LOW;
    const bounceLevels = calculateBounceLevels(currentLow, wave1End);
    
    // 计算延伸水平（第三浪目标）
    const extensionLevels = calculateExtensionLevels(wave1Start, wave1End);
    
    // 算法衍生监测点（基于黄金分割，非固定点位）
    const lifeLine = retracementLevels[0.8];
    const riseVHigh = bounceLevels[0.5];   // (v)浪高点近似：0.5反弹位
    const ivLow = bounceLevels[0.236];    // (iv)浪低点近似：0.236反弹位
    
    return {
      currentPrice: currentPrice,
      wave1: {
        start: wave1Start,
        end: wave1End,
        range: wave1Range
      },
      wave2: {
        start: wave1End,
        currentLow: currentLow
      },
      retracementLevels: retracementLevels,
      bounceLevels: bounceLevels,
      extensionLevels: extensionLevels,
      monitorPoints: {
        WAVE_1_START: wave1Start,
        WAVE_1_END: wave1End,
        WAVE_2_LOW: currentLow,
        LIFE_LINE: lifeLine,
        RISE_V_HIGH: riseVHigh,
        IV_LOW: ivLow
      },
      keyLevels: [
        { price: wave1Start, type: 'support', label: '第一浪起点' },
        { price: retracementLevels[0.236], type: 'support', label: '0.236回撤位' },
        { price: retracementLevels[0.382], type: 'support', label: '0.382回撤位' },
        { price: retracementLevels[0.5], type: 'support', label: '0.5回撤位' },
        { price: retracementLevels[0.618], type: 'support', label: '0.618回撤位' },
        { price: retracementLevels[0.786], type: 'support', label: '0.786回撤位' },
        { price: lifeLine, type: 'support', label: '0.8回撤位（蓝线/生命线）' },
        { price: currentLow, type: 'support', label: '第二浪当前低点' },
        { price: ivLow, type: 'support', label: '0.236反弹位（(iv)浪低点）' },
        { price: wave1End, type: 'pressure', label: '第一浪终点' },
        { price: bounceLevels[0.382], type: 'pressure', label: '0.382反弹位' },
        { price: riseVHigh, type: 'pressure', label: '0.5反弹位（(v)浪高点）' },
        { price: bounceLevels[0.618], type: 'pressure', label: '0.618反弹位' },
        { price: bounceLevels[0.786], type: 'pressure', label: '0.786反弹位' },
        { price: extensionLevels[1.618], type: 'pressure', label: '1.618延伸位' },
        { price: extensionLevels[2.618], type: 'pressure', label: '2.618延伸位' }
      ],
      inferred: false
    };
  }
  
  // 使用推理出的波浪结构进行分析
  console.log('📌 使用推理出的波浪结构进行分析');
  
  const wave1 = waveStructure.wave1;
  const wave2 = waveStructure.wave2;
  
  // 计算回撤水平
  const retracementLevels = calculateRetracementLevels(wave1.start, wave1.end);
  
  // 计算反弹水平
  const currentLow = wave2 ? wave2.currentLow : wave1.end;
  const bounceLevels = calculateBounceLevels(currentLow, wave1.end);
  
  // 计算延伸水平
  const extensionLevels = calculateExtensionLevels(wave1.start, wave1.end);
  
  // 算法衍生监测点（基于黄金分割，非固定点位）
  const lifeLine = retracementLevels[0.8];
  const riseVHigh = bounceLevels[0.5];   // (v)浪高点近似：0.5反弹位
  const ivLow = bounceLevels[0.236];     // (iv)浪低点近似：0.236反弹位
  
  // 计算监测点
  const monitorPoints = {
    WAVE_1_START: wave1.start,
    WAVE_1_END: wave1.end,
    WAVE_2_LOW: currentLow,
    LIFE_LINE: lifeLine,
    RISE_V_HIGH: riseVHigh,
    IV_LOW: ivLow
  };
  
  // 生成关键点位列表（含算法衍生监测点）
  const keyLevels = [
    { price: wave1.start, type: 'support', label: '第一浪起点' },
    { price: retracementLevels[0.236], type: 'support', label: '0.236回撤位' },
    { price: retracementLevels[0.382], type: 'support', label: '0.382回撤位' },
    { price: retracementLevels[0.5], type: 'support', label: '0.5回撤位' },
    { price: retracementLevels[0.618], type: 'support', label: '0.618回撤位' },
    { price: retracementLevels[0.786], type: 'support', label: '0.786回撤位' },
    { price: lifeLine, type: 'support', label: '0.8回撤位（蓝线/生命线）' },
    { price: currentLow, type: 'support', label: '第二浪当前低点' },
    { price: ivLow, type: 'support', label: '0.236反弹位（(iv)浪低点）' },
    { price: wave1.end, type: 'pressure', label: '第一浪终点' },
    { price: bounceLevels[0.382], type: 'pressure', label: '0.382反弹位' },
    { price: riseVHigh, type: 'pressure', label: '0.5反弹位（(v)浪高点）' },
    { price: bounceLevels[0.618], type: 'pressure', label: '0.618反弹位' },
    { price: bounceLevels[0.786], type: 'pressure', label: '0.786反弹位' },
    { price: extensionLevels[1.618], type: 'pressure', label: '1.618延伸位' },
    { price: extensionLevels[2.618], type: 'pressure', label: '2.618延伸位' }
  ];
  
  return {
    currentPrice: currentPrice,
    wave1: wave1,
    wave2: wave2,
    retracementLevels: retracementLevels,
    bounceLevels: bounceLevels,
    extensionLevels: extensionLevels,
    monitorPoints: monitorPoints,
    keyLevels: keyLevels,
    inferred: true
  };
}

/**
 * 识别收缩三角形
 * @param {Array} keyPoints - 关键点位数组
 * @param {Array} klineData - K线数据数组
 * @returns {Object|null} 收缩三角形结构
 */
function identifyContractingTriangle(keyPoints, klineData) {
  if (!keyPoints || keyPoints.length < 5) {
    return null;
  }
  
  // 按时间排序
  const sortedPoints = [...keyPoints].sort((a, b) => a.time - b.time);
  
  // 尝试识别a-b-c-d-e结构
  for (let i = 0; i <= sortedPoints.length - 5; i++) {
    const a = sortedPoints[i];
    const b = sortedPoints[i + 1];
    const c = sortedPoints[i + 2];
    const d = sortedPoints[i + 3];
    const e = sortedPoints[i + 4];
    
    // 验证收缩三角形的基本结构
    if (validateContractingTriangle([a, b, c, d, e])) {
      // 计算各浪的价格范围
      const aPrice = Math.abs(a.price - b.price);
      const bPrice = Math.abs(b.price - c.price);
      const cPrice = Math.abs(c.price - d.price);
      const dPrice = Math.abs(d.price - e.price);
      
      // 构建三角形结构
      const triangle = {
        type: a.price > b.price ? 'regular' : 'running',
        a: a,
        b: b,
        c: c,
        d: d,
        e: e,
        prices: {
          a: aPrice,
          b: bPrice,
          c: cPrice,
          d: dPrice
        },
        isValid: true
      };
      
      return triangle;
    }
  }
  
  return null;
}

/**
 * 验证收缩三角形
 * @param {Array} points - 5个关键点的数组 [a, b, c, d, e]
 * @returns {boolean} 是否为有效的收缩三角形
 */
function validateContractingTriangle(points) {
  if (!points || points.length !== 5) {
    return false;
  }
  
  const [a, b, c, d, e] = points;
  
  // 验证价格走势
  // 规则1: a和c同方向，b和d同方向，且方向相反
  const aToBUp = b.price > a.price;
  const bToCUp = c.price > b.price;
  const cToDUp = d.price > c.price;
  const dToEUp = e.price > d.price;
  
  if (aToBUp === bToCUp || bToCUp === cToDUp || cToDUp === dToEUp) {
    return false;
  }
  
  // 规则2: 价格范围应该逐渐缩小
  const aPrice = Math.abs(a.price - b.price);
  const bPrice = Math.abs(b.price - c.price);
  const cPrice = Math.abs(c.price - d.price);
  const dPrice = Math.abs(d.price - e.price);
  
  if (aPrice < bPrice || bPrice < cPrice || cPrice < dPrice) {
    return false;
  }
  
  // 规则3: b浪价格不能超过a浪的1.382倍
  if (bPrice > aPrice * 1.382) {
    return false;
  }
  
  // 规则4: c浪价格不能超过b浪的1倍
  if (cPrice > bPrice) {
    return false;
  }
  
  // 规则5: d浪价格不能超过c浪的1倍
  if (dPrice > cPrice) {
    return false;
  }
  
  // 规则6: e浪价格不能超过d浪的1倍
  if (Math.abs(e.price - d.price) > dPrice) {
    return false;
  }
  
  // 规则7: e浪终点必须在a浪的价格范围内
  const aRangeMin = Math.min(a.price, b.price);
  const aRangeMax = Math.max(a.price, b.price);
  if (e.price < aRangeMin || e.price > aRangeMax) {
    return false;
  }
  
  return true;
}

/**
 * 构建艾略特通道
 * @param {Array} points - 关键点位数组
 * @returns {Object|null} 艾略特通道
 */
function buildElliottChannel(points) {
  if (points.length < 4) {
    return null;
  }
  
  const a = points[0];
  const b = points[1];
  const c = points[2];
  const d = points[3];
  
  // 计算上轨和下轨的斜率
  const upperSlope = (b.price - d.price) / (b.time - d.time);
  const lowerSlope = (a.price - c.price) / (a.time - c.time);
  
  // 验证通道是否收缩
  const isContracting = Math.abs(upperSlope) > Math.abs(lowerSlope) || 
                       Math.sign(upperSlope) !== Math.sign(lowerSlope);
  
  return {
    upper: {
      start: b,
      end: d,
      slope: upperSlope
    },
    lower: {
      start: a,
      end: c,
      slope: lowerSlope
    },
    isContracting: isContracting
  };
}

/**
 * 识别推动浪 1-2-3-4-5 和调整浪 a-b-c
 * 基于关键点位，按照艾略特波浪规则识别
 * @param {Array} klineData - K线数据
 * @param {number} [lookbackPeriod] - 局部高低点回看周期，不传则根据数据量自适应
 * @returns {Object|null} { impulse: { wave1..wave5 }, corrective: { waveA, waveB, waveC }, keyPoints }
 */
function identifyWaves12345AndABC(klineData, lookbackPeriod) {
  if (!klineData || klineData.length < 32) return null;

  // 数据量少时用小 lookback，否则高低点过少导致识别失败（如 160 条用 8 只得 2 个高点）
  const lp = lookbackPeriod != null ? lookbackPeriod : (klineData.length < 300 ? 4 : 6);

  const keyPoints = identifyKeyPoints(klineData, lp);
  if (keyPoints.length < 6) return null;

  const sorted = [...keyPoints].sort((a, b) => a.time - b.time);
  const lows = sorted.filter(p => p.type === 'low');
  const highs = sorted.filter(p => p.type === 'high');

  if (lows.length < 3 || highs.length < 3) return null;

  // 找全局最低点作为浪1起点
  const globalLow = lows.reduce((min, p) => p.price < min.price ? p : min, lows[0]);
  const globalHigh = highs.reduce((max, p) => p.price > max.price ? p : max, highs[0]);

  // 确定主趋势方向
  const lowIdx = sorted.findIndex(p => p === globalLow);
  const highIdx = sorted.findIndex(p => p === globalHigh);
  const isUptrend = lowIdx < highIdx;

  const impulse = { wave1: null, wave2: null, wave3: null, wave4: null, wave5: null };
  const corrective = { waveA: null, waveB: null, waveC: null };

  if (isUptrend) {
    // 上升推动浪：0(低)->1(高)->2(低)->3(高)->4(低)->5(高)
    const pointsAfterLow = sorted.filter(p => p.time >= globalLow.time);
    if (pointsAfterLow.length < 6) return { impulse, corrective, keyPoints };

    let w1End = null, w2End = null, w3End = null, w4End = null, w5End = null;
    let cursor = 0;

    for (let i = 0; i < pointsAfterLow.length; i++) {
      const p = pointsAfterLow[i];
      if (p.type === 'high' && !w1End) {
        w1End = p;
        cursor = i;
        break;
      }
    }
    for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
      const p = pointsAfterLow[i];
      if (p.type === 'low' && !w2End) {
        w2End = p;
        cursor = i;
        break;
      }
    }
    for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
      const p = pointsAfterLow[i];
      if (p.type === 'high' && p.price > w1End.price && !w3End) {
        w3End = p;
        cursor = i;
        break;
      }
    }
    for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
      const p = pointsAfterLow[i];
      if (p.type === 'low' && p.price > w2End.price && !w4End) {
        w4End = p;
        cursor = i;
        break;
      }
    }
    for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
      const p = pointsAfterLow[i];
      if (p.type === 'high' && p.price > w3End.price && !w5End) {
        w5End = p;
        break;
      }
    }
    // 若未找到完整5浪，用最后一个显著高点作为5
    if (!w5End && w4End) {
      const after4 = pointsAfterLow.filter(p => p.time > w4End.time && p.type === 'high');
      w5End = after4.reduce((max, p) => p.price > max.price ? p : max, after4[0] || w3End);
    }

    if (w1End) impulse.wave1 = { start: globalLow, end: w1End, startPrice: globalLow.price, endPrice: w1End.price };
    if (w2End) impulse.wave2 = { start: w1End, end: w2End, startPrice: w1End.price, endPrice: w2End.price };
    if (w3End) impulse.wave3 = { start: w2End, end: w3End, startPrice: w2End.price, endPrice: w3End.price };
    if (w4End) impulse.wave4 = { start: w3End, end: w4End, startPrice: w3End.price, endPrice: w4End.price };
    if (w5End) impulse.wave5 = { start: w4End, end: w5End, startPrice: w4End.price, endPrice: w5End.price };

    // 调整浪 a-b-c：5浪高点之后，浪c 取浪b之后「最低」的低点（完整锯齿形至 4702 等）
    if (w5End) {
      const after5 = sorted.filter(p => p.time > w5End.time);
      let aEnd = null, bEnd = null, cEnd = null;
      for (const p of after5) {
        if (p.type === 'low' && !aEnd) aEnd = p;
        else if (p.type === 'high' && aEnd && !bEnd) bEnd = p;
      }
      if (aEnd && bEnd) {
        const afterB = after5.filter(p => p.time > bEnd.time && p.type === 'low' && p.price < aEnd.price);
        cEnd = afterB.length > 0 ? afterB.reduce((min, p) => p.price < min.price ? p : min, afterB[0]) : null;
        if (!cEnd) {
          const firstLow = after5.find(p => p.time > bEnd.time && p.type === 'low');
          cEnd = firstLow;
        }
        // 从 K 线补充：若存在更低点（如 2/7 07:00 的 4702），取浪b之后最低的低点
        if (klineData && klineData.length > 0) {
          const getT = (d) => d.time || (d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000);
          const bTime = bEnd.time || bEnd.timestamp * 1000;
          const kSorted = [...klineData].sort((a, b) => getT(a) - getT(b));
          const afterBKline = kSorted.filter(d => getT(d) > bTime);
          let minLow = null;
          for (const d of afterBKline) {
            const low = d.low ?? d.close ?? d.price;
            if (low != null && low < aEnd.price && (!minLow || low < minLow.price)) {
              minLow = { type: 'low', price: low, time: getT(d) };
            }
          }
          if (minLow && (!cEnd || minLow.price < cEnd.price)) {
            cEnd = minLow;
          }
        }
      }
      if (aEnd) corrective.waveA = { start: w5End, end: aEnd, startPrice: w5End.price, endPrice: aEnd.price };
      if (bEnd) corrective.waveB = { start: aEnd, end: bEnd, startPrice: aEnd.price, endPrice: bEnd.price };
      if (cEnd) corrective.waveC = { start: bEnd, end: cEnd, startPrice: bEnd.price, endPrice: cEnd.price };
    }
  } else {
    // 下跌趋势：类似逻辑反向
    const pointsAfterHigh = sorted.filter(p => p.time >= globalHigh.time);
    if (pointsAfterHigh.length < 6) return { impulse, corrective, keyPoints };

    let w1End = null, w2End = null, w3End = null, w4End = null, w5End = null;
    let cursor = 0;
    for (let i = 0; i < pointsAfterHigh.length; i++) {
      const p = pointsAfterHigh[i];
      if (p.type === 'low' && !w1End) { w1End = p; cursor = i; break; }
    }
    for (let i = cursor + 1; i < pointsAfterHigh.length; i++) {
      const p = pointsAfterHigh[i];
      if (p.type === 'high' && !w2End) { w2End = p; cursor = i; break; }
    }
    for (let i = cursor + 1; i < pointsAfterHigh.length; i++) {
      const p = pointsAfterHigh[i];
      if (p.type === 'low' && p.price < w1End.price && !w3End) { w3End = p; cursor = i; break; }
    }
    // 浪5：取浪3之后「最低」的低点（而非第一个低于浪4之后的低点），确保真实最低点被识别
    const after3Lows = pointsAfterHigh.filter(p => p.time > w3End.time && p.type === 'low' && p.price < w3End.price);
    w5End = after3Lows.length > 0 ? after3Lows.reduce((min, p) => p.price < min.price ? p : min, after3Lows[0]) : null;
    // 浪4：浪3与浪5之间的高点，需满足 price < w2End
    const between3And5 = pointsAfterHigh.filter(p => p.time > w3End.time && p.time < (w5End ? w5End.time : Infinity) && p.type === 'high' && p.price < w2End.price);
    w4End = between3And5.length > 0 ? between3And5.reduce((max, p) => p.price > max.price ? p : max, between3And5[0]) : null;
    // 若 keyPoints 中无浪4（浪3到浪5间无高点），从 K 线数据取期间最高点
    if (!w4End && w5End && klineData.length > 0) {
      const t3 = w3End.time || w3End.timestamp * 1000;
      const t5 = w5End.time || w5End.timestamp * 1000;
      const kBetween = klineData.filter(d => {
        const t = d.time || (d.timestamp ? d.timestamp * 1000 : 0);
        return t > t3 && t < t5;
      });
      if (kBetween.length > 0) {
        const maxCandle = kBetween.reduce((m, d) => {
          const h = d.high ?? d.close ?? d.price;
          const mH = m.high ?? m.close ?? m.price;
          return (h || 0) > (mH || 0) ? d : m;
        }, kBetween[0]);
        const h = maxCandle.high ?? maxCandle.close ?? maxCandle.price;
        if (h != null && h < w2End.price) {
          w4End = { type: 'high', price: h, time: maxCandle.time || maxCandle.timestamp * 1000 };
        }
      }
    }
    if (!w4End && w5End) {
      w4End = w3End;
    }

    if (w1End) impulse.wave1 = { start: globalHigh, end: w1End, startPrice: globalHigh.price, endPrice: w1End.price };
    if (w2End) impulse.wave2 = { start: w1End, end: w2End, startPrice: w1End.price, endPrice: w2End.price };
    if (w3End) impulse.wave3 = { start: w2End, end: w3End, startPrice: w2End.price, endPrice: w3End.price };
    if (w4End) impulse.wave4 = { start: w3End, end: w4End, startPrice: w3End.price, endPrice: w4End.price };
    if (w5End) impulse.wave5 = { start: w4End, end: w5End, startPrice: w4End.price, endPrice: w5End.price };

    if (w5End) {
      const after5 = sorted.filter(p => p.time > w5End.time);
      let aEnd = null, bEnd = null, cEnd = null;
      for (const p of after5) {
        if (p.type === 'high' && !aEnd) aEnd = p;
        else if (p.type === 'low' && aEnd && !bEnd) bEnd = p;
      }
      if (aEnd && bEnd) {
        const afterB = after5.filter(p => p.time > bEnd.time && p.type === 'high' && p.price > aEnd.price);
        cEnd = afterB.length > 0 ? afterB.reduce((max, p) => p.price > max.price ? p : max, afterB[0]) : null;
        if (!cEnd) {
          const firstHigh = after5.find(p => p.time > bEnd.time && p.type === 'high');
          cEnd = firstHigh;
        }
        if (klineData && klineData.length > 0) {
          const getT = (d) => d.time || (d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000);
          const bTime = bEnd.time || bEnd.timestamp * 1000;
          const kSorted = [...klineData].sort((a, b) => getT(a) - getT(b));
          const afterBKline = kSorted.filter(d => getT(d) > bTime);
          let maxHigh = null;
          for (const d of afterBKline) {
            const high = d.high ?? d.close ?? d.price;
            if (high != null && high > aEnd.price && (!maxHigh || high > maxHigh.price)) {
              maxHigh = { type: 'high', price: high, time: getT(d) };
            }
          }
          if (maxHigh && (!cEnd || maxHigh.price > cEnd.price)) {
            cEnd = maxHigh;
          }
        }
      }
      if (aEnd) corrective.waveA = { start: w5End, end: aEnd, startPrice: w5End.price, endPrice: aEnd.price };
      if (bEnd) corrective.waveB = { start: aEnd, end: bEnd, startPrice: aEnd.price, endPrice: bEnd.price };
      if (cEnd) corrective.waveC = { start: bEnd, end: cEnd, startPrice: bEnd.price, endPrice: cEnd.price };
    }
  }

  // 驱动浪规则验证
  const ruleValidation = validateImpulseRules(impulse, isUptrend);
  // 尝试识别 W-X-Y 联合形（在 a-b-c 之上或替代）
  const wxy = identifyWXY(keyPoints, { wave5: impulse.wave5 });
  // 浪c 之后的延续浪（新浪 1'-2'-3'-4'-5'，覆盖 2/6、2/7 等后续日期）
  const continuation = identifyContinuationAfterC(corrective, sorted, isUptrend, klineData);

  return {
    impulse,
    corrective,
    wxy,
    continuation,
    keyPoints,
    isUptrend,
    ruleValidation
  };
}

/**
 * 识别浪c之后的延续浪（新浪 1'-2'-3'-4'-5'）
 * 用于在 2/6、2/7 等后续日期显示浪点
 * @param {Object} corrective - 调整浪 { waveA, waveB, waveC }
 * @param {Array} sorted - 按时间排序的关键点位
 * @param {boolean} isUptrend - 主趋势方向（与原推动浪一致）
 * @param {Array} [klineData] - K线数据，用于补充关键点位不足时的极值点
 * @returns {Object} { wave1, wave2, wave3, wave4?, wave5? } 或空对象
 */
function identifyContinuationAfterC(corrective, sorted, isUptrend, klineData) {
  const c = corrective?.waveC;
  if (!c || !c.end) return {};
  const cTime = c.end.time || c.end.timestamp * 1000;
  const cPrice = c.endPrice != null ? c.endPrice : (c.end?.price ?? c.end?.close);
  let afterC = sorted.filter(p => p.time > cTime);
  // 从 K 线补充浪c之后的极值点，确保 2/6、2/7 等后续日期有足够点位
  if (klineData && klineData.length > 0) {
    const kSorted = [...klineData].sort((a, b) => (a.time || a.timestamp * 1000) - (b.time || b.timestamp * 1000));
    const getT = (d) => d.time || (d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000);
    const afterCKline = kSorted.filter(d => getT(d) > cTime);
    const lp = 3; // 小 lookback 以捕捉更多极值
    for (let i = lp; i < afterCKline.length - lp; i++) {
      const d = afterCKline[i];
      const t = getT(d);
      const high = d.high ?? d.close ?? d.price;
      const low = d.low ?? d.close ?? d.price;
      let isHigh = true, isLow = true;
      for (let j = i - lp; j <= i + lp; j++) {
        if (j === i) continue;
        const h = afterCKline[j]?.high ?? afterCKline[j]?.close ?? afterCKline[j]?.price;
        const l = afterCKline[j]?.low ?? afterCKline[j]?.close ?? afterCKline[j]?.price;
        if (h >= high) isHigh = false;
        if (l <= low) isLow = false;
      }
      if (isHigh && !afterC.some(p => Math.abs(p.time - t) < 3600000 && p.type === 'high')) {
        afterC.push({ type: 'high', price: high, time: t });
      }
      if (isLow && !afterC.some(p => Math.abs(p.time - t) < 3600000 && p.type === 'low')) {
        afterC.push({ type: 'low', price: low, time: t });
      }
    }
    afterC = afterC.sort((a, b) => a.time - b.time);
  }
  if (afterC.length < 4) return {};

  const continuation = { wave1: null, wave2: null, wave3: null, wave4: null, wave5: null };
  if (isUptrend) {
    // 上升趋势：浪c 为低点，之后为 高->低->高->低->高
    let w1 = null, w2 = null, w3 = null, w4 = null, w5 = null;
    for (const p of afterC) {
      if (p.type === 'high' && !w1) { w1 = p; continue; }
      if (p.type === 'low' && w1 && !w2) { w2 = p; continue; }
      if (p.type === 'high' && w2 && p.price > w1.price && !w3) { w3 = p; continue; }
      if (p.type === 'low' && w3 && p.price > w2.price && !w4) { w4 = p; continue; }
      if (p.type === 'high' && w4 && p.price > w3.price && !w5) { w5 = p; break; }
    }
    if (!w5 && w4) {
      const after4 = afterC.filter(p => p.time > w4.time && p.type === 'high');
      w5 = after4.length > 0 ? after4.reduce((max, p) => p.price > max.price ? p : max, after4[0]) : null;
    }
    if (w1) continuation.wave1 = { start: c.end, end: w1, startPrice: cPrice, endPrice: w1.price };
    if (w2) continuation.wave2 = { start: w1, end: w2, startPrice: w1?.price, endPrice: w2.price };
    if (w3) continuation.wave3 = { start: w2, end: w3, startPrice: w2?.price, endPrice: w3.price };
    if (w4) continuation.wave4 = { start: w3, end: w4, startPrice: w3?.price, endPrice: w4.price };
    if (w5) continuation.wave5 = { start: w4, end: w5, startPrice: w4?.price, endPrice: w5.price };
  } else {
    // 下跌趋势：浪c 为高点，之后为 低->高->低->高->低
    let w1 = null, w2 = null, w3 = null, w4 = null, w5 = null;
    for (const p of afterC) {
      if (p.type === 'low' && !w1) { w1 = p; continue; }
      if (p.type === 'high' && w1 && !w2) { w2 = p; continue; }
      if (p.type === 'low' && w2 && p.price < w1.price && !w3) { w3 = p; continue; }
      if (p.type === 'high' && w3 && p.price < w2.price && !w4) { w4 = p; continue; }
      if (p.type === 'low' && w4 && p.price < w3.price && !w5) { w5 = p; break; }
    }
    if (!w5 && w4) {
      const after4 = afterC.filter(p => p.time > w4.time && p.type === 'low');
      w5 = after4.length > 0 ? after4.reduce((min, p) => p.price < min.price ? p : min, after4[0]) : null;
    }
    if (w1) continuation.wave1 = { start: c.end, end: w1, startPrice: cPrice, endPrice: w1.price };
    if (w2) continuation.wave2 = { start: w1, end: w2, startPrice: w1?.price, endPrice: w2.price };
    if (w3) continuation.wave3 = { start: w2, end: w3, startPrice: w2?.price, endPrice: w3.price };
    if (w4) continuation.wave4 = { start: w3, end: w4, startPrice: w3?.price, endPrice: w4.price };
    if (w5) continuation.wave5 = { start: w4, end: w5, startPrice: w4?.price, endPrice: w5.price };
  }
  return continuation;
}

/**
 * 验证驱动浪（推动浪）铁律（基于黄金波浪理论推理文档 5.7 节）
 * @param {Object} impulse - 推动浪结构 { wave1..wave5 }
 * @param {boolean} isUptrend - 是否上升趋势
 * @returns {Object} { valid: boolean, violations: string[] }
 */
function validateImpulseRules(impulse, isUptrend) {
  const violations = [];
  const w1 = impulse.wave1;
  const w2 = impulse.wave2;
  const w3 = impulse.wave3;
  const w4 = impulse.wave4;
  const w5 = impulse.wave5;
  if (!w1 || !w2 || !w3) return { valid: false, violations: ['缺少1/2/3浪'] };

  const p1Start = w1.startPrice != null ? w1.startPrice : w1.start?.price;
  const p1End = w1.endPrice != null ? w1.endPrice : w1.end?.price;
  const p2End = w2.endPrice != null ? w2.endPrice : w2.end?.price;
  const p3End = w3.endPrice != null ? w3.endPrice : w3.end?.price;
  const p3Start = w3.startPrice != null ? w3.startPrice : w3.start?.price;
  const p4End = w4 ? (w4.endPrice != null ? w4.endPrice : w4.end?.price) : null;
  const p4Start = w4 ? (w4.startPrice != null ? w4.startPrice : w4.start?.price) : null;

  // 规则1：2浪不能折返1浪的100%
  if (isUptrend) {
    if (p2End <= p1Start) violations.push('2浪回撤超过1浪100%');
  } else {
    if (p2End >= p1Start) violations.push('2浪反弹超过1浪100%');
  }

  // 规则2：3浪须超过1浪的终点
  if (isUptrend) {
    if (p3End <= p1End) violations.push('3浪未突破1浪终点');
  } else {
    if (p3End >= p1End) violations.push('3浪未跌破1浪终点');
  }

  // 规则3：推动浪4浪不能切入1浪（仅推动浪，楔形允许）
  if (w4 && p4End != null) {
    if (isUptrend) {
      if (p4End < p1End) violations.push('4浪切入1浪价格区间（推动浪不允许）');
    } else {
      if (p4End > p1End) violations.push('4浪切入1浪价格区间（推动浪不允许）');
    }
  }

  // 规则4：4浪不能折返3浪的100%
  if (w4 && p4End != null && p4Start != null) {
    if (isUptrend) {
      if (p4End < p3Start) violations.push('4浪折返超过3浪100%');
    } else {
      if (p4End > p3Start) violations.push('4浪折返超过3浪100%');
    }
  }

  // 规则5：3浪一定不是最短的（1、3、5浪中）
  if (w1 && w3 && w5) {
    const len1 = Math.abs(p1End - p1Start);
    const len3 = Math.abs(p3End - p3Start);
    const p5End = w5.endPrice != null ? w5.endPrice : w5.end?.price;
    const p5Start = w5.startPrice != null ? w5.startPrice : w5.start?.price;
    const len5 = Math.abs(p5End - p5Start);
    const minLen = Math.min(len1, len3, len5);
    if (len3 === minLen && len1 !== len3 && len5 !== len3) {
      violations.push('3浪为最短浪（铁律：3浪不能最短）');
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * 识别 W-X-Y 联合形调整（双锯齿/双重横向整理）
 * 基于关键点位识别 w-x-y 三段结构
 * @param {Array} keyPoints - 关键点位（已按时间排序）
 * @param {Object} impulse - 推动浪结构（5浪终点之后为调整浪起点）
 * @returns {Object|null} { waveW, waveX, waveY } 或 null
 */
function identifyWXY(keyPoints, impulse) {
  if (!keyPoints || !impulse || !impulse.wave5) return null;
  const w5End = impulse.wave5.end || impulse.wave5;
  const w5Price = impulse.wave5.endPrice != null ? impulse.wave5.endPrice : w5End?.price;
  const w5Time = impulse.wave5.end?.time || impulse.wave5.end?.timestamp * 1000;

  const sorted = [...keyPoints].sort((a, b) => a.time - b.time);
  const after5 = sorted.filter(p => p.time > w5Time);
  if (after5.length < 5) return null;

  // W-X-Y：低-高-低（下跌调整）或 高-低-高（上涨调整）
  const first = after5[0];
  const isDownAdjust = first.type === 'low' || (first.type === 'high' && first.price < w5Price);

  let wEnd = null, xEnd = null, yEnd = null;
  if (isDownAdjust) {
    for (const p of after5) {
      if (p.type === 'low' && !wEnd) wEnd = p;
      else if (p.type === 'high' && wEnd && !xEnd) xEnd = p;
      else if (p.type === 'low' && xEnd && !yEnd) yEnd = p;
    }
  } else {
    for (const p of after5) {
      if (p.type === 'high' && !wEnd) wEnd = p;
      else if (p.type === 'low' && wEnd && !xEnd) xEnd = p;
      else if (p.type === 'high' && xEnd && !yEnd) yEnd = p;
    }
  }
  if (!wEnd || !xEnd || !yEnd) return null;

  return {
    waveW: { start: w5End, end: wEnd, startPrice: w5Price, endPrice: wEnd.price },
    waveX: { start: wEnd, end: xEnd, startPrice: wEnd.price, endPrice: xEnd.price },
    waveY: { start: xEnd, end: yEnd, startPrice: xEnd.price, endPrice: yEnd.price }
  };
}

/**
 * 验证波浪内部结构
 * @param {Object} wave - 波浪结构
 * @returns {boolean} 是否验证通过
 */
function validateWaveInternalStructure(wave) {
  // 根据波浪类型验证内部结构
  if (wave.type === 'motive') {
    // 驱动浪内部结构应该是5浪
    return wave.subwaves && wave.subwaves.length === 5;
  } else if (wave.type === 'corrective') {
    // 调整浪内部结构应该是3浪或其变体
    return wave.subwaves && (wave.subwaves.length === 3 || wave.subwaves.length === 5);
  }
  
  return true;
}

/**
 * 为所有关键点分配浪点标签（使用波浪算法）
 * 主浪点：浪1、浪2、浪3、浪4、浪5、浪a、浪b、浪c、浪1'～浪5'
 * 子浪点：浪X·i（落在浪X内部的极值点）
 * @param {Array} keyPoints - 关键点位数组（已按时间排序）
 * @param {Object} waveResult - identifyWaves12345AndABC 返回值
 * @returns {Array} [{ point, label }] 每个关键点及其浪点标签
 */
function assignWaveLabelsToKeyPoints(keyPoints, waveResult) {
  if (!keyPoints || keyPoints.length === 0 || !waveResult) return [];
  const { impulse, corrective, continuation } = waveResult;
  const tTol = 3600000; // 1 小时匹配容差
  const match = (kp, pt) => {
    if (!pt) return false;
    const t = pt.time || pt.timestamp * 1000;
    const p = pt.price ?? pt.close;
    return Math.abs((kp.time || kp.timestamp * 1000) - t) < tTol &&
      Math.abs((kp.price ?? kp.close) - p) < 1;
  };

  const turnPoints = [];
  const addTurn = (pt, label) => {
    if (!pt) return;
    const obj = pt.end || pt;
    const t = obj.time || obj.timestamp * 1000;
    const p = obj.price ?? obj.close ?? (pt.endPrice != null ? pt.endPrice : null);
    if (t != null && p != null) turnPoints.push({ t, p, label });
  };
  if (impulse?.wave1) {
    addTurn(impulse.wave1.start, '起点');
    ['wave1', 'wave2', 'wave3', 'wave4', 'wave5'].forEach((k, i) => addTurn(impulse[k]?.end, `浪${i + 1}`));
  }
  ['waveA', 'waveB', 'waveC'].forEach((k, i) => addTurn(corrective?.[k]?.end, `浪${['a', 'b', 'c'][i]}`));
  if (continuation) {
    ['wave1', 'wave2', 'wave3', 'wave4', 'wave5'].forEach((k, i) => addTurn(continuation[k]?.end, `浪${i + 1}'`));
  }
  turnPoints.sort((a, b) => a.t - b.t);

  const getLabel = (kp) => {
    const kt = kp.time || kp.timestamp * 1000;
    const kp_val = kp.price ?? kp.close;
    for (const tp of turnPoints) {
      if (Math.abs(kt - tp.t) < tTol && Math.abs(kp_val - tp.p) < 1) return tp.label;
    }
    let segIdx = -1;
    for (let i = 0; i < turnPoints.length - 1; i++) {
      if (kt >= turnPoints[i].t && kt < turnPoints[i + 1].t) {
        segIdx = i;
        break;
      }
    }
    if (kt < turnPoints[0].t) segIdx = -1;
    else if (segIdx < 0) segIdx = turnPoints.length - 2;
    if (segIdx >= 0 && segIdx < turnPoints.length - 1) {
      const segLabel = turnPoints[segIdx + 1].label;
      return `${segLabel}·`;
    }
    return kp.type === 'high' ? '高' : '低';
  };

  const subCount = {};
  return keyPoints.map(kp => {
    let label = getLabel(kp);
    if (label.endsWith('·')) {
      const base = label.slice(0, -1);
      subCount[base] = (subCount[base] || 0) + 1;
      label = `${base}·${subCount[base]}`;
    }
    return { point: kp, label };
  });
}

module.exports = {
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
};
