---
name: "公安食堂订餐"
description: "A restrained mobile product system for internal canteen ordering, kitchen operations, and administrative control."
colors:
  bg: "#f5f7f8"
  surface: "#ffffff"
  surface-alt: "#f9fafb"
  primary: "#0f5f9f"
  primary-dark: "#0b2a4a"
  primary-soft: "#dbeafe"
  primary-line: "#93c5fd"
  accent: "#ed8936"
  accent-soft: "#fef3c7"
  text: "#1f2937"
  text-secondary: "#4b5563"
  text-muted: "#9ca3af"
  border: "#e5e7eb"
  divider: "#f1f3f5"
  success: "#10b981"
  success-soft: "#d1fae5"
  warning: "#f59e0b"
  warning-soft: "#fef3c7"
  danger: "#ef4444"
  danger-soft: "#fee2e2"
  info: "#3b82f6"
  info-soft: "#dbeafe"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Source Han Sans SC, Noto Sans CJK SC, sans-serif"
    fontSize: "32rpx"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.5rpx"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Source Han Sans SC, Noto Sans CJK SC, sans-serif"
    fontSize: "28rpx"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Source Han Sans SC, Noto Sans CJK SC, sans-serif"
    fontSize: "24rpx"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  sm: "10rpx"
  md: "16rpx"
  lg: "20rpx"
  xl: "28rpx"
  pill: "999rpx"
spacing:
  xs: "8rpx"
  sm: "12rpx"
  md: "16rpx"
  lg: "24rpx"
  xl: "28rpx"
  screen: "24rpx"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "84rpx"
    padding: "0 24rpx"
  button-subtle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: "80rpx"
    padding: "0 24rpx"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "84rpx"
    padding: "0 24rpx"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "28rpx"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "84rpx"
    padding: "0 24rpx"
  status-tag:
    backgroundColor: "{colors.divider}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "10rpx 16rpx"
---

# Design System: 公安食堂订餐

## 1. Overview

**Creative North Star: "The Service Desk"**

This system should feel like a calm internal service counter: orderly enough for administrative trust, fast enough for daily meal decisions, and warm enough to belong to a canteen rather than a command console. The visual language is restrained product UI: cool gray background, white operational surfaces, 公安蓝 authority color, amber meal hints, and compact mobile controls.

The product must feel 稳重、清晰、高效. It explicitly rejects internet marketing style, overly playful consumer app treatment, and outdated government system aesthetics. Familiar mobile patterns are not a compromise here; they are the reason officers, kitchen staff, and administrators can complete work without pausing to interpret the interface.

**Key Characteristics:**
- Restrained, role-aware, mobile-first product interface.
- 公安蓝 used for authority, current selection, and primary action only.
- White cards and cool gray backgrounds create separation without visual noise.
- Status, cutoff, export, and permission states are shown in plain Chinese and consistent color roles.
- Dense admin views are acceptable when hierarchy makes scanning faster.

## 2. Colors

The palette is a restrained operational police-blue system with cool neutral surfaces and limited semantic color for status.

### Primary
- **Police Blue**: The primary action and selection color. Use for submit buttons, active tabs, active categories, selected meal cards, and admin controls that commit the normal path.
- **Command Navy**: The high-authority text color for totals, prices, selected controls, and blue-on-light surfaces.
- **Soft Police Blue**: The selected surface and positive context background. Use it behind current orders, selected meals, role pickers, and enabled slot chips.
- **Police Line Blue**: The low-emphasis border for secondary buttons and soft blue controls.

### Secondary
- **Meal Amber**: The warm accent for food-specific hints and deadline notes. It should appear sparingly; it is a helper color, not a brand color.

### Tertiary
- **System Blue**: Informational order state.
- **System Red**: Destructive actions, stopped slots, cancellation, and serious errors.
- **System Emerald**: Verified, successful, or open states when police blue would create ambiguity.

### Neutral
- **Intranet Mist**: Page background. It keeps screens quiet and separates white operational panels.
- **Work Surface**: Default card, input, and control surface.
- **Raised Work Surface**: Secondary panel surface for job cards, add forms, and low-priority grouped content.
- **Ink**: Primary text for names, order numbers, titles, and form values.
- **Secondary Ink**: Supporting copy, labels, and non-primary metadata.
- **Muted Ink**: Empty states, hints, and lower-priority metadata.
- **Quiet Border**: Card, input, and secondary control outline.
- **Hairline Divider**: Internal list dividers and segmented-control wells.

### Named Rules

**The One Authority Rule.** Police Blue is reserved for the current task path: primary action, selected state, and admin authority. Do not use it as decoration.

**The Warmth Limit Rule.** Meal Amber appears only where it clarifies food, deadline, or caution context. It must not become a general accent system.

**The No Marketing Gradient Rule.** Gradients may appear only on compact app headers already present in the mini-program. Never use them as promotional hero treatment, decorative backgrounds, or attention grabbing banners.

## 3. Typography

**Display Font:** None.
**Body Font:** System Chinese sans stack: `-apple-system`, `BlinkMacSystemFont`, `PingFang SC`, `Source Han Sans SC`, `Noto Sans CJK SC`, `sans-serif`.
**Label/Mono Font:** Same family.

**Character:** Typography is native, practical, and compact. It should read like a dependable WeChat utility, not a campaign page.

### Hierarchy

- **Title** (700, 32rpx, 1.25): Section titles such as 订餐主页, 管理中心, 今日看板, and 菜品管理.
- **Emphasis Title** (700-800, 40rpx, 1.15): Login brand title and numeric metrics only. Use sparingly.
- **Body** (400, 28rpx, 1.45): Main form values, body labels, dish names, and order information.
- **Dense Label** (600-700, 24-26rpx, 1.3): Buttons, tabs, picker chips, status details, and admin row labels.
- **Tiny Status** (600, 20-22rpx, 1.2): Compact slot state, badges, and metadata where space is tight.

