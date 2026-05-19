const ADMIN_TAB_ROLES = ["kitchen", "admin", "super_admin"];

const ALL_TABS = [
  { pagePath: "/pages/home/index", text: "订餐" },
  { pagePath: "/pages/profile/index", text: "我的" },
  { pagePath: "/pages/admin-stats/index", text: "管理", roles: ADMIN_TAB_ROLES }
];

function getCurrentRole() {
  let app = null;
  try {
    app = getApp();
  } catch (err) {
    app = null;
  }
  return (
    (app && app.globalData && app.globalData.profile && app.globalData.profile.role) ||
    "officer"
  );
}

function visibleTabsForRole(role) {
  return ALL_TABS.filter((tab) => !tab.roles || tab.roles.includes(role));
}

Component({
  data: {
    selected: 0,
    list: [],
    color: "#666666",
    selectedColor: "#0B2A4A"
  },

  lifetimes: {
    attached() {
      this.refresh();
    }
  },

  methods: {
    /**
     * Re-read the role and rebuild the tab list. Call from each tab page's
     * onShow with its own pagePath so the active item stays in sync.
     */
    refresh(selectedPath) {
      const role = getCurrentRole();
      const list = visibleTabsForRole(role);
      let selected = 0;
      if (selectedPath) {
        const idx = list.findIndex((tab) => tab.pagePath === selectedPath);
        if (idx >= 0) {
          selected = idx;
        }
      }
      this.setData({ list, selected });
    },

    onTap(e) {
      const path = e.currentTarget.dataset.path;
      if (!path) {
        return;
      }
      wx.switchTab({ url: path });
    }
  }
});
