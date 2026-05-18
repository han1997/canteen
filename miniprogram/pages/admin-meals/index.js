const api = require("../../services/api");
const { todayString } = require("../../utils/date");
const { getApiBaseUrl } = require("../../config/env");

const MANAGE_ROLES = ["kitchen", "admin", "super_admin"];
const MEAL_TYPES = [
  { label: "早餐", value: "breakfast" },
  { label: "中餐", value: "lunch" },
  { label: "晚餐", value: "dinner" }
];
const CATEGORY_OPTIONS = [
  { label: "普通套餐", value: "normal" },
  { label: "减脂套餐", value: "fat_loss" }
];
const DEFAULT_API_BASE_URL = getApiBaseUrl();
const DEFAULT_MEAL_IMAGE_LOCAL = "/assets/default-meal.png";
const DEFAULT_MEAL_IMAGE_URL = "/static/default-meal.png";
const UPLOAD_IMAGE_EDGE = 960;
const UPLOAD_IMAGE_QUALITY = 76;

function toast(title, icon) {
  wx.showToast({
    title,
    icon: icon || "none"
  });
}

function categoryIndex(category) {
  const idx = CATEGORY_OPTIONS.findIndex((item) => item.value === category);
  return idx >= 0 ? idx : 0;
}

function resolveImageUrl(url) {
  if (!url) {
    return DEFAULT_MEAL_IMAGE_URL;
  }
  return url;
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

function toPreviewImageUrl(url) {
  if (!url) {
    return DEFAULT_MEAL_IMAGE_LOCAL;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith("/static/")) {
    return `${getApiOrigin()}${url}`;
  }
  return url;
}

function chooseImageFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: (res) => {
        const filePath = res && res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : "";
        if (!filePath) {
          reject(new Error("未选择图片"));
          return;
        }
        resolve(filePath);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

function compressImageFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      compressedWidth: UPLOAD_IMAGE_EDGE,
      compressedHeight: UPLOAD_IMAGE_EDGE,
      quality: UPLOAD_IMAGE_QUALITY,
      success: (res) => {
        resolve((res && res.tempFilePath) || filePath);
      },
      fail: () => {
        resolve(filePath);
      }
    });
  });
}

