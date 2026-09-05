// cloudfunctions/nearby/index.js
// 附近 POI 搜索云函数 - 代理【高德地图】Web 服务 API（周边搜索 place/around）
//
// 历史：原实现用腾讯位置服务（status=113 此功能未被授权 / 配额分配混乱，排障成本过高），
// 2026-08-26 换为高德。错误码更清晰（10000=成功，10001=key无效，10003=无权限），
// 个人开发者 free 额度足够本功能使用。
//
// 调用链：小程序前端 → wx.cloud.callFunction('nearby') → 高德 restapi.amap.com
// Key 只保存在云端，不随小程序包下发。
//
// Key 优先级：云函数环境变量 AMAP_KEY > 下方内置常量
// 设置环境变量：云开发控制台 → 云函数 → nearby → 配置 → 环境变量

const https = require('https')

// ======== 配置区 ========
// ⚠️ 高德 Key 只从环境变量 AMAP_KEY 读取（已移除代码内置密钥，防泄露）
// 配置方法：云开发控制台 → 云函数 → nearby → 配置 → 环境变量 → AMAP_KEY
const AMAP_KEY = (process.env.AMAP_KEY || '').trim()
const API_HOST = 'restapi.amap.com'
const API_PATH = '/v3/place/around'
const REQUEST_TIMEOUT = 5000
const USER_AGENT = 'wx-cloudfunction'
// =======================

exports.main = async (event) => {
  const ev = event || {}

  // 版本自检：确认云端是不是最新代码
  if (ev.action === 'version') {
    return {
      code: 0,
      version: 'v11-logredact',
      keyConfigured: !!AMAP_KEY,
      note: '高德周边搜索 + 逆地理编码 + 实况天气，Key 仅来自环境变量 AMAP_KEY；请求日志已脱敏'
    }
  }

  // Key 未配置时优雅报错，避免误导
  if (!AMAP_KEY) {
    return { code: -1, msg: '云函数未配置 AMAP_KEY 环境变量（云开发控制台 → 云函数 → nearby → 配置 → 环境变量）' }
  }

  // 逆地理编码：坐标 → 地址文字（用于"当前定位"展示）
  if (ev.action === 'regeo') {
    const lat2 = Number(ev.latitude)
    const lng2 = Number(ev.longitude)
    if (isNaN(lat2) || isNaN(lng2) || lat2 < -90 || lat2 > 90 || lng2 < -180 || lng2 > 180) {
      return { code: -1, msg: '坐标参数错误' }
    }
    try {
      const info = await regeoAmap(lat2, lng2)
      return { code: 0, data: info }
    } catch (err) {
      console.error('[nearby] 逆地理编码失败:', err.message)
      return { code: -1, msg: err.message || '位置解析失败' }
    }
  }


  // 天气查询：坐标 → 逆地理取 adcode → 高德实况天气
  if (ev.action === 'weather') {
    const lat3 = Number(ev.latitude)
    const lng3 = Number(ev.longitude)
    if (isNaN(lat3) || isNaN(lng3) || lat3 < -90 || lat3 > 90 || lng3 < -180 || lng3 > 180) {
      return { code: -1, msg: '坐标参数错误' }
    }
    try {
      const info = await regeoAmap(lat3, lng3)
      if (!info.adcode) {
        return { code: -1, msg: '无法解析所在城市编码' }
      }
      const weather = await weatherAmap(info.adcode)
      weather.city = info.city || info.district || info.province || ''
      return { code: 0, data: weather }
    } catch (err) {
      console.error('[nearby] 天气查询失败:', err.message)
      return { code: -1, msg: err.message || '天气查询失败' }
    }
  }

  const { keyword, latitude, longitude, radius = 3000 } = ev

  // 参数校验
  const kw = (keyword || '').trim()
  const lat = Number(latitude)
  const lng = Number(longitude)
  const rad = Number(radius)

  if (!kw) {
    return { code: -1, msg: '缺少搜索关键词' }
  }
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { code: -1, msg: '坐标参数错误' }
  }
  if (isNaN(rad) || rad <= 0 || rad > 5000) {
    return { code: -1, msg: '搜索半径参数错误（1-5000米）' }
  }

  try {
    const pois = await searchAmap(kw, lat, lng, rad)
    return { code: 0, data: pois }
  } catch (err) {
    console.error('[nearby] 高德搜索失败:', err.message)
    return { code: -1, msg: err.message || '搜索失败' }
  }
}

