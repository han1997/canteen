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
    loginAccount: "",
    loginPassword: "",
    bindPoliceNo: "",
    bindMobile: "",
    bindRealName: ""
  },

  async onShow() {
    const app = getApp();
    if (!app.globalData.token) {
      return;
    }
    if (app.globalData.profile) {
      wx.reLaunch({ url: "/pages/home/index" });
      return;
    }
    try {
      this.setData({ loading: true });
      const profile = await api.getMe();
      app.setAuth(app.globalData.token, profile);
      wx.reLaunch({ url: "/pages/home/index" });
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
    wx.reLaunch({ url: "/pages/home/index" });
  },

  async submitLogin() {
    const account = this.data.loginAccount.trim();
    const password = this.data.loginPassword;
    if (!account || !password) {
      toast("请填写账号和密码");
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await api.login({
        account,
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
    const mobile = this.data.bindMobile.trim();
    const realName = this.data.bindRealName.trim();
    const wechatCode = `mp_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!realName) {
      toast("请填写姓名");
      return;
    }
    if (!policeNo && !mobile) {
      toast("警号与手机号至少填写其一");
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await api.wechatBind({
        police_no: policeNo || null,
        mobile: mobile || null,
        real_name: realName,
        wechat_code: wechatCode
      });
      await new Promise((resolve) => {
        wx.showModal({
          title: "首次绑定成功",
          content: "初始登录密码为 123456。若系统已有该账号，则沿用原密码。请登录后及时修改密码。",
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