Page({
  data: {
    allowed: false,
    loading: false,
    mealDate: todayString(),
    slots: [],
    categoryLabels: CATEGORY_OPTIONS.map((item) => item.label)
  },

  async onShow() {
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadSlots();
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
      allowed: MANAGE_ROLES.includes(profile.role)
    });
  },

  formatSlots(slots) {
    return (slots || []).map((slot) => ({
      id: slot.id,
      mealType: slot.meal_type,
      mealTypeLabel: MEAL_TYPES.find((item) => item.value === slot.meal_type)?.label || slot.meal_type,
      isBreakfast: slot.meal_type === "breakfast",
      isOpen: !!slot.is_open,
      bookingDeadline: slot.booking_deadline,
      packages: (slot.packages || []).map((pkg) => ({
        id: pkg.id,
        packageName: pkg.package_name,
        imageUrl: resolveImageUrl(pkg.image_url),
        imagePreviewUrl: toPreviewImageUrl(resolveImageUrl(pkg.image_url)),
        priceInput: String(pkg.price || 0),
        selectable: !!pkg.is_selectable,
        categoryIndex: categoryIndex(pkg.meal_category)
      })),
      draft: {
        packageName: "",
        imageUrl: DEFAULT_MEAL_IMAGE_URL,
        imagePreviewUrl: toPreviewImageUrl(DEFAULT_MEAL_IMAGE_URL),
        priceInput: "",
        categoryIndex: 0
      }
    }));
  },

  async loadSlots() {
    this.setData({ loading: true });
    try {
      const slots = await api.getAdminMealSlots(this.data.mealDate);
      this.setData({
        slots: this.formatSlots(slots)
      });
    } catch (err) {
      toast(err.message || "加载菜品失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  onDateChange(e) {
    this.setData({
      mealDate: e.detail.value
    });
    this.loadSlots();
  },

  async createSlot(e) {
    const mealType = e.currentTarget.dataset.mealType;
    try {
      await api.createOrUpdateAdminMealSlot({
        meal_date: this.data.mealDate,
        meal_type: mealType,
        is_open: true
      });
      toast("时段已发布", "success");
      await this.loadSlots();
    } catch (err) {
      toast(err.message || "发布时段失败");
    }
  },

  async onSlotOpenChange(e) {
    const slotId = Number(e.currentTarget.dataset.slotId);
    const isOpen = !!e.detail.value;
    try {
      await api.updateAdminMealSlotStatus(slotId, isOpen);
      toast(isOpen ? "已开放订餐" : "已停止订餐", "success");
      await this.loadSlots();
    } catch (err) {
      toast(err.message || "更新时段状态失败");
    }
  },

  onPackageInput(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`slots[${slotIndex}].packages[${pkgIndex}].${field}`]: e.detail.value
    });
  },

  onPackageSelectableChange(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    this.setData({
      [`slots[${slotIndex}].packages[${pkgIndex}].selectable`]: !!e.detail.value
    });
  },

  onPackageCategoryChange(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    this.setData({
      [`slots[${slotIndex}].packages[${pkgIndex}].categoryIndex`]: Number(e.detail.value)
    });
  },

  async savePackage(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const slot = this.data.slots[slotIndex];
    const pkg = slot.packages[pkgIndex];
    const price = Number(pkg.priceInput || 0);
    if (!pkg.packageName.trim()) {
      toast("菜品名称不能为空");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      toast("价格不合法");
      return;
    }

    const payload = {
      package_name: pkg.packageName.trim(),
      image_url: resolveImageUrl(pkg.imageUrl),
      price,
      is_selectable: pkg.selectable
    };
    if (!slot.isBreakfast) {
      payload.meal_category = CATEGORY_OPTIONS[pkg.categoryIndex].value;
    }

    try {
      await api.updateAdminMealPackage(pkg.id, payload);
      toast("菜品已更新", "success");
      await this.loadSlots();
    } catch (err) {
      toast(err.message || "更新菜品失败");
    }
  },

  onDraftInput(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`slots[${slotIndex}].draft.${field}`]: e.detail.value
    });
  },

  onDraftCategoryChange(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    this.setData({
      [`slots[${slotIndex}].draft.categoryIndex`]: Number(e.detail.value)
    });
  },

  async addPackage(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const slot = this.data.slots[slotIndex];
    const draft = slot.draft;
    const name = draft.packageName.trim();
    const price = Number(draft.priceInput || 0);
    if (!name) {
      toast("请填写菜品名称");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      toast("价格不合法");
      return;
    }

    const payload = {
      package_name: name,
      image_url: resolveImageUrl(draft.imageUrl),
      price
    };
    if (!slot.isBreakfast) {
      payload.meal_category = CATEGORY_OPTIONS[draft.categoryIndex].value;
    }

    try {
      await api.createAdminMealPackage(slot.id, payload);
      toast("菜品已新增", "success");
      await this.loadSlots();
    } catch (err) {
      toast(err.message || "新增菜品失败");
    }
  },

  async choosePackageImage(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    try {
      const filePath = await chooseImageFile();
      const compressedPath = await compressImageFile(filePath);
      wx.showLoading({ title: "上传中" });
      const imageUrl = await api.uploadAdminMealImage(compressedPath);
      this.setData({
        [`slots[${slotIndex}].packages[${pkgIndex}].imageUrl`]: imageUrl,
        [`slots[${slotIndex}].packages[${pkgIndex}].imagePreviewUrl`]: toPreviewImageUrl(imageUrl)
      });
      toast("图片已上传", "success");
    } catch (err) {
      if (err && err.errMsg && String(err.errMsg).includes("cancel")) {
        return;
      }
      toast(err.message || "上传图片失败");
    } finally {
      wx.hideLoading();
    }
  },

  async chooseDraftImage(e) {
    const slotIndex = Number(e.currentTarget.dataset.slotIndex);
    try {
      const filePath = await chooseImageFile();
      const compressedPath = await compressImageFile(filePath);
      wx.showLoading({ title: "上传中" });
      const imageUrl = await api.uploadAdminMealImage(compressedPath);
      this.setData({
        [`slots[${slotIndex}].draft.imageUrl`]: imageUrl,
        [`slots[${slotIndex}].draft.imagePreviewUrl`]: toPreviewImageUrl(imageUrl)
      });
      toast("图片已上传", "success");
    } catch (err) {
      if (err && err.errMsg && String(err.errMsg).includes("cancel")) {
        return;
      }
      toast(err.message || "上传图片失败");
    } finally {
      wx.hideLoading();
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
