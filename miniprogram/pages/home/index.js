const api = require("../../services/api");
const { CATEGORY_LABEL, MEAL_TYPE_LABEL } = require("../../utils/constants");
const { formatDateTime, todayString } = require("../../utils/date");
const { withPullDownRefresh } = require("../../utils/pull-refresh");
const { getApiBaseUrl } = require("../../config/env");

const PRIVILEGED_ROLES = ["kitchen", "admin", "super_admin"];
const DEFAULT_API_BASE_URL = getApiBaseUrl();
const DEFAULT_MEAL_IMAGE_LOCAL = "/assets/default-meal.png";
const PROFILE_SYNC_INTERVAL = 5 * 60 * 1000;
const HOME_REFRESH_INTERVAL = 45 * 1000;
const ORDER_STATUS_LABEL = {
  booked: "已预订",
  verified: "已完成",
  cancelled: "已取消"
};

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

function parseDateTime(text) {
  const parsed = new Date(
    String(text || "")
      .replace("T", " ")
      .replace(/Z$/, "")
      .replace(/\.\d+/, "")
      .replace(/-/g, "/")
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toInt(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return 0;
  }
  return Math.round(num);
}

function getApiOrigin() {
  const app = getApp();
  const baseUrl = (
    (app && app.globalData && app.globalData.apiBaseUrl) ||
    DEFAULT_API_BASE_URL
  )
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "");
  return baseUrl;
}

function toMealImageUrl(imageUrl) {
  if (!imageUrl) {
    return DEFAULT_MEAL_IMAGE_LOCAL;
  }
  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/static/")) {
    return `${getApiOrigin()}${imageUrl}`;
  }
  return DEFAULT_MEAL_IMAGE_LOCAL;
}

