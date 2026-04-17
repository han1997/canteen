const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v1";
let isRedirectingToLogin = false;

function getAppInstance() {
  try {
    return getApp();
  } catch (err) {
    return null;
  }
}

function getBaseUrl() {
  const app = getAppInstance();
  if (app && app.globalData && app.globalData.apiBaseUrl) {
    return app.globalData.apiBaseUrl;
  }
  return DEFAULT_BASE_URL;
}

function getToken() {
  const app = getAppInstance();
  if (app && app.globalData && app.globalData.token) {
    return app.globalData.token;
  }
  return wx.getStorageSync("token") || "";
}

function toQueryString(query) {
  if (!query) {
    return "";
  }
  const pairs = Object.keys(query)
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`);
  return pairs.join("&");
}

function buildUrl(path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = toQueryString(query);
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  return queryString ? `${baseUrl}${normalizedPath}?${queryString}` : `${baseUrl}${normalizedPath}`;
}

function parseErrorMessage(payload) {
  if (!payload) {
    return "请求失败";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (typeof payload.detail === "string") {
    return payload.detail;
  }
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    const first = payload.detail[0];
    if (first && typeof first.msg === "string") {
      return first.msg;
    }
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }
  return "请求失败";
}

function redirectToLogin() {
  if (isRedirectingToLogin) {
    return;
  }
  isRedirectingToLogin = true;
  const app = getAppInstance();
  if (app && typeof app.clearAuth === "function") {
    app.clearAuth();
  } else {
    wx.removeStorageSync("token");
    wx.removeStorageSync("profile");
  }

  setTimeout(() => {
    wx.reLaunch({
      url: "/pages/login/index"
    });
    isRedirectingToLogin = false;
  }, 50);
}

function request(options) {
  const method = options.method || "GET";
  const auth = options.auth !== false;
  const header = {
    "Content-Type": "application/json"
  };
  if (auth) {
    const token = getToken();
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: buildUrl(options.url, options.query),
      method,
      data: options.data,
      header,
      success: (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(res.data);
          return;
        }

        if (statusCode === 401 && auth) {
          redirectToLogin();
        }
        reject(new Error(parseErrorMessage(res.data)));
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || "网络请求失败"));
      }
    });
  });
}

module.exports = {
  request
};
