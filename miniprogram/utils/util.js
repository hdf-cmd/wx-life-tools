// utils/util.js
// 工具函数集合

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的时间字符串 YYYY-MM-DD HH:mm:ss
 */
const formatTime = (date) => {
  const year = date.getFullYear()
  const month = formatNumber(date.getMonth() + 1)
  const day = formatNumber(date.getDate())
  const hour = formatNumber(date.getHours())
  const minute = formatNumber(date.getMinutes())
  const second = formatNumber(date.getSeconds())

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期字符串 YYYY-MM-DD
 */
const formatDate = (date) => {
  const year = date.getFullYear()
  const month = formatNumber(date.getMonth() + 1)
  const day = formatNumber(date.getDate())

  return `${year}-${month}-${day}`
}

/**
 * 格式化金额
 * @param {number} amount - 金额数值
 * @param {number} decimals - 小数位数，默认2位
 * @returns {string} 格式化的金额字符串
 */
const formatMoney = (amount, decimals = 2) => {
  if (amount === null || amount === undefined) return '0.00'
  
  const num = Number(amount)
  if (isNaN(num)) return '0.00'

  // 添加千分位分隔符
  const fixed = num.toFixed(decimals)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  
  return parts.join('.')
}

/**
 * 显示提示框
 * @param {string} title - 提示内容
 * @param {string} icon - 图标类型：success / error / none
 */
const showToast = (title, icon = 'none') => {
  wx.showToast({
    title: title,
    icon: icon,
    duration: 2000
  })
}

/**
 * 显示加载提示
 * @param {string} title - 加载提示文字
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title: title,
    mask: true
  })
}

/**
 * 隐藏加载提示
 */
const hideLoading = () => {
  wx.hideLoading()
}

/**
 * 数字补零
 * @param {number} n - 数字
 * @returns {string} 补零后的字符串
 */
const formatNumber = (n) => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 导出工具函数
module.exports = {
  formatTime,
  formatDate,
  formatMoney,
  showToast,
  showLoading,
  hideLoading
}
