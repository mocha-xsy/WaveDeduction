/**
 * 数据获取与处理模块
 * 包含获取实时价格和历史K线数据的函数
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TIMEFRAME_CONFIG, GOLD_HISTORY_DATA_FILE } = require('../config/config');

/**
 * 获取实时黄金价格（支持API获取和手动输入）
 * 
 * 优先级：
 * 1. 命令行参数 --price 或 -p
 * 2. 环境变量 GOLD_PRICE
 * 3. 从 jijinhao.com API 获取（需要Referrer头）
 * 
 * 注意：如果API获取失败，必须使用 --price 参数或 GOLD_PRICE 环境变量手动输入价格
 */
async function getCurrentGoldPrice() {
  // 方案1：从命令行参数获取（最高优先级）
  const args = process.argv.slice(2);
  const priceArgIndex = args.findIndex(arg => arg === '--price' || arg === '-p');
  if (priceArgIndex !== -1 && args[priceArgIndex + 1]) {
    const manualPrice = parseFloat(args[priceArgIndex + 1]);
    if (!isNaN(manualPrice) && manualPrice > 0 && manualPrice < 10000) {
      console.log(`📌 使用手动输入价格: ${manualPrice.toFixed(2)} USD/盎司`);
      // 手动输入的价格不在这里追加，由调用者决定是否追加
      return manualPrice;
    }
  }
  
  // 方案2：从环境变量获取
  if (process.env.GOLD_PRICE) {
    const envPrice = parseFloat(process.env.GOLD_PRICE);
    if (!isNaN(envPrice) && envPrice > 0) {
      console.log(`📌 使用环境变量价格: ${envPrice}`);
      // 环境变量的价格不在这里追加，由调用者决定是否追加
      return envPrice;
    }
  }
  
  // 方案3：从 jijinhao.com API 获取真实价格
  // 注意：此API需要Referrer头，必须从 quote.cngold.org 域名访问
  try {
    // 生成时间戳（避免缓存）
    const timestamp = Date.now();
    const url = `https://api.jijinhao.com/sQuoteCenter/realTime.htm?code=JO_92233&_=${timestamp}`;
    
    // 必须设置Referrer，否则API返回666状态码
    const headers = {
      'Referer': 'https://quote.cngold.org/gjs/',
      'Origin': 'https://quote.cngold.org',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7'
    };
    
    const response = await fetchFromURL(url, headers);
    
    // 响应格式: var hq_str = "现货黄金,0,4775.63,4965.87,4971.42,4654.29,0,0,708.0,0.0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-02-07,05:59:59,00,2,190.2402,3.9836,0.0,0.0,4776.99,120,2026-02-07,05:59:07,";
    let price = null;
    if (typeof response === 'string' && response.startsWith('var hq_str = ')) {
      // 提取字符串部分
      const hqStr = response.replace(/^var hq_str = /, '').replace(/;$/, '').replace(/^"|"$/g, '');
      // 按逗号分割
      const dataArray = hqStr.split(',');
      
      // 解析价格数据（根据用户提供的字段对应关系）
      // 字段索引：
      // 2: 昨收
      // 3: 当前价格
      // 4: 最高
      // 5: 最低
      // 38: 今开
      
      if (dataArray.length >= 39) {
        price = dataArray[3]; // 当前价格
      }
    } else {
      throw new Error('jijinhao API响应格式异常');
    }
    
    if (price && !isNaN(price) && price > 0 && price < 10000) {
      const finalPrice = parseFloat(price);
      
      // 实时追加价格到K线数据文件（静默模式，避免刷屏）
      appendCurrentPriceToFile(finalPrice, true);
      
      return finalPrice;
    }
    
    throw new Error('jijinhao响应中未找到有效的价格字段');

  } catch (error) {
    // API获取失败，提示用户使用手动输入
    throw new Error(`无法从jijinhao获取真实价格：${error.message}。请使用 --price 或 GOLD_PRICE 手动指定价格`);
  }
}

/**
 * 从指定URL获取价格（支持HTTPS和HTTP）
 */
