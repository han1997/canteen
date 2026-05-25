const api = require("../../services/api");
const { ROLE_LABEL } = require("../../utils/constants");
const { addDays, todayString } = require("../../utils/date");

const STATS_ROLES = ["kitchen", "admin", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];
const PROFILE_SYNC_INTERVAL = 5 * 60 * 1000;
const STATS_REFRESH_INTERVAL = 60 * 1000;

const MEAL_TYPE_OPTIONS = [
  { label: "全部时段", value: "all" },
  { label: "早餐", value: "breakfast" },
  { label: "中餐", value: "lunch" },
  { label: "晚餐", value: "dinner" }
];

const CATEGORY_OPTIONS = [
  { label: "全部套餐", value: "all" },
  { label: "普通套餐", value: "normal" },
  { label: "减脂套餐", value: "fat_loss" },
  { label: "自选菜", value: "self_pick" }
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

function packageStatsEqual(prev, next) {
  if (prev === next) {
    return true;
  }
  if (!Array.isArray(prev) || !Array.isArray(next)) {
    return false;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      !a ||
      !b ||
      a.key !== b.key ||
      a.mealType !== b.mealType ||
      a.packageName !== b.packageName ||
      Number(a.totalQuantity) !== Number(b.totalQuantity)
    ) {
      return false;
    }
  }
  return true;
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
    exporting: false,
    downloading: false
  },

  onLoad() {
    this._profileSyncedAt = 0;
    this._lastLoadedAt = 0;
    this._loadPromise = null;
    this._accessPromise = null;
  },

  onShow() {
    this.ensureAccess(false).then(() => {
      if (this.data.allowed) {
        this.loadAll({ force: false, silent: true });
      }
    });
  },

  async ensureAccess(force = false) {
    if (this._accessPromise) {
      return this._accessPromise;
    }
    this._accessPromise = this._ensureAccessInternal(force).finally(() => {
      this._accessPromise = null;
    });
    return this._accessPromise;
  },

  async _ensureAccessInternal(force = false) {
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

    const allowed = STATS_ROLES.includes(profile.role);
    const isAdmin = ADMIN_ROLES.includes(profile.role);
    const roleLabel = ROLE_LABEL[profile.role] || profile.role;
    if (
      this.data.allowed === allowed &&
      this.data.isAdmin === isAdmin &&
      this.data.roleLabel === roleLabel
    ) {
      return;
    }

    this.setData({
      allowed,
      isAdmin,
      roleLabel
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

  async loadAll(options = {}) {
    const force = !!options.force;
    const silent = options.silent === true;
    if (!this.validateDateRange()) {
      return;
    }

    const now = Date.now();
    const hasBaseData = !!this.data.summary || !!this.data.breakfastItems.length || !!this.data.dashboard;
    if (!force && this._lastLoadedAt && hasBaseData && now - this._lastLoadedAt < STATS_REFRESH_INTERVAL) {
      return;
    }
    if (this._loadPromise) {
      return this._loadPromise;
    }

    if (!silent || !hasBaseData) {
      this.setData({ loading: true });
    }

    const tasks = [this.loadSummary(), this.loadBreakfastStats()];
    if (this.data.isAdmin) {
      tasks.push(this.loadDashboard());
    }

    this._loadPromise = Promise.all(tasks)
      .then(() => {
        this._lastLoadedAt = Date.now();
      })
      .catch((err) => {
        toast(err.message || "加载统计失败");
      })
      .finally(() => {
        if (!silent || !hasBaseData) {
          this.setData({ loading: false });
        }
        this._loadPromise = null;
      });

    return this._loadPromise;
  },

  async loadSummary() {
    const summary = await api.getStatsSummary(this.data.fromDate, this.data.toDate);
    const nextPackageStats = formatPackageStats((summary && summary.package_stats) || []);
    const prevSummary = this.data.summary;
    const summaryUnchanged =
      !!prevSummary &&
      prevSummary.total_orders === summary.total_orders &&
      prevSummary.breakfast_orders === summary.breakfast_orders &&
      prevSummary.lunch_orders === summary.lunch_orders &&
      prevSummary.dinner_orders === summary.dinner_orders;
    const packageStatsUnchanged = packageStatsEqual(this.data.summaryPackageStats, nextPackageStats);
    if (
      summaryUnchanged &&
      packageStatsUnchanged
    ) {
      return;
    }
    this.setData({
      summary,
      summaryPackageStats: nextPackageStats
    });
  },

  async loadDashboard() {
    const dashboard = await api.getTodayDashboard(todayString());
    const nextPackageStats = formatPackageStats((dashboard && dashboard.package_stats) || []);
    const prevDashboard = this.data.dashboard;
    const dashboardUnchanged =
      !!prevDashboard &&
      prevDashboard.total_orders === dashboard.total_orders &&
      prevDashboard.breakfast_orders === dashboard.breakfast_orders &&
      prevDashboard.lunch_orders === dashboard.lunch_orders &&
      prevDashboard.dinner_orders === dashboard.dinner_orders;
    const packageStatsUnchanged = packageStatsEqual(this.data.dashboardPackageStats, nextPackageStats);
    if (
      dashboardUnchanged &&
      packageStatsUnchanged
    ) {
      return;
    }
    this.setData({
      dashboard,
      dashboardPackageStats: nextPackageStats
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
    await this.loadAll({ force: true, silent: false });
  },

  async queryTomorrow() {
    const tomorrow = addDays(todayString(), 1);
    this.setData({
      fromDate: tomorrow,
      toDate: tomorrow
    });
    await this.loadAll({ force: true, silent: false });
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

  async downloadExportFile() {
    const job = this.data.exportJob;
    if (!job || !job.job_no) {
      toast("暂无导出任务");
      return;
    }
    if (job.status !== "done") {
      toast("任务尚未完成");
      return;
    }
    if (this.data.downloading) {
      return;
    }
    this.setData({ downloading: true });
    wx.showLoading({ title: "下载中...", mask: true });
    try {
      const tempFilePath = await api.downloadExportFile(job.job_no);
      wx.hideLoading();
      wx.openDocument({
        filePath: tempFilePath,
        fileType: "xlsx",
        showMenu: true,
        fail: (err) => {
          toast((err && err.errMsg) || "无法打开文件");
        }
      });
    } catch (err) {
      wx.hideLoading();
      toast(err.message || "下载失败");
    } finally {
      this.setData({ downloading: false });
    }
  },

  goHome() {
    wx.reLaunch({
      url: "/pages/home/index"
    });
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
