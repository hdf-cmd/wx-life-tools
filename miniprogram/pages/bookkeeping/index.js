// pages/bookkeeping/index.js
// 记账本 - 账单列表页逻辑

const util = require('../../utils/util.js')
const date = require('../../utils/date.js')
const category = require('../../utils/category.js')

Page({
  data: {
    monthStr: '',        // YYYY-MM 格式字符串
    monthLabel: '',      // 展示用：2026年10月
    totalIncome: '0.00',
    expenseText: '0.00', // 支出展示串（含负号；为 0 时不带负号，避免出现 -0.00）
    balance: '0.00',
    groupedBills: [],    // 按日分组的账单列表
    loading: false,
    loadError: false,    // 加载失败态（与"本月没有账单"区分开）
    hasMore: false,      // 分页：是否还有下一页
    loadingMore: false,  // 分页：触底加载中
    statsTruncated: false, // 汇总超出单次查询上限时为 true，需提示
    budget: 0,           // 本月预算（0=未设置）
    budgetPercent: 0,
    budgetState: 'safe', // safe / warn / over
    budgetStateText: '',
    budgetRemainText: ''
  },

  onLoad: function () {
    this._bills = []      // 累积的原始账单（分页拼接，仅供列表展示）
    this._page = 0
    this._reqSeq = 0      // 请求序号：切月/刷新后丢弃在途旧请求，避免旧月数据拼进新月
    this._destroyed = false
    this.setMonth(date.currentMonthStr(), true)
  },

  onShow: function () {
    // 每次显示页面时刷新数据（从 add 页面返回时）
    this.refresh()
  },

  onUnload: function () {
    this._destroyed = true
  },

  /**
   * 设置当前月份并刷新
   */
  setMonth: function (monthStr, skipLoad) {
    // 展示不带前导零：2026年9月（不是 2026年09月）
    const label = monthStr.slice(0, 4) + '年' + parseInt(monthStr.slice(5), 10) + '月'
    this.setData({ monthStr: monthStr, monthLabel: label })
    if (!skipLoad) this.refresh()
  },

  /**
   * 整页刷新：列表 + 汇总 + 预算三个口径一起重取
   * @param {boolean} keepData - true 时不清空已渲染列表（删除后重拉用）
   */
  refresh: function (keepData) {
    if (!keepData) {
      this.setData({
        groupedBills: [],
        totalIncome: '0.00',
        expenseText: '0.00',
        balance: '0.00',
        loadError: false,
        statsTruncated: false
      })
    }
    this.loadBills()
    this.loadSummary()
    this.loadBudget()
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
   * 加载账单列表（分页）
   * @param {boolean} append - false=重新加载（切月/首次），true=触底追加下一页
   */
  loadBills: function (append) {
    const that = this
    const { monthStr } = this.data
    const seq = ++this._reqSeq

    if (append) {
      if (this.data.loadingMore || !this.data.hasMore) return
      this.setData({ loadingMore: true })
    } else {
      this._bills = []          // 累积的原始账单（分页拼接）
      this.setData({ loading: true, hasMore: false, loadError: false })
    }

    const page = append ? this._page + 1 : 1
    this._page = page

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: {
        action: 'list',
        month: monthStr,
        page: page
      },
      success: function (res) {
        if (seq !== that._reqSeq || that._destroyed) return
        const r = res.result || {}
        if (r.code === 0) {
          const result = r.data || {}
          // 列表只负责展示已加载的页；收支汇总走 stats 的全量口径（见 loadSummary）
          that._bills = (that._bills || []).concat(result.list || [])
          that.processBills(that._bills)
          that.setData({ hasMore: !!result.hasMore })
        } else {
          that.setData({ loadError: true })
          util.showToast(r.msg || '加载失败')
        }
        that.setData({ loading: false, loadingMore: false })
      },
      fail: function (err) {
        if (seq !== that._reqSeq || that._destroyed) return
        console.error('[loadBills] 调用失败:', err)
        util.showToast('网络错误，请重试')
        that.setData({ loading: false, loadingMore: false, loadError: true })
      }
    })
  },

  /**
   * 月度收支汇总：走 stats 接口的全量口径
   * 列表页自行累加只能算到"已加载的那几页"，会与统计页互相打架，故汇总一律问服务端
   */
  loadSummary: function () {
    const that = this
    const { monthStr } = this.data
    const seq = this._reqSeq

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'stats', month: monthStr },
      success: function (res) {
        if (seq !== that._reqSeq || that._destroyed) return
        const r = res.result || {}
        if (r.code !== 0) return
        const d = r.data || {}
        const expense = Math.abs(Number(d.totalExpense) || 0)
        that.setData({
          totalIncome: (Number(d.totalIncome) || 0).toFixed(2),
          expenseText: (expense > 0 ? '-' : '') + expense.toFixed(2),
          balance: (Number(d.balance) || 0).toFixed(2),
          statsTruncated: !!d.truncated
        })
        that.refreshBudgetBar()
      },
      fail: function (err) {
        console.error('[loadSummary] 调用失败:', err)
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
    const dayMap = {}

    bills.forEach(bill => {
      const cents = Math.round((Number(bill.amount) || 0) * 100)
      if (!dayMap[bill.date]) {
        dayMap[bill.date] = {
          date: bill.date,
          dateLabel: date.dayLabel(bill.date),
          bills: [],
          incomeCents: 0,
          expenseCents: 0
        }
      }

      // 每日小计以「分」为整数累加，最后一步才还原成元
      if (bill.type === 'income') {
        dayMap[bill.date].incomeCents += cents
      } else {
        dayMap[bill.date].expenseCents += cents
      }

      dayMap[bill.date].bills.push(Object.assign({}, bill, {
        amount: (cents / 100).toFixed(2),
        icon: category.iconOf(bill.category)
      }))
    })

    // 转换为数组并按日期降序排列
    const groupedBills = Object.values(dayMap)
      .map(group => ({
        date: group.date,
        dateLabel: group.dateLabel,
        bills: group.bills,
        dayIncome: (group.incomeCents / 100).toFixed(2),
        dayExpense: (group.expenseCents / 100).toFixed(2)
      }))
      .sort((a, b) => b.date.localeCompare(a.date))

    this.setData({ groupedBills: groupedBills })
  },

  /**
   * 加载本月预算
   */
  loadBudget: function () {
    const that = this
    const { monthStr } = this.data
    const seq = this._reqSeq

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'getBudget', month: monthStr },
      success: function (res) {
        if (seq !== that._reqSeq || that._destroyed) return
        const r = res.result || {}
        if (r.code === 0) {
          that.setData({ budget: (r.data && r.data.amount) || 0 })
          that.refreshBudgetBar()
        }
      },
      fail: function () { /* 预算加载失败不打扰 */ }
    })
  },

  /**
   * 根据预算 + 本月支出刷新进度条状态
   */
  refreshBudgetBar: function () {
    const budget = this.data.budget
    if (!(budget > 0)) {
      this.setData({ budgetPercent: 0, budgetState: 'safe', budgetStateText: '', budgetRemainText: '' })
      return
    }

    const expense = Math.abs(parseFloat(this.data.expenseText)) || 0
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
          name: 'bookkeeping',
          data: { action: 'setBudget', month: monthStr, amount: v },
          success: function (r) {
            const result = (r && r.result) || {}
            if (result.code === 0) {
              util.showToast(result.msg, 'success')
              that.loadBudget()
            } else {
              util.showToast(result.msg || '设置失败')
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
   * 加载失败后重试（错误态按钮入口）
   */
  retryLoad: function () {
    this.refresh()
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
      name: 'bookkeeping',
      data: {
        action: 'delete',
        id: id
      },
      success: function (res) {
        util.hideLoading()
        const r = res.result || {}
        if (r.code === 0) {
          util.showToast('删除成功', 'success')
          that.refresh()
        } else {
          util.showToast(r.msg || '删除失败')
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
