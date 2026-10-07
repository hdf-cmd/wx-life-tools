// pages/bookkeeping/stats.js
// 统计页面逻辑

const util = require('../../utils/util.js')
const date = require('../../utils/date.js')
const category = require('../../utils/category.js')
const { toCsv } = require('../../utils/csv.js')

// 趋势窗口：云函数 trend 的月份窗口锚定「今天所在的近 N 个月」，不接受所选月参数，
// 所以本图固定显示近 6 个月，切月不重取（重取也是同一份数据），文案上写清楚
const TREND_MONTHS = 6

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
    loading: false,
    loadError: false,      // 失败态（与「本月还没有记录」的空态分开）
    statsTruncated: false, // 本月超 1000 条，统计只按前 1000 条算
    trendTruncated: false  // 趋势窗口内超 1000 条，柱高只按前 1000 条算
  },

  onLoad: function (options) {
    this._destroyed = false
    this._reqSeq = 0     // 统计请求序号：切月/刷新后丢弃在途旧回调，避免上月数据顶在新月标题下
    this._trendSeq = 0

    // 从 URL 参数获取月份（分享链接可能被手改，非法值一律回落到当月），否则用当前月份
    const param = options && options.month
    const monthStr = (typeof param === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(param))
      ? param
      : date.currentMonthStr()
    this.setMonth(monthStr)
    this.loadTrend()
  },

  onUnload: function () {
    this._destroyed = true
  },

  /**
   * 设置当前月份（monthStr 为唯一口径）并重取统计
   */
  setMonth: function (monthStr) {
    const parts = String(monthStr).split('-')
    this.setData({
      monthStr: monthStr,
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10)
    })
    this.loadStats()
  },

  /**
   * 切换到上一个月
   */
  prevMonth: function () {
    this.setMonth(date.shiftMonth(this.data.monthStr, -1))
  },

  /**
   * 切换到下一个月
   */
  nextMonth: function () {
    this.setMonth(date.shiftMonth(this.data.monthStr, 1))
  },

  /**
   * 加载统计数据
   */
  loadStats: function () {
    const that = this
    const { monthStr } = this.data
    const seq = ++this._reqSeq

    // 切月/刷新先清零旧数据：否则新月标题下会顶着上月的分类列表和汇总
    this.setData({
      loading: true,
      loadError: false,
      statsTruncated: false,
      totalIncome: '0.00',
      totalExpense: '0.00',
      balance: '0.00',
      categoryStats: []
    })

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: {
        action: 'stats',
        month: monthStr
      },
      success: function (res) {
        if (seq !== that._reqSeq || that._destroyed) return
        const r = (res && res.result) || {}
        if (r.code === 0) {
          const data = r.data || {}
          const categoryStats = (data.categoryStats || []).map(item => Object.assign({}, item, {
            icon: category.iconOf(item.category),
            amount: (Number(item.amount) || 0).toFixed(2)
          }))

          that.setData({
            totalIncome: (Number(data.totalIncome) || 0).toFixed(2),
            totalExpense: (Number(data.totalExpense) || 0).toFixed(2),
            balance: (Number(data.balance) || 0).toFixed(2),
            categoryStats: categoryStats,
            // 本月超过 1000 条时服务端只按前 1000 条算，必须明示，不能静默少算
            statsTruncated: !!data.truncated
          })
        } else {
          // 失败态与空态分开：页面给「加载失败 + 重新加载」，不让用户以为记录丢了
          that.setData({ loadError: true })
          util.showToast(r.msg || '加载失败')
        }
        that.setData({ loading: false })
      },
      fail: function (err) {
        if (seq !== that._reqSeq || that._destroyed) return
        console.error('[loadStats] 调用失败:', err)
        util.showToast('网络错误，请重试')
        that.setData({ loading: false, loadError: true })
      }
    })
  },

  /**
   * 加载近 6 个月收支趋势（锚点为今天，与所选月份无关）
   */
  loadTrend: function () {
    const that = this
    const seq = ++this._trendSeq

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'trend', months: TREND_MONTHS },
      success: function (res) {
        if (seq !== that._trendSeq || that._destroyed) return
        const r = (res && res.result) || {}
        if (r.code !== 0) return
        const list = r.data || []

        // 柱高按支出/收入较大值归一化（保留 3% 最小可见高度）
        let maxVal = 0
        list.forEach(item => {
          maxVal = Math.max(maxVal, item.income, item.expense)
        })
        list.forEach(item => {
          item.incomeH = maxVal > 0 ? Math.max(Math.round(item.income / maxVal * 100), 3) : 3
          item.expenseH = maxVal > 0 ? Math.max(Math.round(item.expense / maxVal * 100), 3) : 3
        })

        that.setData({ trend: list, trendTruncated: !!r.truncated })
      },
      fail: function () {
        // 趋势加载失败不打扰用户（辅助信息）
      }
    })
  },

  /**
   * 点击趋势柱 → 切换到该月统计（趋势图本身固定显示近 6 个月，不随切月重取）
   */
  onTrendTap: function (e) {
    const month = e.currentTarget.dataset.month
    if (!month || month === this.data.monthStr) return
    this.setMonth(month)
  },

  /**
   * 统计加载失败后的重试入口（错误态按钮）
   */
  retryLoad: function () {
    this.loadStats()
    this.loadTrend()
  },

  /**
   * 导出本月 CSV（复制到剪贴板）
   */
  exportMonth: function () {
    const that = this
    if (this.data.exporting) return
    this.setData({ exporting: true })

    const monthStr = this.data.monthStr

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'export', month: monthStr },
      success: function (res) {
        if (that._destroyed) return
        that.setData({ exporting: false })
        const r = (res && res.result) || {}
        if (r.code !== 0) {
          util.showToast(r.msg || '导出失败')
          return
        }
        const bills = r.data || []
        if (bills.length === 0) {
          util.showToast('本月没有账单可导出')
          return
        }
        const truncated = !!r.truncated
        // 截断必须明示：toast 会被紧随其后的 modal 盖掉，所以同一句话也写进弹窗正文
        if (truncated) util.showToast('仅导出前 1000 条')

        // 拼 CSV 走 utils/csv.js（与习惯导出共用，避免两处转义口径漂移）
        const csv = toCsv(
          ['日期', '类型', '分类', '金额', '备注'],
          bills.map(b => [
            b.date,
            b.type === 'income' ? '收入' : '支出',
            b.category,
            (Number(b.amount) || 0).toFixed(2),
            b.note || ''
          ])
        )

        wx.setClipboardData({
          data: csv,
          success: function () {
            if (that._destroyed) return
            wx.showModal({
              title: '导出成功',
              content: `${monthStr} 共 ${bills.length} 笔账单已复制为 CSV`
                + (truncated ? '（本月账单超过 1000 条，仅导出前 1000 条）' : '')
                + '，去电脑上粘贴到表格文件即可保存',
              showCancel: false,
              confirmText: '知道了'
            })
          },
          fail: function (err) {
            if (that._destroyed) return
            console.error('[exportMonth] 复制剪贴板失败:', err)
            util.showToast('复制失败，请重试')
          }
        })
      },
      fail: function (err) {
        if (that._destroyed) return
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
