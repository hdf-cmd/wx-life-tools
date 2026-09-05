// pages/bookkeeping/index.js
// 记账本 - 账单列表页逻辑

const util = require('../../utils/util.js')

// 分类图标映射
const CATEGORY_ICONS = {
  '餐饮': '🍜', '交通': '🚌', '购物': '🛒', '娱乐': '🎮', '住房': '🏠',
  '医疗': '💊', '教育': '📚', '服饰': '👔', '通讯': '📱', '其他': '📦',
  '工资': '💰', '奖金': '🎁', '投资': '📈', '红包': '🎊', '兼职': '💵'
}

Page({
  data: {
    currentYear: 0,
    currentMonth: 0,
    monthStr: '',        // YYYY-MM 格式字符串
    totalIncome: '0.00',
    totalExpense: '0.00',
    balance: '0.00',
    groupedBills: [],    // 按日分组的账单列表
    loading: false,
    hasMore: false,      // 分页：是否还有下一页
    loadingMore: false,  // 分页：触底加载中
    budget: 0,           // 本月预算（0=未设置）
    budgetPercent: 0,
    budgetState: 'safe', // safe / warn / over
    budgetStateText: '',
    budgetRemainText: ''
  },

  onLoad: function () {
    // 初始化为当前月份
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    })
    this.updateMonthStr()
  },

  onShow: function () {
    // 每次显示页面时刷新数据（从 add 页面返回时）
    this.loadBills()
    this.loadBudget()
  },

  /**
   * 更新月份字符串
   */
  updateMonthStr: function () {
    const { currentYear, currentMonth } = this.data
    const monthStr = `${currentYear}-${currentMonth < 10 ? '0' + currentMonth : currentMonth}`
    this.setData({ monthStr })
  },

  /**
   * 切换到上一个月
   */
  prevMonth: function () {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) {
      currentMonth = 12
      currentYear--
    }
    this.setData({ currentYear, currentMonth })
    this.updateMonthStr()
    this.loadBills()
    this.loadBudget()
  },

  /**
   * 切换到下一个月
   */
  nextMonth: function () {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }
    this.setData({ currentYear, currentMonth })
    this.updateMonthStr()
    this.loadBills()
    this.loadBudget()
  },

  /**
   * 加载账单列表（分页）
   * @param {boolean} append - false=重新加载（切月/首次），true=触底追加下一页
   */
  loadBills: function (append) {
    const that = this
    const { monthStr } = this.data

    if (append) {
      if (this.data.loadingMore || !this.data.hasMore) return
      this.setData({ loadingMore: true })
    } else {
      this._bills = []          // 累积的原始账单（分页拼接）
      this.setData({ loading: true, hasMore: false })
    }

    const page = append ? this._page + 1 : 1
    this._page = page

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: {
        action: 'list',
        month: monthStr,
        page: page
      },
      success: function (res) {
        if (res.result.code === 0) {
          const result = res.result.data || {}
          const list = result.list || []
          // 累积拼接后统一处理（汇总要算全量，不能只算当前页）
          that._bills = (that._bills || []).concat(list)
          that.processBills(that._bills)
          that.setData({ hasMore: !!result.hasMore })
        } else {
          util.showToast(res.result.msg || '加载失败')
        }
        that.setData({ loading: false, loadingMore: false })
      },
      fail: function (err) {
        console.error('[loadBills] 调用失败:', err)
        util.showToast('网络错误，请重试')
        that.setData({ loading: false, loadingMore: false })
      }
    })
  },

  /**
   * 触底加载下一页
   */
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadBills(true)
    }
  },

  /**
   * 处理账单数据：计算汇总、按日分组
   */
  processBills: function (bills) {
    let totalIncome = 0   // 以分为单位累加（整数）
    let totalExpense = 0
    const dayMap = {}

    bills.forEach(bill => {
      const amountCents = Math.round(bill.amount * 100)
      const amount = amountCents / 100
      const icon = CATEGORY_ICONS[bill.category] || '📦'

      // 计算收支汇总（整数累加）
      if (bill.type === 'income') {
        totalIncome += amountCents
      } else {
        totalExpense += amountCents
      }

      // 按日期分组
      if (!dayMap[bill.date]) {
        dayMap[bill.date] = {
          date: bill.date,
          dateLabel: this.formatDateLabel(bill.date),
          bills: [],
          dayIncome: 0,
          dayExpense: 0
        }
      }

      if (bill.type === 'income') {
        dayMap[bill.date].dayIncome += amount
      } else {
        dayMap[bill.date].dayExpense += amount
      }

      dayMap[bill.date].bills.push(Object.assign({}, bill, { amount: amount.toFixed(2),
        icon: icon }))
    })

    // 转换为数组并按日期降序排列
    const groupedBills = Object.values(dayMap).sort((a, b) => {
      return b.date.localeCompare(a.date)
    })

    // 格式化每日小计
    groupedBills.forEach(group => {
      group.dayIncome = group.dayIncome.toFixed(2)
      group.dayExpense = group.dayExpense.toFixed(2)
    })

    this.setData({
      totalIncome: (totalIncome / 100).toFixed(2),
      totalExpense: (totalExpense / 100).toFixed(2),
      balance: ((totalIncome - totalExpense) / 100).toFixed(2),
      groupedBills: groupedBills
    })

    // 支出汇总变了，预算进度条跟随刷新
    this.refreshBudgetBar()
  },

  /**
   * 加载本月预算
   */
  loadBudget: function () {
    const that = this
    const { monthStr } = this.data

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: { action: 'getBudget', month: monthStr },
      success: function (res) {
        if (res.result.code === 0) {
          that.setData({ budget: (res.result.data && res.result.data.amount) || 0 })
          that.refreshBudgetBar()
        }
      },
      fail: function () { /* 预算加载失败不打扰 */ }
    })
  },

  /**
   * 根据预算 + 当前支出刷新进度条状态
   */
  refreshBudgetBar: function () {
    const budget = this.data.budget
    if (!(budget > 0)) {
      this.setData({ budgetPercent: 0, budgetState: 'safe', budgetStateText: '', budgetRemainText: '' })
      return
    }

    const expense = parseFloat(this.data.totalExpense) || 0
    const rawPercent = expense / budget * 100
    const percent = Math.min(Math.round(rawPercent), 100)

    let state = 'safe'
    let stateText = '状态良好'
    let remainText = ''
    if (rawPercent >= 100) {
      state = 'over'
      stateText = '已超支'
      remainText = `已超支 ¥${(expense - budget).toFixed(2)}，管住手手 🙅`
    } else if (rawPercent >= 80) {
      state = 'warn'
      stateText = '快超支啦'
      remainText = `已用 ¥${expense.toFixed(2)}（${Math.round(rawPercent)}%）· 剩余 ¥${(budget - expense).toFixed(2)}`
    } else {
      remainText = `已用 ¥${expense.toFixed(2)}（${Math.round(rawPercent)}%）· 剩余 ¥${(budget - expense).toFixed(2)}`
    }

    this.setData({
      budgetPercent: percent,
      budgetState: state,
      budgetStateText: stateText,
      budgetRemainText: remainText
    })
  },

  /**
   * 点击预算卡片：设置/修改预算（输入 0 清除）
   */
  tapBudget: function () {
    const that = this
    const { budget, monthStr } = this.data

    wx.showModal({
      title: '本月预算',
      content: budget > 0
        ? `当前预算 ¥${budget.toFixed(2)}，输入新金额（0 为清除预算）`
        : `设置 ${monthStr} 的预算金额（元）`,
      editable: true,
      placeholderText: budget > 0 ? String(budget) : '例如 3000',
      success: function (res) {
        if (!res.confirm) return
        const v = parseFloat(res.content)
        if (isNaN(v) || v < 0) {
          util.showToast('请输入有效金额')
          return
        }
        wx.cloud.callFunction({
          followSystem: true,
          name: 'bookkeeping',
          data: { action: 'setBudget', month: monthStr, amount: v },
          success: function (r) {
            if (r.result.code === 0) {
              util.showToast(r.result.msg, 'success')
              that.loadBudget()
            } else {
              util.showToast(r.result.msg || '设置失败')
            }
          },
          fail: function () {
            util.showToast('网络错误，请重试')
          }
        })
      }
    })
  },

  /**
   * 格式化日期标签
   */
  formatDateLabel: function (dateStr) {
    // 手动解析日期字符串，避免 new Date("YYYY-MM-DD") 按 UTC 解析导致的时区偏差
    const parts = dateStr.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const day = parseInt(parts[2])

    const today = new Date()
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0')

    if (dateStr === todayStr) {
      return '今天'
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.getFullYear() + '-' +
      String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
      String(yesterday.getDate()).padStart(2, '0')

    if (dateStr === yesterdayStr) {
      return '昨天'
    }

    return `${parts[1]}月${day}日`
  },

  /**
   * 点击账单 → 编辑（长按仍是删除）
   */
  onBillTap: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/bookkeeping/add?id=' + id
    })
  },

  /**
   * 长按删除账单
   */
  onLongPressDelete: function (e) {
    const id = e.currentTarget.dataset.id
    const that = this

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条账单吗？',
      confirmColor: '#FF5252',
      success: function (res) {
        if (res.confirm) {
          that.deleteBill(id)
        }
      }
    })
  },

  /**
   * 删除账单
   */
  deleteBill: function (id) {
    const that = this
    util.showLoading('删除中...')

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: {
        action: 'delete',
        id: id
      },
      success: function (res) {
        util.hideLoading()
        if (res.result.code === 0) {
          util.showToast('删除成功', 'success')
          that.loadBills()
        } else {
          util.showToast(res.result.msg || '删除失败')
        }
      },
      fail: function (err) {
        util.hideLoading()
        console.error('[deleteBill] 调用失败:', err)
        util.showToast('网络错误，请重试')
      }
    })
  },

  /**
   * 跳转到记一笔页面
   */
  goAdd: function () {
    wx.navigateTo({
      url: '/pages/bookkeeping/add'
    })
  },

  /**
   * 跳转到统计页面
   */
  goStats: function () {
    wx.navigateTo({
      url: '/pages/bookkeeping/stats?month=' + this.data.monthStr
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '我在用这个小程序记账，超省心',
      path: '/pages/bookkeeping/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '我在用这个小程序记账，超省心' }
  }
})
