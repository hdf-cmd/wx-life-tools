// pages/random/group/index.js
// 抽签分组工具

Page({
  data: {
    mode: 'group',       // 当前模式：group=分组，draw=抽签
    namesText: '',       // 原始输入文本
    names: [],           // 解析后的名字数组
    groupCount: 2,       // 分组数量
    groupResults: [],    // 分组结果
    lastGroupResults: [], // 上一次的分组结果（用于避免重复）
    drawCount: '10',     // 签的数量
    drawPick: '1',       // 抽取数量
    drawResults: [],     // 抽签结果
    isDrawing: false     // 是否正在抽签
  },

  _timer: null,

  onUnload: function () {
    this.clearTimer()
  },

  // 切换模式
  switchMode: function (e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ mode: mode })
  },

  // 输入名单
  onNamesInput: function (e) {
    const text = e.detail.value
    // 解析名字：支持换行和逗号分隔
    const names = text
      .split(/[\n,，]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
    this.setData({ namesText: text, names: names })
  },

  // 减少分组数
  decreaseGroup: function () {
    if (this.data.groupCount > 2) {
      this.setData({ groupCount: this.data.groupCount - 1 })
    }
  },

  // 增加分组数
  increaseGroup: function () {
    if (this.data.groupCount < this.data.names.length) {
      this.setData({ groupCount: this.data.groupCount + 1 })
    }
  },

  // 开始分组
  startGroup: function () {
    const { names, groupCount } = this.data
    if (names.length < 2) {
      wx.showToast({ title: '至少需要2个人', icon: 'none' })
      return
    }
    if (groupCount < 2) {
      wx.showToast({ title: '至少需要2组', icon: 'none' })
      return
    }
    if (groupCount > names.length) {
      wx.showToast({ title: '分组数不能超过人数', icon: 'none' })
      return
    }

    const results = this.doGroup(names, groupCount)
    this.setData({
      groupResults: results,
      lastGroupResults: results
    })
  },

  // 执行分组（Fisher-Yates 洗牌）
  doGroup: function (names, groupCount) {
    // 复制数组并洗牌
    const shuffled = [].concat(names)
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // 分配到各组
    const results = Array.from({ length: groupCount }, () => [])
    shuffled.forEach((name, idx) => {
      results[idx % groupCount].push(name)
    })

    return results
  },

  // 重新分组（确保与上次不同）
  reGroup: function () {
    const { names, groupCount, lastGroupResults } = this.data
    let results = this.doGroup(names, groupCount)
    let attempts = 0

    // 尝试确保与上次不同（最多尝试10次）
    while (this.isSameGrouping(results, lastGroupResults) && attempts < 10) {
      results = this.doGroup(names, groupCount)
      attempts++
    }

    this.setData({
      groupResults: results,
      lastGroupResults: results
    })
  },

  // 检查两次分组是否相同
  isSameGrouping: function (a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      const sortedA = a[i].slice().sort()
      const sortedB = b[i].slice().sort()
      if (sortedA.length !== sortedB.length) return false
      for (let j = 0; j < sortedA.length; j++) {
        if (sortedA[j] !== sortedB[j]) return false
      }
    }
    return true
  },

  // 输入签数
  onDrawCountInput: function (e) {
    this.setData({ drawCount: e.detail.value })
  },

  // 输入抽取数量
  onDrawPickInput: function (e) {
    this.setData({ drawPick: e.detail.value })
  },

  // 开始抽签
  startDraw: function () {
    const count = parseInt(this.data.drawCount)
    const pick = parseInt(this.data.drawPick)

    if (isNaN(count) || count < 1) {
      wx.showToast({ title: '请输入有效的签数', icon: 'none' })
      return
    }
    if (isNaN(pick) || pick < 1) {
      wx.showToast({ title: '请输入有效的抽取数量', icon: 'none' })
      return
    }
    if (pick > count) {
      wx.showToast({ title: '抽取数量不能超过签数', icon: 'none' })
      return
    }

    this.setData({ isDrawing: true, drawResults: [] })

    // 抽签动画
    let interval = 80
    let animCount = 0
    const maxAnim = 20

    const animate = () => {
      // 随机显示一个签号
      const randomNum = 1 + Math.floor(Math.random() * count)
      this.setData({ drawResults: [randomNum] })
      animCount++

      if (animCount >= maxAnim) {
        // 停止，生成最终结果
        const results = this.doDraw(count, pick)
        this.setData({
          drawResults: results,
          isDrawing: false
        })
        this.clearTimer()
        return
      }

      if (animCount > maxAnim * 0.6) {
        interval += 30
      }

      this._timer = setTimeout(animate, interval)
    }

    animate()
  },

  // 执行抽签（不重复抽取）
  doDraw: function (count, pick) {
    const pool = []
    for (let i = 1; i <= count; i++) {
      pool.push(i)
    }

    const results = []
    for (let i = 0; i < pick; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      results.push(pool[idx])
      pool.splice(idx, 1)
    }

    // 排序结果
    return results.sort((a, b) => a - b)
  },

  // 清除定时器
  clearTimer: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }
})
