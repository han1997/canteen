const api = require("../../services/api");
const { MEAL_TYPE_LABEL } = require("../../utils/constants");
const { addDays, formatDateTime, listDateStrings, todayString } = require("../../utils/date");
const { withPullDownRefresh } = require("../../utils/pull-refresh");

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
const STATUS_CLASS_UNKNOWN = "status-tag status-unknown";

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

function showConfirm(content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: "提示",
      content,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

Page({
  data: {
    fromDate: todayString(),
    toDate: addDays(todayString(), 6),
    orders: [],
    loading: false,
    cancelReason: "个人原因"
  },

  async onShow() {
    await this.ensureAuth();
    await this.loadOrders();
  },

  onPullDownRefresh: withPullDownRefresh("loadOrders"),

  async ensureAuth() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    if (!app.globalData.profile) {
      try {
        const profile = await api.getMe();
        app.setAuth(app.globalData.token, profile);
      } catch (err) {
        toast(err.message || "登录状态异常");
      }
    }
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  onReasonInput(e) {
    this.setData({
      cancelReason: e.detail.value
    });
  },

  validateDateRange() {
    if (this.data.fromDate > this.data.toDate) {
      toast("开始日期不能大于结束日期");
      return false;
    }
    return true;
  },

  async queryOrders() {
    if (!this.validateDateRange()) {
      return;
    }
    await this.loadOrders();
  },

  async buildSlotMap() {
    const dateList = listDateStrings(this.data.fromDate, this.data.toDate, 31);
    const requests = dateList.map((dateText) => api.getMealSlots(dateText).catch(() => []));
    const responses = await Promise.all(requests);
    const map = {};
    responses.forEach((slots) => {
      (slots || []).forEach((slot) => {
        const typeLabel = MEAL_TYPE_LABEL[slot.meal_type] || slot.meal_type;
        map[slot.id] = `${slot.meal_date} ${typeLabel}`;
      });
    });
    return map;
  },

  async loadOrders() {
    if (!this.validateDateRange()) {
      return;
    }

    this.setData({ loading: true });
    try {
      const [orders, slotMap] = await Promise.all([
        api.getMyOrders(this.data.fromDate, this.data.toDate),
        this.buildSlotMap()
      ]);
      const formatted = (orders || []).map((order) => ({
        id: order.id,
        orderNo: order.order_no,
        slotLabel: slotMap[order.slot_id] || `时段#${order.slot_id}`,
        status: order.status,
        statusLabel: STATUS_LABEL[order.status] || order.status,
        statusClass: STATUS_CLASS[order.status] || STATUS_CLASS_UNKNOWN,
        bookedAtText: formatDateTime(order.booked_at),
        verifiedAtText: formatDateTime(order.verified_at),
        items: order.items || [],
        canCancel: order.status === "booked"
      }));
      this.setData({
        orders: formatted
      });
    } catch (err) {
      toast(err.message || "加载订单失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  async cancelOrder(e) {
    const orderId = Number(e.currentTarget.dataset.orderId);
    const confirmed = await showConfirm("确认取消此订单吗？");
    if (!confirmed) {
      return;
    }
    try {
      await api.cancelOrder(orderId, this.data.cancelReason);
      toast("已取消", "success");
      await this.loadOrders();
    } catch (err) {
      toast(err.message || "取消失败");
    }
  }
});
