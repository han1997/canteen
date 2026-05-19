const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");
const PROFILE_SYNC_INTERVAL = 5 * 60 * 1000;

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

  onLoad() {
    this._profileSyncedAt = 0;
    this._ensurePromise = null;
  },

  onShow() {
    this.syncTabBar();
    this.ensureAuth(false);
  },

  syncTabBar() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.refresh === "function") {
      tabBar.refresh("/pages/profile/index");
    }
  },

  async ensureAuth(force = false) {
    if (this._ensurePromise) {
      return this._ensurePromise;
    }

    this._ensurePromise = this._ensureAuthInternal(force).finally(() => {
      this._ensurePromise = null;
    });
    return this._ensurePromise;
  },

  async _ensureAuthInternal(force = false) {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }

    const now = Date.now();
    let profile = app.globalData.profile;
    const needSync = force || !profile || !this._profileSyncedAt || now - this._profileSyncedAt > PROFILE_SYNC_INTERVAL;
    try {
      if (needSync) {
        profile = await api.getMe();
        app.setAuth(app.globalData.token, profile);
        this._profileSyncedAt = now;
      }
    } catch (err) {
      toast(err.message || "登录状态异常");
      return;
    }

    const roleLabel = ROLE_LABEL[profile.role] || profile.role;
    const showRole = profile.role !== "officer";
    const canManage = ["kitchen", "admin", "super_admin"].includes(profile.role);
    const current = this.data.profile;
    if (
      current &&
      current.id === profile.id &&
      current.role === profile.role &&
      current.real_name === profile.real_name &&
      current.police_no === profile.police_no &&
      this.data.roleLabel === roleLabel &&
      this.data.showRole === showRole &&
      this.data.canManage === canManage
    ) {
      return;
    }

    this.setData({
      profile,
      roleLabel,
      showRole,
      canManage
    });
    this.syncTabBar();
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
