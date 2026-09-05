// pages/random/food/index.js
// 「今天吃什么」核心页面

// 预设菜品列表（带 emoji）
const DEFAULT_FOODS = [
  { name: '盖浇饭', emoji: '🍚' },
  { name: '炒饭', emoji: '🍳' },
  { name: '面条', emoji: '🍜' },
  { name: '饺子', emoji: '🥟' },
  { name: '麻辣烫', emoji: '🌶️' },
  { name: '火锅', emoji: '🍲' },
  { name: '烧烤', emoji: '🍖' },
  { name: '汉堡', emoji: '🍔' },
  { name: '披萨', emoji: '🍕' },
  { name: '寿司', emoji: '🍣' },
  { name: '沙拉', emoji: '🥗' },
  { name: '黄焖鸡', emoji: '🐔' },
  { name: '酸菜鱼', emoji: '🐟' },
  { name: '小龙虾', emoji: '🦞' },
  { name: '烤鱼', emoji: '🔥' },
  { name: '串串香', emoji: '🍢' },
  { name: '冒菜', emoji: '🥘' },
  { name: '煎饼果子', emoji: '🫓' },
  { name: '肉夹馍', emoji: '🥙' },
  { name: '兰州拉面', emoji: '🍜' },
  { name: '沙县小吃', emoji: '🥡' },
  { name: '麻辣香锅', emoji: '🌶️' },
  { name: '螺蛳粉', emoji: '🍜' },
  { name: '酸辣粉', emoji: '🌶️' },
  { name: '鸡公煲', emoji: '🍗' },
  { name: '水煮鱼', emoji: '🐟' },
  { name: '回锅肉', emoji: '🥩' },
  { name: '宫保鸡丁', emoji: '🥜' },
  { name: '鱼香肉丝', emoji: '🥢' },
  { name: '番茄炒蛋', emoji: '🍅' },
  { name: '红烧肉', emoji: '🥩' },
  { name: '糖醋排骨', emoji: '🍖' },
  { name: '麻婆豆腐', emoji: '🧊' },
  { name: '青椒肉丝', emoji: '🫑' },
  { name: '土豆丝', emoji: '🥔' },
  { name: '蛋炒饭', emoji: '🍚' }
]

// 存储 key
const STORAGE_KEYS = {
  customFoods: 'custom_food_list',
  excludedFoods: 'excluded_food_list',
  history: 'food_history'
}

