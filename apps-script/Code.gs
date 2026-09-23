const SPEC_SHEET = "pump_spec";
const SPEC_HEADERS = [
  "모델명",
  "전류 하한",
  "전류 상한",
  "전력 하한",
  "전력 상한",
  "유량 하한",
  "유량 상한",
  "사용여부",
  "수정일",
];

function getSpreadsheet() {
  return SpreadsheetApp.getActive();
}

function getOrCreateSheet_(name) {
  const ss = getSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function findSpecSheet_() {
  const ss = getSpreadsheet();
  const named = ss.getSheetByName(SPEC_SHEET);
  if (named && named.getLastRow() >= 2) return named;

  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const firstCell = String(sheets[i].getRange(1, 1).getValue() || "").trim();
    if (firstCell === "모델명" && sheets[i].getLastRow() >= 2) {
      return sheets[i];
    }
  }
  return named || ss.getSheets()[0];
}

function getPumpSpecs(includeInactive) {
  const sheet = findSpecSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const specs = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const modelName = String(row[0] || "").trim();
    if (!modelName) continue;

    const spec = {
      id: "spec-" + modelName,
      modelName: modelName,
      currentLsl: Number(row[1]),
      currentUsl: Number(row[2]),
      powerLsl: Number(row[3]),
      powerUsl: Number(row[4]),
      flowLsl: Number(row[5]),
      flowUsl: Number(row[6]),
      active: String(row[7] || "사용").trim() !== "미사용",
      updatedAt: row[8] ? String(row[8]) : "",
    };

    if (includeInactive || spec.active) specs.push(spec);
  }
  return specs;
}

function getPumpModels() {
  return getPumpSpecs(false).map(function (item) {
    return item.modelName;
  });
}

function getPumpSpec(modelName) {
  const specs = getPumpSpecs(true);
  for (let i = 0; i < specs.length; i++) {
    if (specs[i].modelName === modelName) return specs[i];
  }
  return null;
}

function makeSheetName(modelName, yyyymmdd) {
  return modelName + "_" + yyyymmdd;
}

function getLastSampleNo_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 11) return 0;
  const values = sheet.getRange(11, 1, lastRow - 10, 1).getValues();
  let maxNo = 0;
  for (let i = 0; i < values.length; i++) {
    const number = Number(values[i][0]);
    if (!isNaN(number) && number > maxNo) maxNo = number;
  }
  return maxNo;
}

function saveInspectionData(payload) {
  const sheetName = makeSheetName(payload.modelName, payload.date);
  const sheet = getOrCreateSheet_(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 8, 2).setValues([
      ["모델명", payload.modelName],
      ["검사일", payload.dateDisplay || payload.date],
      ["전류 하한", payload.spec.currentLsl],
      ["전류 상한", payload.spec.currentUsl],
      ["전력 하한", payload.spec.powerLsl],
      ["전력 상한", payload.spec.powerUsl],
      ["유량 하한", payload.spec.flowLsl],
      ["유량 상한", payload.spec.flowUsl],
    ]);
    sheet.getRange(10, 1, 1, 5).setValues([["시료번호", "전류치", "전력치", "유량", "판정"]]);
  }

  const lastNo = getLastSampleNo_(sheet);
  const startRow = Math.max(sheet.getLastRow() + 1, 11);
  const rows = payload.samples.map(function (sample, index) {
    return [
      lastNo + index + 1,
      sample.current,
      sample.power,
      sample.flow,
      sample.result,
    ];
  });
  sheet.getRange(startRow, 1, rows.length, 5).setValues(rows);

  return {
    sheetName: sheetName,
    savedCount: rows.length,
    startNo: lastNo + 1,
  };
}

function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("펌프 공정품질현황 관리")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppBootstrap() {
  return {
    specs: getPumpSpecs(true),
    inspections: listInspections(),
  };
}

function listInspections() {
  const ss = getSpreadsheet();
  const specSheet = findSpecSheet_();
  const result = [];
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet.getName() === specSheet.getName()) continue;
    if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "모델명") continue;
    result.push(parseInspectionSheet_(sheet));
  }
  return result;
}

