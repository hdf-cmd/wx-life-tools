// pages/bookkeeping/stats.js
// 统计页面逻辑

const util = require('../../utils/util.js')

// 分类图标映射
const CATEGORY_ICONS = {
  '餐饮': '🍜', '交通': '🚌', '购物': '🛒', '娱乐': '🎮', '住房': '🏠',
  '医疗': '💊', '教育': '📚', '服饰': '👔', '通讯': '📱', '其他': '📦'
}

Page({
  data: {
    year: 0,
    month: 0,
    monthStr: '',
    totalIncome: '0.00',
    totalExpense: '0.00',
    balance: '0.00',
    categoryStats: [],  // 分类统计数据
    loading: false
  },

  onLoad: function (options) {
    // 从 URL 参数获取月份，或使用当前月份
    if (options.month) {
      const parts = options.month.split('-')
      this.setData({
        year: parseInt(parts[0]),
        month: parseInt(parts[1]),
        monthStr: options.month
      })
    } else {
      const now = new Date()
      this.setData({
        year: now.getFullYear(),
        month: now.getMonth() + 1
      })
      this.updateMonthStr()
    }

    this.loadStats()
  },

  /**
   * 更新月份字符串
   */
  updateMonthStr: function () {
    const { year, month } = this.data
    const monthStr = `${year}-${month < 10 ? '0' + month : month}`
    this.setData({ monthStr })
  },

  /**
   * 切换到上一个月
   */
  prevMonth: function () {
    let { year, month } = this.data
    month--
    if (month < 1) {
      month = 12
      year--
    }
    this.setData({ year, month })
    this.updateMonthStr()
    this.loadStats()
  },

  /**
   * 切换到下一个月
   */
  nextMonth: function () {
    let { year, month } = this.data
    month++
    if (month > 12) {
      month = 1
      year++
    }
    this.setData({ year, month })
    this.updateMonthStr()
    this.loadStats()
  },

  /**
   * 加载统计数据
   */
  loadStats: function () {
    const that = this
    const { monthStr } = this.data

    this.setData({ loading: true })

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: {
        action: 'stats',
        month: monthStr
      },
      success: function (res) {
        if (res.result.code === 0) {
          const data = res.result.data
          const categoryStats = (data.categoryStats || []).map(item => (Object.assign({}, item, { icon: CATEGORY_ICONS[item.category] || '📦',
            amount: item.amount.toFixed(2) })))

          that.setData({
            totalIncome: data.totalIncome.toFixed(2),
            totalExpense: data.totalExpense.toFixed(2),
            balance: data.balance.toFixed(2),
            categoryStats: categoryStats
          })
        } else {
          util.showToast(res.result.msg || '加载失败')
        }
        that.setData({ loading: false })
      },
      fail: function (err) {
        util.hideLoading()
        console.error('[loadStats] 调用失败:', err)
        util.showToast('网络错误，请重试')
        that.setData({ loading: false })
      }
    })
  }
})
