const ENV_STORAGE_KEY = "runtime_env";
const FALLBACK_ENV = "release";

const ENV_API_BASE_URL_MAP = {
  develop: "http://127.0.0.1:8000/api/v1",
  trial: "https://ct.128791.xyz:2096/api/v1",
  release: "https://ct.128791.xyz:2096/api/v1"
};

function normalizeEnv(value) {
  const env = String(value || "").trim().toLowerCase();
  if (env === "dev") {
    return "develop";
  }
  if (env === "prod") {
    return "release";
  }
  if (env in ENV_API_BASE_URL_MAP) {
    return env;
  }
  return "";
}

function detectWechatEnvVersion() {
  try {
    const info = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
    const envVersion = info && info.miniProgram ? info.miniProgram.envVersion : "";
    const normalized = normalizeEnv(envVersion);
    return normalized || FALLBACK_ENV;
  } catch (err) {
    return FALLBACK_ENV;
  }
}

function getRuntimeEnv() {
  try {
    const manualEnv = normalizeEnv(wx.getStorageSync(ENV_STORAGE_KEY));
    if (manualEnv) {
      return manualEnv;
    }
  } catch (err) {
    // ignore storage errors
  }
  return detectWechatEnvVersion();
}

function setRuntimeEnv(env) {
  const normalized = normalizeEnv(env);
  if (!normalized) {
    throw new Error("unsupported env, expected: develop/trial/release");
  }
  wx.setStorageSync(ENV_STORAGE_KEY, normalized);
  return normalized;
}

function clearRuntimeEnv() {
  try {
    wx.removeStorageSync(ENV_STORAGE_KEY);
  } catch (err) {
    // ignore storage errors
  }
}

function getApiBaseUrl(env) {
  const runtimeEnv = normalizeEnv(env) || getRuntimeEnv();
  return ENV_API_BASE_URL_MAP[runtimeEnv] || ENV_API_BASE_URL_MAP[FALLBACK_ENV];
}

module.exports = {
  ENV_STORAGE_KEY,
  ENV_API_BASE_URL_MAP,
  getRuntimeEnv,
  setRuntimeEnv,
  clearRuntimeEnv,
  getApiBaseUrl
};
