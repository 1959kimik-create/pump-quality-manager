const STORAGE_KEYS = {
  specs: "pump_spec_v1",
  inspections: "pump_inspections_v1",
  config: "pump_config_v1",
};

const DEFAULT_SPECS = [
  {
    id: "spec-model-a",
    modelName: "MODEL_A",
    currentLsl: 1.2,
    currentUsl: 1.8,
    powerLsl: 250,
    powerUsl: 350,
    flowLsl: 10,
    flowUsl: 15,
    active: true,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  },
  {
    id: "spec-model-b",
    modelName: "MODEL_B",
    currentLsl: 1.5,
    currentUsl: 2.1,
    powerLsl: 300,
    powerUsl: 400,
    flowLsl: 12,
    flowUsl: 18,
    active: true,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  },
  {
    id: "spec-model-c",
    modelName: "MODEL_C",
    currentLsl: 2.0,
    currentUsl: 2.5,
    powerLsl: 400,
    powerUsl: 500,
    flowLsl: 15,
    flowUsl: 20,
    active: true,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  },
];

const DEFAULT_CONFIG = {
  companyName: "펌프 공정품질 관리",
  reportTitle: "펌프 공정 품질현황",
  emailRecipient: "kik1959@naver.com",
  currentDecimals: 2,
  powerDecimals: 2,
  flowDecimals: 1,
  defectRateDecimals: 4,
  minSamplesForCpk: 5,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const googleData = {
  ready: false,
  specs: null,
  inspections: null,
};

function isGas() {
  return typeof google !== "undefined" && google.script && google.script.run;
}

function loadGoogleData(callback) {
  if (!isGas()) {
    callback();
    return;
  }
  google.script.run
    .withSuccessHandler(function (data) {
      googleData.ready = true;
      googleData.specs = (data.specs || []).map(function (item) {
        return Object.assign({ id: item.id || "spec-" + item.modelName }, item);
      });
      googleData.inspections = data.inspections || [];
      callback();
    })
    .withFailureHandler(function (error) {
      console.error(error);
      callback();
    })
    .getAppBootstrap();
}

function runGas(name, payload, onDone) {
  if (!isGas()) return;
  const runner = google.script.run
    .withFailureHandler(function (error) {
      console.error(error);
    });
  if (onDone) runner.withSuccessHandler(onDone);
  runner[name](payload);
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getConfig() {
  const saved = readJson(STORAGE_KEYS.config, null);
  return { ...DEFAULT_CONFIG, ...(saved || {}) };
}

function saveConfig(partial) {
  const next = { ...getConfig(), ...partial };
  writeJson(STORAGE_KEYS.config, next);
  return next;
}

function getSpecs(includeInactive = false) {
  if (googleData.specs) {
    return includeInactive ? googleData.specs : googleData.specs.filter((item) => item.active);
  }
  let specs = readJson(STORAGE_KEYS.specs, null);
  if (!specs) {
    specs = DEFAULT_SPECS;
    writeJson(STORAGE_KEYS.specs, specs);
  }
  return includeInactive ? specs : specs.filter((item) => item.active);
}

function getSpecByModel(modelName) {
  return getSpecs(true).find((item) => item.modelName === modelName) || null;
}

function upsertSpec(payload) {
  const specs = getSpecs(true);
  const name = payload.modelName.trim();
  const now = todayIso();
  const existing = specs.find((item) => item.modelName === name);

  if (existing && existing.id !== payload.id) {
    throw new Error("이미 등록된 모델명입니다.");
  }

  if (payload.id) {
    const index = specs.findIndex((item) => item.id === payload.id);
    if (index < 0) throw new Error("수정할 모델을 찾을 수 없습니다.");
    specs[index] = {
      ...specs[index],
      ...payload,
      modelName: name,
      updatedAt: now,
    };
  } else {
    specs.push({
      id: `spec-${Date.now()}`,
      modelName: name,
      currentLsl: Number(payload.currentLsl),
      currentUsl: Number(payload.currentUsl),
      powerLsl: Number(payload.powerLsl),
      powerUsl: Number(payload.powerUsl),
      flowLsl: Number(payload.flowLsl),
      flowUsl: Number(payload.flowUsl),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  writeJson(STORAGE_KEYS.specs, specs);
  googleData.specs = specs;
  runGas("upsertPumpSpec", {
    modelName: name,
    currentLsl: payload.currentLsl,
    currentUsl: payload.currentUsl,
    powerLsl: payload.powerLsl,
    powerUsl: payload.powerUsl,
    flowLsl: payload.flowLsl,
    flowUsl: payload.flowUsl,
    active: true,
  }, function (next) {
    googleData.specs = next;
  });
  return specs;
}

function setSpecActive(id, active) {
  const specs = getSpecs(true);
  const target = specs.find((item) => item.id === id);
  if (!target) throw new Error("모델을 찾을 수 없습니다.");
  target.active = active;
  target.updatedAt = todayIso();
  writeJson(STORAGE_KEYS.specs, specs);
  googleData.specs = specs;
  runGas("setPumpSpecActive", { modelName: target.modelName, active: active }, function (next) {
    googleData.specs = next;
  });
  return specs;
}

function snapshotSpec(spec) {
  return {
    modelName: spec.modelName,
    currentLsl: spec.currentLsl,
    currentUsl: spec.currentUsl,
    powerLsl: spec.powerLsl,
    powerUsl: spec.powerUsl,
    flowLsl: spec.flowLsl,
    flowUsl: spec.flowUsl,
  };
}

function getInspections() {
  if (googleData.inspections) return googleData.inspections;
  return readJson(STORAGE_KEYS.inspections, []);
}

function getInspectionById(id) {
  return getInspections().find((item) => item.id === id) || null;
}

function getInspectionBySheet(sheetName) {
  return getInspections().find((item) => item.sheetName === sheetName) || null;
}

function makeSheetName(modelName, yyyymmdd) {
  return `${modelName}_${yyyymmdd}`;
}

function summarizeSamples(samples) {
  const total = samples.length;
  const ng = samples.filter((sample) => sample.result === "NG").length;
  return {
    total,
    ng,
    ok: total - ng,
    defectRate: total ? (ng / total) * 100 : 0,
  };
}

function saveInspection(record) {
  const inspections = getInspections();
  const existingIndex = inspections.findIndex((item) => item.sheetName === record.sheetName);

  if (existingIndex >= 0) {
    const existing = inspections[existingIndex];
    const startNo = existing.samples.length;
    const appended = record.samples.map((sample, index) => ({
      ...sample,
      no: startNo + index + 1,
    }));
    existing.samples = [...existing.samples, ...appended];
    existing.summary = summarizeSamples(existing.samples);
    existing.updatedAt = new Date().toISOString();
    inspections[existingIndex] = existing;
    writeJson(STORAGE_KEYS.inspections, inspections);
    googleData.inspections = inspections;
    runGas("saveInspectionData", {
      modelName: record.modelName,
      date: record.date,
      dateDisplay: record.dateDisplay,
      spec: record.spec,
      samples: appended,
    });
    return { inspection: existing, appended: true };
  }

  const created = {
    ...record,
    id: `insp-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  inspections.unshift(created);
  writeJson(STORAGE_KEYS.inspections, inspections);
  googleData.inspections = inspections;
  runGas("saveInspectionData", {
    modelName: record.modelName,
    date: record.date,
    dateDisplay: record.dateDisplay,
    spec: record.spec,
    samples: record.samples,
  });
  return { inspection: created, appended: false };
}

function deleteInspection(id) {
  const next = getInspections().filter((item) => item.id !== id);
  writeJson(STORAGE_KEYS.inspections, next);
  return next;
}
