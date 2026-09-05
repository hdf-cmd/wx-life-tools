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
    trend: [],          // 近 6 个月趋势
    exporting: false,
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
    this.loadTrend()
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
  },

  /**
   * 加载近 6 个月收支趋势
   */
  loadTrend: function () {
    const that = this

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: { action: 'trend', months: 6 },
      success: function (res) {
        if (res.result.code !== 0) return
        const list = res.result.data || []

        // 柱高按支出/收入较大值归一化（保留 3% 最小可见高度）
        let maxVal = 0
        list.forEach(item => {
          maxVal = Math.max(maxVal, item.income, item.expense)
        })
        list.forEach(item => {
          item.incomeH = maxVal > 0 ? Math.max(Math.round(item.income / maxVal * 100), 3) : 3
          item.expenseH = maxVal > 0 ? Math.max(Math.round(item.expense / maxVal * 100), 3) : 3
        })

        that.setData({ trend: list })
      },
      fail: function () {
        // 趋势加载失败不打扰用户（辅助信息）
      }
    })
  },

  /**
   * 点击趋势柱 → 切换到该月统计
   */
  onTrendTap: function (e) {
    const month = e.currentTarget.dataset.month
    if (!month || month === this.data.monthStr) return
    const parts = month.split('-')
    this.setData({
      year: parseInt(parts[0]),
      month: parseInt(parts[1]),
      monthStr: month
    })
    this.loadStats()
  },

  /**
   * 导出本月 CSV（复制到剪贴板）
   */
  exportMonth: function () {
    const that = this
    if (this.data.exporting) return
    this.setData({ exporting: true })

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: { action: 'export', month: this.data.monthStr },
      success: function (res) {
        that.setData({ exporting: false })
        if (res.result.code !== 0) {
          util.showToast(res.result.msg || '导出失败')
          return
        }
        const bills = res.result.data || []
        if (bills.length === 0) {
          util.showToast('本月没有账单可导出')
          return
        }

        // 拼 CSV（字段含逗号/引号/换行时加引号转义；BOM 头保证 Excel 中文不乱码）
        const escape = function (v) {
          const s = String(v === undefined || v === null ? '' : v)
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
        }
        let csv = '\ufeff日期,类型,分类,金额,备注\n'
        bills.forEach(b => {
          csv += [
            b.date,
            b.type === 'income' ? '收入' : '支出',
            escape(b.category),
            b.amount.toFixed(2),
            escape(b.note || '')
          ].join(',') + '\n'
        })

        wx.setClipboardData({
          data: csv,
          success: function () {
            wx.showModal({
              title: '导出成功',
              content: `${that.data.monthStr} 共 ${bills.length} 笔账单已复制为 CSV，去电脑上粘贴到表格文件即可保存`,
              showCancel: false,
              confirmText: '知道了'
            })
          }
        })
      },
      fail: function (err) {
        that.setData({ exporting: false })
        console.error('[exportMonth] 调用失败:', err)
        util.showToast('网络错误，请重试')
      }
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '我的月度账单统计',
      path: '/pages/bookkeeping/stats'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '我的月度账单统计' }
  }
})