function parseInspectionSheet_(sheet) {
  const modelName = String(sheet.getRange(1, 2).getValue() || "");
  const dateDisplay = String(sheet.getRange(2, 2).getValue() || "");
  const spec = {
    modelName: modelName,
    currentLsl: Number(sheet.getRange(3, 2).getValue()),
    currentUsl: Number(sheet.getRange(4, 2).getValue()),
    powerLsl: Number(sheet.getRange(5, 2).getValue()),
    powerUsl: Number(sheet.getRange(6, 2).getValue()),
    flowLsl: Number(sheet.getRange(7, 2).getValue()),
    flowUsl: Number(sheet.getRange(8, 2).getValue()),
  };

  const lastRow = sheet.getLastRow();
  const samples = [];
  if (lastRow >= 11) {
    const rows = sheet.getRange(11, 1, lastRow - 10, 5).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === "" && rows[i][1] === "") continue;
      const current = Number(rows[i][1]);
      const power = Number(rows[i][2]);
      const flow = Number(rows[i][3]);
      const currentOk = current >= spec.currentLsl && current <= spec.currentUsl;
      const powerOk = power >= spec.powerLsl && power <= spec.powerUsl;
      const flowOk = flow >= spec.flowLsl && flow <= spec.flowUsl;
      const result = String(rows[i][4] || "") || (currentOk && powerOk && flowOk ? "OK" : "NG");
      samples.push({
        no: Number(rows[i][0]) || i + 1,
        current: current,
        power: power,
        flow: flow,
        result: result,
        currentOk: currentOk,
        powerOk: powerOk,
        flowOk: flowOk,
      });
    }
  }

  const ng = samples.filter(function (sample) { return sample.result === "NG"; }).length;
  const sheetName = sheet.getName();
  const dateMatch = sheetName.match(/_(\d{8})$/);
  return {
    id: sheetName,
    sheetName: sheetName,
    modelName: modelName,
    date: dateMatch ? dateMatch[1] : "",
    dateDisplay: dateDisplay,
    spec: spec,
    samples: samples,
    summary: {
      total: samples.length,
      ng: ng,
      ok: samples.length - ng,
      defectRate: samples.length ? (ng / samples.length) * 100 : 0,
    },
  };
}

function upsertPumpSpec(payload) {
  const sheet = findSpecSheet_();
  const values = sheet.getDataRange().getValues();
  const name = String(payload.modelName || "").trim();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === name) {
      rowIndex = i + 1;
      break;
    }
  }

  const row = [
    name,
    Number(payload.currentLsl),
    Number(payload.currentUsl),
    Number(payload.powerLsl),
    Number(payload.powerUsl),
    Number(payload.flowLsl),
    Number(payload.flowUsl),
    payload.active === false ? "미사용" : "사용",
    now,
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 9).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return getPumpSpecs(true);
}

function setPumpSpecActive(payload) {
  const current = getPumpSpec(payload.modelName);
  if (!current) throw new Error("모델을 찾을 수 없습니다.");
  return upsertPumpSpec({
    modelName: payload.modelName,
    currentLsl: current.currentLsl,
    currentUsl: current.currentUsl,
    powerLsl: current.powerLsl,
    powerUsl: current.powerUsl,
    flowLsl: current.flowLsl,
    flowUsl: current.flowUsl,
    active: payload.active,
  });
}

function getInspectionBySheetName_(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("검사결과를 찾을 수 없습니다.");
  return parseInspectionSheet_(sheet);
}

function formatNum_(value, decimals) {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return Number(value).toFixed(decimals);
}

function formatRate_(rate) {
  if (rate === null || rate === undefined || isNaN(rate)) return "-";
  return Number(rate).toFixed(4) + "%";
}

function mean_(values) {
  if (!values.length) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function sampleStdev_(values) {
  if (values.length < 2) return null;
  const avg = mean_(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - avg;
    sum += diff * diff;
  }
  return Math.sqrt(sum / (values.length - 1));
}

function processCapability_(values, lsl, usl, minSamples) {
  const avg = mean_(values);
  const sigma = sampleStdev_(values);
  if (values.length < minSamples || sigma === null || sigma === 0 || avg === null) {
    return { mean: avg, stdev: sigma, cp: null, cpk: null };
  }
  return {
    mean: avg,
    stdev: sigma,
    cp: (usl - lsl) / (6 * sigma),
    cpk: Math.min((usl - avg) / (3 * sigma), (avg - lsl) / (3 * sigma)),
  };
}

function characteristicStats_(inspection) {
  const spec = inspection.spec;
  const samples = inspection.samples;
  const defs = [
    { key: "current", label: "전류", unit: "A", lsl: spec.currentLsl, usl: spec.currentUsl, decimals: 2 },
    { key: "power", label: "전력", unit: "W", lsl: spec.powerLsl, usl: spec.powerUsl, decimals: 2 },
    { key: "flow", label: "유량", unit: "ml/min", lsl: spec.flowLsl, usl: spec.flowUsl, decimals: 1 },
  ];
  return defs.map(function (item) {
    const values = samples.map(function (sample) { return Number(sample[item.key]); });
    const ng = values.filter(function (value) {
      return value < item.lsl || value > item.usl;
    }).length;
    return Object.assign({}, item, processCapability_(values, item.lsl, item.usl, 5), {
      values: values,
      ng: ng,
      defectRate: samples.length ? (ng / samples.length) * 100 : 0,
    });
  });
}

function buildHistogram_(values, lsl, usl, binCount) {
  if (!values.length) return { bins: [] };
  const dataMin = Math.min.apply(null, values.concat([lsl]));
  const dataMax = Math.max.apply(null, values.concat([usl]));
  const padding = (dataMax - dataMin) * 0.08 || 1;
  const min = dataMin - padding;
  const max = dataMax + padding;
  const width = (max - min) / binCount;
  const bins = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({ from: min + i * width, to: min + (i + 1) * width, count: 0 });
  }
  for (let i = 0; i < values.length; i++) {
    let index = Math.floor((values[i] - min) / width);
    if (index < 0) index = 0;
    if (index > binCount - 1) index = binCount - 1;
    bins[index].count += 1;
  }
  return { bins: bins };
}

