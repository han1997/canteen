const api = require("../../services/api");
const { withPullDownRefresh } = require("../../utils/pull-refresh");
const { getApiBaseUrl } = require("../../config/env");
const { todayString } = require("../../utils/date");

const MANAGE_ROLES = ["kitchen", "admin", "super_admin"];
const MEAL_TYPES = [
  { label: "早餐", value: "breakfast" },
  { label: "中餐", value: "lunch" },
  { label: "晚餐", value: "dinner" }
];
const CATEGORY_OPTIONS = [
  { label: "普通套餐", value: "normal" },
  { label: "减脂套餐", value: "fat_loss" },
  { label: "自选菜", value: "self_pick" }
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

function emptyDraft() {
  return {
    packageName: "",
    imageUrl: DEFAULT_MEAL_IMAGE_URL,
    imagePreviewUrl: toPreviewImageUrl(DEFAULT_MEAL_IMAGE_URL),
    priceInput: "",
    categoryIndex: 0
  };
}

function formatPackage(pkg) {
  return {
    id: pkg.id,
    mealType: pkg.meal_type,
    packageName: pkg.package_name,
    imageUrl: resolveImageUrl(pkg.image_url),
    imagePreviewUrl: toPreviewImageUrl(resolveImageUrl(pkg.image_url)),
    priceInput: String(pkg.price || 0),
    selectable: !!pkg.is_selectable,
    categoryIndex: categoryIndex(pkg.meal_category)
  };
}

Page({
  data: {
    allowed: false,
    loading: false,
    activeIndex: 0,
    mealTypes: MEAL_TYPES,
    packagesByType: { breakfast: [], lunch: [], dinner: [] },
    drafts: {
      breakfast: emptyDraft(),
      lunch: emptyDraft(),
      dinner: emptyDraft()
    },
    categoryLabels: CATEGORY_OPTIONS.map((item) => item.label),
    todayDate: todayString(),
    todaySlotChips: [
      { mealType: "breakfast", label: "早餐", isOpen: false, slotId: null },
      { mealType: "lunch", label: "中餐", isOpen: false, slotId: null },
      { mealType: "dinner", label: "晚餐", isOpen: false, slotId: null }
    ]
  },

  async onShow() {
    // Suppress refresh when returning from system media picker — otherwise the
    // in-progress draft form (name / price) gets wiped by a server reload.
    if (this._pickingImage) {
      return;
    }
    await this.ensureAccess();
    if (this.data.allowed) {
      await this.loadPackages();
      await this.loadTodaySlots();
    }
  },

  onPullDownRefresh: withPullDownRefresh(
    async function () {
      await this.ensureAccess();
      if (this.data.allowed) {
        await this.loadPackages();
        await this.loadTodaySlots();
      }
    },
    { guard() { return !!this._pickingImage; } }
  ),

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

  activeMealType() {
    return MEAL_TYPES[this.data.activeIndex].value;
  },

  async loadTodaySlots() {
    try {
      const slots = await api.getAdminMealSlots(this.data.todayDate);
      const slotByType = {};
      (slots || []).forEach((slot) => {
        slotByType[slot.meal_type] = slot;
      });
      const chips = this.data.todaySlotChips.map((chip) => {
        const slot = slotByType[chip.mealType];
        return {
          ...chip,
          isOpen: !!(slot && slot.is_open),
          slotId: slot ? slot.id : null
        };
      });
      this.setData({ todaySlotChips: chips });
    } catch (err) {
      // 静默失败：今日时段开关不可用不影响菜品管理主功能
    }
  },

  async onToggleTodaySlot(e) {
    const mealType = e.currentTarget.dataset.mealType;
    const isOpen = !!e.detail.value;
    const chipIndex = this.data.todaySlotChips.findIndex((c) => c.mealType === mealType);
    if (chipIndex < 0) {
      return;
    }
    const chip = this.data.todaySlotChips[chipIndex];

    try {
      if (chip.slotId) {
        await api.updateAdminMealSlotStatus(chip.slotId, isOpen);
      } else {
        // 今日还没有这餐次的 slot，先创建并直接设为期望状态
        await api.createOrUpdateAdminMealSlot({
          meal_date: this.data.todayDate,
          meal_type: mealType,
          is_open: isOpen
        });
      }
      toast(isOpen ? "已开放订餐" : "已停止订餐", "success");
      await this.loadTodaySlots();
    } catch (err) {
      toast(err.message || "更新时段状态失败");
      // 回退 UI 到服务端真实状态
      await this.loadTodaySlots();
    }
  },

  async loadPackages() {
    this.setData({ loading: true });
    try {
      const pkgs = await api.getAdminMealPackages();
      const grouped = { breakfast: [], lunch: [], dinner: [] };
      (pkgs || []).forEach((pkg) => {
        if (grouped[pkg.meal_type]) {
          grouped[pkg.meal_type].push(formatPackage(pkg));
        }
      });
      this.setData({ packagesByType: grouped });
    } catch (err) {
      toast(err.message || "加载菜品失败");
    } finally {
      this.setData({ loading: false });
    }
  },

  onTabChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx === this.data.activeIndex) {
      return;
    }
    this.setData({ activeIndex: idx });
  },

  onPackageInput(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const field = e.currentTarget.dataset.field;
    const mealType = this.activeMealType();
    this.setData({
      [`packagesByType.${mealType}[${pkgIndex}].${field}`]: e.detail.value
    });
  },

  onPackageSelectableChange(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    this.setData({
      [`packagesByType.${mealType}[${pkgIndex}].selectable`]: !!e.detail.value
    });
  },

  onPackageCategoryChange(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    this.setData({
      [`packagesByType.${mealType}[${pkgIndex}].categoryIndex`]: Number(e.detail.value)
    });
  },

  async savePackage(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    const pkg = this.data.packagesByType[mealType][pkgIndex];
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
    if (mealType !== "breakfast") {
      payload.meal_category = CATEGORY_OPTIONS[pkg.categoryIndex].value;
    }

    try {
      await api.updateAdminMealPackage(pkg.id, payload);
      toast("菜品已更新", "success");
      await this.loadPackages();
    } catch (err) {
      toast(err.message || "更新菜品失败");
    }
  },

  async deletePackage(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    const pkg = this.data.packagesByType[mealType][pkgIndex];
    if (!pkg) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "删除菜品",
        content: `确认删除“${pkg.packageName}”吗？\n未核销的相关订单会被自动取消。`,
        confirmColor: "#b42318",
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) {
      return;
    }

    try {
      await api.deleteAdminMealPackage(pkg.id);
      toast("菜品已删除", "success");
      await this.loadPackages();
    } catch (err) {
      toast(err.message || "删除菜品失败");
    }
  },

  onDraftInput(e) {
    const field = e.currentTarget.dataset.field;
    const mealType = this.activeMealType();
    this.setData({
      [`drafts.${mealType}.${field}`]: e.detail.value
    });
  },

  onDraftCategoryChange(e) {
    const mealType = this.activeMealType();
    this.setData({
      [`drafts.${mealType}.categoryIndex`]: Number(e.detail.value)
    });
  },

  async addPackage() {
    const mealType = this.activeMealType();
    const draft = this.data.drafts[mealType];
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
      meal_type: mealType,
      package_name: name,
      image_url: resolveImageUrl(draft.imageUrl),
      price
    };
    if (mealType !== "breakfast") {
      payload.meal_category = CATEGORY_OPTIONS[draft.categoryIndex].value;
    }

    try {
      await api.createAdminMealPackage(payload);
      toast("菜品已新增", "success");
      this.setData({
        [`drafts.${mealType}`]: emptyDraft()
      });
      await this.loadPackages();
    } catch (err) {
      toast(err.message || "新增菜品失败");
    }
  },

  async choosePackageImage(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    this._pickingImage = true;
    try {
      const filePath = await chooseImageFile();
      const compressedPath = await compressImageFile(filePath);
      wx.showLoading({ title: "上传中" });
      const imageUrl = await api.uploadAdminMealImage(compressedPath);
      this.setData({
        [`packagesByType.${mealType}[${pkgIndex}].imageUrl`]: imageUrl,
        [`packagesByType.${mealType}[${pkgIndex}].imagePreviewUrl`]: toPreviewImageUrl(imageUrl)
      });
      toast("图片已上传", "success");
    } catch (err) {
      if (err && err.errMsg && String(err.errMsg).includes("cancel")) {
        return;
      }
      toast(err.message || "上传图片失败");
    } finally {
      wx.hideLoading();
      this._pickingImage = false;
    }
  },

  async chooseDraftImage() {
    const mealType = this.activeMealType();
    this._pickingImage = true;
    try {
      const filePath = await chooseImageFile();
      const compressedPath = await compressImageFile(filePath);
      wx.showLoading({ title: "上传中" });
      const imageUrl = await api.uploadAdminMealImage(compressedPath);
      this.setData({
        [`drafts.${mealType}.imageUrl`]: imageUrl,
        [`drafts.${mealType}.imagePreviewUrl`]: toPreviewImageUrl(imageUrl)
      });
      toast("图片已上传", "success");
    } catch (err) {
      if (err && err.errMsg && String(err.errMsg).includes("cancel")) {
        return;
      }
      toast(err.message || "上传图片失败");
    } finally {
      wx.hideLoading();
      this._pickingImage = false;
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
