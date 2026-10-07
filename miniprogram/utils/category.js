// utils/category.js
// 记账分类的单一数据源：分类表 + 图标。
// 原先 add 页自持一份 16 行的分类数组、本文件再存一份图标映射，两处改一处就会静默错位
// （列表页/统计页拿不到图标时统一回落到 📦，看不出是"没配"还是"配错了"）。
// 现在只维护下面两个数组，CATEGORY_ICONS 由它们派生。

// 支出分类
const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜' },
  { name: '交通', icon: '🚌' },
  { name: '购物', icon: '🛒' },
  { name: '娱乐', icon: '🎮' },
  { name: '住房', icon: '🏠' },
  { name: '医疗', icon: '💊' },
  { name: '教育', icon: '📚' },
  { name: '服饰', icon: '👔' },
  { name: '通讯', icon: '📱' },
  { name: '其他', icon: '📦' }
]

// 收入分类
const INCOME_CATEGORIES = [
  { name: '工资', icon: '💰' },
  { name: '奖金', icon: '🎁' },
  { name: '投资', icon: '📈' },
  { name: '红包', icon: '🎊' },
  { name: '兼职', icon: '💵' },
  { name: '其他', icon: '📦' }
]

const FALLBACK_ICON = '📦'

const CATEGORY_ICONS = {}
EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES).forEach(function (c) {
  CATEGORY_ICONS[c.name] = c.icon
})

// 历史数据里可能有用户自填或已下架的分类，一律回落，不抛错
function iconOf(category) {
  return CATEGORY_ICONS[category] || FALLBACK_ICON
}

module.exports = {
  EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
  INCOME_CATEGORIES: INCOME_CATEGORIES,
  CATEGORY_ICONS: CATEGORY_ICONS,
  FALLBACK_ICON: FALLBACK_ICON,
  iconOf: iconOf
}
