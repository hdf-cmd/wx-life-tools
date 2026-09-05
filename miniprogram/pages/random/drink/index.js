// pages/random/drink/index.js
// 喝什么 - 奶茶随机选择

const util = require('../../../utils/util.js')

// 奶茶品牌数据
const BRAND_DATA = require('./brand-data.js')
Page({
  data: {
    // 品牌列表
    brands: BRAND_DATA,
    // 当前选中的品牌（null 表示未选择）
    selectedBrand: null,
    // 当前品牌的预设饮品列表
    drinkList: [],
    // 被排除的预设饮品（按品牌名存储）
    excludedDrinks: {},
    // 自定义饮品（按品牌名存储）
    customDrinks: {},
    // 显示的饮品（预设 - 排除 + 自定义）
    displayDrinks: [],
    // 当前显示的饮品（滚动动画用）
    displayDrink: null,
    // 是否正在滚动
    isRolling: false,
    // 滚动动画定时器
    rollTimer: null,
    // 上次选中的饮品
    lastDrink: null,
    // 历史记录
    historyList: [],
    // 是否显示管理面板
    showManagePanel: false,
    // 新饮品名称输入
    newDrinkName: '',
    // 结果动画
    resultAnim: false,
    // 附近品牌模式
    nearbyMode: false,
    // 附近有门店的品牌列表
    nearbyBrands: [],
    // 定位加载中
    locationLoading: false,
    // 当前定位的地址文字（逆地理编码结果）
    locationText: '',
    // 是否使用了默认坐标（定位失败 fallback）
    locationFallback: false
  },

  onLoad: function () {
    this.loadCustomDrinks()
    this.loadExcludedDrinks()
    this.loadHistory()
  },

  onUnload: function () {
    this.clearRollTimer()
  },

  // ========== 品牌选择 ==========

  /**
   * 选择品牌（支持附近模式）
   */
  selectBrand: function (e) {
    const brandName = e.currentTarget.dataset.name
    // 优先从 nearbyBrands 查找，再从 brands 查找
    let brand = this.data.nearbyMode
      ? this.data.nearbyBrands.find(b => b.name === brandName)
      : this.data.brands.find(b => b.name === brandName)
    if (!brand) return

    this.setData({
      selectedBrand: brand,
      showManagePanel: false,
      displayDrink: null,
      lastDrink: null
    })

    this.refreshDisplayDrinks()
  },

  /**
   * 返回品牌列表
   */
  backToBrands: function () {
    this.setData({
      selectedBrand: null,
      drinkList: [],
      displayDrinks: [],
      displayDrink: null
    })
  },

  // ========== 刷新显示饮品列表 ==========

  /**
   * 根据排除和自定义重新计算 displayDrinks
   */
  refreshDisplayDrinks: function () {
    const brandName = this.data.selectedBrand.name
    const excluded = this.data.excludedDrinks[brandName] || []
    const customDrinks = this.data.customDrinks[brandName] || []

    // 可用预设 = 预设 - 排除
    const drinkList = this.data.selectedBrand.drinks.filter(
      d => !excluded.includes(d.name)
    )

    // 合并自定义
    const displayDrinks = [].concat(drinkList, customDrinks.map(name => ({ name })))

    this.setData({
      drinkList: drinkList,
      displayDrinks: displayDrinks
    })
  },

  // ========== 随机选择 ==========

  /**
   * 开始随机滚动
   */
  startRoll: function () {
    if (this.data.isRolling) return
    const drinks = this.data.displayDrinks
    if (drinks.length === 0) {
      util.showToast('暂无饮品')
      return
    }
    if (drinks.length === 1) {
      this.setData({ displayDrink: drinks[0], lastDrink: drinks[0], resultAnim: true })
      setTimeout(() => this.setData({ resultAnim: false }), 500)
      this.saveHistory(drinks[0])
      return
    }

    this.setData({ isRolling: true, resultAnim: false })

    // 随机滚动次数 15-20 次
    const totalRolls = 15 + Math.floor(Math.random() * 6)
    let currentRoll = 0
    let interval = 30 // 初始间隔 30ms

    const roll = () => {
      const idx = Math.floor(Math.random() * drinks.length)
      this.setData({ displayDrink: drinks[idx] })
      currentRoll++

      if (currentRoll >= totalRolls) {
        // 最终结果：避免与上次相同
        const finalDrink = this.pickRandom(drinks)
        this.setData({
          displayDrink: finalDrink,
          lastDrink: finalDrink,
          isRolling: false,
          resultAnim: true
        })
        this.saveHistory(finalDrink)
        return
      }

      // 减速曲线
      if (currentRoll > totalRolls * 0.7) {
        interval = 80 + Math.floor(Math.random() * 40)
      } else if (currentRoll > totalRolls * 0.4) {
        interval = 50 + Math.floor(Math.random() * 30)
      }

      this.data.rollTimer = setTimeout(roll, interval)
    }

    roll()
  },

  /**
   * 随机选取（避免与上次相同）
   */
  pickRandom: function (drinks) {
    if (drinks.length <= 1) return drinks[0]
    const last = this.data.lastDrink
    let candidates = drinks
    if (last) {
      candidates = drinks.filter(d => d.name !== last.name)
    }
    if (candidates.length === 0) candidates = drinks
    const idx = Math.floor(Math.random() * candidates.length)
    return candidates[idx]
  },

  /**
   * 换一批（重新随机，不重复上次）
   */
  refresh: function () {
    this.startRoll()
  },

  /**
   * 清除滚动定时器
   */
  clearRollTimer: function () {
    if (this.data.rollTimer) {
      clearTimeout(this.data.rollTimer)
      this.setData({ rollTimer: null })
    }
  },

  // ========== 管理饮品 ==========

  /**
   * 切换管理面板
   */
  toggleManagePanel: function () {
    this.setData({ showManagePanel: !this.data.showManagePanel })
  },

  /**
   * 新饮品名称输入
   */
  onNewDrinkInput: function (e) {
    this.setData({ newDrinkName: e.detail.value })
  },

  /**
   * 添加自定义饮品
   */
  addDrink: function () {
    const name = this.data.newDrinkName.trim()
    if (!name) {
      util.showToast('请输入饮品名称')
      return
    }
    const brandName = this.data.selectedBrand.name
    const customDrinks = this.data.customDrinks[brandName] || []

    // 检查是否已存在（预设或自定义）
    const presetNames = this.data.selectedBrand.drinks.map(d => d.name)
    const allNames = [].concat(presetNames, customDrinks)
    if (allNames.includes(name)) {
      util.showToast('该饮品已存在')
      return
    }

    customDrinks.push(name)
    const newCustomDrinks = Object.assign({}, this.data.customDrinks, { [brandName]: customDrinks })

    this.setData({
      customDrinks: newCustomDrinks,
      newDrinkName: ''
    })

    // 保存到本地存储
    wx.setStorageSync('drink_customDrinks', newCustomDrinks)
    this.refreshDisplayDrinks()
    util.showToast('添加成功', 'success')
  },

  /**
   * 删除自定义饮品
   */
  deleteCustomDrink: function (e) {
    const name = e.currentTarget.dataset.name
    const brandName = this.data.selectedBrand.name
    let customDrinks = this.data.customDrinks[brandName] || []
    customDrinks = customDrinks.filter(n => n !== name)

    const newCustomDrinks = Object.assign({}, this.data.customDrinks)
    if (customDrinks.length === 0) {
      delete newCustomDrinks[brandName]
    } else {
      newCustomDrinks[brandName] = customDrinks
    }

    this.setData({
      customDrinks: newCustomDrinks
    })

    wx.setStorageSync('drink_customDrinks', newCustomDrinks)
    this.refreshDisplayDrinks()
    util.showToast('已删除', 'success')
  },

  /**
   * 排除/恢复预设饮品
   */
  toggleExcludeDrink: function (e) {
    const name = e.currentTarget.dataset.name
    const brandName = this.data.selectedBrand.name
    let excluded = this.data.excludedDrinks[brandName] || []
    const idx = excluded.indexOf(name)
    if (idx >= 0) {
      excluded.splice(idx, 1)
    } else {
      excluded.push(name)
    }

    const newExcluded = Object.assign({}, this.data.excludedDrinks)
    if (excluded.length === 0) {
      delete newExcluded[brandName]
    } else {
      newExcluded[brandName] = excluded
    }

    this.setData({
      excludedDrinks: newExcluded
    })

    wx.setStorageSync('drink_excludedDrinks', newExcluded)
    this.refreshDisplayDrinks()
  },

  /**
   * 恢复默认（清除该品牌的自定义和排除）
   */
  restoreDefault: function () {
    wx.showModal({
      title: '恢复默认',
      content: '确定恢复默认饮品列表吗？该品牌的自定义饮品和排除设置将被清除。',
      success: (res) => {
        if (res.confirm) {
          const brandName = this.data.selectedBrand.name
          const newCustom = Object.assign({}, this.data.customDrinks)
          const newExcluded = Object.assign({}, this.data.excludedDrinks)
          delete newCustom[brandName]
          delete newExcluded[brandName]

          this.setData({
            customDrinks: newCustom,
            excludedDrinks: newExcluded
          })

          wx.setStorageSync('drink_customDrinks', newCustom)
          wx.setStorageSync('drink_excludedDrinks', newExcluded)
          this.refreshDisplayDrinks()
          util.showToast('已恢复默认', 'success')
        }
      }
    })
  },

  // ========== 历史记录 ==========

  /**
   * 保存历史记录
   */
  saveHistory: function (drink) {
    let history = [].concat(this.data.historyList)
    const record = {
      name: drink.name,
      price: drink.price || 0,
      brandName: this.data.selectedBrand.name,
      brandIcon: this.data.selectedBrand.logo,
      time: Date.now()
    }

    // 去重：移除已有的相同记录
    history = history.filter(h => h.name !== drink.name || h.brandName !== this.data.selectedBrand.name)
    history.unshift(record)

    // 最多保留 20 条
    if (history.length > 20) history = history.slice(0, 20)

    this.setData({ historyList: history })
    wx.setStorageSync('drink_history', history)
  },

  /**
   * 加载历史记录
   */
  loadHistory: function () {
    const history = wx.getStorageSync('drink_history') || []
    this.setData({ historyList: history })
  },

  /**
   * 加载自定义饮品
   */
  loadCustomDrinks: function () {
    const customDrinks = wx.getStorageSync('drink_customDrinks') || {}
    this.setData({ customDrinks: customDrinks })
  },

  /**
   * 加载排除饮品
   */
  loadExcludedDrinks: function () {
    const excludedDrinks = wx.getStorageSync('drink_excludedDrinks') || {}
    this.setData({ excludedDrinks: excludedDrinks })
  },

  // ========== 附近品牌 ==========

  /**
   * 点击"附近品牌"按钮
   */
  goNearby: function () {
    this.setData({ locationLoading: true, locationText: '', locationFallback: false })

    // 与首页天气共享定位（10 分钟内复用缓存）
    const map = require('../../../utils/map.js')
    map.getSharedLocation().then((loc) => {
      this.resolveLocationText(loc.latitude, loc.longitude)
      this.searchNearbyBrands(loc.latitude, loc.longitude)
    }).catch((err) => {
      // 模拟器定位失败时，使用默认坐标（北京）作为备选
      console.warn('[附近品牌] 定位失败，使用默认坐标:', err && err.errMsg)
      this.setData({ locationFallback: true })
      this.resolveLocationText(39.9042, 116.4074)
      this.searchNearbyBrands(39.9042, 116.4074)
    })
  },

  /**
   * 逆地理编码：坐标 → 地址文字（带 24h 本地缓存，避免反复消耗高德额度）
   */
  resolveLocationText: function (latitude, longitude) {
    const map = require('../../../utils/map.js')
    const cacheKey = 'locText_' + latitude.toFixed(3) + ',' + longitude.toFixed(3)
    const cached = wx.getStorageSync(cacheKey)
    if (cached && cached.time && Date.now() - cached.time < 24 * 3600 * 1000) {
      this.setData({ locationText: cached.text })
      return
    }

    map.getLocationText(latitude, longitude).then(info => {
      if (info && info.address) {
        const text = info.address
        try {
          wx.setStorageSync(cacheKey, { text: text, time: Date.now() })
        } catch (e) { /* 缓存失败忽略 */ }
        this.setData({ locationText: text })
      } else {
        this.setData({ locationText: '' })
      }
    }).catch(() => {
      this.setData({ locationText: '' })
    })
  },

  /**
   * 搜索附近品牌
   */
  searchNearbyBrands: function (latitude, longitude) {
    const map = require('../../../utils/map.js')

    // 24h 本地缓存：同一坐标当天只查一次高德，保护免费配额
    const cacheKey = 'nearby_pois_' + latitude.toFixed(3) + ',' + longitude.toFixed(3)
    const cached = wx.getStorageSync(cacheKey)
    const useCached = cached && cached.time && Date.now() - cached.time < 24 * 3600 * 1000 && Array.isArray(cached.pois)

    const poisPromise = useCached
      ? Promise.resolve(cached.pois)
      : map.searchNearby(latitude, longitude, '奶茶', 3000).then(pois => {
          try {
            wx.setStorageSync(cacheKey, { pois: pois, time: Date.now() })
          } catch (e) { /* 缓存写入失败忽略 */ }
          return pois
        })

    poisPromise.then(pois => {
      // 提取所有 POI 名称，用于品牌匹配
      const poiNames = pois.map(p => p.title).join(' ')

      // 12个品牌名称（用于模糊匹配）
      const brandNames = this.data.brands.map(b => b.name)
      // 从品牌数据动态生成关键词映射（单一数据源，避免硬编码重复）
      const brandShortNames = {}
      this.data.brands.forEach(b => { brandShortNames[b.name] = b.keywords || [b.name] })

      // 匹配附近有门店的品牌
      const nearbyBrands = []
      brandNames.forEach(name => {
        const keywords = brandShortNames[name] || [name]
        const hasStore = keywords.some(kw => poiNames.indexOf(kw) > -1)
        if (hasStore) {
          // 找到最近门店的距离
          let minDist = Infinity
          pois.forEach(poi => {
            keywords.forEach(kw => {
              if (poi.title.indexOf(kw) > -1) {
                const dist = this.calcDistance(latitude, longitude, poi.location.lat, poi.location.lng)
                if (dist < minDist) minDist = dist
              }
            })
          })
          const dist = minDist < Infinity ? minDist : null
          nearbyBrands.push(Object.assign({}, this.data.brands.find(b => b.name === name), { distance: dist,
            distanceText: dist ? (dist < 1000 ? dist + 'm' : (dist / 1000).toFixed(1) + 'km') : '' }))
        }
      })

      this.setData({
        nearbyMode: true,
        nearbyBrands: nearbyBrands,
        locationLoading: false
      })

      if (nearbyBrands.length === 0) {
        util.showToast('附近暂未找到匹配品牌')
      }
    }).catch(err => {
      this.setData({ locationLoading: false })
      console.error('[附近品牌] 搜索失败:', err)
      util.showToast('搜索附近品牌失败')
    })
  },

  /**
   * 计算两点间距离（米）- Haversine 公式
   */
  calcDistance: function (lat1, lng1, lat2, lng2) {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  },

  /**
   * 退出附近模式，显示全部品牌
   */
  exitNearbyMode: function () {
    this.setData({
      nearbyMode: false,
      nearbyBrands: [],
      locationText: '',
      locationFallback: false
    })
  },

  /**
   * 分享给好友（带抽中的饮品名）
   */
  onShareAppMessage: function () {
    const last = this.data.lastDrink
    const name = last && last.name
    return {
      title: name ? '我抽到了「' + name + '」，你也来一杯' : '今天喝什么？282 款饮品随机选',
      path: '/pages/random/drink/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '今天喝什么？282 款饮品随机选' }
  }
})
