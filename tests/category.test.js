// tests/category.test.js
// utils/category.js 守卫测试：分类表是记账三个页面共用的单一数据源，
// 一旦"同名分类配了不同图标"或"漏配图标"，列表页/统计页会静默回落成 📦，肉眼看不出是漏配还是配错。
// 运行方式：node tests/category.test.js

const path = require('path')
const category = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'category.js'))

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  [通过] ' + name)
  } catch (e) {
    failed++
    console.log('  [失败] ' + name + '\n         ' + (e && e.message))
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + '应为 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

const ALL = category.EXPENSE_CATEGORIES.concat(category.INCOME_CATEGORIES)

console.log('utils/category.js 分类表守卫测试\n')

test('支出 10 类、收入 6 类', () => {
  eq(category.EXPENSE_CATEGORIES.length, 10, '支出分类数')
  eq(category.INCOME_CATEGORIES.length, 6, '收入分类数')
})

test('每个分类都有非空名称与非空图标', () => {
  ALL.forEach(c => {
    assert(typeof c.name === 'string' && c.name.length > 0, '分类名不能为空')
    assert(typeof c.icon === 'string' && c.icon.length > 0, c.name + ' 缺图标')
  })
})

test('派生一致：iconOf 对每个分类返回它自己的图标', () => {
  ALL.forEach(c => eq(category.iconOf(c.name), c.icon, c.name + ' 的 iconOf'))
})

test('同名分类的图标必须一致（否则派生映射会互相覆盖）', () => {
  const seen = {}
  ALL.forEach(c => {
    if (seen[c.name]) eq(seen[c.name], c.icon, '同名分类「' + c.name + '」图标不一致')
    seen[c.name] = c.icon
  })
})

test('未知/历史分类回落 📦 且不抛错', () => {
  eq(category.iconOf('已经下架的分类'), category.FALLBACK_ICON, '未知分类')
  eq(category.iconOf(undefined), category.FALLBACK_ICON, 'undefined')
  eq(category.iconOf(''), category.FALLBACK_ICON, '空串')
})

test('「其他」的图标就是回落图标（漏配时视觉不可分辨，故必须相等）', () => {
  eq(category.EXPENSE_CATEGORIES.find(c => c.name === '其他').icon, category.FALLBACK_ICON, '支出-其他')
  eq(category.INCOME_CATEGORIES.find(c => c.name === '其他').icon, category.FALLBACK_ICON, '收入-其他')
})

test('CATEGORY_ICONS 不再手写，条目数等于去重后的分类名数', () => {
  const uniqueNames = {}
  ALL.forEach(c => { uniqueNames[c.name] = 1 })
  eq(Object.keys(category.CATEGORY_ICONS).length, Object.keys(uniqueNames).length, '派生映射条目数')
})

console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
process.exit(failed > 0 ? 1 : 0)
