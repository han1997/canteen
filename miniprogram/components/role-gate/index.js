Component({
  properties: {
    roles: {
      type: Array,
      value: []
    },
    profile: {
      type: Object,
      value: null
    }
  },

  data: {
    allow: false
  },

  observers: {
    "roles, profile": function observer(roles, profile) {
      const userRole = profile && profile.role;
      this.setData({
        allow: Array.isArray(roles) && roles.includes(userRole)
      });
    }
  }
});
