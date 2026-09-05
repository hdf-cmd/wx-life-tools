// pages/bookkeeping/add.js
// 记一笔页面逻辑

const util = require('../../utils/util.js')

// 支出分类
const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜' },
  { name: '交通', icon: '🚌' },
  { name: '购物', icon: '🛒' },
  { name: '娱乐', icon: '🎮' },
  { name: '住房', icon: '🏠' },
  { name: '医疗', icon: '💊' },
  { name: '教育', icon: '📚' },
  { name: '服饰', icon: '👔' },
  { name: '通讯', icon: '📱' },
  { name: '其他', icon: '📦' }
]

// 收入分类
const INCOME_CATEGORIES = [
  { name: '工资', icon: '💰' },
  { name: '奖金', icon: '🎁' },
  { name: '投资', icon: '📈' },
  { name: '红包', icon: '🎊' },
  { name: '兼职', icon: '💵' },
  { name: '其他', icon: '📦' }
]

Page({
  data: {
    type: 'expense',          // 类型：expense/income
    amount: '',               // 金额
    selectedCategory: null,   // 选中的分类对象
    categories: EXPENSE_CATEGORIES, // 当前分类列表
    note: '',                 // 备注
    date: '',                 // 日期 YYYY-MM-DD
    saving: false             // 防抖：防止重复提交
  },

  onLoad: function () {
    // 默认日期为今天
    const today = util.formatDate(new Date())
    this.setData({ date: today })
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
   * 保存账单
   */
  saveBill: function () {
    // 防抖：防止重复提交
    if (this.data.saving) return
    this.setData({ saving: true })

    const { type, amount, selectedCategory, note, date } = this.data

    // 校验金额
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      this.setData({ saving: false })
      util.showToast('请输入有效金额')
      return
    }

    // 校验分类
    if (!selectedCategory) {
      this.setData({ saving: false })
      util.showToast('请选择分类')
      return
    }

    // 处理浮点精度
    const safeAmount = Math.round(amountNum * 100) / 100
    const that = this

    util.showLoading('保存中...')

    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: {
        action: 'add',
        amount: safeAmount,
        type: type,
        category: selectedCategory.name,
        note: note,
        date: date
      },
      success: function (res) {
        util.hideLoading()
        if (res.result.code === 0) {
          util.showToast('保存成功', 'success')
          // 返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1000)
        } else {
          util.showToast(res.result.msg || '保存失败')
          // 保存失败，解除防抖锁定
          that.setData({ saving: false })
        }
      },
      fail: function (err) {
        util.hideLoading()
        console.error('[saveBill] 调用失败:', err)
        util.showToast('网络错误，请重试')
        // 保存失败，解除防抖锁定
        that.setData({ saving: false })
      }
    })
  }
})