function fetchFromURL(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...customHeaders
      }
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // 如果响应不是JSON，尝试解析为数字
          if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
            const json = JSON.parse(data);
            // 尝试多种可能的响应格式
            const price = json.price || 
                         json.data?.price || 
                         json.spot || 
                         json.close ||
                         json.last ||
                         json.value ||
                         json.rate ||
                         json.rates?.USD ||
                         json.USD ||
                         (json.metals && json.metals.gold) ||
                         (Array.isArray(json) && json[0]?.price) ||
                         null;
            
            if (price !== null && price !== undefined) {
              const numPrice = typeof price === 'string' ? parseFloat(price) : price;
              if (typeof numPrice === 'number' && numPrice > 0 && numPrice < 10000) {
                resolve(numPrice);
                return;
              }
            }
            // 如果找到了JSON但没有价格，返回整个JSON对象供调用者处理
            resolve(json);
          } else {
            // 尝试直接解析为数字
            const numPrice = parseFloat(data.trim());
            if (!isNaN(numPrice) && numPrice > 0 && numPrice < 10000) {
              resolve(numPrice);
            } else {
              // 如果无法解析为数字，返回原始字符串供调用者处理
              // 这对于处理 var quote_json = {...} 格式的响应很有用
              resolve(data);
            }
          }
        } catch (e) {
          reject(new Error(`API响应解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('API请求超时'));
    });

    req.end();
  });
}

/**
 * 从指定API获取价格（保留向后兼容）
 */
function fetchFromAPI(hostname, path, headers) {
  const protocol = hostname.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${hostname}${path}`;
  return fetchFromURL(url, headers);
}

/**
 * 从API获取历史K线数据（尝试多个数据源）
 * @param {number} days - 天数
 * @param {number} interval - 时间间隔（分钟）
 * @returns {Promise<Array>} K线数据数组
 */
async function fetchHistoricalKlineFromAPI(days, interval = 60) {
  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);
  
  // 尝试从多个API获取历史数据
  // 注意：大多数免费API不支持获取365天的历史数据
  // 这里提供一个框架，实际使用时需要配置相应的API密钥
  
  // 方案1: 使用Alpha Vantage API（需要API密钥）
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (alphaVantageKey) {
    try {
      // 根据时间间隔选择合适的API参数
      let apiInterval = '60min';
      if (interval === 240) {
        apiInterval = '4h';
      } else if (interval === 1440) {
        apiInterval = 'daily';
      }
      
      // Alpha Vantage API示例（需要配置）
      // const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=XAU&to_symbol=USD&interval=${apiInterval}&apikey=${alphaVantageKey}`;
      // 这里需要实现具体的API调用逻辑
    } catch (e) {
      console.warn('⚠️  Alpha Vantage API获取失败:', e.message);
    }
  }
  
  // 如果所有API都无法获取历史数据，返回null
  return null;
}

/**
 * 获取指定时间周期的K线数据
 * @param {Object} timeframeConfig - 时间周期配置
 * @param {number} days - 天数
 * @returns {Promise<Array>} K线数据数组
 */
async function fetchKlineData(timeframeConfig, days = 365) {
  // 计算时间范围
  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);
  
  const FILE_PATH = timeframeConfig.FILE_PATH;
  
  // 步骤1: 尝试从本地文件读取
  if (fs.existsSync(FILE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
      if (data && data.length > 0) {
        // 检查数据是否足够（至少需要days天的数据）
        const sortedData = [...data].sort((a, b) => {
          const timeA = a.time || new Date(a.timestamp).getTime();
          const timeB = b.time || new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        const oldestData = sortedData[0];
        const oldestTime = oldestData.time || new Date(oldestData.timestamp).getTime();
        const requiredTime = startTime.getTime();
        
        // 如果数据足够新，直接返回
        if (oldestTime <= requiredTime) {
          return data;
        }
      }
    } catch (e) {
      console.warn('⚠️  读取本地K线数据文件失败，将重新生成:', e.message);
    }
  }
  
  // 步骤2: 尝试从API获取历史数据
  let klineData = null;
  try {
    klineData = await fetchHistoricalKlineFromAPI(days, timeframeConfig.INTERVAL);
  } catch (e) {
    console.warn('⚠️  从API获取历史数据失败:', e.message);
  }
  
  // 步骤3: API 失败时尝试使用真实数据源（不使用模拟数据）
  if (!klineData || klineData.length === 0) {
    const isH1 = timeframeConfig.INTERVAL === 60;
    if (isH1 && fs.existsSync(GOLD_HISTORY_DATA_FILE)) {
      // H1: 使用 fetch_year_data.js 生成的真实数据
      klineData = loadGoldDataFromFile(GOLD_HISTORY_DATA_FILE);
      if (klineData.length > 0) {
        klineData = klineData.map(d => ({
          timestamp: d.timestamp,
          time: d.time || (d.timestamp ? (typeof d.timestamp === 'number' && d.timestamp < 1e12 ? d.timestamp * 1000 : new Date(d.timestamp).getTime()) : null),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          price: d.close || d.price
        })).filter(d => d.time || d.timestamp);
        if (klineData.length > 0) {
          saveKlineDataToFile(klineData, FILE_PATH);
          console.log(`📌 使用 ${GOLD_HISTORY_DATA_FILE} 的真实数据（共 ${klineData.length} 条）`);
        }
      }
    }
    if (!klineData || klineData.length === 0) {
      console.warn('⚠️  无历史K线数据。请先运行: node fetch_year_data.js 2025-01-01');
      klineData = [];
    }
  }

  return klineData;
}

/**
 * 更新K线数据
 * @param {Object} timeframeConfig - 时间周期配置
 * @param {boolean} forceUpdate - 是否强制更新
 * @param {boolean} silent - 是否静默模式
 * @returns {Promise<Array>} 更新后的K线数据
 */
async function updateKlineData(timeframeConfig, forceUpdate = false, silent = false) {
  const FILE_PATH = timeframeConfig.FILE_PATH;
  const DAYS_TO_FETCH = timeframeConfig.DAYS_TO_FETCH;
  
  // 检查文件是否存在且是最新的
  let shouldUpdate = forceUpdate;
  
  if (!forceUpdate && fs.existsSync(FILE_PATH)) {
    try {
      const stat = fs.statSync(FILE_PATH);
      const fileAge = Date.now() - stat.mtime.getTime();
      // 如果文件超过1小时（3600000毫秒），需要更新
      if (fileAge > timeframeConfig.UPDATE_INTERVAL) {
        shouldUpdate = true;
      }
    } catch (e) {
      console.warn('⚠️  检查K线数据文件状态失败:', e.message);
      shouldUpdate = true;
    }
  } else if (!fs.existsSync(FILE_PATH)) {
    shouldUpdate = true;
  }
  
  if (shouldUpdate) {
    if (!silent) {
      console.log(`🔄 正在更新${timeframeConfig.NAME}K线数据（前${DAYS_TO_FETCH}天）...`);
    }
    const klineData = await fetchKlineData(timeframeConfig, DAYS_TO_FETCH);
    saveKlineDataToFile(klineData, FILE_PATH);
    if (!silent) {
      console.log(`✅ ${timeframeConfig.NAME}K线数据更新完成，共${klineData.length}条数据`);
    }
    return klineData;
  } else {
    // 文件是最新的，直接读取
    try {
      const klineData = loadKlineDataFromFile(FILE_PATH);
      if (!silent) {
        console.log(`✅ 使用最新的${timeframeConfig.NAME}K线数据，共${klineData.length}条数据`);
      }
      return klineData;
    } catch (e) {
      console.warn('⚠️  读取K线数据文件失败，将重新获取:', e.message);
      const klineData = await fetchKlineData(timeframeConfig, DAYS_TO_FETCH);
      saveKlineDataToFile(klineData, FILE_PATH);
      return klineData;
    }
  }
}

/**
 * 保存K线数据到文件
 * @param {Array} klineData - K线数据数组
 * @param {string} filePath - 文件路径
 */
function saveKlineDataToFile(klineData, filePath) {
  try {
    // 确保数据按时间排序
    const sortedData = [...klineData].sort((a, b) => {
      const timeA = a.time || new Date(a.timestamp).getTime();
      const timeB = b.time || new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
    
    fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2));
  } catch (e) {
    console.error('❌ 保存K线数据到文件失败:', e.message);
  }
}

/**
 * 从文件加载K线数据
 * @param {string} filePath - 文件路径
 * @returns {Array} K线数据数组
 */
function loadKlineDataFromFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  } catch (e) {
    console.error('❌ 从文件加载K线数据失败:', e.message);
    return [];
  }
}

