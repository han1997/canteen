const api = require("../../services/api");

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

Page({
  data: {
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
    submitting: false
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  async submit() {
    const { oldPassword, newPassword, confirmPassword } = this.data;
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

    this.setData({ submitting: true });
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
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 600);
    } catch (err) {
      toast(err.message || "修改密码失败");
    } finally {
      this.setData({ submitting: false });
    }
  }
});