Page({
  data: {
    // 菜品相关
    foodList: [],         // 当前可用菜品列表（预设 - 排除 + 自定义）
    customFoods: [],      // 自定义菜品
    excludedFoods: [],    // 被排除的预设菜品
    // 选择结果
    displayFood: null,    // 当前显示的菜品 { name, emoji }
    isRolling: false,     // 是否正在滚动
    showResult: false,    // 是否展示最终结果
    resultAnim: false,    // 结果弹跳动画触发
    // 菜品管理面板
    showFoodPanel: false, // 是否展开菜品管理面板
    newFood: '',          // 新菜品输入
    // 历史记录
    historyList: [],      // 最近5次选择
    // 记录上次结果，用于换一批不重复
    lastFood: null
  },

  _timer: null,

  onLoad: function () {
    this.initFoodList()
    this.loadHistory()
  },

  onUnload: function () {
    this.clearTimer()
  },

  // ===== 初始化菜品列表 =====
  initFoodList: function () {
    const customFoods = wx.getStorageSync(STORAGE_KEYS.customFoods) || []
    const excludedFoods = wx.getStorageSync(STORAGE_KEYS.excludedFoods) || []

    // 可用预设 = 预设 - 排除
    const availableDefaults = DEFAULT_FOODS.filter(
      f => !excludedFoods.includes(f.name)
    )
    // 自定义菜品（去重预设名）
    const defaultNames = DEFAULT_FOODS.map(f => f.name)
    const validCustoms = customFoods
      .filter(name => !defaultNames.includes(name))
      .map(name => ({ name, emoji: '🍽️' }))

    const foodList = [].concat(availableDefaults, validCustoms)
    this.setData({ foodList, customFoods, excludedFoods })
  },

  // ===== 加载历史记录 =====
  loadHistory: function () {
    const history = wx.getStorageSync(STORAGE_KEYS.history) || []
    this.setData({ historyList: history })
  },

  // ===== 保存历史记录 =====
  saveHistory: function (food) {
    let history = [].concat(this.data.historyList)
    // 添加到开头
    history = [{ name: food.name, emoji: food.emoji, time: this.formatTime() }].concat(history)
    // 只保留最近20条
    if (history.length > 20) history = history.slice(0, 20)
    wx.setStorageSync(STORAGE_KEYS.history, history)
    this.setData({ historyList: history })
  },

  // 格式化时间
  formatTime: function () {
    const d = new Date()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hour}:${min}`
  },

  // ===== 从列表中随机选一个（排除上次结果）=====
  pickRandom: function () {
    const foodList = this.data.foodList
    if (foodList.length <= 1) return foodList[0]
    const last = this.data.lastFood
    let candidates = foodList
    if (last) {
      candidates = foodList.filter(f => f.name !== last.name)
    }
    const idx = Math.floor(Math.random() * candidates.length)
    return candidates[idx]
  },

  // ===== 开始快速随机选择 =====
  startRoll: function () {
    if (this.data.foodList.length === 0) {
      wx.showToast({ title: '菜品列表为空', icon: 'none' })
      return
    }
    if (this.data.isRolling) return

    this.setData({ isRolling: true, showResult: false, resultAnim: false })

    // 快速选择参数：总时长约 1~1.2s
    let interval = 30       // 初始间隔 30ms，极快
    let count = 0
    const maxCount = 15 + Math.floor(Math.random() * 6) // 15~20 次
    const foodList = this.data.foodList

    const roll = () => {
      // 快速切换菜品
      const idx = Math.floor(Math.random() * foodList.length)
      this.setData({ displayFood: foodList[idx] })
      count++

      if (count >= maxCount) {
        // 停止滚动，确定最终结果（排除上次）
        const finalFood = this.pickRandom()
        this.setData({
          displayFood: finalFood,
          isRolling: false,
          showResult: true,
          lastFood: finalFood
        })
        // 触发 scale 弹跳动画
        setTimeout(() => {
          this.setData({ resultAnim: true })
        }, 30)
        // 不自动保存历史，等用户确认
        this.clearTimer()
        return
      }

      // 陡峭减速曲线：前60%快速，后40%急剧减速
      if (count > maxCount * 0.6) {
        interval += 50  // 后段大幅加速间隔
      } else if (count > maxCount * 0.3) {
        interval += 12  // 中段适度减速
      }
      // 前30%保持高速不变

      this._timer = setTimeout(roll, interval)
    }

    roll()
  },

  // 换一批（重新随机，不重复上次结果）
  refresh: function () {
    this.startRoll()
  },

  // 确认选择（点击后才记录到最近选择）
  confirmFood: function () {
    if (this.data.displayFood) {
      this.saveHistory(this.data.displayFood)
      wx.showToast({ title: '已记录', icon: 'success' })
    }
  },

  // 清除定时器
  clearTimer: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  // ===== 菜品管理面板 =====
  toggleFoodPanel: function () {
    this.setData({ showFoodPanel: !this.data.showFoodPanel })
  },

  // 输入新菜品
  onNewFoodInput: function (e) {
    this.setData({ newFood: e.detail.value })
  },

  // 添加自定义菜品
  addFood: function () {
    const name = this.data.newFood.trim()
    if (!name) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' })
      return
    }

    // 检查是否已存在（预设或自定义）
    const allNames = this.data.foodList.map(f => f.name)
    if (allNames.includes(name)) {
      wx.showToast({ title: '该菜品已存在', icon: 'none' })
      return
    }

    // 保存到本地存储
    const customFoods = wx.getStorageSync(STORAGE_KEYS.customFoods) || []
    customFoods.push(name)
    wx.setStorageSync(STORAGE_KEYS.customFoods, customFoods)

    // 重新初始化列表
    this.initFoodList()
    this.setData({ newFood: '' })
    wx.showToast({ title: '添加成功', icon: 'success' })
  },

  // 删除自定义菜品
  deleteCustomFood: function (e) {
    const name = e.currentTarget.dataset.name
    const customFoods = wx.getStorageSync(STORAGE_KEYS.customFoods) || []
    const newCustoms = customFoods.filter(f => f !== name)
    wx.setStorageSync(STORAGE_KEYS.customFoods, newCustoms)
    this.initFoodList()
    wx.showToast({ title: '已删除', icon: 'success' })
  },

  // 排除预设菜品（标记为排除，而非删除）
  toggleExcludeFood: function (e) {
    const name = e.currentTarget.dataset.name
    let excluded = [].concat(this.data.excludedFoods)
    const idx = excluded.indexOf(name)
    if (idx >= 0) {
      excluded.splice(idx, 1) // 取消排除
    } else {
      excluded.push(name) // 标记排除
    }
    wx.setStorageSync(STORAGE_KEYS.excludedFoods, excluded)
    this.initFoodList()
  },

  // 恢复默认（清除所有自定义和排除）
  restoreDefault: function () {
    wx.showModal({
      title: '恢复默认',
      content: '确定恢复默认菜品列表吗？自定义菜品和排除设置将被清除。',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(STORAGE_KEYS.customFoods)
          wx.removeStorageSync(STORAGE_KEYS.excludedFoods)
          this.initFoodList()
          wx.showToast({ title: '已恢复默认', icon: 'success' })
        }
      }
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '今天吃什么？让它替你决定',
      path: '/pages/random/food/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '今天吃什么？让它替你决定' }
  }
})