/**
 * 追加当前价格到K线数据文件
 * @param {number} price - 当前价格
 * @param {boolean} silent - 是否静默模式
 */
function appendCurrentPriceToFile(price, silent = false) {
  try {
    // 追加到所有时间周期的文件
    Object.values(TIMEFRAME_CONFIG).forEach(config => {
      const FILE_PATH = config.FILE_PATH;
      
      if (fs.existsSync(FILE_PATH)) {
        try {
          const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
          
          // 创建新的K线数据点
          const now = new Date();
          const newDataPoint = {
            timestamp: now.toISOString(),
            time: now.getTime(),
            price: price,
            open: price,
            high: price,
            low: price,
            close: price
          };
          
          // 检查是否已经有相同时间的数据
          const lastDataPoint = data[data.length - 1];
          if (lastDataPoint) {
            const lastTime = lastDataPoint.time || new Date(lastDataPoint.timestamp).getTime();
            const timeDiff = now.getTime() - lastTime;
            
            // 如果时间差小于时间周期的一半，不追加
            if (timeDiff < (config.INTERVAL * 60000) / 2) {
              if (!silent) {
                console.log(`⏰ 时间间隔不足，跳过追加价格到${config.NAME}数据文件`);
              }
              return;
            }
          }
          
          // 追加新数据
          data.push(newDataPoint);
          
          // 限制数据量，只保留最近365天的数据
          const maxDataPoints = (365 * 24 * 60) / config.INTERVAL;
          if (data.length > maxDataPoints) {
            data.splice(0, data.length - maxDataPoints);
          }
          
          // 保存更新后的数据
          fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
          
          if (!silent) {
            console.log(`✅ 已将当前价格 ${price.toFixed(2)} 追加到${config.NAME}数据文件`);
          }
        } catch (e) {
          if (!silent) {
            console.warn(`⚠️  追加价格到${config.NAME}数据文件失败:`, e.message);
          }
        }
      } else {
        if (!silent) {
          console.warn(`⚠️ ${config.NAME}数据文件不存在，跳过追加价格`);
        }
      }
    });
  } catch (e) {
    if (!silent) {
      console.error('❌ 追加当前价格到K线数据文件失败:', e.message);
    }
  }
}

