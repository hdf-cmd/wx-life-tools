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
    loadingMore: false   // 分页：触底加载中
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
  }
})
