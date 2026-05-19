const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");

const ADMIN_ROLES = ["admin", "super_admin"];
const ROLE_OPTIONS = [
  { label: "民警", value: "officer" },
  { label: "食堂人员", value: "kitchen" },
  { label: "管理员", value: "admin" },
  { label: "超级管理员", value: "super_admin" }
];

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

Page({
  data: {
    allowed: false,
    loading: false,
    users: [],
    keyword: "",
    showCreateForm: false,
    creating: false,
    roleLabels: ROLE_OPTIONS.map((item) => item.label),
    createPoliceNo: "",
    createRealName: "",
    createDeptName: "祁门县公安局",
    createMobile: "",
    createRoleIndex: 0,
    createPassword: ""
  },

  async onShow() {
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadUsers();
    }
  },

  async ensureAccess() {
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
      allowed: ADMIN_ROLES.includes(profile.role)
    });
  },

  onKeywordInput(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  async searchUsers() {
    await this.loadUsers();
  },

  async clearKeyword() {
    this.setData({
      keyword: ""
    });
    await this.loadUsers();
  },

  toggleCreateForm() {
    this.setData({
      showCreateForm: !this.data.showCreateForm
    });
  },

  onCreateInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  onCreateRoleChange(e) {
    this.setData({
      createRoleIndex: Number(e.detail.value)
    });
  },

  roleIndexByValue(role) {
    const index = ROLE_OPTIONS.findIndex((item) => item.value === role);
    return index >= 0 ? index : 0;
  },

  formatUsers(users) {
    return (users || []).map((user) => ({
      id: user.id,
      policeNo: user.police_no,
      realName: user.real_name,
      deptName: user.dept_name,
      role: user.role,
      roleLabel: ROLE_LABEL[user.role] || user.role,
      roleIndex: this.roleIndexByValue(user.role),
      status: user.status,
      statusLabel: user.status === "active" ? "启用" : "禁用",
      statusClass: user.status === "active" ? "status-tag status-verified" : "status-tag status-cancelled"
    }));
  },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const users = await api.listAdminUsers(this.data.keyword.trim() || undefined);
      this.setData({
        users: this.formatUsers(users)
      });
    } catch (err) {
      toast(err.message || "加载用户失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  async submitCreate() {
    const policeNo = this.data.createPoliceNo.trim();
    const realName = this.data.createRealName.trim();
    const deptName = (this.data.createDeptName || "").trim() || "祁门县公安局";
    const mobile = this.data.createMobile.trim();
    const initPassword = this.data.createPassword;
    const role = ROLE_OPTIONS[this.data.createRoleIndex].value;

    if (!policeNo || !realName || !initPassword) {
      toast("请填写完整用户信息");
      return;
    }
    if (initPassword.length < 6) {
      toast("初始密码至少 6 位");
      return;
    }

    this.setData({ creating: true });
    try {
      await api.createAdminUser({
        police_no: policeNo,
        real_name: realName,
        dept_name: deptName,
        role,
        mobile: mobile || null,
        init_password: initPassword
      });
      toast("创建成功", "success");
      this.setData({
        createPoliceNo: "",
        createRealName: "",
        createDeptName: "祁门县公安局",
        createMobile: "",
        createRoleIndex: 0,
        createPassword: ""
      });
      await this.loadUsers();
    } catch (err) {
      toast(err.message || "创建用户失败");
    } finally {
      this.setData({ creating: false });
    }
  },

  async changeUserRole(e) {
    const userId = Number(e.currentTarget.dataset.userId);
    const roleIndex = Number(e.detail.value);
    const role = ROLE_OPTIONS[roleIndex].value;
    try {
      await api.updateAdminUserRole(userId, role);
      toast("角色已更新", "success");
      await this.loadUsers();
    } catch (err) {
      toast(err.message || "更新角色失败");
    }
  },

  async toggleUserStatus(e) {
    const userId = Number(e.currentTarget.dataset.userId);
    const currentStatus = e.currentTarget.dataset.currentStatus;
    const nextStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await api.updateAdminUserStatus(userId, nextStatus);
      toast("状态已更新", "success");
      await this.loadUsers();
    } catch (err) {
      toast(err.message || "更新状态失败");
    }
  },

  logout() {
    const app = getApp();
    app.clearAuth();
    wx.reLaunch({
      url: "/pages/login/index"
    });
  }
});