Page({
  data: {
    mealDate: todayString(),
    profile: null,
    slots: [],
    loading: false,
    placing: false,
    placingSlotId: 0,
    canManage: false
  },

  onLoad() {
    this._profileSyncedAt = 0;
    this._lastLoadedAt = 0;
    this._loadPromise = null;
  },

  onShow() {
    this.syncTabBar();
    this.initAndLoad({ force: false, silent: true });
  },

  syncTabBar() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.refresh === "function") {
      tabBar.refresh("/pages/home/index");
    }
  },

  onPullDownRefresh: withPullDownRefresh(function () {
    return this.initAndLoad({ force: true, silent: false });
  }),

  async initAndLoad(options = {}) {
    const force = !!options.force;
    const silent = options.silent !== false;
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }

    try {
      const profile = await this.ensureProfile(force);
      this.applyProfile(profile);
      await this.loadData({ force, silent });
    } catch (err) {
      toast(err.message || "加载用户信息失败");
    }
  },

  async ensureProfile(force = false) {
    const app = getApp();
    const now = Date.now();
    let profile = app.globalData.profile;
    const needSync = force || !profile || !this._profileSyncedAt || now - this._profileSyncedAt > PROFILE_SYNC_INTERVAL;
    if (!needSync) {
      return profile;
    }

    profile = await api.getMe();
    app.setAuth(app.globalData.token, profile);
    this._profileSyncedAt = now;
    return profile;
  },

  applyProfile(profile) {
    const canManage = PRIVILEGED_ROLES.includes(profile.role);
    const current = this.data.profile;
    if (
      current &&
      current.id === profile.id &&
      current.role === profile.role &&
      current.real_name === profile.real_name &&
      current.police_no === profile.police_no &&
      this.data.canManage === canManage
    ) {
      return;
    }

    this.setData({
      profile,
      canManage
    });
    this.syncTabBar();
  },

  async loadData(options = {}) {
    const force = !!options.force;
    const silent = options.silent === true;
    const now = Date.now();
    if (!force && this._lastLoadedAt && this.data.slots.length && now - this._lastLoadedAt < HOME_REFRESH_INTERVAL) {
      return;
    }
    if (this._loadPromise) {
      return this._loadPromise;
    }

    const shouldShowLoading = !silent || !this.data.slots.length;
    if (shouldShowLoading) {
      this.setData({ loading: true });
    }

    this._loadPromise = Promise.all([
      api.getMealSlots(this.data.mealDate),
      api.getMyOrders(this.data.mealDate, this.data.mealDate)
    ])
      .then(([slots, orders]) => {
        const orderMap = {};
        (orders || []).forEach((order) => {
          orderMap[order.slot_id] = order;
        });
        const formattedSlots = (slots || []).map((slot) => this.formatSlot(slot, orderMap[slot.id]));
        this.setData({
          slots: formattedSlots
        });
        this._lastLoadedAt = Date.now();
      })
      .catch((err) => {
        toast(err.message || "加载订餐信息失败");
      })
      .finally(() => {
        if (shouldShowLoading) {
          this.setData({ loading: false });
        }
        this._loadPromise = null;
      });

    return this._loadPromise;
  },

  formatSlot(slot, existingOrder) {
    const deadlineDate = parseDateTime(slot.booking_deadline);
    const deadlinePassed = deadlineDate ? deadlineDate.getTime() < Date.now() : false;
    const canBook = !!slot.is_open && !deadlinePassed;
    const slotStatus = !slot.is_open ? "时段已关闭" : deadlinePassed ? "已过截止时间" : "可下单";
    const itemQtyMap = {};
    (existingOrder?.items || []).forEach((item) => {
      itemQtyMap[item.item_name] = toInt(item.quantity);
    });

    const packages = (slot.packages || []).map((pkg) => ({
      id: pkg.id,
      slotId: slot.id,
      packageName: pkg.package_name,
      mealCategory: pkg.meal_category,
      categoryLabel: CATEGORY_LABEL[pkg.meal_category] || pkg.meal_category,
      imageUrl: toMealImageUrl(pkg.image_url),
      price: pkg.price,
      calories: pkg.calories,
      proteinG: pkg.protein_g,
      carbsG: pkg.carbs_g,
      fatG: pkg.fat_g,
      items: pkg.items || [],
      qty: itemQtyMap[pkg.package_name] || 0
    }));
    return {
      id: slot.id,
      mealType: slot.meal_type,
      isBreakfast: slot.meal_type === "breakfast",
      mealTypeLabel: MEAL_TYPE_LABEL[slot.meal_type] || slot.meal_type,
      bookingDeadline: slot.booking_deadline,
      deadlineText: formatDateTime(slot.booking_deadline),
      isOpen: slot.is_open,
      canBook,
      slotStatus,
      packages,
      selectedOrder: existingOrder
        ? {
            orderNo: existingOrder.order_no,
            status: ORDER_STATUS_LABEL[existingOrder.status] || existingOrder.status
          }
        : null
    };
  },

  onPackageImageError(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const packageIndex = Number(e.currentTarget.dataset.packageIndex);
    this.setData({
      [`slots[${slotIndex}].packages[${packageIndex}].imageUrl`]: DEFAULT_MEAL_IMAGE_LOCAL
    });
  },

  onDateChange(e) {
    this.setData({
      mealDate: e.detail.value
    });
    this.loadData({ force: true, silent: false });
  },

  onNoteInput(e) {
    const key = `slots[${e.currentTarget.dataset.slotIndex}].note`;
    this.setData({
      [key]: e.detail.value
    });
  },

  adjustQty(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const packageIndex = Number(e.currentTarget.dataset.packageIndex);
    const delta = Number(e.currentTarget.dataset.delta);
    const slot = this.data.slots[slotIndex];
    if (!slot || !slot.canBook) {
      return;
    }

    const current = toInt(slot.packages[packageIndex].qty);
    let next = current + delta;
    if (next < 0) {
      next = 0;
    }
    if (next > 99) {
      next = 99;
    }
    this.setData({
      [`slots[${slotIndex}].packages[${packageIndex}].qty`]: next
    });
  },

  async submitSlotOrder(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const slot = this.data.slots[slotIndex];
    if (!slot) {
      return;
    }
    if (!slot.canBook) {
      toast("该时段当前不可下单");
      return;
    }

    const selections = (slot.packages || [])
      .filter((pkg) => toInt(pkg.qty) > 0)
      .map((pkg) => ({
        package_id: pkg.id,
        quantity: toInt(pkg.qty)
      }));
    if (!selections.length) {
      toast("请先选择数量");
      return;
    }

    this.setData({
      placing: true,
      placingSlotId: slot.id
    });
    try {
      const order = await api.createOrder({
        slot_id: slot.id,
        selections,
        note: slot.note || null
      });
      toast(`下单成功：${order.order_no}`, "success");
      await this.loadData({ force: true, silent: false });
    } catch (err) {
      toast(err.message || "下单失败");
    } finally {
      this.setData({
        placing: false,
        placingSlotId: 0
      });
    }
  },

  logout() {
    const app = getApp();
    app.clearAuth();
    wx.reLaunch({
      url: "/pages/login/index"
    });
  },

  goProfile() {
    wx.switchTab({
      url: "/pages/profile/index"
    });
  },

  goManage() {
    wx.switchTab({
      url: "/pages/admin-stats/index"
    });
  }
});
