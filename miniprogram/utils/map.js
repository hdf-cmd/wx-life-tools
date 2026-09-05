// utils/map.js
// 附近 POI 搜索（云函数代理版 → 高德地图）
//
// 调用链：小程序前端 → wx.cloud.callFunction('nearby') → 高德 restapi.amap.com
//
// 历史：
//   - 最初直连腾讯位置服务（IP白名单/Key类型/配额各种 112/113/121，排障成本过高）
//   - 改云函数代理腾讯（边界参数编码/双斜杠/机房IP 113，仍未完全收敛）
//   - 2026-08-26 云函数切换为高德 Web 服务 API（/v3/place/around），错误码清晰，前端零改动
//
// Key 只存在云端（cloudfunctions/nearby），不下发小程序包。

/**
 * 搜索附近 POI
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @param {string} keyword - 搜索关键词，如 "奶茶"
 * @param {number} radius - 搜索半径（米），默认 3000
 * @returns {Promise<Array>} POI 列表（与云函数返回形状一致：title / location.lat / location.lng / _distance）
 */
function searchNearby(latitude, longitude, keyword, radius = 3000) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      followSystem: true,
      name: 'nearby',
      data: {
        keyword: keyword,
        latitude: latitude,
        longitude: longitude,
        radius: radius
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0) {
        resolve(result.data || [])
      } else {
        reject(new Error(result.msg || '搜索失败'))
      }
    }).catch(err => {
      console.error('[map] 云函数调用失败:', err)
      reject(err)
    })
  })
}

/**
 * 逆地理编码：坐标 → 地址信息（"当前定位"展示用）
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @returns {Promise<Object|null>} {address, province, city, district}，失败返回 null
 */
function getLocationText(latitude, longitude) {
  return wx.cloud.callFunction({
    followSystem: true,
    name: 'nearby',
    data: { action: 'regeo', latitude: latitude, longitude: longitude }
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      return result.data
    }
    return null
  }).catch(err => {
    console.error('[map] 逆地理编码失败:', err)
    return null
  })
}

/**
 * 共享定位（首页天气 / 附近品牌共用，10 分钟内复用缓存，避免反复唤起 GPS）
 * 注：平台不开放 wx.getLocation（类目不符），使用 wx.getFuzzyLocation 模糊定位（约1公里精度，天气/附近门店足够）
 * @returns {Promise<{latitude:number, longitude:number}>}
 */
function getSharedLocation() {
  const CACHE_KEY = 'shared_location'
  let cached = null
  try { cached = wx.getStorageSync(CACHE_KEY) } catch (e) { /* 忽略 */ }
  if (cached && cached.time && Date.now() - cached.time < 10 * 60 * 1000) {
    return Promise.resolve({ latitude: cached.latitude, longitude: cached.longitude })
  }
  return new Promise(function (resolve, reject) {
    wx.getFuzzyLocation({
      type: 'gcj02',
      success: function (res) {
        try {
          wx.setStorageSync(CACHE_KEY, { latitude: res.latitude, longitude: res.longitude, time: Date.now() })
        } catch (e) { /* 缓存失败忽略 */ }
        resolve({ latitude: res.latitude, longitude: res.longitude })
      },
      fail: function (err) {
        reject(err)
      }
    })
  })
}

/**
 * 实况天气查询（走 nearby 云函数 → 高德天气接口）
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object|null>} {weather, temperature, city, ...}，失败返回 null
 */
function getWeather(latitude, longitude) {
  return wx.cloud.callFunction({
    followSystem: true,
    name: 'nearby',
    data: { action: 'weather', latitude: latitude, longitude: longitude }
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      return result.data
    }
    return null
  }).catch(err => {
    console.error('[map] 天气查询失败:', err)
    return null
  })
}

module.exports = { searchNearby, getLocationText, getSharedLocation, getWeather }