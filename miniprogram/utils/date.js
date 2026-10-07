// utils/date.js
// 日期/月份工具：统一"本地时区"口径。各页原先各写一份月份加减，跨年分支已出现过分歧。

/** 数字补零 */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 本地时区的 YYYY-MM-DD
 * 禁用 toISOString().slice(0,10)：那是 UTC 日期，北京时间 00:00–07:59 会得到"昨天"
 */
function todayStr(date) {
  const d = date || new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function monthKey(year, month) {
  return year + '-' + pad2(month)
}

/** 当月 YYYY-MM */
function currentMonthStr() {
  return todayStr().slice(0, 7)
}

/** 月份加减，含跨年进位；入参/出参均为 YYYY-MM */
function shiftMonth(monthStr, delta) {
  const parts = String(monthStr).split('-')
  const idx = parseInt(parts[0], 10) * 12 + (parseInt(parts[1], 10) - 1) + delta
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1)
}

/** 该月天数；入参 YYYY-MM */
function daysInMonth(monthStr) {
  const parts = String(monthStr).split('-')
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0).getDate()
}

/**
 * 把 YYYY-MM-DD 解析成本地零点的 Date
 * new Date('YYYY-MM-DD') 会按 UTC 解析，取 getDate() 时在东八区可能少一天
 */
function parseLocalDate(dateStr) {
  const p = String(dateStr).split('-')
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
}

/** 相对今天的中文标签：今天 / 昨天 / 9月5日 */
function dayLabel(dateStr) {
  const now = new Date()
  if (dateStr === todayStr(now)) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === todayStr(yesterday)) return '昨天'
  const p = String(dateStr).split('-')
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日'
}

module.exports = {
  pad2,
  todayStr,
  monthKey,
  currentMonthStr,
  shiftMonth,
  daysInMonth,
  parseLocalDate,
  dayLabel
}
