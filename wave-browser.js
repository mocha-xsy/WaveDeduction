/**
 * 浏览器端波浪分析模块（从 src/wave/wave.js 和 src/fibonacci/fibonacci.js 移植）
 * 用于 goldWaveAnalysis_full.html 在浏览器中运行波浪识别
 */
(function (global) {
  const FIBONACCI_RATIOS = {
    RETRACEMENT: [0.236, 0.382, 0.5, 0.618, 0.786, 0.8],
    BOUNCE: [0.236, 0.382, 0.5, 0.618, 0.786]
  };

  function getKlineTime(d) {
    if (d.timestamp != null) {
      if (typeof d.timestamp === 'string') return new Date(d.timestamp).getTime();
      return d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000;
    }
    const t = d.time;
    return t != null && t > 1e12 ? t : (t || 0) * 1000;
  }

  function identifyKeyPoints(klineData, lookbackPeriod) {
    lookbackPeriod = lookbackPeriod || 5;
    if (!klineData || klineData.length < lookbackPeriod * 2) return [];
    const keyPoints = [];
    const sorted = [...klineData].sort((a, b) => getKlineTime(a) - getKlineTime(b));
    for (let i = lookbackPeriod; i < sorted.length - lookbackPeriod; i++) {
      const current = sorted[i];
      const currentHigh = current.high || current.close || current.price;
      const currentLow = current.low || current.close || current.price;
      let isLocalHigh = true, isLocalLow = true;
      for (let j = i - lookbackPeriod; j <= i + lookbackPeriod; j++) {
        if (j === i) continue;
        const h = sorted[j].high || sorted[j].close || sorted[j].price;
        const l = sorted[j].low || sorted[j].close || sorted[j].price;
        if (h >= currentHigh) isLocalHigh = false;
        if (l <= currentLow) isLocalLow = false;
      }
      if (isLocalHigh) keyPoints.push({ type: 'high', price: currentHigh, time: getKlineTime(current), index: i });
      if (isLocalLow) keyPoints.push({ type: 'low', price: currentLow, time: getKlineTime(current), index: i });
    }
    keyPoints.sort((a, b) => a.time - b.time);
    return keyPoints;
  }

  function calculateRetracementLevels(startPrice, endPrice) {
    const range = endPrice - startPrice;
    const levels = {};
    FIBONACCI_RATIOS.RETRACEMENT.forEach(r => { levels[r] = endPrice - range * r; });
    return levels;
  }

  function calculateBounceLevels(lowPrice, highPrice) {
    const range = highPrice - lowPrice;
    const levels = {};
    FIBONACCI_RATIOS.BOUNCE.forEach(r => { levels[r] = lowPrice + range * r; });
    return levels;
  }

  function identifyContinuationAfterC(corrective, sorted, isUptrend, klineData) {
    const c = corrective?.waveC;
    if (!c || !c.end) return {};
    const cTime = c.end.time || c.end.timestamp * 1000;
    const cPrice = c.endPrice != null ? c.endPrice : (c.end?.price ?? c.end?.close);
    let afterC = sorted.filter(p => p.time > cTime);
    if (klineData && klineData.length > 0) {
      const kSorted = [...klineData].sort((a, b) => getKlineTime(a) - getKlineTime(b));
      const afterCKline = kSorted.filter(d => getKlineTime(d) > cTime);
      const lp = 3;
      for (let i = lp; i < afterCKline.length - lp; i++) {
        const d = afterCKline[i];
        const t = getKlineTime(d);
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
        if (isHigh && !afterC.some(p => Math.abs(p.time - t) < 3600000 && p.type === 'high'))
          afterC.push({ type: 'high', price: high, time: t });
        if (isLow && !afterC.some(p => Math.abs(p.time - t) < 3600000 && p.type === 'low'))
          afterC.push({ type: 'low', price: low, time: t });
      }
      afterC = afterC.sort((a, b) => a.time - b.time);
    }
    if (afterC.length < 4) return {};
    const continuation = { wave1: null, wave2: null, wave3: null, wave4: null, wave5: null };
    if (isUptrend) {
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

  function identifyWaves12345AndABC(klineData, lookbackPeriod) {
    if (!klineData || klineData.length < 32) return null;
    const lp = lookbackPeriod != null ? lookbackPeriod : (klineData.length < 300 ? 4 : 6);
    const keyPoints = identifyKeyPoints(klineData, lp);
    if (keyPoints.length < 6) return null;
    const sorted = [...keyPoints].sort((a, b) => a.time - b.time);
    const lows = sorted.filter(p => p.type === 'low');
    const highs = sorted.filter(p => p.type === 'high');
    if (lows.length < 3 || highs.length < 3) return null;
    const globalLow = lows.reduce((min, p) => p.price < min.price ? p : min, lows[0]);
    const globalHigh = highs.reduce((max, p) => p.price > max.price ? p : max, highs[0]);
    const lowIdx = sorted.findIndex(p => p === globalLow);
    const highIdx = sorted.findIndex(p => p === globalHigh);
    const isUptrend = lowIdx < highIdx;
    const impulse = { wave1: null, wave2: null, wave3: null, wave4: null, wave5: null };
    const corrective = { waveA: null, waveB: null, waveC: null };

    if (isUptrend) {
      const pointsAfterLow = sorted.filter(p => p.time >= globalLow.time);
      if (pointsAfterLow.length < 6) return { impulse, corrective, keyPoints, isUptrend };
      let w1End = null, w2End = null, w3End = null, w4End = null, w5End = null;
      let cursor = 0;
      for (let i = 0; i < pointsAfterLow.length; i++) {
        const p = pointsAfterLow[i];
        if (p.type === 'high' && !w1End) { w1End = p; cursor = i; break; }
      }
      for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
        const p = pointsAfterLow[i];
        if (p.type === 'low' && !w2End) { w2End = p; cursor = i; break; }
      }
      for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
        const p = pointsAfterLow[i];
        if (p.type === 'high' && p.price > w1End.price && !w3End) { w3End = p; cursor = i; break; }
      }
      for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
        const p = pointsAfterLow[i];
        if (p.type === 'low' && p.price > w2End.price && !w4End) { w4End = p; cursor = i; break; }
      }
      for (let i = cursor + 1; i < pointsAfterLow.length; i++) {
        const p = pointsAfterLow[i];
        if (p.type === 'high' && p.price > w3End.price && !w5End) { w5End = p; break; }
      }
      if (!w5End && w4End) {
        const after4 = pointsAfterLow.filter(p => p.time > w4End.time && p.type === 'high');
        w5End = after4.reduce((max, p) => p.price > max.price ? p : max, after4[0] || w3End);
      }
      if (w1End) impulse.wave1 = { start: globalLow, end: w1End, startPrice: globalLow.price, endPrice: w1End.price };
      if (w2End) impulse.wave2 = { start: w1End, end: w2End, startPrice: w1End.price, endPrice: w2End.price };
      if (w3End) impulse.wave3 = { start: w2End, end: w3End, startPrice: w2End.price, endPrice: w3End.price };
      if (w4End) impulse.wave4 = { start: w3End, end: w4End, startPrice: w3End.price, endPrice: w4End.price };
      if (w5End) impulse.wave5 = { start: w4End, end: w5End, startPrice: w4End.price, endPrice: w5End.price };
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
          if (!cEnd) cEnd = after5.find(p => p.time > bEnd.time && p.type === 'low');
          if (klineData && klineData.length > 0) {
            const bTime = bEnd.time;
            const kSorted = [...klineData].sort((a, b) => getKlineTime(a) - getKlineTime(b));
            const afterBKline = kSorted.filter(d => getKlineTime(d) > bTime);
            let minLow = null;
            for (const d of afterBKline) {
              const low = d.low ?? d.close ?? d.price;
              if (low != null && low < aEnd.price && (!minLow || low < minLow.price))
                minLow = { type: 'low', price: low, time: getKlineTime(d) };
            }
            if (minLow && (!cEnd || minLow.price < cEnd.price)) cEnd = minLow;
          }
        }
        if (aEnd) corrective.waveA = { start: w5End, end: aEnd, startPrice: w5End.price, endPrice: aEnd.price };
        if (bEnd) corrective.waveB = { start: aEnd, end: bEnd, startPrice: aEnd.price, endPrice: bEnd.price };
        if (cEnd) corrective.waveC = { start: bEnd, end: cEnd, startPrice: bEnd.price, endPrice: cEnd.price };
      }
    } else {
      const pointsAfterHigh = sorted.filter(p => p.time >= globalHigh.time);
      if (pointsAfterHigh.length < 6) return { impulse, corrective, keyPoints, isUptrend };
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
      const after3Lows = pointsAfterHigh.filter(p => p.time > w3End.time && p.type === 'low' && p.price < w3End.price);
      w5End = after3Lows.length > 0 ? after3Lows.reduce((min, p) => p.price < min.price ? p : min, after3Lows[0]) : null;
      const between3And5 = pointsAfterHigh.filter(p => p.time > w3End.time && p.time < (w5End ? w5End.time : Infinity) && p.type === 'high' && p.price < w2End.price);
      w4End = between3And5.length > 0 ? between3And5.reduce((max, p) => p.price > max.price ? p : max, between3And5[0]) : null;
      if (!w4End && w5End) w4End = w3End;
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
          if (!cEnd) cEnd = after5.find(p => p.time > bEnd.time && p.type === 'high');
          if (klineData && klineData.length > 0) {
            const bTime = bEnd.time;
            const kSorted = [...klineData].sort((a, b) => getKlineTime(a) - getKlineTime(b));
            const afterBKline = kSorted.filter(d => getKlineTime(d) > bTime);
            let maxHigh = null;
            for (const d of afterBKline) {
              const high = d.high ?? d.close ?? d.price;
              if (high != null && high > aEnd.price && (!maxHigh || high > maxHigh.price))
                maxHigh = { type: 'high', price: high, time: getKlineTime(d) };
            }
            if (maxHigh && (!cEnd || maxHigh.price > cEnd.price)) cEnd = maxHigh;
          }
        }
        if (aEnd) corrective.waveA = { start: w5End, end: aEnd, startPrice: w5End.price, endPrice: aEnd.price };
        if (bEnd) corrective.waveB = { start: aEnd, end: bEnd, startPrice: aEnd.price, endPrice: bEnd.price };
        if (cEnd) corrective.waveC = { start: bEnd, end: cEnd, startPrice: bEnd.price, endPrice: cEnd.price };
      }
    }

    const continuation = identifyContinuationAfterC(corrective, sorted, isUptrend, klineData);
    return { impulse, corrective, continuation, keyPoints, isUptrend };
  }

  function assignWaveLabelsToKeyPoints(keyPoints, waveResult) {
    if (!keyPoints || keyPoints.length === 0 || !waveResult) return [];
    const { impulse, corrective, continuation } = waveResult;
    const tTol = 3600000;
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
        if (kt >= turnPoints[i].t && kt < turnPoints[i + 1].t) { segIdx = i; break; }
      }
      if (kt < turnPoints[0].t) segIdx = -1;
      else if (segIdx < 0) segIdx = turnPoints.length - 2;
      if (segIdx >= 0 && segIdx < turnPoints.length - 1) return turnPoints[segIdx + 1].label + '·';
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

  global.WaveBrowser = {
    identifyKeyPoints,
    identifyWaves12345AndABC,
    assignWaveLabelsToKeyPoints,
    calculateRetracementLevels,
    calculateBounceLevels,
    getKlineTime
  };
})(typeof window !== 'undefined' ? window : this);
