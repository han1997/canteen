const api = require("../../services/api");
const { CATEGORY_LABEL, MEAL_TYPE_LABEL } = require("../../utils/constants");
const { formatDateTime, todayString } = require("../../utils/date");

const PRIVILEGED_ROLES = ["kitchen", "admin", "super_admin"];
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

  async onShow() {
    await this.initAndLoad();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async initAndLoad() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }

    let profile = app.globalData.profile;
    try {
      if (!profile) {
        profile = await api.getMe();
        app.setAuth(app.globalData.token, profile);
      }
      this.setData({
        profile,
        canManage: PRIVILEGED_ROLES.includes(profile.role)
      });
      await this.loadData();
    } catch (err) {
      toast(err.message || "加载用户信息失败");
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [slots, orders] = await Promise.all([
        api.getMealSlots(this.data.mealDate),
        api.getMyOrders(this.data.mealDate, this.data.mealDate)
      ]);
      const orderMap = {};
      (orders || []).forEach((order) => {
        orderMap[order.slot_id] = order;
      });
      const formattedSlots = (slots || []).map((slot) => this.formatSlot(slot, orderMap[slot.id]));
      this.setData({
        slots: formattedSlots
      });
    } catch (err) {
      toast(err.message || "加载订餐信息失败");
    } finally {
      this.setData({ loading: false });
    }
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

  onDateChange(e) {
    this.setData({
      mealDate: e.detail.value
    });
    this.loadData();
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
      await this.loadData();
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
