const { getRuntimeEnv, getApiBaseUrl } = require("./config/env");

App({
  globalData: {
    env: "",
    apiBaseUrl: "",
    token: "",
    profile: null
  },

  onLaunch() {
    const env = getRuntimeEnv();
    const apiBaseUrl = getApiBaseUrl(env);
    const token = wx.getStorageSync("token") || "";
    const profile = wx.getStorageSync("profile") || null;
    this.globalData.env = env;
    this.globalData.apiBaseUrl = apiBaseUrl;
    this.globalData.token = token;
    this.globalData.profile = profile;
  },

  setAuth(token, profile) {
    this.globalData.token = token || "";
    this.globalData.profile = profile || null;
    wx.setStorageSync("token", this.globalData.token);
    if (this.globalData.profile) {
      wx.setStorageSync("profile", this.globalData.profile);
    } else {
      wx.removeStorageSync("profile");
    }
  },

  clearAuth() {
    this.globalData.token = "";
    this.globalData.profile = null;
    wx.removeStorageSync("token");
    wx.removeStorageSync("profile");
  }
});
