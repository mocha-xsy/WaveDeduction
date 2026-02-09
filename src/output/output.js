/**
 * 输出与报告模块
 * 包含生成分析报告和格式化输出的函数
 */

const { calculateBounceLevels } = require('../fibonacci/fibonacci');

/**
 * 格式化输出分析结果（简洁版，用于定时监控）
 * @param {Object} analysis - 分析结果
 * @param {Object} trend - 趋势判断
 * @param {Object} [stats] - 账户和日内统计信息（可选）
 */
function formatOutputCompact(analysis, trend, stats = null) {
  const now = new Date().toLocaleString('zh-CN');
  const price = analysis?.currentPrice ?? 0;
  const trendStr = trend?.trend ?? '未知';
  const actionStr = trend?.action ?? '等待更多数据';
  // 第一行：当前价格 + 趋势
  if (stats && typeof stats.dayOpen === 'number') {
    const change = stats.dayChangeAbs;
    const changePct = stats.dayChangePct;
    const sign = change >= 0 ? '+' : '';
    console.log(
      `\n[${now}] 💰 ${price.toFixed(2)} ` +
      `(${sign}${change.toFixed(2)}, ${sign}${changePct.toFixed(2)}%) | ${trendStr}`
    );
  } else {
    console.log(`\n[${now}] 💰 ${price.toFixed(2)} | ${trendStr}`);
  }

  console.log(`   ${actionStr}`);

  // 账户信息（成本、收益）
  if (stats && typeof stats.costUsd === 'number' && typeof stats.amountCny === 'number') {
    console.log(
      `   🧾 成本: ${stats.costUsd.toFixed(2)} USD | 持仓: ${stats.amountCny.toFixed(2)} CNY`
    );
    if (typeof stats.pnlCny === 'number' && typeof stats.pnlPct === 'number') {
      const pnlSign = stats.pnlCny >= 0 ? '+' : '';
      console.log(
        `   💹 收益: ${pnlSign}${Math.abs(stats.pnlCny).toFixed(2)} CNY ` +
        `(${pnlSign}${Math.abs(stats.pnlPct).toFixed(2)}%)`
      );
    }
  }

  // 今日涨跌信息
  if (stats && typeof stats.dayOpen === 'number') {
    const change = stats.dayChangeAbs;
    const changePct = stats.dayChangePct;
    const sign = change >= 0 ? '+' : '';
    console.log(
      `   📅 今日涨跌: ${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%) ` +
      `(日开盘 ${stats.dayOpen.toFixed(2)})`
    );
  }
  
  // 监测点状态（简洁，算法衍生）
  if (analysis && analysis.monitorPoints && trend && trend.status) {
    const lifeLineStatus = trend.status.lifeLine ? '✅' : '❌';
    const wave1EndStatus = trend.status.wave1End ? '✅' : '⏳';
    console.log(`   生命线: ${analysis.monitorPoints.LIFE_LINE.toFixed(2)} ${lifeLineStatus} | 第一浪终点: ${analysis.monitorPoints.WAVE_1_END.toFixed(2)} ${wave1EndStatus}`);
  }
  
  // 最近支撑位和目标位
  if (trend?.immediateSupport) {
    const distance = (price - trend.immediateSupport.price).toFixed(2);
    console.log(`   🛡️  支撑: ${trend.immediateSupport.price} (${distance}点)`);
  }
  if (trend?.immediateTarget) {
    const distance = (trend.immediateTarget.price - price).toFixed(2);
    console.log(`   🎯 目标: ${trend.immediateTarget.price} (${distance}点)`);
  }
}

/**
 * 格式化输出分析结果（基于推理出的波浪结构）
 * @param {Object} analysis - 分析结果
 * @param {Object} trend - 趋势判断
 * @param {Object} waveStructure - 推理出的波浪结构（可选）
 * @param {Object} [stats] - 账户和日内统计信息（可选）
 * @param {Object} [analysisResult] - 多周期分析结果（可选）
 * @param {Object} [wxyStructure] - W-X-Y 联合形结构（算法识别，可选）
 * @param {string} [timeframeName] - 推理周期名称（如 1小时、4小时、日线）
 */
