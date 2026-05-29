// Hardcoded Delta Exchange-style system values for BTC option selling.
const CONFIG = Object.freeze({
  lotSizeBtc: 0.001,
  makerFeeRate: 0.0001,
  premiumCapRate: 0.035,
  gstRate: 0.18,
  defaultTargetRoi: 0.05,
});

const state = {
  targetRoi: CONFIG.defaultTargetRoi,
  hydrated: false,
};

const elements = {
  form: document.getElementById('calculatorForm'),
  btcPrice: document.getElementById('btcPrice'),
  sellingPrice: document.getElementById('sellingPrice'),
  buyingPrice: document.getElementById('buyingPrice'),
  lots: document.getElementById('lots'),
  leverage: document.getElementById('leverage'),
  resetBtn: document.getElementById('resetBtn'),
  copyBtn: document.getElementById('copyBtn'),
  copyJournalBtn: document.getElementById('copyJournalBtn'),
  copyJournalBtnSecondary: document.getElementById('copyJournalBtnSecondary'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  targetButtons: document.querySelectorAll('[data-target-roi]'),
  statusMessage: document.getElementById('statusMessage'),
  roiBadge: document.getElementById('roiBadge'),
  grossProfit: document.getElementById('grossProfit'),
  entryFee: document.getElementById('entryFee'),
  exitFee: document.getElementById('exitFee'),
  totalCharges: document.getElementById('totalCharges'),
  netProfit: document.getElementById('netProfit'),
  marginUsed: document.getElementById('marginUsed'),
  roiPercent: document.getElementById('roiPercent'),
  roiDetail: document.getElementById('roiDetail'),
  targetBuyback: document.getElementById('targetBuyback'),
  targetBuybackLabel: document.getElementById('targetBuybackLabel'),
  entryLogic: document.getElementById('entryLogic'),
  exitLogic: document.getElementById('exitLogic'),
  capitalUsed: document.getElementById('capitalUsed'),
  summaryGrossProfit: document.getElementById('summaryGrossProfit'),
  summaryTotalCharges: document.getElementById('summaryTotalCharges'),
  summaryNetProfit: document.getElementById('summaryNetProfit'),
  summaryNetRoi: document.getElementById('summaryNetRoi'),
  summaryTargetBuyback: document.getElementById('summaryTargetBuyback'),
  profitPerLot: document.getElementById('profitPerLot'),
  feePerLot: document.getElementById('feePerLot'),
  netProfitPerLot: document.getElementById('netProfitPerLot'),
  capitalEfficiency: document.getElementById('capitalEfficiency'),
  premiumDecayCaptured: document.getElementById('premiumDecayCaptured'),
};

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function parseValue(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const absolute = Math.abs(value);
  const digits = absolute >= 1000 ? 2 : 6;
  return formatter.format(Number(value.toFixed(digits)));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return `${percentFormatter.format(value)}%`;
}

function formatPlain(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Number(value.toFixed(digits)).toString();
}

function getLotQuantity(lots) {
  return lots * CONFIG.lotSizeBtc;
}

function getFeeBreakdown(price, lots, btcPrice) {
  // The fee model is fixed: standard fee vs premium cap, then GST is added.
  const lotQuantity = getLotQuantity(lots);
  const notionalValue = lotQuantity * btcPrice;
  const standardTradingFee = notionalValue * CONFIG.makerFeeRate;
  const premiumCapFee = CONFIG.premiumCapRate * lotQuantity * price;
  const effectiveFee = Math.min(standardTradingFee, premiumCapFee);
  const feeBeforeGst = effectiveFee;
  const finalFee = feeBeforeGst * (1 + CONFIG.gstRate);

  return {
    notionalValue,
    standardTradingFee,
    premiumCapFee,
    effectiveFee,
    finalFee,
    capThresholdPrice: (btcPrice * CONFIG.makerFeeRate) / CONFIG.premiumCapRate,
  };
}

function calculateTrade(sellingPrice, buyingPrice, lots, leverage, btcPrice) {
  const lotQuantity = getLotQuantity(lots);
  const entry = getFeeBreakdown(sellingPrice, lots, btcPrice);
  const exit = buyingPrice == null ? null : getFeeBreakdown(buyingPrice, lots, btcPrice);

  const grossProfit = buyingPrice == null ? null : (sellingPrice - buyingPrice) * lotQuantity;
  const entryFee = entry.finalFee;
  const exitFee = exit ? exit.finalFee : null;
  const totalCharges = exitFee == null ? null : entryFee + exitFee;
  const netProfit = grossProfit == null || totalCharges == null ? null : grossProfit - totalCharges;
  const marginUsed = entry.notionalValue / leverage;
  const roiPercent = netProfit == null ? null : (netProfit / marginUsed) * 100;

  return {
    grossProfit,
    entryFee,
    exitFee,
    totalCharges,
    netProfit,
    marginUsed,
    roiPercent,
    entry,
    exit,
    lotQuantity,
  };
}

function netProfitForExitPrice(exitPrice, sellingPrice, lots, leverage, btcPrice) {
  const summary = calculateTrade(sellingPrice, exitPrice, lots, leverage, btcPrice);
  return summary.netProfit;
}

function solveTargetBuybackPrice(sellingPrice, lots, leverage, btcPrice, targetRoi = CONFIG.defaultTargetRoi) {
  const lotQuantity = getLotQuantity(lots);
  const entry = getFeeBreakdown(sellingPrice, lots, btcPrice);
  const targetNetProfit = (entry.notionalValue / leverage) * targetRoi;
  const entryFee = entry.finalFee;
  const threshold = entry.capThresholdPrice;

  const solveRegionOne = () => {
    // When the exit premium stays below the cap threshold, the exit fee is linear.
    const numerator = lotQuantity * sellingPrice - entryFee - targetNetProfit;
    const denominator = lotQuantity * (1 + CONFIG.premiumCapRate * (1 + CONFIG.gstRate));
    return numerator / denominator;
  };

  const solveRegionTwo = () => {
    // Above the cap threshold, the exit fee becomes a flat standard-fee amount.
    const exitStandardFeeAfterGst = lotQuantity * btcPrice * CONFIG.makerFeeRate * (1 + CONFIG.gstRate);
    const numerator = lotQuantity * sellingPrice - entryFee - targetNetProfit - exitStandardFeeAfterGst;
    return numerator / lotQuantity;
  };

  const regionOnePrice = solveRegionOne();
  if (Number.isFinite(regionOnePrice) && regionOnePrice >= 0 && regionOnePrice <= threshold) {
    return regionOnePrice;
  }

  const regionTwoPrice = solveRegionTwo();
  if (Number.isFinite(regionTwoPrice) && regionTwoPrice > threshold) {
    return regionTwoPrice;
  }

  const maxNetProfit = netProfitForExitPrice(0, sellingPrice, lots, leverage, btcPrice);
  if (maxNetProfit == null || maxNetProfit < targetNetProfit) {
    return null;
  }

  let low = 0;
  let high = Math.max(sellingPrice, threshold * 2, 1);
  let guard = 0;

  while (guard < 60) {
    const value = netProfitForExitPrice(high, sellingPrice, lots, leverage, btcPrice);
    if (value == null || value <= targetNetProfit) {
      break;
    }
    high *= 2;
    guard += 1;
  }

  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    const net = netProfitForExitPrice(mid, sellingPrice, lots, leverage, btcPrice);

    if (net == null) {
      return null;
    }

    if (net > targetNetProfit) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

function setValue(element, value, options = {}) {
  if (!element) {
    return;
  }

  element.textContent = value;
  element.classList.remove('positive', 'negative', 'neutral');

  if (options.state === 'positive') {
    element.classList.add('positive');
  }

  if (options.state === 'negative') {
    element.classList.add('negative');
  }

  if (options.state === 'neutral') {
    element.classList.add('neutral');
  }
}

function getTargetLabel(targetRoi) {
  return `NET ${percentFormatter.format(targetRoi * 100)}%`;
}

function setActiveTargetButton(targetRoi) {
  const targetPercent = Math.round(targetRoi * 100);

  elements.targetButtons.forEach((button) => {
    const isActive = Number(button.dataset.targetRoi) === targetPercent;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  if (elements.targetBuybackLabel) {
    elements.targetBuybackLabel.textContent = `Exact Buyback Price for ${getTargetLabel(targetRoi)}`;
  }
}

function getTradeState() {
  const btcPrice = parseValue(elements.btcPrice.value);
  const sellingPrice = parseValue(elements.sellingPrice.value);
  const buyingPrice = parseValue(elements.buyingPrice.value);
  const lots = parseValue(elements.lots.value);
  const leverage = parseValue(elements.leverage.value);

  const validInputs = btcPrice != null && btcPrice > 0 && sellingPrice != null && sellingPrice > 0 && lots != null && lots > 0 && leverage != null && leverage > 0;

  return {
    btcPrice,
    sellingPrice,
    buyingPrice,
    lots,
    leverage,
    validInputs,
  };
}

function getTradeSummary(stateSnapshot, summary, targetBuyback) {
  const capitalUsed = summary?.marginUsed;
  return {
    capitalUsed,
    grossProfit: summary?.grossProfit,
    totalCharges: summary?.totalCharges,
    netProfit: summary?.netProfit,
    netRoi: summary?.roiPercent,
    targetBuyback,
    profitPerLot: summary?.grossProfit == null ? null : summary.grossProfit / stateSnapshot.lots,
    feePerLot: summary?.totalCharges == null ? null : summary.totalCharges / stateSnapshot.lots,
    netProfitPerLot: summary?.netProfit == null ? null : summary.netProfit / stateSnapshot.lots,
    capitalEfficiency: summary?.netProfit == null || !capitalUsed ? null : (summary.netProfit / capitalUsed) * 100,
    premiumDecayCaptured: summary?.grossProfit == null ? null : (summary.grossProfit / summary.entry.notionalValue) * 100,
  };
}

function buildEntryExitFormula(price, breakdown) {
  return [
    `Entry notional = ${formatMoney(breakdown.notionalValue)}`,
    `Standard fee = ${formatMoney(breakdown.standardTradingFee)}`,
    `Premium cap fee = ${formatMoney(breakdown.premiumCapFee)}`,
    `Effective fee = MIN(Standard Fee, Premium Cap Fee) = ${formatMoney(breakdown.effectiveFee)}`,
    `Final fee = Effective fee × (1 + GST) = ${formatMoney(breakdown.finalFee)}`,
  ].join(' | ');
}

function formatTradeJournal(trade, stateSnapshot, summary, targetBuyback) {
  return [
    'BTC Price:',
    `${formatMoney(stateSnapshot.btcPrice)}`,
    'Selling Price:',
    `${formatMoney(stateSnapshot.sellingPrice)}`,
    'Buyback Price:',
    stateSnapshot.buyingPrice == null ? 'Enter buyback price' : formatMoney(stateSnapshot.buyingPrice),
    'Lots:',
    `${stateSnapshot.lots}`,
    'Leverage:',
    `${stateSnapshot.leverage}x`,
    '',
    'Gross Profit:',
    summary.grossProfit == null ? 'Enter buyback price' : formatMoney(summary.grossProfit),
    'Total Charges:',
    summary.totalCharges == null ? 'Enter buyback price' : formatMoney(summary.totalCharges),
    'Net Profit:',
    summary.netProfit == null ? 'Enter buyback price' : formatMoney(summary.netProfit),
    'ROI:',
    summary.roiPercent == null ? 'Enter buyback price' : formatPercent(summary.roiPercent),
    '',
    `Target Net ROI: ${getTargetLabel(state.targetRoi)}`,
    `Target Buyback: ${targetBuyback == null ? 'Not achievable' : formatMoney(targetBuyback)}`,
    '',
    'Generated by BTC Option Selling Net Profit Calculator',
  ].join('\n');
}

function buildCsvRows(stateSnapshot, summary, targetBuyback, tradeSummary) {
  return [
    ['Metric', 'Value'],
    ['BTC Price', formatMoney(stateSnapshot.btcPrice)],
    ['Selling Price', formatMoney(stateSnapshot.sellingPrice)],
    ['Buyback Price', stateSnapshot.buyingPrice == null ? 'Enter buyback price' : formatMoney(stateSnapshot.buyingPrice)],
    ['Lots', String(stateSnapshot.lots)],
    ['Leverage', `${stateSnapshot.leverage}x`],
    ['Capital Used', formatMoney(tradeSummary.capitalUsed)],
    ['Gross Profit', summary.grossProfit == null ? 'Enter buyback price' : formatMoney(summary.grossProfit)],
    ['Entry Fee', formatMoney(summary.entryFee)],
    ['Exit Fee', summary.exitFee == null ? 'Enter buyback price' : formatMoney(summary.exitFee)],
    ['Total Charges', summary.totalCharges == null ? 'Enter buyback price' : formatMoney(summary.totalCharges)],
    ['Net Profit', summary.netProfit == null ? 'Enter buyback price' : formatMoney(summary.netProfit)],
    ['Net ROI', summary.roiPercent == null ? 'Enter buyback price' : formatPercent(summary.roiPercent)],
    ['Target Net ROI', getTargetLabel(state.targetRoi)],
    ['Target Buyback', targetBuyback == null ? 'Not achievable' : formatMoney(targetBuyback)],
    ['Profit Per Lot', formatMoney(tradeSummary.profitPerLot)],
    ['Fee Per Lot', formatMoney(tradeSummary.feePerLot)],
    ['Net Profit Per Lot', formatMoney(tradeSummary.netProfitPerLot)],
    ['Capital Efficiency', formatPercent(tradeSummary.capitalEfficiency)],
    ['Premium Decay Captured (%)', formatPercent(tradeSummary.premiumDecayCaptured)],
  ]
    .map(([label, value]) => `${label},${String(value).replaceAll('"', '""')}`)
    .join('\n');
}

function buildPdfReport(stateSnapshot, summary, tradeSummary, targetBuyback) {
  const reportTitle = 'BTC Options Profit Analytics Report';
  const rows = [
    ['Capital Used', tradeSummary.capitalUsed],
    ['Gross Profit', summary.grossProfit],
    ['Entry Fee', summary.entryFee],
    ['Exit Fee', summary.exitFee],
    ['Total Charges', summary.totalCharges],
    ['Net Profit', summary.netProfit],
    ['Net ROI', summary.roiPercent == null ? null : formatPercent(summary.roiPercent)],
    ['Target ROI', getTargetLabel(state.targetRoi)],
    ['Target Buyback', targetBuyback == null ? 'Not achievable' : formatMoney(targetBuyback)],
  ];

  const metricCards = rows
    .map(([label, value]) => `<div class="print-card"><span>${label}</span><strong>${value == null ? '--' : value}</strong></div>`)
    .join('');

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
  if (!printWindow) {
    return false;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${reportTitle}</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      color: #102030;
      background: #f4f7fb;
      padding: 32px;
    }
    .sheet {
      max-width: 1100px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #dce4ee;
      border-radius: 20px;
      padding: 28px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 24px;
      border-bottom: 1px solid #e7edf5;
      padding-bottom: 18px;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
      color: #4e6b8a;
    }
    h1 {
      margin: 8px 0 0;
      font-size: 28px;
    }
    .meta {
      color: #567;
      font-size: 13px;
      line-height: 1.7;
      text-align: right;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .print-card {
      border: 1px solid #e4ebf3;
      border-radius: 16px;
      padding: 16px;
      background: linear-gradient(180deg, #fcfdff, #f7fafd);
    }
    .print-card span, .section-label {
      display: block;
      color: #70839b;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    }
    .print-card strong {
      font-size: 20px;
    }
    .section {
      margin-top: 22px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    td {
      border-top: 1px solid #e7edf5;
      padding: 10px 0;
      font-size: 14px;
    }
    td:last-child {
      text-align: right;
      font-weight: 700;
    }
    @media print {
      body { background: white; padding: 0; }
      .sheet { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="eyebrow">Professional BTC Options Profit Analytics Engine</div>
        <h1>${reportTitle}</h1>
        <div class="meta">Generated by BTC Option Selling Net Profit Calculator<br />Designed and developed by MD. Minaj Uddin</div>
      </div>
      <div class="meta">
        BTC Price: ${formatMoney(stateSnapshot.btcPrice)}<br />
        Selling Price: ${formatMoney(stateSnapshot.sellingPrice)}<br />
        Buyback Price: ${stateSnapshot.buyingPrice == null ? 'Enter buyback price' : formatMoney(stateSnapshot.buyingPrice)}<br />
        Lots: ${stateSnapshot.lots}<br />
        Leverage: ${stateSnapshot.leverage}x
      </div>
    </div>

    <div class="grid">${metricCards}</div>

    <div class="section">
      <div class="section-label">Advanced Metrics</div>
      <table>
        <tr><td>Profit Per Lot</td><td>${formatMoney(tradeSummary.profitPerLot)}</td></tr>
        <tr><td>Fee Per Lot</td><td>${formatMoney(tradeSummary.feePerLot)}</td></tr>
        <tr><td>Net Profit Per Lot</td><td>${formatMoney(tradeSummary.netProfitPerLot)}</td></tr>
        <tr><td>Capital Efficiency</td><td>${formatPercent(tradeSummary.capitalEfficiency)}</td></tr>
        <tr><td>Premium Decay Captured (%)</td><td>${formatPercent(tradeSummary.premiumDecayCaptured)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-label">Fee Breakdown</div>
      <table>
        <tr><td>Entry Fee Formula</td><td>${summary.entry ? formatMoney(summary.entry.finalFee) : '--'}</td></tr>
        <tr><td>Exit Fee Formula</td><td>${summary.exit ? formatMoney(summary.exit.finalFee) : 'Enter buyback price'}</td></tr>
        <tr><td>Target Net ROI</td><td>${getTargetLabel(state.targetRoi)}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

function updateResultCardClasses(summary) {
  const targetValue = summary?.netProfit;
  const stateName = targetValue == null ? 'neutral' : Math.abs(targetValue) < 0.0001 ? 'neutral' : targetValue > 0 ? 'positive' : 'negative';
  document.querySelectorAll('.result-card, .trade-summary, .advanced-metrics').forEach((card) => {
    card.classList.remove('positive-card', 'negative-card', 'neutral-card');
    card.classList.add(`${stateName}-card`);
  });
}

function animateLiveCards() {
  document.querySelectorAll('.result-card, .trade-summary, .advanced-metrics').forEach((card) => {
    card.classList.remove('value-updated');
    void card.offsetWidth;
    card.classList.add('value-updated');
  });
}

function updateUi() {
  const stateSnapshot = getTradeState();

  if (!stateSnapshot.validInputs) {
    setValue(elements.grossProfit, '--');
    setValue(elements.entryFee, '--');
    setValue(elements.exitFee, '--');
    setValue(elements.totalCharges, '--');
    setValue(elements.netProfit, '--');
    setValue(elements.marginUsed, '--');
    setValue(elements.roiPercent, '--');
    setValue(elements.targetBuyback, '--');
    setValue(elements.capitalUsed, '--');
    setValue(elements.summaryGrossProfit, '--');
    setValue(elements.summaryTotalCharges, '--');
    setValue(elements.summaryNetProfit, '--');
    setValue(elements.summaryNetRoi, '--');
    setValue(elements.summaryTargetBuyback, '--');
    setValue(elements.profitPerLot, '--');
    setValue(elements.feePerLot, '--');
    setValue(elements.netProfitPerLot, '--');
    setValue(elements.capitalEfficiency, '--');
    setValue(elements.premiumDecayCaptured, '--');
    elements.entryLogic.textContent = '--';
    elements.exitLogic.textContent = '--';
    elements.statusMessage.textContent = 'Enter BTC price, selling price, lots, and leverage to calculate live results.';
    elements.roiBadge.textContent = 'Ready';
    elements.roiBadge.className = 'pill pill-positive';
    setActiveTargetButton(state.targetRoi);
    updateResultCardClasses(null);
    return;
  }

  const summary = calculateTrade(stateSnapshot.sellingPrice, stateSnapshot.buyingPrice, stateSnapshot.lots, stateSnapshot.leverage, stateSnapshot.btcPrice);
  const targetBuyback = solveTargetBuybackPrice(
    stateSnapshot.sellingPrice,
    stateSnapshot.lots,
    stateSnapshot.leverage,
    stateSnapshot.btcPrice,
    state.targetRoi,
  );
  const tradeSummary = getTradeSummary(stateSnapshot, summary, targetBuyback);

  setValue(elements.grossProfit, summary.grossProfit == null ? 'Enter buyback price' : formatMoney(summary.grossProfit), {
    state: summary.grossProfit > 0 ? 'positive' : summary.grossProfit < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.entryFee, formatMoney(summary.entryFee), { state: 'negative' });
  setValue(elements.exitFee, summary.exitFee == null ? 'Enter buyback price' : formatMoney(summary.exitFee), {
    state: summary.exitFee == null ? 'neutral' : 'negative',
  });
  setValue(elements.totalCharges, summary.totalCharges == null ? 'Enter buyback price' : formatMoney(summary.totalCharges), {
    state: summary.totalCharges == null ? 'neutral' : 'negative',
  });
  setValue(elements.netProfit, summary.netProfit == null ? 'Enter buyback price' : formatMoney(summary.netProfit), {
    state: summary.netProfit > 0 ? 'positive' : summary.netProfit < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.marginUsed, formatMoney(summary.marginUsed));
  setValue(elements.roiPercent, summary.roiPercent == null ? 'Enter buyback price' : formatPercent(summary.roiPercent), {
    state: summary.roiPercent > 0 ? 'positive' : summary.roiPercent < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.targetBuyback, targetBuyback == null ? 'Not achievable' : formatMoney(targetBuyback), {
    state: targetBuyback == null ? 'neutral' : 'positive',
  });

  setValue(elements.capitalUsed, formatMoney(tradeSummary.capitalUsed));
  setValue(elements.summaryGrossProfit, summary.grossProfit == null ? 'Enter buyback price' : formatMoney(summary.grossProfit));
  setValue(elements.summaryTotalCharges, summary.totalCharges == null ? 'Enter buyback price' : formatMoney(summary.totalCharges));
  setValue(elements.summaryNetProfit, summary.netProfit == null ? 'Enter buyback price' : formatMoney(summary.netProfit), {
    state: summary.netProfit > 0 ? 'positive' : summary.netProfit < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.summaryNetRoi, summary.roiPercent == null ? 'Enter buyback price' : formatPercent(summary.roiPercent), {
    state: summary.roiPercent > 0 ? 'positive' : summary.roiPercent < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.summaryTargetBuyback, targetBuyback == null ? 'Not achievable' : formatMoney(targetBuyback));
  setValue(elements.profitPerLot, formatMoney(tradeSummary.profitPerLot));
  setValue(elements.feePerLot, formatMoney(tradeSummary.feePerLot));
  setValue(elements.netProfitPerLot, formatMoney(tradeSummary.netProfitPerLot));
  setValue(elements.capitalEfficiency, formatPercent(tradeSummary.capitalEfficiency), {
    state: tradeSummary.capitalEfficiency > 0 ? 'positive' : tradeSummary.capitalEfficiency < 0 ? 'negative' : 'neutral',
  });
  setValue(elements.premiumDecayCaptured, formatPercent(tradeSummary.premiumDecayCaptured));

  elements.entryLogic.textContent = `Entry Fee = MIN(Standard Fee, Premium Cap Fee) + GST | BTC price = ${formatMoney(stateSnapshot.btcPrice)} | Notional = ${formatMoney(summary.entry.notionalValue)} | Standard fee = ${formatMoney(summary.entry.standardTradingFee)} | Premium cap fee = ${formatMoney(summary.entry.premiumCapFee)} | Final fee after GST = ${formatMoney(summary.entry.finalFee)}`;

  if (stateSnapshot.buyingPrice == null) {
    elements.exitLogic.textContent = 'Exit Fee = MIN(Standard Fee, Premium Cap Fee) + GST | Buyback price is optional. Enter a buyback price to see the exit fee, total charges, net profit, and ROI.';
    elements.statusMessage.textContent = `Target buyback solved from the live Delta fee model for ${getTargetLabel(state.targetRoi)}.`;
    elements.roiBadge.textContent = targetBuyback == null ? 'Target unavailable' : 'Target ready';
    elements.roiBadge.className = targetBuyback == null ? 'pill' : 'pill pill-positive';
    setActiveTargetButton(state.targetRoi);
    updateResultCardClasses(summary);
    return;
  }

  elements.exitLogic.textContent = `Exit Fee = MIN(Standard Fee, Premium Cap Fee) + GST | BTC price = ${formatMoney(stateSnapshot.btcPrice)} | Notional = ${formatMoney(summary.exit.notionalValue)} | Standard fee = ${formatMoney(summary.exit.standardTradingFee)} | Premium cap fee = ${formatMoney(summary.exit.premiumCapFee)} | Final fee after GST = ${formatMoney(summary.exit.finalFee)}`;
  elements.statusMessage.textContent = 'Live trade results updated from your current inputs.';

  const positive = summary.netProfit != null && summary.netProfit > 0;
  const negative = summary.netProfit != null && summary.netProfit < 0;
  const neutral = summary.netProfit != null && Math.abs(summary.netProfit) < 0.0001;
  elements.roiBadge.textContent = positive ? 'Profit' : negative ? 'Loss' : 'Breakeven';
  elements.roiBadge.className = positive ? 'pill pill-positive' : neutral ? 'pill pill-neutral' : 'pill pill-negative';
  setActiveTargetButton(state.targetRoi);
  updateResultCardClasses(summary);

  if (!state.hydrated) {
    state.hydrated = true;
    document.body.classList.add('hydrated');
  }

  animateLiveCards();
}

async function copyText(text, successMessage, errorMessage) {
  try {
    await navigator.clipboard.writeText(text);
    elements.statusMessage.textContent = successMessage;
  } catch (error) {
    elements.statusMessage.textContent = errorMessage;
  }
}

function buildCurrentPayload() {
  const stateSnapshot = getTradeState();

  if (!stateSnapshot.validInputs) {
    return {
      stateSnapshot,
      summary: {
        grossProfit: null,
        entryFee: null,
        exitFee: null,
        totalCharges: null,
        netProfit: null,
        marginUsed: null,
        roiPercent: null,
        entry: {
          notionalValue: null,
          standardTradingFee: null,
          premiumCapFee: null,
          effectiveFee: null,
          finalFee: null,
        },
        exit: null,
      },
      targetBuyback: null,
      tradeSummary: {
        capitalUsed: null,
        grossProfit: null,
        totalCharges: null,
        netProfit: null,
        netRoi: null,
        targetBuyback: null,
        profitPerLot: null,
        feePerLot: null,
        netProfitPerLot: null,
        capitalEfficiency: null,
        premiumDecayCaptured: null,
      },
    };
  }

  const summary = calculateTrade(stateSnapshot.sellingPrice, stateSnapshot.buyingPrice, stateSnapshot.lots, stateSnapshot.leverage, stateSnapshot.btcPrice);
  const targetBuyback = solveTargetBuybackPrice(
    stateSnapshot.sellingPrice,
    stateSnapshot.lots,
    stateSnapshot.leverage,
    stateSnapshot.btcPrice,
    state.targetRoi,
  );
  const tradeSummary = getTradeSummary(stateSnapshot, summary, targetBuyback);

  return {
    stateSnapshot,
    summary,
    targetBuyback,
    tradeSummary,
  };
}

async function copyResults() {
  const payload = buildCurrentPayload();
  const lines = [
    'BTC Option Selling Net Profit Calculator',
    `Gross Profit: ${payload.summary.grossProfit == null ? 'Enter buyback price' : formatMoney(payload.summary.grossProfit)}`,
    `Entry Fee: ${formatMoney(payload.summary.entryFee)}`,
    `Exit Fee: ${payload.summary.exitFee == null ? 'Enter buyback price' : formatMoney(payload.summary.exitFee)}`,
    `Total Charges: ${payload.summary.totalCharges == null ? 'Enter buyback price' : formatMoney(payload.summary.totalCharges)}`,
    `Net Profit: ${payload.summary.netProfit == null ? 'Enter buyback price' : formatMoney(payload.summary.netProfit)}`,
    `Margin Used: ${formatMoney(payload.summary.marginUsed)}`,
    `ROI (Net): ${payload.summary.roiPercent == null ? 'Enter buyback price' : formatPercent(payload.summary.roiPercent)}`,
    `Exact Buyback Price for ${getTargetLabel(state.targetRoi)}: ${payload.targetBuyback == null ? 'Not achievable' : formatMoney(payload.targetBuyback)}`,
  ];

  await copyText(lines.join('\n'), 'Results copied to clipboard.', 'Copy failed. Your browser may block clipboard access.');
}

async function copyTradeJournal() {
  const payload = buildCurrentPayload();
  const journal = formatTradeJournal(payload.tradeSummary, payload.stateSnapshot, payload.summary, payload.targetBuyback);
  await copyText(journal, 'Trade journal copied to clipboard.', 'Copy failed. Your browser may block clipboard access.');
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const payload = buildCurrentPayload();
  const csv = buildCsvRows(payload.stateSnapshot, payload.summary, payload.targetBuyback, payload.tradeSummary);
  downloadBlob('btc-option-profit-report.csv', csv, 'text/csv;charset=utf-8;');
  elements.statusMessage.textContent = 'CSV export downloaded.';
}

function exportPdf() {
  const payload = buildCurrentPayload();
  const success = buildPdfReport(payload.stateSnapshot, payload.summary, payload.tradeSummary, payload.targetBuyback);
  elements.statusMessage.textContent = success ? 'PDF report opened in a print window.' : 'PDF export failed. Please allow pop-ups for this site.';
}

function resetCalculator() {
  elements.form.reset();
  elements.btcPrice.value = '100000';
  state.targetRoi = CONFIG.defaultTargetRoi;
  setActiveTargetButton(state.targetRoi);
  updateUi();
}

elements.form.addEventListener('input', updateUi);
elements.resetBtn.addEventListener('click', resetCalculator);
elements.copyBtn.addEventListener('click', copyResults);
elements.copyJournalBtn.addEventListener('click', copyTradeJournal);
elements.copyJournalBtnSecondary.addEventListener('click', copyTradeJournal);
elements.exportCsvBtn.addEventListener('click', exportCsv);
elements.exportPdfBtn.addEventListener('click', exportPdf);

elements.targetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.targetRoi = Number(button.dataset.targetRoi) / 100;
    setActiveTargetButton(state.targetRoi);
    updateUi();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.altKey && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    copyTradeJournal();
  }

  if (event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    exportPdf();
  }

  if (event.altKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    exportCsv();
  }

  if (event.key === 'Escape') {
    resetCalculator();
  }
});

requestAnimationFrame(() => {
  document.body.classList.add('app-ready');
});

setActiveTargetButton(state.targetRoi);
updateUi();