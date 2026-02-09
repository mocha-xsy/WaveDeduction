/**
 * 趋势判断模块
 * 包含判断当前趋势的函数
 * 基于算法衍生监测点（黄金分割），非固定点位
 */

/**
 * 判断趋势（5档价格区间，基于文档04/07）
 * @param {number} currentPrice - 当前价格
 * @param {Object} analysis - 分析结果
 * @returns {Object} 趋势判断结果
 */
function judgeTrend(currentPrice, analysis) {
  if (!analysis) {
    return {
      trend: '未知',
      action: '等待更多数据',
      status: {},
      nearbyLevels: [],
      immediateSupport: null,
      immediateTarget: null
    };
  }
  
  const monitorPoints = analysis.monitorPoints;
  const keyLevels = analysis.keyLevels || [];
  
  // 算法衍生监测点（若无则用公式计算）
  const wave1End = monitorPoints.WAVE_1_END;
  const wave2Low = monitorPoints.WAVE_2_LOW;
  const lifeLine = monitorPoints.LIFE_LINE;
  const range = wave1End - wave2Low;
  const riseVHigh = monitorPoints.RISE_V_HIGH ?? (wave2Low + 0.5 * range);   // (v)浪高点：0.5反弹位
  const ivLow = monitorPoints.IV_LOW ?? (wave2Low + 0.236 * range);         // (iv)浪低点：0.236反弹位
  
  // 状态判断（5档）
  const status = {
    lifeLine: currentPrice >= lifeLine,
    wave1End: currentPrice >= wave1End,
    wave2Low: currentPrice >= wave2Low,
    riseVHigh: currentPrice >= riseVHigh,
    ivLow: currentPrice >= ivLow
  };
  
  // 附近关键点位
  const nearbyLevels = [];
  const maxDistance = 100; // 最大距离（点）
  
  keyLevels.forEach(level => {
    const distance = Math.abs(currentPrice - level.price);
    if (distance <= maxDistance) {
      nearbyLevels.push({
        price: level.price,
        type: level.type,
        label: level.label,
        distance: distance
      });
    }
  });
  
  // 按距离排序
  nearbyLevels.sort((a, b) => a.distance - b.distance);
  
  // 最近支撑位和目标位
  const supports = keyLevels.filter(level => level.type === 'support' && level.price <= currentPrice);
  const pressures = keyLevels.filter(level => level.type === 'pressure' && level.price >= currentPrice);
  
  supports.sort((a, b) => b.price - a.price); // 支撑位从高到低排序
  pressures.sort((a, b) => a.price - b.price); // 压力位从低到高排序
  
  const immediateSupport = supports.length > 0 ? supports[0] : null;
  const immediateTarget = pressures.length > 0 ? pressures[0] : null;
  
  // 5档趋势判断（文档：>5100、4850-5100、4600-4850、4540-4600、<4540）
  let trend = '未知';
  let action = '等待更多数据';
  
  if (status.wave1End) {
    trend = '第三浪上涨';
    action = '持有多单，目标看向延伸位';
  } else if (currentPrice > riseVHigh) {
    trend = '第二浪可能结束';
    action = '突破(v)浪高点，可能进入第三浪';
  } else if (currentPrice > ivLow) {
    trend = '调整中';
    action = '在(iv)浪低点和(v)浪高点之间';
  } else if (currentPrice > wave2Low) {
    trend = '深度调整';
    action = '跌破(iv)浪低点，但未破Y浪低点';
  } else if (currentPrice > lifeLine) {
    trend = '关键区域';
    action = '接近蓝线0.8位置，需密切关注';
  } else {
    trend = '危险区域';
    action = '跌破蓝线0.8位置，第二浪可能延伸';
  }
  
  return {
    trend: trend,
    action: action,
    status: status,
    nearbyLevels: nearbyLevels,
    immediateSupport: immediateSupport,
    immediateTarget: immediateTarget
  };
}

module.exports = {
  judgeTrend
};
