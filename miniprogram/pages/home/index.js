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

// 餐别 tab：早餐 / 中餐 / 晚餐
const MEAL_TAB_OPTIONS = [
  { label: "早餐", value: "breakfast" },
  { label: "中餐", value: "lunch" },
  { label: "晚餐", value: "dinner" }
];

// 分类 nav：普通套餐 / 减脂餐 / 自选菜
const CATEGORY_NAV_OPTIONS = [
  { label: "普通套餐", value: "normal" },
  { label: "减脂餐", value: "fat_loss" },
  { label: "自选菜", value: "self_pick" }
];

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
    canManage: false,
    // 新增：餐别 tab 与分类 nav
    mealTabs: MEAL_TAB_OPTIONS,
    activeMealIndex: 0,
    categoryNavs: CATEGORY_NAV_OPTIONS,
    activeCategoryIndex: 0,
    // 当前餐别对应的 slot（可能为 null：该日期未开放此餐别）
    activeSlot: null,
    // 当前餐别 + 当前分类过滤出的菜品
    activePackages: []
  },

  onLoad() {
    this._profileSyncedAt = 0;
    this._lastLoadedAt = 0;
    this._loadPromise = null;
  },

  onShow() {
    this.initAndLoad({ force: false, silent: true });
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
        this.refreshActiveView();
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
      unit: pkg.unit || "份",
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
    const pkgIndex = Number(e.currentTarget.dataset.packageIndex);
    if (Number.isNaN(pkgIndex)) {
      return;
    }
    this.setData({
      [`activePackages[${pkgIndex}].imageUrl`]: DEFAULT_MEAL_IMAGE_LOCAL
    });
  },

  // 根据 activeMealIndex 和 activeCategoryIndex 重新计算 activeSlot 和 activePackages
  refreshActiveView() {
    const mealType = MEAL_TAB_OPTIONS[this.data.activeMealIndex].value;
    const slot = this.data.slots.find((s) => s.mealType === mealType) || null;

    // 早餐没有分类概念，把所有菜品都归到 normal
    const isBreakfast = mealType === "breakfast";
    const targetCategory = isBreakfast
      ? "normal"
      : CATEGORY_NAV_OPTIONS[this.data.activeCategoryIndex].value;

    const packages = slot
      ? (slot.packages || []).filter((pkg) => {
          if (isBreakfast) {
            return true;
          }
          return (pkg.mealCategory || "normal") === targetCategory;
        })
      : [];

    this.setData({
      activeSlot: slot,
      activePackages: packages
    });
  },

  onMealTabChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx === this.data.activeMealIndex) {
      return;
    }
    this.setData({ activeMealIndex: idx });
    this.refreshActiveView();
  },

  onCategoryChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx === this.data.activeCategoryIndex) {
      return;
    }
    this.setData({ activeCategoryIndex: idx });
    this.refreshActiveView();
  },

  onDateChange(e) {
    this.setData({
      mealDate: e.detail.value
    });
    this.loadData({ force: true, silent: false });
  },

  onNoteInput(e) {
    // 留空：备注框已隐藏
  },

  // 数量调整：用 packageId 定位（因为列表是过滤后的）
  adjustQty(e) {
    if (!this.data.activeSlot || !this.data.activeSlot.canBook) {
      return;
    }
    const packageId = Number(e.currentTarget.dataset.packageId);
    const delta = Number(e.currentTarget.dataset.delta);
    if (!packageId || Number.isNaN(delta)) {
      return;
    }

    const slotIndex = this.data.slots.findIndex((s) => s.id === this.data.activeSlot.id);
    if (slotIndex < 0) {
      return;
    }
    const packages = this.data.slots[slotIndex].packages || [];
    const pkgIndex = packages.findIndex((p) => p.id === packageId);
    if (pkgIndex < 0) {
      return;
    }

    const current = toInt(packages[pkgIndex].qty);
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > 99) next = 99;

    // 同时更新 slots 和 activePackages
    const activePkgIndex = (this.data.activePackages || []).findIndex((p) => p.id === packageId);
    const updates = {
      [`slots[${slotIndex}].packages[${pkgIndex}].qty`]: next
    };
    if (activePkgIndex >= 0) {
      updates[`activePackages[${activePkgIndex}].qty`] = next;
    }
    this.setData(updates);
  },

  async submitSlotOrder() {
    const slot = this.data.activeSlot;
    if (!slot) {
      toast("当前日期暂无该餐别");
      return;
    }
    if (!slot.canBook) {
      toast("该时段当前不可下单");
      return;
    }

    // 必须从 slots 中读取完整的 packages（包括其他分类下被选中的菜品）
    const slotIndex = this.data.slots.findIndex((s) => s.id === slot.id);
    if (slotIndex < 0) {
      return;
    }
    const allPackages = this.data.slots[slotIndex].packages || [];

    const selections = allPackages
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
        note: null
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
    wx.navigateTo({
      url: "/pages/profile/index"
    });
  },

  goManage() {
    wx.navigateTo({
      url: "/pages/admin-stats/index"
    });
  }
});