function barText_(count, maxCount) {
  if (!count) return "";
  const width = Math.max(1, Math.round((count / Math.max(maxCount, 1)) * 16));
  let bar = "";
  for (let i = 0; i < width; i++) bar += "■";
  return bar;
}

function capText_(value, decimals) {
  return value === null || value === undefined ? "N/A" : formatNum_(value, decimals);
}

function styleHeaderRow_(range) {
  range
    .setFontWeight("bold")
    .setBackground("#12324d")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center");
}

function insertHistogram_(sheet, row, item, imageBase64) {
  if (imageBase64) {
    const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const blob = Utilities.newBlob(Utilities.base64Decode(raw), "image/jpeg", item.key + ".jpg");
    const image = sheet.insertImage(blob, 1, row);
    image.setWidth(520);
    image.setHeight(180);
    return row + 12;
  }

  const values = item.values.map(function (value) { return [Number(value)]; });
  if (!values.length) return row;
  sheet.getRange(row, 10, values.length, 1).setValues(values);
  let builder = sheet.newChart()
    .addRange(sheet.getRange(row, 10, values.length, 1))
    .setPosition(row, 1, 0, 0)
    .setOption("legend", { position: "none" })
    .setOption("title", item.label + " Histogram")
    .setOption("colors", ["#0f766e"])
    .setOption("width", 520)
    .setOption("height", 200)
    .setNumHeaders(0);
  if (Charts.ChartType.HISTOGRAM) {
    builder = builder.setChartType(Charts.ChartType.HISTOGRAM);
  } else {
    const hist = buildHistogram_(item.values, item.lsl, item.usl, 8);
    const data = hist.bins.map(function (bin) {
      return [formatNum_((bin.from + bin.to) / 2, item.decimals), bin.count];
    });
    sheet.getRange(row, 10, data.length, 2).setValues(data);
    builder = sheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(sheet.getRange(row, 10, data.length, 2))
      .setPosition(row, 1, 0, 0)
      .setOption("legend", { position: "none" })
      .setOption("bar.groupWidth", "100%")
      .setOption("colors", ["#0f766e"])
      .setOption("width", 520)
      .setOption("height", 200);
  }
  sheet.insertChart(builder.build());
  return row + 12;
}

