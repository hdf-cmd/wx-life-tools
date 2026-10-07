// utils/category.js
// 账单分类图标的单一数据源（原先在列表页与统计页各存一份，改分类时容易漏改一处）

const CATEGORY_ICONS = {
  '餐饮': '🍜', '交通': '🚌', '购物': '🛒', '娱乐': '🎮', '住房': '🏠',
  '医疗': '💊', '教育': '📚', '服饰': '👔', '通讯': '📱', '其他': '📦',
  '工资': '💰', '奖金': '🎁', '投资': '📈', '红包': '🎊', '兼职': '💵'
}

function iconOf(category) {
  return CATEGORY_ICONS[category] || '📦'
}

module.exports = { CATEGORY_ICONS, iconOf }
