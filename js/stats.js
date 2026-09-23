const CHARACTERISTICS = [
  { key: "current", label: "전류", unit: "A", lsl: "currentLsl", usl: "currentUsl", decimals: 2 },
  { key: "power", label: "전력", unit: "W", lsl: "powerLsl", usl: "powerUsl", decimals: 2 },
  { key: "flow", label: "유량", unit: "ml/min", lsl: "flowLsl", usl: "flowUsl", decimals: 1 },
];

function toYyyymmdd(year, month, day) {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function formatDateDisplay(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYyyymmdd(value) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    day: Number(value.slice(6, 8)),
  };
}

function formatNumber(value, decimals) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(decimals);
}

function formatDefectRate(rate, decimals = 4) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return "-";
  return `${Number(rate).toFixed(decimals)}%`;
}

function isInSpec(value, lsl, usl) {
  return value >= lsl && value <= usl;
}

function judgeSample(sample, spec) {
  const currentOk = isInSpec(sample.current, spec.currentLsl, spec.currentUsl);
  const powerOk = isInSpec(sample.power, spec.powerLsl, spec.powerUsl);
  const flowOk = isInSpec(sample.flow, spec.flowLsl, spec.flowUsl);
  return {
    ...sample,
    currentOk,
    powerOk,
    flowOk,
    result: currentOk && powerOk && flowOk ? "OK" : "NG",
  };
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdev(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function processCapability(values, lsl, usl, minSamples = 5) {
  const avg = mean(values);
  const sigma = sampleStdev(values);
  if (values.length < minSamples || sigma === null || sigma === 0 || avg === null) {
    return { mean: avg, stdev: sigma, cp: null, cpk: null };
  }
  const cp = (usl - lsl) / (6 * sigma);
  const cpk = Math.min((usl - avg) / (3 * sigma), (avg - lsl) / (3 * sigma));
  return { mean: avg, stdev: sigma, cp, cpk };
}

function characteristicStats(samples, spec, minSamples = 5) {
  return CHARACTERISTICS.map((item) => {
    const values = samples.map((sample) => sample[item.key]);
    const ng = samples.filter((sample) => sample[`${item.key}Ok`] === false).length;
    const capability = processCapability(values, spec[item.lsl], spec[item.usl], minSamples);
    return {
      ...item,
      lsl: spec[item.lsl],
      usl: spec[item.usl],
      values,
      ng,
      defectRate: samples.length ? (ng / samples.length) * 100 : 0,
      ...capability,
    };
  });
}

function buildHistogram(values, lsl, usl, binCount = 8) {
  if (!values.length) {
    return { bins: [], min: lsl, max: usl };
  }

  const dataMin = Math.min(...values, lsl);
  const dataMax = Math.max(...values, usl);
  const padding = (dataMax - dataMin) * 0.08 || 1;
  const min = dataMin - padding;
  const max = dataMax + padding;
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: min + index * width,
    to: min + (index + 1) * width,
    count: 0,
  }));

  values.forEach((value) => {
    const rawIndex = Math.floor((value - min) / width);
    const index = Math.min(Math.max(rawIndex, 0), binCount - 1);
    bins[index].count += 1;
  });

  return { bins, min, max };
}

function drawHistogram(canvas, values, lsl, usl, avg, cssWidth, cssHeight) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = 2;
  cssWidth = cssWidth || canvas.clientWidth || 560;
  cssHeight = cssHeight || canvas.clientHeight || 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { top: 18, right: 16, bottom: 32, left: 36 };
  const width = cssWidth - pad.left - pad.right;
  const height = cssHeight - pad.top - pad.bottom;
  const { bins, min, max } = buildHistogram(values, lsl, usl);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + height);
  ctx.lineTo(pad.left + width, pad.top + height);
  ctx.stroke();

  const barGap = 3;
  const barWidth = Math.max(4, width / bins.length - barGap);

  bins.forEach((bin, index) => {
    const x = pad.left + index * (width / bins.length) + barGap / 2;
    const barHeight = (bin.count / maxCount) * (height - 4);
    const y = pad.top + height - barHeight;
    const mid = (bin.from + bin.to) / 2;
    const inSpec = mid >= lsl && mid <= usl;
    ctx.fillStyle = inSpec ? "#0f766e" : "#dc2626";
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.globalAlpha = 1;
  });

  const xOf = (value) => pad.left + ((value - min) / (max - min)) * width;

  function drawLimit(value, color, label) {
    const x = xOf(value);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "11px 'Pretendard', 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, pad.top - 4);
  }

  drawLimit(lsl, "#b45309", "LSL");
  drawLimit(usl, "#b45309", "USL");

  if (avg !== null && avg !== undefined) {
    drawLimit(avg, "#2563eb", "AVG");
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Pretendard', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(min.toFixed(2), pad.left, pad.top + height + 18);
  ctx.textAlign = "right";
  ctx.fillText(max.toFixed(2), pad.left + width, pad.top + height + 18);
}

function summarizeInspection(samples) {
  const total = samples.length;
  const ng = samples.filter((sample) => sample.result === "NG").length;
  return {
    total,
    ng,
    ok: total - ng,
    defectRate: total ? (ng / total) * 100 : 0,
  };
}
