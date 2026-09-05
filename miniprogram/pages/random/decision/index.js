// pages/random/decision/index.js
// 随机决策器

const STORAGE_KEY = 'saved_decision_groups'

Page({
  data: {
    optionsText: '',     // 原始输入文本
    options: [],         // 解析后的选项数组
    isRolling: false,    // 是否正在滚动
    highlightIndex: -1,  // 当前高亮索引
    result: '',          // 最终结果
    groupName: '',       // 决策组名称
    savedGroups: []      // 已保存的决策组
  },

  _timer: null,

  onLoad: function () {
    this.loadSavedGroups()
  },

  onUnload: function () {
    this.clearTimer()
  },

  // 加载已保存的决策组
  loadSavedGroups: function () {
    const groups = wx.getStorageSync(STORAGE_KEY) || []
    this.setData({ savedGroups: groups })
  },

  // 输入选项文本
  onOptionsInput: function (e) {
    const text = e.detail.value
    // 解析选项：按行分割，过滤空行
    const options = text.split('\n').map(s => s.trim()).filter(s => s.length > 0)
    this.setData({ optionsText: text, options: options })
  },

  // 开始决策
  startDecision: function () {
    const { options } = this.data
    if (options.length < 2) {
      wx.showToast({ title: '至少需要2个选项', icon: 'none' })
      return
    }

    this.setData({ isRolling: true, result: '', highlightIndex: -1 })

    let interval = 80
    let count = 0
    const maxCount = 25 + Math.floor(Math.random() * 15)

    const roll = () => {
      // 循环高亮每个选项
      const idx = count % options.length
      this.setData({ highlightIndex: idx })
      count++

      if (count >= maxCount) {
        // 停止，随机选择最终结果
        const finalIdx = Math.floor(Math.random() * options.length)
        this.setData({
          highlightIndex: finalIdx,
          isRolling: false,
          result: options[finalIdx]
        })
        this.clearTimer()
        return
      }

      // 逐渐减速
      if (count > maxCount * 0.7) {
        interval += 50
      } else if (count > maxCount * 0.4) {
        interval += 20
      }

      this._timer = setTimeout(roll, interval)
    }

    roll()
  },

  // 清除定时器
  clearTimer: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  // 输入决策组名称
  onGroupNameInput: function (e) {
    this.setData({ groupName: e.detail.value })
  },

  // 保存决策组
  saveGroup: function () {
    const { groupName, options } = this.data
    const name = groupName.trim()

    if (!name) {
      wx.showToast({ title: '请输入决策组名称', icon: 'none' })
      return
    }

    if (options.length < 2) {
      wx.showToast({ title: '至少需要2个选项', icon: 'none' })
      return
    }

    // 加载现有决策组
    const groups = wx.getStorageSync(STORAGE_KEY) || []

    // 检查是否已存在同名
    const existIdx = groups.findIndex(g => g.name === name)
    if (existIdx >= 0) {
      // 更新现有
      groups[existIdx].options = [].concat(options)
    } else {
      // 添加新的
      groups.push({ name: name, options: [].concat(options) })
    }

    wx.setStorageSync(STORAGE_KEY, groups)
    this.loadSavedGroups()
    this.setData({ groupName: '' })
    wx.showToast({ title: '保存成功', icon: 'success' })
  },

  // 加载决策组
  loadGroup: function (e) {
    const name = e.currentTarget.dataset.name
    const groups = this.data.savedGroups
    const group = groups.find(g => g.name === name)

    if (group) {
      const optionsText = group.options.join('\n')
      this.setData({
        optionsText: optionsText,
        options: group.options,
        groupName: name
      })
      wx.showToast({ title: '已加载', icon: 'success' })
    }
  },

  // 删除决策组
  deleteGroup: function (e) {
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认删除',
      content: `确定删除决策组"${name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          const groups = this.data.savedGroups.filter(g => g.name !== name)
          wx.setStorageSync(STORAGE_KEY, groups)
          this.loadSavedGroups()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
