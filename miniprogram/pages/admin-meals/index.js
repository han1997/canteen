const api = require("../../services/api");
const { withPullDownRefresh } = require("../../utils/pull-refresh");
const { getApiBaseUrl } = require("../../config/env");
const { todayString, addDays } = require("../../utils/date");

const MANAGE_ROLES = ["kitchen", "admin", "super_admin"];
const MEAL_TYPES = [
  { label: "早餐", value: "breakfast" },
  { label: "午晚餐", value: "lunch_dinner" }
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

function emptyDraft(defaultMealTypes) {
  // defaultMealTypes: 默认勾选的餐别（取决于当前 tab）
  return {
    packageName: "",
    imageUrl: DEFAULT_MEAL_IMAGE_URL,
    imagePreviewUrl: toPreviewImageUrl(DEFAULT_MEAL_IMAGE_URL),
    priceInput: "",
    categoryIndex: 0,
    mealTypeCheckBreakfast: (defaultMealTypes || []).includes("breakfast"),
    mealTypeCheckLunch: (defaultMealTypes || []).includes("lunch"),
    mealTypeCheckDinner: (defaultMealTypes || []).includes("dinner")
  };
}

function formatPackage(pkg) {
  // 计算菜品适用的餐别标签
  const mealTypes = pkg.meal_types || [];
  let mealTypeLabel = "";
  const hasBreakfast = mealTypes.includes("breakfast");
  const hasLunch = mealTypes.includes("lunch");
  const hasDinner = mealTypes.includes("dinner");

  if (hasBreakfast && !hasLunch && !hasDinner) {
    mealTypeLabel = "早餐";
  } else if (hasLunch && hasDinner) {
    mealTypeLabel = "午晚餐";
  } else if (hasLunch) {
    mealTypeLabel = "中餐";
  } else if (hasDinner) {
    mealTypeLabel = "晚餐";
  }

  return {
    id: pkg.id,
    mealTypes: mealTypes,  // 数组形式存储
    mealTypeLabel: mealTypeLabel,
    // 默认在午晚餐 tab 中显示哪些菜品：包含 lunch 或 dinner 的
    isBreakfast: hasBreakfast,
    isLunchOrDinner: hasLunch || hasDinner,
    packageName: pkg.package_name,
    imageUrl: resolveImageUrl(pkg.image_url),
    imagePreviewUrl: toPreviewImageUrl(resolveImageUrl(pkg.image_url)),
    priceInput: String(pkg.price || 0),
    selectable: !!pkg.is_selectable,
    categoryIndex: categoryIndex(pkg.meal_category),
    // 餐别多选状态
    mealTypeCheckBreakfast: hasBreakfast,
    mealTypeCheckLunch: hasLunch,
    mealTypeCheckDinner: hasDinner
  };
}

Page({
  data: {
    allowed: false,
    loading: false,
    activeIndex: 0,
    mealTypes: MEAL_TYPES,
    packagesByType: { breakfast: [], lunch_dinner: [] },
    drafts: {
      breakfast: emptyDraft(["breakfast"]),
      lunch_dinner: emptyDraft(["lunch", "dinner"])
    },
    categoryLabels: CATEGORY_OPTIONS.map((item) => item.label),
    slotDayIndex: 0,
    slotDayTabs: [
      { label: "今天", date: todayString() },
      { label: "明天", date: addDays(todayString(), 1) }
    ],
    slotChips: [
      { mealType: "breakfast", label: "早餐", isOpen: false, slotId: null },
      { mealType: "lunch", label: "中餐", isOpen: false, slotId: null },
      { mealType: "dinner", label: "晚餐", isOpen: false, slotId: null }
    ],
    slotChipsByDate: {}
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
      await this.loadSlotChips();
    }
  },

  onPullDownRefresh: withPullDownRefresh(
    async function () {
      await this.ensureAccess();
      if (this.data.allowed) {
        await this.loadPackages();
        await this.loadSlotChips();
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

  // 根据当前 tab 推断默认勾选的餐别
  defaultMealTypesForTab(tab) {
    if (tab === "breakfast") return ["breakfast"];
    if (tab === "lunch_dinner") return ["lunch", "dinner"];
    return [];
  },

  // 从复选框状态收集已勾选的餐别
  collectCheckedMealTypes(pkg) {
    const result = [];
    if (pkg.mealTypeCheckBreakfast) result.push("breakfast");
    if (pkg.mealTypeCheckLunch) result.push("lunch");
    if (pkg.mealTypeCheckDinner) result.push("dinner");
    return result;
  },

  activeSlotDate() {
    const idx = this.data.slotDayIndex;
    const tab = this.data.slotDayTabs[idx] || this.data.slotDayTabs[0];
    return tab.date;
  },

  buildChipsForDate(date) {
    const cached = this.data.slotChipsByDate[date];
    if (cached) {
      return cached;
    }
    return [
      { mealType: "breakfast", label: "早餐", isOpen: false, slotId: null },
      { mealType: "lunch", label: "中餐", isOpen: false, slotId: null },
      { mealType: "dinner", label: "晚餐", isOpen: false, slotId: null }
    ];
  },

  async loadSlotChips() {
    const dates = this.data.slotDayTabs.map((t) => t.date);
    const slotChipsByDate = { ...this.data.slotChipsByDate };
    for (const date of dates) {
      try {
        const slots = await api.getAdminMealSlots(date);
        const slotByType = {};
        (slots || []).forEach((slot) => {
          slotByType[slot.meal_type] = slot;
        });
        const baseChips = [
          { mealType: "breakfast", label: "早餐" },
          { mealType: "lunch", label: "中餐" },
          { mealType: "dinner", label: "晚餐" }
        ];
        slotChipsByDate[date] = baseChips.map((chip) => {
          const slot = slotByType[chip.mealType];
          return {
            ...chip,
            isOpen: !!(slot && slot.is_open),
            slotId: slot ? slot.id : null
          };
        });
      } catch (err) {
        // 静默失败：开关不可用不影响菜品管理主功能
        if (!slotChipsByDate[date]) {
          slotChipsByDate[date] = this.buildChipsForDate(date);
        }
      }
    }
    this.setData({
      slotChipsByDate,
      slotChips: slotChipsByDate[this.activeSlotDate()] || this.buildChipsForDate(this.activeSlotDate())
    });
  },

  onSlotDayTabChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx === this.data.slotDayIndex) {
      return;
    }
    const tab = this.data.slotDayTabs[idx];
    if (!tab) {
      return;
    }
    this.setData({
      slotDayIndex: idx,
      slotChips: this.data.slotChipsByDate[tab.date] || this.buildChipsForDate(tab.date)
    });
  },

  async onToggleSlot(e) {
    const mealType = e.currentTarget.dataset.mealType;
    const isOpen = !!e.detail.value;
    const targetDate = this.activeSlotDate();
    const chipIndex = this.data.slotChips.findIndex((c) => c.mealType === mealType);
    if (chipIndex < 0) {
      return;
    }
    const chip = this.data.slotChips[chipIndex];

    try {
      if (chip.slotId) {
        await api.updateAdminMealSlotStatus(chip.slotId, isOpen);
      } else {
        await api.createOrUpdateAdminMealSlot({
          meal_date: targetDate,
          meal_type: mealType,
          is_open: isOpen
        });
      }
      toast(isOpen ? "已开放订餐" : "已停止订餐", "success");
      await this.loadSlotChips();
    } catch (err) {
      toast(err.message || "更新时段状态失败");
      await this.loadSlotChips();
    }
  },

  async loadPackages() {
    this.setData({ loading: true });
    try {
      const pkgs = await api.getAdminMealPackages();
      const grouped = { breakfast: [], lunch_dinner: [] };
      (pkgs || []).forEach((pkg) => {
        const formatted = formatPackage(pkg);
        // 早餐 tab：仅显示包含 breakfast 的菜品
        if (formatted.isBreakfast) {
          grouped.breakfast.push(formatted);
        }
        // 午晚餐 tab：显示包含 lunch 或 dinner 的菜品
        if (formatted.isLunchOrDinner) {
          grouped.lunch_dinner.push(formatted);
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

  onPackageMealTypeChange(e) {
    const pkgIndex = Number(e.currentTarget.dataset.pkgIndex);
    const mealType = this.activeMealType();
    const field = e.currentTarget.dataset.field;  // mealTypeCheckBreakfast/Lunch/Dinner
    this.setData({
      [`packagesByType.${mealType}[${pkgIndex}].${field}`]: !!e.detail.value
    });
  },

  onDraftMealTypeChange(e) {
    const mealType = this.activeMealType();
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`drafts.${mealType}.${field}`]: !!e.detail.value
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

    // 收集勾选的餐别
    const mealTypes = this.collectCheckedMealTypes(pkg);
    if (mealTypes.length === 0) {
      toast("请至少选择一个餐别");
      return;
    }

    const payload = {
      meal_types: mealTypes,
      package_name: pkg.packageName.trim(),
      image_url: resolveImageUrl(pkg.imageUrl),
      price,
      is_selectable: pkg.selectable
    };
    // 早餐外的餐别才传 category
    if (!(mealTypes.length === 1 && mealTypes[0] === "breakfast")) {
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

    // 收集勾选的餐别
    const mealTypes = this.collectCheckedMealTypes(draft);
    if (mealTypes.length === 0) {
      toast("请至少选择一个餐别");
      return;
    }

    const payload = {
      meal_types: mealTypes,
      package_name: name,
      image_url: resolveImageUrl(draft.imageUrl),
      price
    };
    if (!(mealTypes.length === 1 && mealTypes[0] === "breakfast")) {
      payload.meal_category = CATEGORY_OPTIONS[draft.categoryIndex].value;
    }

    try {
      await api.createAdminMealPackage(payload);
      toast("菜品已新增", "success");
      this.setData({
        [`drafts.${mealType}`]: emptyDraft(this.defaultMealTypesForTab(mealType))
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

  bulkImport() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["xlsx", "xls"],
      success: async (res) => {
        if (!res.tempFiles || !res.tempFiles.length) {
          toast("未选择文件");
          return;
        }
        const filePath = res.tempFiles[0].path;
        wx.showLoading({ title: "导入中...", mask: true });
        try {
          const result = await api.bulkImportMealPackages(filePath);
          wx.hideLoading();
          const msg = `导入完成：新增 ${result.created} 个菜品，跳过 ${result.skipped} 个${
            result.errors.length ? `，${result.errors.length} 条错误` : ""
          }`;
          wx.showModal({
            title: "批量导入结果",
            content: msg + (result.errors.length ? `\n\n${result.errors.slice(0, 3).join("\n")}` : ""),
            showCancel: false
          });
          await this.loadPackages();
        } catch (err) {
          wx.hideLoading();
          toast(err.message || "批量导入失败");
        }
      },
      fail: () => {
        toast("选择文件失败");
      }
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
