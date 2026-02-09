/**
 * 黄金分割计算模块
 * 包含计算黄金分割水平的函数
 */

const { FIBONACCI_RATIOS } = require('../config/config');

/**
 * 计算回撤水平
 * @param {number} startPrice - 起始价格
 * @param {number} endPrice - 结束价格
 * @returns {Object} 回撤水平对象
 */
function calculateRetracementLevels(startPrice, endPrice) {
  const range = endPrice - startPrice;
  const levels = {};
  
  FIBONACCI_RATIOS.RETRACEMENT.forEach(ratio => {
    const level = endPrice - range * ratio;
    levels[ratio] = level;
  });
  
  return {
    0.236: levels[0.236],
    0.382: levels[0.382],
    0.5: levels[0.5],
    0.618: levels[0.618],
    0.786: levels[0.786],
    0.8: levels[0.8]  // 蓝线
  };
}

/**
 * 计算反弹水平
 * @param {number} lowPrice - 低点价格
 * @param {number} highPrice - 高点价格
 * @returns {Object} 反弹水平对象
 */
function calculateBounceLevels(lowPrice, highPrice) {
  const range = highPrice - lowPrice;
  const levels = {};
  
  FIBONACCI_RATIOS.BOUNCE.forEach(ratio => {
    const level = lowPrice + range * ratio;
    levels[ratio] = level;
  });
  
  return {
    0.236: levels[0.236],
    0.382: levels[0.382],
    0.5: levels[0.5],
    0.618: levels[0.618],
    0.786: levels[0.786]
  };
}

/**
 * 计算延伸水平
 * @param {number} startPrice - 起始价格
 * @param {number} endPrice - 结束价格
 * @returns {Object} 延伸水平对象
 */
function calculateExtensionLevels(startPrice, endPrice) {
  const range = endPrice - startPrice;
  const levels = {};
  
  FIBONACCI_RATIOS.EXTENSION.forEach(ratio => {
    const level = endPrice + range * ratio;
    levels[ratio] = level;
  });
  
  return {
    1.618: levels[1.618],
    2.618: levels[2.618]
  };
}

module.exports = {
  calculateRetracementLevels,
  calculateBounceLevels,
  calculateExtensionLevels
};