function fillReportSheet_(sheet, inspection, images) {
  images = images || {};
  const stats = characteristicStats_(inspection);
  const summary = inspection.summary;
  const navy = "#12324d";
  if (typeof sheet.setHiddenGridlines === "function") sheet.setHiddenGridlines(true);
  sheet.setColumnWidths(1, 7, 92);
  sheet.setColumnWidth(3, 110);

  let row = 1;
  sheet.getRange(row, 1, 1, 7).merge().setValue("펌프 공정품질현황")
    .setFontSize(18).setFontWeight("bold").setFontColor("#ffffff").setBackground(navy);
  row += 1;
  sheet.getRange(row, 1, 1, 7).merge().setValue(inspection.modelName + " 공정 품질현황")
    .setFontSize(14).setFontWeight("bold").setBackground("#ccfbf1");
  row += 1;
  sheet.getRange(row, 1, 1, 7).merge()
    .setValue("검사일 " + inspection.dateDisplay + "  ·  " + inspection.sheetName)
    .setFontColor("#4b6478").setBackground("#f8fafc");
  row += 2;

  sheet.getRange(row, 1, 1, 4).setValues([["총 검사수", "정상수", "불량수", "불량율"]]);
  styleHeaderRow_(sheet.getRange(row, 1, 1, 4));
  row += 1;
  sheet.getRange(row, 1, 1, 4).setValues([[
    summary.total,
    summary.ok,
    summary.ng,
    formatRate_(summary.defectRate),
  ]]).setHorizontalAlignment("center").setFontWeight("bold").setFontSize(14);
  sheet.getRange(row, 1).setBackground("#e0f2fe");
  sheet.getRange(row, 2).setBackground("#d1fae5");
  sheet.getRange(row, 3).setBackground("#fee2e2");
  sheet.getRange(row, 4).setBackground("#ccfbf1");
  row += 2;

  for (let i = 0; i < stats.length; i++) {
    const item = stats[i];
    sheet.getRange(row, 1, 1, 7).merge()
      .setValue(item.label + " 품질분석")
      .setFontWeight("bold").setFontSize(12);
    row += 1;
    sheet.getRange(row, 1, 1, 5).setValues([["하한", "상한", "평균", "표준편차", "단위"]]);
    styleHeaderRow_(sheet.getRange(row, 1, 1, 5));
    row += 1;
    sheet.getRange(row, 1, 1, 5).setValues([[
      formatNum_(item.lsl, item.decimals),
      formatNum_(item.usl, item.decimals),
      capText_(item.mean, item.decimals),
      capText_(item.stdev, item.decimals),
      item.unit,
    ]]).setHorizontalAlignment("center");
    row += 2;
    row = insertHistogram_(sheet, row, item, images[item.key]);
    row += 1;
  }

  sheet.getRange(row, 1, 1, 7).merge().setValue("공정능력 분석").setFontWeight("bold").setFontSize(12);
  row += 1;
  sheet.getRange(row, 1, 1, 7).setValues([["특성치", "하한", "상한", "평균", "표준편차", "Cp", "Cpk"]]);
  styleHeaderRow_(sheet.getRange(row, 1, 1, 7));
  row += 1;
  for (let i = 0; i < stats.length; i++) {
    const item = stats[i];
    sheet.getRange(row, 1, 1, 7).setValues([[
      item.label,
      formatNum_(item.lsl, item.decimals),
      formatNum_(item.usl, item.decimals),
      capText_(item.mean, item.decimals),
      capText_(item.stdev, item.decimals),
      capText_(item.cp, 3),
      capText_(item.cpk, 3),
    ]]).setHorizontalAlignment("center");
    row += 1;
  }
  row += 1;

  sheet.getRange(row, 1, 1, 7).merge().setValue("특성치별 불량율").setFontWeight("bold").setFontSize(12);
  row += 1;
  sheet.getRange(row, 1, 1, 3).setValues([["특성치", "불량수", "불량율"]]);
  styleHeaderRow_(sheet.getRange(row, 1, 1, 3));
  row += 1;
  for (let i = 0; i < stats.length; i++) {
    const item = stats[i];
    sheet.getRange(row, 1, 1, 3).setValues([[
      item.label,
      item.ng,
      formatRate_(item.defectRate),
    ]]).setHorizontalAlignment("center");
    row += 1;
  }
}

