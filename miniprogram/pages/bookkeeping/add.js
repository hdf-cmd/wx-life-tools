// pages/bookkeeping/add.js
// 记一笔页面逻辑

const util = require('../../utils/util.js')
const date = require('../../utils/date.js')
const category = require('../../utils/category.js')

// 表单上限：与云函数 bookkeeping 的校验口径对齐，前端先拦一道，不靠服务端拒绝
const MAX_AMOUNT = 10000000
const MAX_NOTE_LEN = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 分类表与图标统一取自 utils/category.js（本文件曾自持一份 16 行副本，改一处就会与列表页/统计页错位）
const EXPENSE_CATEGORIES = category.EXPENSE_CATEGORIES
const INCOME_CATEGORIES = category.INCOME_CATEGORIES

Page({
  data: {
    type: 'expense',          // 类型：expense/income
    amount: '',               // 金额
    selectedCategory: null,   // 选中的分类对象
    categories: EXPENSE_CATEGORIES, // 当前分类列表
    note: '',                 // 备注
    date: '',                 // 日期 YYYY-MM-DD
    saving: false,            // 防抖：防止重复提交
    editId: ''                // 编辑模式：账单ID（空=新增模式）
  },

  onLoad: function (options) {
    this._destroyed = false
    this._backTimer = null   // 「提示后返回上一页」的 setTimeout 句柄，onUnload 里必须清掉

    // 默认日期为今天（统一走 utils/date 的本地时区口径）
    this.setData({ date: date.todayStr() })

    // 编辑模式：带 id 进入，加载原账单回填
    if (options && options.id) {
      this.setData({ editId: options.id })
      wx.setNavigationBarTitle({ title: '编辑账单' })
      this.loadBill(options.id)
    }
  },

  onUnload: function () {
    this._destroyed = true
    if (this._backTimer) {
      clearTimeout(this._backTimer)
      this._backTimer = null
    }
  },

  /**
   * 延迟返回上一页（唯一入口，便于统一清理句柄）
   */
  backLater: function (delay) {
    const that = this
    this._backTimer = setTimeout(function () {
      that._backTimer = null
      if (that._destroyed) return
      wx.navigateBack()
    }, delay)
  },

  /**
   * 编辑模式：加载原账单并回填表单
   */
  loadBill: function (id) {
    const that = this
    util.showLoading('加载中...')

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'get', id: id },
      success: function (res) {
        if (that._destroyed) return
        util.hideLoading()
        const r = (res && res.result) || {}
        if (r.code !== 0) {
          // 无权/已被删除：绝不能停在空白表单，否则用户点保存会「编辑」出一条新记录
          util.showToast(r.msg || '账单加载失败')
          that.backLater(1000)
          return
        }
        const bill = r.data || {}
        const categories = bill.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
        that.setData({
          type: bill.type,
          categories: categories,
          amount: String(bill.amount),
          note: bill.note || '',
          date: bill.date,
          selectedCategory: categories.find(function (c) { return c.name === bill.category }) || null
        })
      },
      fail: function (err) {
        if (that._destroyed) return
        util.hideLoading()
        console.error('[loadBill] 调用失败:', err)
        util.showToast('网络错误，请重试')
      }
    })
  },

  /**
   * 切换收支类型
   */
  switchType: function (e) {
    const type = e.currentTarget.dataset.type
    const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

    this.setData({
      type: type,
      categories: categories,
      selectedCategory: null // 切换类型时清空分类选择
    })
  },

  /**
   * 金额输入
   */
  onAmountInput: function (e) {
    this.setData({
      amount: e.detail.value
    })
  },

  /**
   * 选择分类
   */
  selectCategory: function (e) {
    const categoryName = e.currentTarget.dataset.category
    const categories = this.data.categories
    const selectedCategory = categories.find(c => c.name === categoryName) || null
    this.setData({
      selectedCategory: selectedCategory
    })
  },

  /**
   * 备注输入
   */
  onNoteInput: function (e) {
    this.setData({
      note: e.detail.value
    })
  },

  /**
   * 日期选择
   */
  onDateChange: function (e) {
    this.setData({
      date: e.detail.value
    })
  },

  /**
   * 表单校验（提交前置，不依赖云函数返回）
   * @returns {number|null} 通过时返回「以分为单位」的整数金额；不通过时已 toast，返回 null
   */
  validateForm: function () {
    const { amount, selectedCategory, note } = this.data
    const dateStr = this.data.date

    const amt = Number(amount)
    if (!amount || !isFinite(amt) || amt <= 0) {
      util.showToast('请输入有效金额')
      return null
    }
    if (amt >= MAX_AMOUNT) {
      util.showToast('金额过大，请确认后再记')
      return null
    }
    if (!selectedCategory) {
      util.showToast('请选择分类')
      return null
    }
    if (note && note.length > MAX_NOTE_LEN) {
      util.showToast('备注最多 ' + MAX_NOTE_LEN + ' 字，请精简一下')
      return null
    }
    if (!DATE_RE.test(dateStr || '')) {
      util.showToast('日期格式不正确（应为 YYYY-MM-DD）')
      return null
    }

    // 先转分做整数运算，最后一步才 /100 还原，避免浮点直加放大误差
    const cents = Math.round(amt * 100)
    if (cents < 1) {
      // 例如输入 0.001：四舍五入后为 0 分，服务端会按「金额必须大于0」拒掉
      util.showToast('金额最少 0.01 元')
      return null
    }
    return cents
  },

  /**
   * 保存账单
   */
  saveBill: function () {
    // 防抖：防止重复提交
    if (this.data.saving) return

    const cents = this.validateForm()
    if (cents === null) return

    const that = this
    this.setData({ saving: true })

    const { type, selectedCategory, note } = this.data

    // 编辑模式走 update，新增走 add
    const isEdit = !!this.data.editId
    const data = {
      action: isEdit ? 'update' : 'add',
      amount: cents / 100,           // 分 → 元：只在最后一步还原
      type: type,
      category: selectedCategory.name,
      note: note,
      date: this.data.date
    }
    if (isEdit) data.id = this.data.editId

    util.showLoading('保存中...')

    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: data,
      success: function (res) {
        if (that._destroyed) return
        util.hideLoading()
        const r = (res && res.result) || {}
        if (r.code === 0) {
          util.showToast(isEdit ? '已保存' : '保存成功', 'success')
          // 返回上一页
          that.backLater(1000)
        } else {
          util.showToast(r.msg || '保存失败')
          // 保存失败，解除防抖锁定
          that.setData({ saving: false })
        }
      },
      fail: function (err) {
        if (that._destroyed) return
        util.hideLoading()
        console.error('[saveBill] 调用失败:', err)
        util.showToast('网络错误，请重试')
        // 保存失败，解除防抖锁定
        that.setData({ saving: false })
      }
    })
  }
})
