/**
 * 配置参数模块
 * 包含所有配置参数
 */

const path = require('path');

// 数据文件路径
const DATA_FILE = path.join(__dirname, '..', '..', 'gold_price_1h.json');

// 黄金分割比率常量
const FIBONACCI_RATIOS = {
  RETRACEMENT: [0.236, 0.382, 0.5, 0.618, 0.786, 0.8],  // 回撤比率（包含0.8蓝线）
  BOUNCE: [0.236, 0.382, 0.5, 0.618, 0.786],        // 反弹比率（0.236 对应(iv)浪低点近似）
  EXTENSION: [1.618, 2.618]                        // 延伸比率
};

// 多周期数据存储配置
const DATA_CONFIG = {
  FILE_PATH: DATA_FILE,
  DAYS_TO_FETCH: 365,        // 获取前365天数据（用于波浪识别）
  UPDATE_INTERVAL: 3600000   // 更新间隔：1小时（毫秒）
};

// 多周期配置
const TIMEFRAME_CONFIG = {
  H1: {
    NAME: '1小时',
    FILE_PATH: path.join(__dirname, '..', '..', 'gold_price_1h.json'),
    INTERVAL: 60,            // 分钟
    DAYS_TO_FETCH: 365,
    UPDATE_INTERVAL: 3600000
  },
  H4: {
    NAME: '4小时',
    FILE_PATH: path.join(__dirname, '..', '..', 'gold_price_4h.json'),
    INTERVAL: 240,           // 分钟
    DAYS_TO_FETCH: 365,
    UPDATE_INTERVAL: 14400000
  },
  D1: {
    NAME: '日线',
    FILE_PATH: path.join(__dirname, '..', '..', 'gold_price_d1.json'),
    INTERVAL: 1440,          // 分钟
    DAYS_TO_FETCH: 365,
    UPDATE_INTERVAL: 86400000
  }
};

// 黄金历史数据文件（1小时K线，由 fetch_year_data.js 生成）
const GOLD_HISTORY_DATA_FILE = path.join(__dirname, '..', '..', 'gold_1year_data_real.json');

// 参考点位（仅作为参考，实际点位从K线数据推理得出）
const REFERENCE_POINTS = {
  WAVE_1: {
    START: 4300,          // 起点（0点），约4300-4400，取4300
    END: 5600,            // 第一浪终点（V）
    RANGE: 1300           // 涨幅约1300
  },
  WAVE_2: {
    START: 5600,          // 第二浪起点（第一浪终点）
    W_LOW: 5100,          // W浪低点
    X_HIGH: 5450,         // X浪高点
    Y_LOW: 4600,          // Y浪低点
    RISE_V_HIGH: 5150,    // 上升5浪(v)浪高点
    CURRENT_LOW: 4600     // 当前低点
  },
  LIFE_LINE: 4540        // 生命线（蓝线0.8位置）- 参考值
};

module.exports = {
  DATA_FILE,
  FIBONACCI_RATIOS,
  DATA_CONFIG,
  TIMEFRAME_CONFIG,
  REFERENCE_POINTS,
  GOLD_HISTORY_DATA_FILE
};
