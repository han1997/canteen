const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

Page({
  data: {
    profile: null,
    roleLabel: "",
    showRole: false,
    canManage: false,
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
    changingPassword: false
  },

  async onShow() {
    await this.ensureAuth();
  },

  async ensureAuth() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    let profile = app.globalData.profile;
    if (!profile) {
      try {
        profile = await api.getMe();
        app.setAuth(app.globalData.token, profile);
      } catch (err) {
        toast(err.message || "登录状态异常");
        return;
      }
    }
    this.setData({
      profile,
      roleLabel: ROLE_LABEL[profile.role] || profile.role,
      showRole: profile.role !== "officer",
      canManage: ["kitchen", "admin", "super_admin"].includes(profile.role)
    });
  },

  onPwdInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  async submitChangePassword() {
    const oldPassword = this.data.oldPassword;
    const newPassword = this.data.newPassword;
    const confirmPassword = this.data.confirmPassword;
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast("请填写完整密码信息");
      return;
    }
    if (newPassword.length < 6) {
      toast("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("两次新密码输入不一致");
      return;
    }

    this.setData({ changingPassword: true });
    try {
      await api.changePassword({
        old_password: oldPassword,
        new_password: newPassword
      });
      this.setData({
        oldPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      toast("密码修改成功", "success");
    } catch (err) {
      toast(err.message || "修改密码失败");
    } finally {
      this.setData({ changingPassword: false });
    }
  },

  goMyOrders() {
    wx.navigateTo({
      url: "/pages/my-orders/index"
    });
  },

  goManage() {
    wx.switchTab({
      url: "/pages/admin-stats/index"
    });
  },

  logout() {
    const app = getApp();
    app.clearAuth();
    wx.reLaunch({
      url: "/pages/login/index"
    });
  }
});
