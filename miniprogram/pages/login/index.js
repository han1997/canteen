const api = require("../../services/api");

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

Page({
  data: {
    mode: "login",
    loading: false,
    loginPoliceNo: "",
    loginPassword: "",
    bindPoliceNo: "",
    bindRealName: ""
  },

  async onShow() {
    const app = getApp();
    if (!app.globalData.token) {
      return;
    }
    if (app.globalData.profile) {
      wx.switchTab({ url: "/pages/home/index" });
      return;
    }
    try {
      this.setData({ loading: true });
      const profile = await api.getMe();
      app.setAuth(app.globalData.token, profile);
      wx.switchTab({ url: "/pages/home/index" });
    } catch (err) {
      app.clearAuth();
    } finally {
      this.setData({ loading: false });
    }
  },

  switchMode(e) {
    this.setData({
      mode: e.currentTarget.dataset.mode
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  async loginAndEnter(accessToken) {
    const app = getApp();
    app.setAuth(accessToken, null);
    const profile = await api.getMe();
    app.setAuth(accessToken, profile);
    wx.switchTab({ url: "/pages/home/index" });
  },

  async submitLogin() {
    const policeNo = this.data.loginPoliceNo.trim();
    const password = this.data.loginPassword;
    if (!policeNo || !password) {
      toast("请填写警号和密码");
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await api.login({
        police_no: policeNo,
        password
      });
      await this.loginAndEnter(result.access_token);
      toast("登录成功", "success");
    } catch (err) {
      toast(err.message || "登录失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  async submitBind() {
    const policeNo = this.data.bindPoliceNo.trim();
    const realName = this.data.bindRealName.trim();
    const wechatCode = `mp_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!policeNo || !realName) {
      toast("请填写警号和姓名");
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await api.wechatBind({
        police_no: policeNo,
        real_name: realName,
        mobile: null,
        wechat_code: wechatCode
      });
      await new Promise((resolve) => {
        wx.showModal({
          title: "首次绑定成功",
          content: "初始登录密码为警号后6位。若系统已有该警号账号，则沿用原密码。请登录后及时修改密码。",
          showCancel: false,
          success: () => resolve(),
          fail: () => resolve()
        });
      });
      await this.loginAndEnter(result.access_token);
      toast("绑定并登录成功", "success");
    } catch (err) {
      toast(err.message || "绑定失败");
    } finally {
      this.setData({ loading: false });
    }
  }
});
