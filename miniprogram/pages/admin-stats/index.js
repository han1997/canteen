const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");
const { addDays, todayString } = require("../../utils/date");

const STATS_ROLES = ["kitchen", "admin", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];

const MEAL_TYPE_OPTIONS = [
  { label: "全部时段", value: "all" },
  { label: "早餐", value: "breakfast" },
  { label: "中餐", value: "lunch" },
  { label: "晚餐", value: "dinner" }
];

const CATEGORY_OPTIONS = [
  { label: "全部套餐", value: "all" },
  { label: "普通套餐", value: "normal" },
  { label: "减脂套餐", value: "fat_loss" }
];

const MEAL_TYPE_LABEL_MAP = {
  breakfast: "早餐",
  lunch: "中餐",
  dinner: "晚餐"
};

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

function formatPackageStats(rows) {
  return (rows || []).map((row) => ({
    key: `${row.meal_type || ""}_${row.package_name || ""}`,
    mealType: row.meal_type || "",
    mealTypeLabel: MEAL_TYPE_LABEL_MAP[row.meal_type] || row.meal_type || "",
    packageName: row.package_name || "",
    totalQuantity: Number(row.total_quantity || 0)
  }));
}

Page({
  data: {
    allowed: false,
    isAdmin: false,
    roleLabel: "",
    loading: false,
    fromDate: todayString(),
    toDate: todayString(),
    dashboard: null,
    dashboardPackageStats: [],
    summary: null,
    summaryPackageStats: [],
    breakfastItems: [],
    breakfastTotalAmount: "0.00",
    mealTypeLabels: MEAL_TYPE_OPTIONS.map((item) => item.label),
    mealCategoryLabels: CATEGORY_OPTIONS.map((item) => item.label),
    mealTypeIndex: 0,
    mealCategoryIndex: 0,
    exportJob: null,
    exporting: false
  },

  async onShow() {
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadAll();
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
      allowed: STATS_ROLES.includes(profile.role),
      isAdmin: ADMIN_ROLES.includes(profile.role),
      roleLabel: ROLE_LABEL[profile.role] || profile.role
    });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  validateDateRange() {
    if (this.data.fromDate > this.data.toDate) {
      toast("开始日期不能大于结束日期");
      return false;
    }
    return true;
  },

  async loadAll() {
    if (!this.validateDateRange()) {
      return;
    }
    this.setData({ loading: true });
    try {
      const tasks = [this.loadSummary(), this.loadBreakfastStats()];
      if (this.data.isAdmin) {
        tasks.push(this.loadDashboard());
      }
      await Promise.all(tasks);
    } catch (err) {
      toast(err.message || "加载统计失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadSummary() {
    const summary = await api.getStatsSummary(this.data.fromDate, this.data.toDate);
    this.setData({
      summary,
      summaryPackageStats: formatPackageStats((summary && summary.package_stats) || [])
    });
  },

  async loadDashboard() {
    const dashboard = await api.getTodayDashboard(todayString());
    this.setData({
      dashboard,
      dashboardPackageStats: formatPackageStats((dashboard && dashboard.package_stats) || [])
    });
  },

  async loadBreakfastStats() {
    const rows = await api.getBreakfastItemStats(this.data.fromDate, this.data.toDate);
    let totalAmount = 0;
    const list = (rows || []).map((row) => {
      const amount = Number(row.total_amount || 0);
      totalAmount += amount;
      return {
        itemName: row.item_name,
        totalQuantity: Number(row.total_quantity || 0),
        unitPrice: Number(row.unit_price || 0).toFixed(2),
        totalAmount: amount.toFixed(2)
      };
    });
    this.setData({
      breakfastItems: list,
      breakfastTotalAmount: totalAmount.toFixed(2)
    });
  },

  async queryToday() {
    const today = todayString();
    this.setData({
      fromDate: today,
      toDate: today
    });
    await this.loadAll();
  },

  async queryTomorrow() {
    const tomorrow = addDays(todayString(), 1);
    this.setData({
      fromDate: tomorrow,
      toDate: tomorrow
    });
    await this.loadAll();
  },

  onMealTypeChange(e) {
    this.setData({
      mealTypeIndex: Number(e.detail.value)
    });
  },

  onCategoryChange(e) {
    this.setData({
      mealCategoryIndex: Number(e.detail.value)
    });
  },

  async createExportJob() {
    if (!this.validateDateRange()) {
      return;
    }
    const mealType = MEAL_TYPE_OPTIONS[this.data.mealTypeIndex].value;
    const mealCategory = CATEGORY_OPTIONS[this.data.mealCategoryIndex].value;
    this.setData({ exporting: true });
    try {
      const job = await api.exportStats({
        from_date: this.data.fromDate,
        to_date: this.data.toDate,
        meal_type: mealType,
        meal_category: mealCategory
      });
      this.setData({
        exportJob: job
      });
      toast("导出任务已完成", "success");
    } catch (err) {
      toast(err.message || "导出失败");
    } finally {
      this.setData({ exporting: false });
    }
  },

  async refreshExportJob() {
    const currentJob = this.data.exportJob;
    if (!currentJob || !currentJob.job_no) {
      toast("暂无导出任务");
      return;
    }
    try {
      const latest = await api.getExportJob(currentJob.job_no);
      this.setData({
        exportJob: latest
      });
      toast("已刷新", "success");
    } catch (err) {
      toast(err.message || "刷新失败");
    }
  },

  goAdminUsers() {
    wx.navigateTo({
      url: "/pages/admin-users/index"
    });
  },

  goMealManage() {
    wx.navigateTo({
      url: "/pages/admin-meals/index"
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