function formatOutput(analysis, trend, waveStructure = null, stats = null, analysisResult = null, wxyStructure = null, timeframeName = '1小时') {
  if (!analysis || !trend) {
    console.log('\n⚠️ 分析数据不足，无法生成完整报告');
    return;
  }
  console.log('\n' + '='.repeat(80));
  console.log('📊 黄金波浪理论实时分析报告（多周期分析）');
  console.log('='.repeat(80));
  
  console.log(`\n💰 当前价格: ${analysis.currentPrice}`);

  // 日内涨跌信息
  if (stats && typeof stats.dayOpen === 'number') {
    const change = stats.dayChangeAbs;
    const changePct = stats.dayChangePct;
    const sign = change >= 0 ? '+' : '';
    console.log(
      `📅 今日涨跌: ${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%) ` +
      `(日开盘 ${stats.dayOpen.toFixed(2)})`
    );
  }

  // 账户信息（成本、收益）
  if (stats && typeof stats.costUsd === 'number' && typeof stats.amountCny === 'number') {
    console.log(
      `🧾 成本: ${stats.costUsd.toFixed(2)} USD | 持仓: ${stats.amountCny.toFixed(2)} CNY`
    );
    if (typeof stats.pnlCny === 'number' && typeof stats.pnlPct === 'number') {
      const pnlSign = stats.pnlCny >= 0 ? '+' : '';
      console.log(
        `💹 收益: ${pnlSign}${Math.abs(stats.pnlCny).toFixed(2)} CNY ` +
        `(${pnlSign}${Math.abs(stats.pnlPct).toFixed(2)}%)`
      );
    }
  }
  console.log(`\n📈 波浪结构:${analysis.inferred ? ` (基于${timeframeName}K线推理)` : ' (使用参考点位)'}`);
  const wave1Range = analysis.wave1.range ?? (analysis.wave1.end - analysis.wave1.start);
  console.log(`   第一浪: ${analysis.wave1.start.toFixed(2)} → ${analysis.wave1.end.toFixed(2)} (涨幅: ${wave1Range.toFixed(2)})`);
  if (analysis.wave1.startTime && analysis.wave1.endTime) {
    const startDate = new Date(analysis.wave1.startTime).toLocaleString('zh-CN');
    const endDate = new Date(analysis.wave1.endTime).toLocaleString('zh-CN');
    console.log(`   第一浪时间: ${startDate} 至 ${endDate}`);
  }
  if (analysis.wave2) {
    console.log(`   第二浪: ${analysis.wave2.start.toFixed(2)} → 进行中 (当前低点: ${analysis.wave2.currentLow.toFixed(2)})`);
  } else {
    console.log(`   第二浪: 正在形成中...`);
  }
  // W-X-Y 联合形（算法识别）
  if (wxyStructure && wxyStructure.waveW && wxyStructure.waveX && wxyStructure.waveY) {
    const w = wxyStructure.waveW, x = wxyStructure.waveX, y = wxyStructure.waveY;
    const wp = w.endPrice != null ? w.endPrice : w.end?.price;
    const xp = x.endPrice != null ? x.endPrice : x.end?.price;
    const yp = y.endPrice != null ? y.endPrice : y.end?.price;
    console.log(`   W-X-Y联合形: W低点 ${wp?.toFixed(2) ?? '—'} | X高点 ${xp?.toFixed(2) ?? '—'} | Y低点 ${yp?.toFixed(2) ?? '—'}`);
  }
  console.log(`\n📊 趋势状态: ${trend.trend}`);
  console.log(`\n${trend.action}`);
  if (trend.waveStatus) {
    console.log(`\n${trend.waveStatus}`);
  }
  
  // 监测点状态（均为算法衍生，非固定点位）
  const mp = analysis.monitorPoints;
  console.log('\n🔍 监测点状态（算法衍生）:');
  console.log(`   生命线（蓝线0.8）: ${mp.LIFE_LINE.toFixed(2)} ${trend.status.lifeLine ? '✅ 未跌破' : '❌ 已跌破'}`);
  console.log(`   第二浪低点(Y): ${mp.WAVE_2_LOW.toFixed(2)} ${trend.status.wave2Low ? '✅ 已突破' : '⏳ 未突破'}`);
  if (mp.IV_LOW != null) {
    console.log(`   (iv)浪低点: ${mp.IV_LOW.toFixed(2)} ${trend.status.ivLow ? '✅ 已突破' : '⏳ 未突破'}`);
  }
  if (mp.RISE_V_HIGH != null) {
    console.log(`   (v)浪高点: ${mp.RISE_V_HIGH.toFixed(2)} ${trend.status.riseVHigh ? '✅ 已突破' : '⏳ 未突破'}`);
  }
  console.log(`   第一浪终点: ${mp.WAVE_1_END.toFixed(2)} ${trend.status.wave1End ? '✅ 已突破（进入第三浪）' : '⏳ 未突破'}`);
  
  // 附近关键点位
  if (trend.nearbyLevels.length > 0) {
    console.log('\n📍 附近关键点位:');
    trend.nearbyLevels.forEach(level => {
      const distance = (analysis.currentPrice - level.price).toFixed(2);
      const direction = distance > 0 ? '上方' : '下方';
      const typeIcon = level.type === 'support' ? '🛡️' : '📈';
      console.log(`   ${typeIcon} ${level.price} - ${level.label} (当前价格${direction}${Math.abs(distance)}点)`);
    });
  }
  
  // 下一个支撑位和目标位
  if (trend.immediateSupport) {
    const distance = (analysis.currentPrice - trend.immediateSupport.price).toFixed(2);
    console.log(`\n🛡️  最近支撑位: ${trend.immediateSupport.price} - ${trend.immediateSupport.label} (距离${distance}点)`);
  }
  
  if (trend.immediateTarget) {
    const distance = (trend.immediateTarget.price - analysis.currentPrice).toFixed(2);
    console.log(`\n🎯 下一个目标位: ${trend.immediateTarget.price} - ${trend.immediateTarget.label} (距离${distance}点)`);
  }
  
  // 关键点位列表（按价格排序，区分支撑和压力）
  console.log('\n📋 关键点位列表（按价格排序）:');
  const supports = analysis.keyLevels.filter(l => l.type === 'support' && l.price !== undefined);
  const pressures = analysis.keyLevels.filter(l => l.type === 'pressure' && l.price !== undefined);
  
  if (supports.length > 0) {
    console.log('\n   🛡️  支撑位:');
    supports.sort((a, b) => a.price - b.price); // 按价格从低到高排序
    supports.forEach((level, index) => {
      const status = analysis.currentPrice >= level.price ? '✅ 未跌破' : '❌ 已跌破';
      const distance = Math.abs(level.price - analysis.currentPrice).toFixed(2);
      console.log(`      ${(index + 1).toString().padStart(2, ' ')}: ${level.price.toString().padStart(6, ' ')} - ${level.label.padEnd(40, ' ')} ${status} (距离${distance}点)`);
    });
  }
  
  if (pressures.length > 0) {
    console.log('\n   📈 压力位:');
    pressures.sort((a, b) => a.price - b.price); // 按价格从低到高排序
    pressures.forEach((level, index) => {
      const status = analysis.currentPrice >= level.price ? '✅ 已突破' : '⏳ 未突破';
      const distance = Math.abs(level.price - analysis.currentPrice).toFixed(2);
      console.log(`      ${(index + 1).toString().padStart(2, ' ')}: ${level.price.toString().padStart(6, ' ')} - ${level.label.padEnd(40, ' ')} ${status} (距离${distance}点)`);
    });
  }
  
  // 黄金分割计算详情
  console.log('\n📐 黄金分割计算详情:');
  console.log('\n   第二浪回撤位（基于第一浪5600）:');
  console.log(`      0.236: ${analysis.retracementLevels[0.236].toFixed(2)}`);
  console.log(`      0.382: ${analysis.retracementLevels[0.382].toFixed(2)}`);
  console.log(`      0.5: ${analysis.retracementLevels[0.5].toFixed(2)}`);
  console.log(`      0.618: ${analysis.retracementLevels[0.618].toFixed(2)}`);
  console.log(`      0.786: ${analysis.retracementLevels[0.786].toFixed(2)}`);
  console.log(`      0.8（蓝线）: ${analysis.retracementLevels[0.8].toFixed(2)}`);
  
  const wave2Low = analysis.monitorPoints?.WAVE_2_LOW ?? analysis.wave2?.currentLow;
  console.log(`\n   反弹压力位（以第二浪低点 ${wave2Low?.toFixed(2) ?? '—'} 为起点，算法衍生）:`);
  if (analysis.bounceLevels[0.236] != null) {
    console.log(`      0.236: ${analysis.bounceLevels[0.236].toFixed(2)} (iv)浪低点`);
  }
  console.log(`      0.382: ${analysis.bounceLevels[0.382].toFixed(2)}`);
  console.log(`      0.5: ${analysis.bounceLevels[0.5].toFixed(2)} (v)浪高点`);
  console.log(`      0.618: ${analysis.bounceLevels[0.618].toFixed(2)}`);
  console.log(`      0.786: ${analysis.bounceLevels[0.786].toFixed(2)}`);
  
  // 第三浪潜在目标（算法衍生：基于第二浪低点及延伸比率）
  if (trend.status.riseVHigh) {
    const wave2Low = analysis.monitorPoints.WAVE_2_LOW;
    const wave2End = analysis.currentPrice < wave2Low ? analysis.currentPrice : wave2Low;
    const wave3Target1 = Math.round((wave2End + 1.618 * analysis.wave1.range) * 100) / 100;
    const wave3Target2 = Math.round((wave2End + 2.618 * analysis.wave1.range) * 100) / 100;
    console.log('\n   🚀 第三浪潜在目标（基于第二浪低点算法）:');
    console.log(`      1.618倍延伸: ${wave3Target1}`);
    console.log(`      2.618倍延伸: ${wave3Target2}`);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * 格式化输出推动浪 12345 和调整浪 abc 点位
 * 基于黄金波浪理论推理文档、波浪理论核心算法提炼
 * @param {Object} waveResult - identifyWaves12345AndABC 的返回值
 */
function formatWavePointsOutput(waveResult) {
  if (!waveResult) return;

  const { impulse, corrective, wxy, isUptrend, ruleValidation } = waveResult;

  console.log('\n' + '='.repeat(60));
  console.log('📊 艾略特波浪点位（推动浪 1-2-3-4-5 & 调整浪 a-b-c）');
  console.log('='.repeat(60));
  console.log(`主趋势: ${isUptrend ? '上升' : '下跌'}`);

  // 驱动浪规则验证结果（基于文档 5.7 节）
  if (ruleValidation) {
    console.log(`\n📋 驱动浪规则验证: ${ruleValidation.valid ? '✅ 通过' : '❌ 存在违规'}`);
    if (ruleValidation.violations && ruleValidation.violations.length > 0) {
      ruleValidation.violations.forEach(v => console.log(`   ⚠️  ${v}`));
    }
  }

  console.log('\n🔺 推动浪 1-2-3-4-5:');
  ['wave1', 'wave2', 'wave3', 'wave4', 'wave5'].forEach((key, i) => {
    const w = impulse[key];
    if (w) {
      const startP = w.startPrice != null ? w.startPrice : w.start?.price;
      const endP = w.endPrice != null ? w.endPrice : w.end?.price;
      const range = endP != null && startP != null ? (endP - startP).toFixed(2) : '—';
      console.log(`   浪${i + 1}: ${startP?.toFixed(2) || '—'} → ${endP?.toFixed(2) || '—'} (幅度: ${range})`);
      if (w.end) console.log(`         终点时间: ${new Date(w.end.time).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   浪${i + 1}: 未识别`);
    }
  });

  console.log('\n🔻 调整浪 a-b-c:');
  ['waveA', 'waveB', 'waveC'].forEach((key, i) => {
    const w = corrective[key];
    const label = ['a', 'b', 'c'][i];
    if (w) {
      const startP = w.startPrice != null ? w.startPrice : w.start?.price;
      const endP = w.endPrice != null ? w.endPrice : w.end?.price;
      const range = endP != null && startP != null ? (endP - startP).toFixed(2) : '—';
      console.log(`   浪${label}: ${startP?.toFixed(2) || '—'} → ${endP?.toFixed(2) || '—'} (幅度: ${range})`);
    } else {
      console.log(`   浪${label}: 未识别`);
    }
  });

  // 浪c 之后的延续浪（浪1'～浪5'）
  const continuation = waveResult.continuation;
  const hasContinuation = continuation && (continuation.wave1 || continuation.wave2 || continuation.wave3);
  if (hasContinuation) {
    console.log('\n🔸 浪c 之后延续浪（浪1\'～浪5\'）:');
    ['wave1', 'wave2', 'wave3', 'wave4', 'wave5'].forEach((key, i) => {
      const w = continuation[key];
      if (w) {
        const startP = w.startPrice != null ? w.startPrice : w.start?.price;
        const endP = w.endPrice != null ? w.endPrice : w.end?.price;
        const range = endP != null && startP != null ? (endP - startP).toFixed(2) : '—';
        console.log(`   浪${i + 1}': ${startP?.toFixed(2) || '—'} → ${endP?.toFixed(2) || '—'} (幅度: ${range})`);
        if (w.end) console.log(`         终点时间: ${new Date(w.end.time).toLocaleString('zh-CN')}`);
      }
    });
  }

  // 浪c 之后无实际延续浪时，输出预测性点位（基于黄金分割）
  if (!hasContinuation && corrective?.waveC?.end) {
    const cLow = corrective.waveC.endPrice ?? corrective.waveC.end?.price ?? corrective.waveC.end?.close;
    const w5High = impulse?.wave5?.endPrice ?? impulse?.wave5?.end?.price;
    const bHigh = corrective?.waveB?.endPrice ?? corrective?.waveB?.end?.price;
    const bounceTarget = [w5High, bHigh].filter(Boolean).reduce((a, b) => Math.max(a, b), 0) || w5High || bHigh;
    if (bounceTarget != null && cLow != null) {
      const bounceLevels = calculateBounceLevels(cLow, bounceTarget);
      console.log('\n🔸 浪c 之后预测性点位（黄金分割反弹）:');
      console.log(`   预期浪1\' 0.382: ${bounceLevels[0.382]?.toFixed(2) ?? '—'}`);
      console.log(`   预期浪1\' 0.5:   ${bounceLevels[0.5]?.toFixed(2) ?? '—'}`);
      console.log(`   预期浪3\' 0.618: ${bounceLevels[0.618]?.toFixed(2) ?? '—'}`);
    }
  }

  // W-X-Y 联合形（若识别到）
  if (wxy && wxy.waveW && wxy.waveX && wxy.waveY) {
    console.log('\n📐 联合形 W-X-Y:');
    ['waveW', 'waveX', 'waveY'].forEach((key, i) => {
      const w = wxy[key];
      const label = ['W', 'X', 'Y'][i];
      const startP = w.startPrice != null ? w.startPrice : w.start?.price;
      const endP = w.endPrice != null ? w.endPrice : w.end?.price;
      const range = endP != null && startP != null ? (endP - startP).toFixed(2) : '—';
      console.log(`   浪${label}: ${startP?.toFixed(2) || '—'} → ${endP?.toFixed(2) || '—'} (幅度: ${range})`);
    });
  }

  // 关键点位速查表（参考文档第八章，R = H - k×ΔP 回撤 / B = L + k×ΔP 反弹）
  const impStart = impulse.wave1?.startPrice ?? impulse.wave1?.start?.price;
  const impEnd = impulse.wave5?.endPrice ?? impulse.wave3?.endPrice ?? impulse.wave1?.endPrice;
  if (impStart != null && impEnd != null) {
    const high = Math.max(impStart, impEnd);
    const low = Math.min(impStart, impEnd);
    const deltaP = high - low;
    const fib08 = high - 0.8 * deltaP;
    const fib0618 = high - 0.618 * deltaP;
    const fib05 = high - 0.5 * deltaP;
    const fib0382 = high - 0.382 * deltaP;
    const bounce0618 = low + 0.618 * deltaP;
    const bounce05 = low + 0.5 * deltaP;
    const bounce0382 = low + 0.382 * deltaP;
    console.log('\n📍 关键点位速查表（基于主驱动浪）:');
    console.log(`   高点: ${high.toFixed(2)} | 低点: ${low.toFixed(2)} | 幅度: ${deltaP.toFixed(2)}`);
    console.log(`   回撤位: 0.382→${fib0382.toFixed(2)} | 0.5→${fib05.toFixed(2)} | 0.618→${fib0618.toFixed(2)} | 0.8→${fib08.toFixed(2)}`);
    console.log(`   反弹位: 0.382→${bounce0382.toFixed(2)} | 0.5→${bounce05.toFixed(2)} | 0.618→${bounce0618.toFixed(2)}`);
  }
  console.log('='.repeat(60) + '\n');
}

module.exports = {
  formatOutputCompact,
  formatOutput,
  formatWavePointsOutput
};