/**
 * 获取最新收盘价
 * @param {Array} klineData - K线数据数组
 * @returns {number|null} 最新收盘价
 */
function getLatestClosePrice(klineData) {
  if (!klineData || klineData.length === 0) {
    return null;
  }
  
  // 按时间排序，获取最后一条数据
  const sortedData = [...klineData].sort((a, b) => {
    const timeA = a.time || new Date(a.timestamp).getTime();
    const timeB = b.time || new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
  
  const lastData = sortedData[sortedData.length - 1];
  return lastData.close || lastData.price || null;
}

/**
 * 更新1小时K线数据
 * @param {boolean} forceUpdate - 是否强制更新
 * @param {boolean} silent - 是否静默模式
 * @returns {Promise<Array>} 更新后的K线数据
 */
async function updateHourlyKlineData(forceUpdate = false, silent = false) {
  return updateKlineData(TIMEFRAME_CONFIG.H1, forceUpdate, silent);
}

/**
 * 从 gold_1year_data_real.json 加载历史数据（1小时K线）
 * 数据格式：{ symbol, resolution, from, to, data: [{timestamp, time, open, high, low, close, volume}] }
 * @param {string} [filePath] - 文件路径，默认 GOLD_HISTORY_DATA_FILE
 * @returns {Array} K线数据数组，兼容 wave 模块格式
 */
function loadGoldDataFromFile(filePath = GOLD_HISTORY_DATA_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const items = raw.data || raw;
    if (!Array.isArray(items) || items.length === 0) return [];
    return items.map(item => ({
      timestamp: item.timestamp,
      time: item.timestamp ? item.timestamp * 1000 : (typeof item.time === 'string' ? new Date(item.time.replace(/\//g, '-')).getTime() : item.time),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      price: item.close,
      volume: item.volume
    })).sort((a, b) => (a.time || a.timestamp * 1000) - (b.time || b.timestamp * 1000));
  } catch (e) {
    console.error('❌ 加载黄金历史数据失败:', e.message);
    return [];
  }
}

/**
 * 获取指定时间段的黄金历史数据，若本地无则调用 fetch_year_data.js 抓取
 * @param {string} [startDate] - 开始日期，如 '2025-01-01'
 * @param {string} [endDate] - 结束日期，默认当前
 * @returns {Promise<Array>} K线数据
 */
async function fetchOrLoadGoldData(startDate = '2025-01-01', endDate = null) {
  const filePath = GOLD_HISTORY_DATA_FILE;
  let data = loadGoldDataFromFile(filePath);
  if (data.length > 0) {
    const startTs = new Date(startDate).getTime() / 1000;
    const endTs = endDate ? new Date(endDate).getTime() / 1000 : Math.floor(Date.now() / 1000);
    data = data.filter(d => {
      const ts = d.timestamp || d.time / 1000;
      return ts >= startTs && ts <= endTs;
    });
  }
  if (data.length < 100) {
    console.log('🔄 历史数据不足，正在调用 fetch_year_data.js 抓取...');
    const projRoot = path.join(__dirname, '..', '..');
    try {
      execSync(`node fetch_year_data.js ${startDate}`, { cwd: projRoot, stdio: 'inherit' });
      data = loadGoldDataFromFile(filePath);
    } catch (e) {
      console.warn('⚠️ 抓取失败，使用本地已有数据');
    }
  }
  return data;
}

/**
 * 计算日内涨跌统计
 * @param {Array} klineData - K线数据数组
 * @param {number} currentPrice - 当前价格
 * @returns {Object|null} 日内涨跌统计
 */
function computeDailyChangeStats(klineData, currentPrice) {
  if (!klineData || klineData.length === 0 || !currentPrice) {
    return null;
  }
  
  // 按时间排序
  const sortedData = [...klineData].sort((a, b) => {
    const timeA = a.time || new Date(a.timestamp).getTime();
    const timeB = b.time || new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
  
  // 查找今天的开盘价
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  
  let dayOpen = null;
  
  for (const item of sortedData) {
    const itemTime = item.time || new Date(item.timestamp).getTime();
    if (itemTime >= todayTimestamp) {
      dayOpen = item.open || item.price;
      break;
    }
  }
  
  if (!dayOpen) {
    // 如果今天还没有K线（例如刚跨日），退而求其次：使用最新一根K线的开盘价
    const lastBar = sortedData[sortedData.length - 1];
    dayOpen = typeof lastBar.open === 'number' && lastBar.open > 0 ? lastBar.open : lastBar.price;
  }

  if (!dayOpen || dayOpen <= 0) {
    return null;
  }

  const dayChangeAbs = currentPrice - dayOpen;
  const dayChangePct = (dayChangeAbs / dayOpen) * 100;

  return {
    dayOpen,
    dayChangeAbs,
    dayChangePct
  };
}

module.exports = {
  loadGoldDataFromFile,
  fetchOrLoadGoldData,
  getCurrentGoldPrice,
  fetchFromURL,
  fetchFromAPI,
  fetchHistoricalKlineFromAPI,
  fetchKlineData,
  updateKlineData,
  saveKlineDataToFile,
  loadKlineDataFromFile,
  appendCurrentPriceToFile,
  getLatestClosePrice,
  updateHourlyKlineData,
  computeDailyChangeStats
};