/**
 * 调高德 place/around 周边搜索，并把结果映射成原腾讯 POI 形状（前端零改动）
 * @param {string} keyword
 * @param {number} lat
 * @param {number} lng
 * @param {number} radius
 * @returns {Promise<Array>} [{title, address, location:{lat,lng}, _distance, category}]
 */
function searchAmap(keyword, lat, lng, radius) {
  // 高德 location 参数顺序：经度,纬度（与腾讯的 lat,lng 相反！）
  const params = [
    'location=' + lng + ',' + lat,
    'keywords=' + encodeURIComponent(keyword),
    'radius=' + radius,
    'offset=25',
    'page=1',
    'extensions=base'
  ].join('&')

  return amapGet(API_PATH, params).then(json => {
    return (json.pois || []).map(p => ({
      title: p.name || '',
      address: p.address || '',
      location: parseLocation(p.location),
      _distance: p.distance ? Math.round(Number(p.distance)) : 0,
      category: p.type || ''
    }))
  })
}

/**
 * 解析高德 "lng,lat" 字符串
 */
function parseLocation(locStr) {
  if (!locStr) return { lat: 0, lng: 0 }
  const parts = String(locStr).split(',')
  const lng = parseFloat(parts[0])
  const lat = parseFloat(parts[1])
  return { lat: isNaN(lat) ? 0 : lat, lng: isNaN(lng) ? 0 : lng }
}

/**
 * 高德实况天气查询
 * 接口：/v3/weather/weatherInfo?city=adcode&extensions=base
 * @param {string} adcode - 城市编码（逆地理 addressComponent.adcode）
 * @returns {Promise<{weather:string, temperature:string, humidity:string, winddirection:string, reporttime:string}>}
 */
function weatherAmap(adcode) {
  const params = 'city=' + encodeURIComponent(adcode) + '&extensions=base'
  return amapGet('/v3/weather/weatherInfo', params).then(json => {
    const live = (json.lives && json.lives[0]) || {}
    return {
      weather: live.weather || '',
      temperature: live.temperature || '',
      humidity: live.humidity || '',
      winddirection: live.winddirection || '',
      reporttime: live.reporttime || ''
    }
  })
}

/**
 * 高德逆地理编码：坐标 → 地址
 * 接口：/v3/geocode/regeo
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{address:string, province:string, city:string, district:string}>}
 */
function regeoAmap(lat, lng) {
  const params = [
    'location=' + lng + ',' + lat,
    'extensions=base'
  ].join('&')

  return amapGet('/v3/geocode/regeo', params).then(json => {
    const rg = json.regeocode || {}
    const ac = rg.addressComponent || {}
    return {
      address: rg.formatted_address || '',
      province: ac.province || '',
      city: ac.city || '',
      district: ac.district || '',
      adcode: ac.adcode || ''
    }
  })
}

/**
 * 通用高德 HTTPS GET 请求（自动拼接 key/output、处理超时和错误）
 * searchAmap 和 regeoAmap 共用，消除重复的 HTTPS 请求代码
 * @param {string} apiPath - 接口路径，如 /v3/place/around
 * @param {string} extraParams - 额外查询参数（不含 key/output）
 * @returns {Promise<Object>} 解析后的 JSON
 */
function amapGet(apiPath, extraParams) {
  return new Promise((resolve, reject) => {
    const params = 'key=' + encodeURIComponent(AMAP_KEY) + '&' + extraParams + '&output=json'
    const path = apiPath + '?' + params
    // 日志脱敏：Key 不进云函数日志
    console.log('[nearby] 高德请求:', apiPath + '?' + params.replace(/key=[^&]+/, 'key=***'))

    const req = https.request({
      hostname: API_HOST,
      path: path,
      method: 'GET',
      timeout: REQUEST_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`高德 HTTP ${res.statusCode}, 响应: ${body.slice(0, 300)}`))
          return
        }
        try {
          const json = JSON.parse(body)
          if (json.status === '1') {
            resolve(json)
          } else {
            reject(new Error(`高德错误: ${json.info || '未知'} (infocode=${json.infocode || '?'})`))
          }
        } catch (e) {
          reject(new Error(`高德响应解析失败: ${e.message}, 响应: ${body.slice(0, 300)}`))
        }
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('请求高德超时'))
    })
    req.on('error', (err) => {
      reject(new Error('请求高德失败: ' + err.message))
    })
    req.end()
  })
}