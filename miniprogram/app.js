App({
  globalData: {
    apiBaseUrl: "http://127.0.0.1:8000/api/v1",
    token: "",
    profile: null
  },

  onLaunch() {
    const token = wx.getStorageSync("token") || "";
    const profile = wx.getStorageSync("profile") || null;
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