function buildReportHtml_(inspection) {
  const stats = characteristicStats_(inspection);
  const summary = inspection.summary;
  const histBlocks = stats.map(function (item) {
    const hist = buildHistogram_(item.values, item.lsl, item.usl, 8);
    let maxCount = 0;
    for (let i = 0; i < hist.bins.length; i++) {
      if (hist.bins[i].count > maxCount) maxCount = hist.bins[i].count;
    }
    const rows = hist.bins.map(function (bin) {
      return (
        "<tr><td>" + formatNum_(bin.from, item.decimals) + " ~ " + formatNum_(bin.to, item.decimals) +
        "</td><td>" + bin.count +
        "</td><td>" + barText_(bin.count, maxCount) + "</td></tr>"
      );
    }).join("");
    return (
      "<h3>" + item.label + " 품질분석</h3>" +
      "<p>하한 " + formatNum_(item.lsl, item.decimals) +
      " / 상한 " + formatNum_(item.usl, item.decimals) + " " + item.unit +
      " · 평균 " + capText_(item.mean, item.decimals) +
      " · 표준편차 " + capText_(item.stdev, item.decimals) + "</p>" +
      "<table><thead><tr><th>구간</th><th>빈도</th><th>분포</th></tr></thead><tbody>" +
      rows + "</tbody></table>"
    );
  }).join("");

  const capRows = stats.map(function (item) {
    return (
      "<tr><td>" + item.label + "</td><td>" + formatNum_(item.lsl, item.decimals) +
      "</td><td>" + formatNum_(item.usl, item.decimals) +
      "</td><td>" + capText_(item.mean, item.decimals) +
      "</td><td>" + capText_(item.stdev, item.decimals) +
      "</td><td>" + capText_(item.cp, 3) +
      "</td><td>" + capText_(item.cpk, 3) + "</td></tr>"
    );
  }).join("");

  const defectRows = stats.map(function (item) {
    return "<tr><td>" + item.label + "</td><td>" + item.ng + "</td><td>" + formatRate_(item.defectRate) + "</td></tr>";
  }).join("");

  return (
    "<div style='font-family:Malgun Gothic,sans-serif;color:#163047;font-size:13px'>" +
    "<h2 style='margin:0 0 6px'>펌프 공정품질현황</h2>" +
    "<h3 style='margin:0 0 6px'>" + inspection.modelName + " 공정 품질현황</h3>" +
    "<p>검사일 " + inspection.dateDisplay + " · " + inspection.sheetName + "</p>" +
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'>" +
    "<tr><th>총 검사수</th><th>정상수</th><th>불량수</th><th>불량율</th></tr>" +
    "<tr><td>" + summary.total + "</td><td>" + summary.ok + "</td><td>" + summary.ng +
    "</td><td>" + formatRate_(summary.defectRate) + "</td></tr></table>" +
    histBlocks +
    "<h3>공정능력 분석</h3>" +
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'>" +
    "<tr><th>특성치</th><th>하한</th><th>상한</th><th>평균</th><th>표준편차</th><th>Cp</th><th>Cpk</th></tr>" +
    capRows + "</table>" +
    "<h3>특성치별 불량율</h3>" +
    "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'>" +
    "<tr><th>특성치</th><th>불량수</th><th>불량율</th></tr>" +
    defectRows + "</table></div>"
  );
}

function isPdfBytes_(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
}

function createReportPdfBlob_(inspection, images) {
  const filename = inspection.sheetName + "_공정품질.pdf";
  const ss = getSpreadsheet();
  const sheet = ss.insertSheet("_pdf_" + Date.now());
  try {
    fillReportSheet_(sheet, inspection, images);
    SpreadsheetApp.flush();
    const url =
      "https://docs.google.com/spreadsheets/d/" + ss.getId() +
      "/export?format=pdf&gid=" + sheet.getSheetId() +
      "&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false" +
      "&pagenumbers=false&gridlines=false&fzr=false" +
      "&top_margin=0.5&bottom_margin=0.5&left_margin=0.4&right_margin=0.4";
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    const blob = response.getBlob().setName(filename);
    if (response.getResponseCode() !== 200 || !isPdfBytes_(blob.getBytes())) {
      throw new Error("PDF 변환에 실패했습니다.");
    }
    return blob;
  } finally {
    ss.deleteSheet(sheet);
  }
}

function getReportPdf(sheetName) {
  const inspection = getInspectionBySheetName_(sheetName);
  const pdf = createReportPdfBlob_(inspection);
  return {
    filename: pdf.getName(),
    base64: Utilities.base64Encode(pdf.getBytes()),
  };
}

function sendReportEmail(payload) {
  const filename = payload.filename || payload.sheetName + "_공정품질.pdf";
  let pdf = null;
  if (payload.pdfBase64) {
    const bytes = Utilities.base64Decode(payload.pdfBase64);
    if (isPdfBytes_(bytes)) {
      pdf = Utilities.newBlob(bytes, "application/pdf", filename);
    }
  }
  if (!pdf && payload.sheetName) {
    try {
      pdf = createReportPdfBlob_(getInspectionBySheetName_(payload.sheetName), payload.histograms);
    } catch (error) {
      pdf = null;
    }
  }
  const body = String(payload.body || "");
  const options = {
    to: payload.recipient,
    subject: payload.subject,
    body: body,
    htmlBody: body.replace(/\n/g, "<br>"),
  };
  if (pdf) options.attachments = [pdf];
  MailApp.sendEmail(options);
  return { ok: true, attached: !!pdf };
}

function authorizeOnce() {
  getSpreadsheet().getName();
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
}

function testReadSpecs() {
  const ss = getSpreadsheet();
  const sheet = findSpecSheet_();
  Logger.log("스프레드시트: " + ss.getName());
  Logger.log("읽은 시트 탭: " + sheet.getName());
  Logger.log("행 수: " + sheet.getLastRow());
  Logger.log("1행 내용: " + JSON.stringify(sheet.getRange(1, 1, 1, 9).getValues()[0]));

  const specs = getPumpSpecs(true);
  Logger.log("모델 목록: " + specs.map(function (item) { return item.modelName; }).join(", "));
  Logger.log(JSON.stringify(specs, null, 2));
  return specs;
}
