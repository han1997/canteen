/**
 * Build an onPullDownRefresh handler that calls `refresh` on the page instance
 * and always stops the pull-down spinner, even when refresh throws.
 *
 * @param {string|Function} refresh - method name on the Page, or a function bound to `this`.
 * @param {Object} [options]
 * @param {Function} [options.guard] - optional predicate (bound to Page) that returns truthy to skip refresh.
 */
function withPullDownRefresh(refresh, options) {
  const guard = options && options.guard;
  return async function onPullDownRefresh() {
    try {
      if (typeof guard === "function" && guard.call(this)) {
        return;
      }
      const fn = typeof refresh === "function" ? refresh : this[refresh];
      if (typeof fn === "function") {
        await fn.call(this);
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  };
}

module.exports = {
  withPullDownRefresh
};
