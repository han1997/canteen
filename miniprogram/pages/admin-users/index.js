const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");
const { withPullDownRefresh } = require("../../utils/pull-refresh");

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
    createPassword: "",
    // 编辑相关
    editingUserId: null,
    editPoliceNo: "",
    editRealName: "",
    editDeptName: "",
    editMobile: "",
    saving: false
  },

  async onShow() {
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadUsers();
    }
  },

  onPullDownRefresh: withPullDownRefresh(async function () {
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadUsers();
    }
  }),

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
      mobile: user.mobile || "",
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

  startEditUser(e) {
    const userId = Number(e.currentTarget.dataset.userId);
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) {
      return;
    }
    this.setData({
      editingUserId: userId,
      editPoliceNo: user.policeNo || "",
      editRealName: user.realName || "",
      editDeptName: user.deptName || "",
      editMobile: user.mobile || ""
    });
  },

  cancelEditUser() {
    this.setData({
      editingUserId: null,
      editPoliceNo: "",
      editRealName: "",
      editDeptName: "",
      editMobile: ""
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  async submitEditUser() {
    const userId = this.data.editingUserId;
    if (!userId) {
      return;
    }
    const policeNo = (this.data.editPoliceNo || "").trim();
    const realName = (this.data.editRealName || "").trim();
    const deptName = (this.data.editDeptName || "").trim();
    const mobile = (this.data.editMobile || "").trim();

    if (!realName) {
      toast("姓名不能为空");
      return;
    }
    if (!deptName) {
      toast("部门不能为空");
      return;
    }
    if (!policeNo && !mobile) {
      toast("警号与手机号至少填写一个");
      return;
    }

    this.setData({ saving: true });
    try {
      await api.updateAdminUser(userId, {
        police_no: policeNo,
        real_name: realName,
        dept_name: deptName,
        mobile: mobile
      });
      toast("已更新", "success");
      this.cancelEditUser();
      await this.loadUsers();
    } catch (err) {
      toast(err.message || "更新失败");
    } finally {
      this.setData({ saving: false });
    }
  },

  bulkImport() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["xlsx", "xls"],
      success: async (res) => {
        if (!res.tempFiles || !res.tempFiles.length) {
          toast("未选择文件");
          return;
        }
        const filePath = res.tempFiles[0].path;
        wx.showLoading({ title: "导入中...", mask: true });
        try {
          const result = await api.bulkImportUsers(filePath);
          wx.hideLoading();
          const msg = `导入完成：新增 ${result.created} 人，跳过 ${result.skipped} 人${
            result.errors.length ? `，${result.errors.length} 条错误` : ""
          }`;
          wx.showModal({
            title: "批量导入结果",
            content: msg + (result.errors.length ? `\n\n${result.errors.slice(0, 3).join("\n")}` : ""),
            showCancel: false
          });
          await this.loadUsers();
        } catch (err) {
          wx.hideLoading();
          toast(err.message || "批量导入失败");
        }
      },
      fail: () => {
        toast("选择文件失败");
      }
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