### Named Rules

**The Native Utility Rule.** Use one system sans stack everywhere. Do not introduce display fonts, ornamental numerals, or type pairings for flavor.

**The Plain Chinese Rule.** Labels must be direct and operational: 提交本时段订单, 执行导出, 停止订餐, 保存菜品. Avoid promotional phrases and clever copy.

## 4. Elevation

Elevation is quiet and structural. Most separation comes from white surfaces on a mist background, 1rpx borders, rounded corners, and small shadows. Shadows should never become dramatic; this product earns trust through clarity, not depth effects.

### Shadow Vocabulary

- **Surface Rest** (`0 2rpx 8rpx rgba(15, 23, 42, 0.04)`): Default card and meal row shadow.
- **Control Lift** (`0 4rpx 12rpx rgba(15, 95, 159, 0.18)`): Primary button and selected pill lift.
- **Panel Lift** (`0 8rpx 24rpx rgba(15, 23, 42, 0.06)`): Secondary panels that need stronger grouping.
- **Header Lift** (`0 16rpx 40rpx rgba(15, 23, 42, 0.08)`): Reserved for top identity cards or major admin headers.

### Named Rules

**The Border First Rule.** Use borders and tonal surfaces before adding stronger shadows. If a shadow is noticeable before the content is read, it is too strong.

## 5. Components

### Buttons

- **Shape:** Moderately rounded controls (`16rpx`) with pill shape (`999rpx`) only for tabs, compact filters, and header utilities.
- **Primary:** Police Blue background with white text, 600 weight, and low blue lift. Use for the single main action in a block: 登录, 提交本时段订单, 保存菜品, 执行导出.
- **Secondary:** White or soft blue surface, Police Blue text, and Police Line Blue border. Use for navigation, upload, refresh, and supporting actions.
- **Danger:** System Red background with white text for destructive actions such as 删除菜品 and logout where consequence is clear.
- **Disabled:** Cool gray surface with white or muted text, no shadow, and no opacity fade.

### Chips

- **Style:** Compact pills with 20-26rpx text. Soft Police Blue chips indicate selected or enabled states; red soft chips indicate stopped or destructive state; blue semantic chips indicate informational state.
- **State:** Selected chips change both fill and text weight. Do not rely on color alone when the chip represents open, stopped, verified, cancelled, or unavailable state.

### Cards / Containers

- **Corner Style:** Operational cards use `20rpx`; large identity cards may use `28rpx`.
- **Background:** White for main work, Raised Work Surface for nested job blocks or add forms.
- **Shadow Strategy:** Default to Surface Rest. Increase only for page-level headers.
- **Border:** 1rpx Quiet Border on cards and rows.
- **Internal Padding:** Use 24-28rpx for general cards, 14-18rpx for dense row cards, and 36-48rpx only for login identity surfaces.

### Inputs / Fields

- **Style:** White surface, 1rpx Quiet Border, `16rpx` radius, 84rpx height, 24rpx horizontal padding.
- **Focus:** Border changes to Police Blue. Avoid glow effects.
- **Compact Inputs:** Admin edit rows may use 70rpx height and 26rpx text, but should keep the same border, radius, and typography vocabulary.
- **Error / Disabled:** Use semantic color and plain helper text near the field. Do not use modal interruption for routine validation.

### Navigation

- **Meal Tabs:** Segmented controls with pill wells. Active state uses white fill on blue headers or Police Blue fill on light surfaces.
- **Category Nav:** Left-side meal category rail is acceptable on ordering screens because it shortens the task path. Active category must be visually strong and text-readable.
- **Top Actions:** Compact grid buttons are acceptable in admin pages. Keep labels short and prevent overflow.

### Meal Package Card

Dish cards combine image, dish name, price, and quantity stepper. Selection should change border and soft background, not card size. Quantity controls must keep fixed square dimensions so repeated tapping does not shift layout.

### Admin Edit Card

Admin cards can be dense. They should group image, editable fields, meal-type controls, availability toggle, and action row in a predictable vertical stack. Destructive and primary actions must remain visually distinct.

## 6. Do's and Don'ts

### Do:

- **Do** keep the product 稳重、清晰、高效 through restrained color, native typography, and direct labels.
- **Do** make ordering, managing slots, checking totals, and exporting data reachable through predictable flows.
- **Do** use Police Blue for primary action, selected state, and trusted admin authority.
- **Do** use semantic tags for open, closed, verified, cancelled, expired, loading, and error states.
- **Do** keep Chinese text readable on small phone screens with fixed control dimensions and clear wrapping behavior.
- **Do** preserve enough warmth for a daily meal service through food imagery, Meal Amber hints, and plain helpful copy.

### Don't:

- **Don't** create an internet marketing style, exaggerated hero treatment, promotional copy, loud gradients, or sales-driven visual language.
- **Don't** make the interface too playful: no cute icons, novelty motion, celebratory styling, or childish visual tone.
- **Don't** reproduce outdated government system aesthetics: no cramped legacy tables, weak hierarchy, stale gray blocks, or bureaucratically heavy copy.
- **Don't** use side-stripe borders such as `border-left` or `border-right` greater than 1px as a colored accent. Replace them with full borders, soft status backgrounds, icons, or clear status tags.
- **Don't** use gradient text, decorative glassmorphism, or modal-first flows.
- **Don't** let admin density become visual clutter. If a screen carries many controls, group them by task and keep action hierarchy explicit.
