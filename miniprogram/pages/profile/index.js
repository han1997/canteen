const api = require("../../services/api");
const { ROLE_LABEL, MEAL_TYPE_LABEL } = require("../../utils/constants");
const { addDays, formatDateTime, todayString } = require("../../utils/date");
const { withPullDownRefresh } = require("../../utils/pull-refresh");

const PROFILE_SYNC_INTERVAL = 5 * 60 * 1000;
const RECENT_ORDERS_LIMIT = 10;
const RECENT_ORDERS_DAYS = 30;

const STATUS_LABEL = {
  booked: "已预约",
  verified: "已完成",
  cancelled: "已取消"
};

const STATUS_CLASS = {
  booked: "status-tag status-booked",
  verified: "status-tag status-verified",
  cancelled: "status-tag status-cancelled"
};

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

function formatItemsText(items) {
  if (!Array.isArray(items) || !items.length) {
    return "—";
  }
  return items
    .map((food) => `${food.item_name} ×${Number(food.quantity || 0)}${food.unit || "份"}`)
    .join("、");
}

function formatRecentOrders(orders) {
  return (orders || []).slice(0, RECENT_ORDERS_LIMIT).map((order) => {
    const mealType = order.meal_type || "";
    const mealTypeLabel = MEAL_TYPE_LABEL[mealType] || mealType;
    const mealDate = order.meal_date || "";
    const slotLabel = [mealDate, mealTypeLabel].filter(Boolean).join(" ") || "—";
    return {
      id: order.id,
      orderNo: order.order_no,
      status: order.status,
      statusLabel: STATUS_LABEL[order.status] || order.status,
      statusClass: STATUS_CLASS[order.status] || STATUS_CLASS.booked,
      bookedAtText: formatDateTime(order.booked_at),
      itemsText: formatItemsText(order.items),
      slotLabel
    };
  });
}

Page({
  data: {
    profile: null,
    roleLabel: "",
    showRole: false,
    canManage: false,
    recentOrders: [],
    ordersLoading: false
  },

  onLoad() {
    this._profileSyncedAt = 0;
    this._ensurePromise = null;
  },

  onShow() {
    this.ensureAuth(false).then(() => {
      if (getApp().globalData.token) {
        this.loadRecentOrders();
      }
    });
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
  },

  async loadRecentOrders() {
    const toDate = todayString();
    const fromDate = addDays(toDate, -(RECENT_ORDERS_DAYS - 1));
    this.setData({ ordersLoading: true });
    try {
      const orders = await api.getMyOrders(fromDate, toDate);
      this.setData({ recentOrders: formatRecentOrders(orders) });
    } catch (err) {
      // Profile page should still render gracefully if order fetch fails.
      toast(err.message || "加载最近订单失败");
    } finally {
      this.setData({ ordersLoading: false });
    }
  },

  onPullDownRefresh: withPullDownRefresh(async function () {
    await this.ensureAuth(true);
    await this.loadRecentOrders();
  }),

  goChangePassword() {
    wx.navigateTo({
      url: "/pages/change-password/index"
    });
  },

  goMyOrders() {
    wx.navigateTo({
      url: "/pages/my-orders/index"
    });
  },

  goManage() {
    wx.navigateTo({
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
