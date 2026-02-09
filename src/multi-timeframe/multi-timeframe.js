/**
 * 多周期分析模块
 * 包含处理多周期数据和分析的函数
 */

const { TIMEFRAME_CONFIG } = require('../config/config');
const { updateKlineData } = require('../data/data');
const { inferWaveStructure, analyzeWave2 } = require('../wave/wave');
const { judgeTrend } = require('../trend/trend');

/**
 * 获取多周期数据
 * @param {boolean} forceUpdate - 是否强制更新
 * @param {boolean} silent - 是否静默模式
 * @returns {Promise<Object>} 多周期数据对象
 */
async function fetchMultiTimeframeData(forceUpdate = false, silent = false) {
  const data = {};
  
  // 并行获取所有时间周期的数据
  const promises = Object.entries(TIMEFRAME_CONFIG).map(async ([key, config]) => {
    const klineData = await updateKlineData(config, forceUpdate, silent);
    data[key] = klineData;
  });
  
  await Promise.all(promises);
  
  return data;
}

/**
 * 分析单个时间周期
 * @param {number} currentPrice - 当前价格
 * @param {Array} klineData - K线数据
 * @param {string} timeframe - 时间周期
 * @returns {Object} 分析结果
 */
function analyzeSingleTimeframe(currentPrice, klineData, timeframe) {
  // 推理波浪结构
  const waveStructure = inferWaveStructure(klineData);
  
  // 分析波浪
  const analysis = analyzeWave2(currentPrice, waveStructure);
  
  // 判断趋势
  const trend = judgeTrend(currentPrice, analysis);
  
  return {
    timeframe: timeframe,
    waveStructure: waveStructure,
    analysis: analysis,
    trend: trend,
    dataPoints: klineData.length
  };
}

/**
 * 多周期综合分析
 * @param {number} currentPrice - 当前价格
 * @param {Object} multiTimeframeData - 多周期数据
 * @returns {Object} 综合分析结果
 */
function analyzeMultiTimeframe(currentPrice, multiTimeframeData) {
  const analysisResults = {};
  
  // 分析每个时间周期
  Object.entries(multiTimeframeData).forEach(([key, data]) => {
    if (data && data.length > 0) {
      analysisResults[key] = analyzeSingleTimeframe(currentPrice, data, key);
    }
  });
  
  // 综合判断
  const comprehensiveJudgment = judgeMultiTimeframeTrend(analysisResults);
  
  return {
    individualAnalyses: analysisResults,
    comprehensiveJudgment: comprehensiveJudgment
  };
}

/**
 * 多周期趋势综合判断
 * @param {Object} analysisResults - 各周期分析结果
 * @returns {Object} 综合判断结果
 */
function judgeMultiTimeframeTrend(analysisResults) {
  const trends = [];
  
  // 收集各周期的趋势判断（result.trend 为 judgeTrend 返回的对象，含 trend/action 等）
  Object.entries(analysisResults).forEach(([timeframe, result]) => {
    if (result && result.trend && typeof result.trend.trend === 'string') {
      trends.push({
        timeframe: timeframe,
        trend: result.trend.trend,      // 趋势字符串，用于统计
        action: result.trend.action || '观望'
      });
    }
  });
  
  // 分析趋势一致性
  let dominantTrend = '震荡';
  let dominantAction = '观望';
  let confidence = 0.5;
  
  if (trends.length > 0) {
    // 统计各趋势出现的次数
    const trendCounts = {};
    trends.forEach(item => {
      trendCounts[item.trend] = (trendCounts[item.trend] || 0) + 1;
    });
    
    // 找到出现次数最多的趋势
    let maxCount = 0;
    Object.entries(trendCounts).forEach(([trend, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantTrend = trend;
      }
    });
    
    // 计算信心度
    confidence = maxCount / trends.length;
    
    // 找到对应的操作建议
    const dominantTrendItem = trends.find(item => item.trend === dominantTrend);
    if (dominantTrendItem) {
      dominantAction = dominantTrendItem.action;
    }
  }
  
  return {
    dominantTrend: dominantTrend,
    dominantAction: dominantAction,
    confidence: confidence,
    individualTrends: trends
  };
}

module.exports = {
  fetchMultiTimeframeData,
  analyzeMultiTimeframe,
  analyzeSingleTimeframe,
  judgeMultiTimeframeTrend
};
