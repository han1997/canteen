const { request } = require("./request");
const { getApiBaseUrl } = require("../config/env");

function login(payload) {
  return request({
    url: "/auth/login",
    method: "POST",
    data: payload,
    auth: false
  });
}

function wechatBind(payload) {
  return request({
    url: "/auth/wechat-bind",
    method: "POST",
    data: payload,
    auth: false
  });
}

function getMe() {
  return request({
    url: "/auth/me"
  });
}

function changePassword(payload) {
  return request({
    url: "/auth/change-password",
    method: "POST",
    data: payload
  });
}

function getMealSlots(mealDate) {
  return request({
    url: "/meals/slots",
    query: {
      meal_date: mealDate
    }
  });
}

function createOrder(payload) {
  return request({
    url: "/orders",
    method: "POST",
    data: payload
  });
}

function getMyOrders(fromDate, toDate) {
  return request({
    url: "/orders/my",
    query: {
      from_date: fromDate,
      to_date: toDate
    }
  });
}

function cancelOrder(orderId, reason) {
  return request({
    url: `/orders/${orderId}/cancel`,
    method: "POST",
    data: {
      reason: reason || null
    }
  });
}

function listAdminUsers(keyword) {
  return request({
    url: "/admin/users",
    query: {
      keyword
    }
  });
}

function createAdminUser(payload) {
  return request({
    url: "/admin/users",
    method: "POST",
    data: payload
  });
}

function updateAdminUserRole(userId, role) {
  return request({
    url: `/admin/users/${userId}/role`,
    method: "PATCH",
    data: {
      role
    }
  });
}

function updateAdminUserStatus(userId, status) {
  return request({
    url: `/admin/users/${userId}/status`,
    method: "PATCH",
    data: {
      status
    }
  });
}

function getTodayDashboard(targetDate) {
  return request({
    url: "/admin/dashboard/today",
    query: {
      target_date: targetDate
    }
  });
}

function getAdminMealSlots(mealDate) {
  return request({
    url: "/admin/meal-slots",
    query: {
      meal_date: mealDate
    }
  });
}

function createOrUpdateAdminMealSlot(payload) {
  return request({
    url: "/admin/meal-slots",
    method: "POST",
    data: payload
  });
}

function updateAdminMealSlotStatus(slotId, isOpen) {
  return request({
    url: `/admin/meal-slots/${slotId}/status`,
    method: "PATCH",
    data: {
      is_open: !!isOpen
    }
  });
}

function createAdminMealPackage(slotId, payload) {
  return request({
    url: `/admin/meal-slots/${slotId}/packages`,
    method: "POST",
    data: payload
  });
}

function updateAdminMealPackage(packageId, payload) {
  return request({
    url: `/admin/meal-packages/${packageId}`,
    method: "PATCH",
    data: payload
  });
}

function deleteAdminMealPackage(packageId) {
  return request({
    url: `/admin/meal-packages/${packageId}`,
    method: "DELETE"
  });
}

function uploadAdminMealImage(filePath) {
  const app = getApp();
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync("token") || "";
  const baseUrl =
    (app && app.globalData && app.globalData.apiBaseUrl) || getApiBaseUrl();
  const normalizedBaseUrl = String(baseUrl).replace(/\/$/, "");

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${normalizedBaseUrl}/admin/uploads/meal-image`,
      filePath,
      name: "image",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        let payload = null;
        try {
          payload = JSON.parse(res.data || "{}");
        } catch (err) {
          reject(new Error("上传返回格式异常"));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && payload && payload.image_url) {
          resolve(payload.image_url);
          return;
        }
        reject(new Error((payload && (payload.detail || payload.message)) || "上传图片失败"));
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || "上传图片失败"));
      }
    });
  });
}

function downloadExportFile(jobNo) {
  const app = getApp();
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync("token") || "";
  const baseUrl =
    (app && app.globalData && app.globalData.apiBaseUrl) || getApiBaseUrl();
  const normalizedBaseUrl = String(baseUrl).replace(/\/$/, "");

  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${normalizedBaseUrl}/stats/export/${encodeURIComponent(jobNo)}/download`,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`下载失败（${res.statusCode}）`));
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || "下载失败"));
      }
    });
  });
}

function getStatsSummary(fromDate, toDate) {
  return request({
    url: "/stats/summary",
    query: {
      from_date: fromDate,
      to_date: toDate
    }
  });
}

function getBreakfastItemStats(fromDate, toDate) {
  return request({
    url: "/stats/breakfast-items",
    query: {
      from_date: fromDate,
      to_date: toDate
    }
  });
}

function exportStats(payload) {
  return request({
    url: "/stats/export",
    method: "POST",
    data: payload
  });
}

function getExportJob(jobNo) {
  return request({
    url: `/stats/export/${jobNo}`
  });
}

module.exports = {
  login,
  wechatBind,
  getMe,
  changePassword,
  getMealSlots,
  createOrder,
  getMyOrders,
  cancelOrder,
  listAdminUsers,
  createAdminUser,
  updateAdminUserRole,
  updateAdminUserStatus,
  getTodayDashboard,
  getAdminMealSlots,
  createOrUpdateAdminMealSlot,
  updateAdminMealSlotStatus,
  createAdminMealPackage,
  updateAdminMealPackage,
  deleteAdminMealPackage,
  uploadAdminMealImage,
  getStatsSummary,
  getBreakfastItemStats,
  exportStats,
  getExportJob,
  downloadExportFile
};
