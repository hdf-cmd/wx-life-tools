// cloudfunctions/unwatermark/index.js
// 短视频去水印：解析抖音/皮皮虾/小红书分享链接，获取无水印视频并转存到云存储
//
// 抖音(2026新方案): 短链取 aweme_id -> 生成 a_bogus 签名 -> aweme/v1/web/aweme/detail 接口 -> bit_rate 无水印直链
//   抖音匿名接口已被签名校验(a_bogus)保护，此处内置其签名算法；若平台升级算法可能失效，保留旧逻辑兜底。
//   仅供个人学习/备份用途，请勿用于批量采集或二次分发他人作品。
// 皮皮虾: item_id -> cell_h5_comment 接口 -> video_high 无水印
// 小红书: 笔记页 originVideoKey
//
// 小程序前端无法直连平台域名，解析与下载在云函数完成，视频转存云存储后经 fileID 预览/下载。

const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 抖音签名与请求固定使用此 UA（a_bogus 与 UA 绑定，勿改）
const UA_DOUYIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// 抖音 ttwid 兜底（注册接口失败时使用）
const FALLBACK_TTWID = '1%7CvDWCB8tYdKPbdOlqwNTkDPhizBaV9i91KjYLKJbqurg%7C1723536402%7C314e63000decb79f46b8ff255560b29f4d8c57352dad465b41977db4830b4c7e'

exports.main = async (event) => {
  const raw = ((event && event.url) || '').trim()
  if (!raw) return { code: -1, msg: '链接为空' }

  // 从分享文案中提取 http 链接
  const m = raw.match(/https?:\/\/[^\s\u00A0"'<>]+/)
  if (!m) return { code: -1, msg: '未识别到链接，请粘贴完整的分享链接' }
  const link = m[0]

  try {
    let meta
    if (/douyin\.com|iesdouyin/.test(link)) {
      meta = await parseDouyin(link)
    } else if (/pipix/.test(link)) {
      meta = await parsePipixia(link)
    } else if (/xhslink\.com|xiaohongshu\.com/.test(link)) {
      meta = await parseXhs(link)
    } else {
      return { code: -1, msg: '暂不支持该平台，目前支持抖音、皮皮虾、小红书' }
    }

    if (!meta || !meta.videoUrl) return { code: -1, msg: '解析失败：未找到视频（该链接可能是图文内容）' }

    // 下载视频 -> 上传云存储（前端经 fileID 下载，无需域名白名单）
    const buf = await httpGet(meta.videoUrl, { timeout: 45000, referer: meta.referer })
    if (!buf.body || buf.body.length < 10240) return { code: -1, msg: '视频下载失败，请换个视频试试' }
    const cloudPath = 'unwatermark/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp4'
    const up = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buf.body })

    return {
      code: 0,
      fileID: up.fileID,
      desc: meta.desc || '',
      cover: meta.cover || '',
      sizeMB: (buf.body.length / 1024 / 1024).toFixed(1)
    }
  } catch (e) {
    console.error('[unwatermark] 解析失败:', e && e.message)
    return { code: -1, msg: (e && e.message) || '解析失败，请稍后重试' }
  }
}

// ==================== 抖音 ====================

/** 抖音：优先 a_bogus 签名接口，逐级兜底 */
async function parseDouyin(link) {
  let page = null
  try { page = await httpGet(link, { ua: UA_MOBILE }) } catch (e) { }
  const html = page ? page.body.toString('utf8') : ''
  const finalUrl = page ? page.finalUrl : link

  let awemeId = null
  const idm = finalUrl.match(/(?:video|note)\/(\d+)/) ||
    finalUrl.match(/modal_id=(\d+)/) ||
    html.match(/video\/(\d{15,})/) ||
    link.match(/(?:video|note)\/(\d+)/)
  if (idm) awemeId = idm[1]

  // 主方案：a_bogus 签名 + detail 接口
  if (awemeId) {
    try {
      const detail = await fetchAwemeDetailSigned(awemeId)
      if (detail) {
        const meta = extractFromDetail(detail)
        if (meta) return meta
      }
    } catch (e) { /* 落入兜底 */ }
  }

  // 兜底 1：分享页 _ROUTER_DATA
  const data = extractRouterData(html)
  if (data) {
    const itemList = findFirst(data, 'item_list')
    if (itemList && itemList[0]) {
      const meta = douyinFromItem(itemList[0])
      if (meta) return meta
    }
  }
  // 兜底 2：iteminfo 接口
  if (awemeId) {
    try {
      const r = await httpGet('https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=' + awemeId, { ua: UA_MOBILE })
      const j = JSON.parse(r.body.toString('utf8'))
      if (j.item_list && j.item_list[0]) {
        const meta = douyinFromItem(j.item_list[0])
        if (meta) return meta
      }
    } catch (e) { }
  }
  // 兜底 3：分享页 HTML 里的 CDN 播放直链
  const um = html.match(/https?:\/\/[^"'\s]+?\/aweme\/v1\/play\/\?video_id=[^"'&\s]+/)
  if (um) return { desc: '', cover: '', videoUrl: um[0].replace(/playwm/g, 'play') }

  throw new Error('抖音解析失败，请确认是视频分享链接')
}

/** a_bogus 签名请求 aweme/detail，成功返回 aweme_detail 对象 */
async function fetchAwemeDetailSigned(awemeId) {
  const referer = 'https://www.douyin.com/video/' + awemeId + '?previous_page=web_code_link'

  // 预热一次视频页（尽力而为）
  try { await httpGet(referer, { headers: browserHeaders(referer) }) } catch (e) { }

  for (let attempt = 0; attempt < 2; attempt++) {
    let ttwid = await getTtwid()
    if (!ttwid) ttwid = FALLBACK_TTWID

    const query = buildQuery({
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      aweme_id: awemeId,
      msToken: randomMsToken(107)
    })
    const aBogus = generate_a_bogus(query, UA_DOUYIN)
    if (!aBogus) return null

    const finalUrl = 'https://www.douyin.com/aweme/v1/web/aweme/detail/?' + query + '&a_bogus=' + encodeURIComponent(aBogus)
    const headers = browserHeaders(referer)
    headers['cookie'] = 'ttwid=' + ttwid

    try {
      const r = await httpGet(finalUrl, { headers: headers })
      const json = JSON.parse(r.body.toString('utf8'))
      if (json && json.aweme_detail) return json.aweme_detail
    } catch (e) { /* 重试 */ }
  }
  return null
}

function browserHeaders(referer) {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'referer': referer,
    'user-agent': UA_DOUYIN,
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  }
}

/** 与浏览器 URLSearchParams 一致的查询串编码 */
function buildQuery(params) {
  try {
    const USP = (typeof URLSearchParams !== 'undefined') ? URLSearchParams : require('url').URLSearchParams
    const sp = new USP()
    for (const k in params) sp.append(k, params[k])
    return sp.toString()
  } catch (e) {
    return Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]) }).join('&')
  }
}

/** 注册获取 ttwid cookie */
function getTtwid() {
  const postData = JSON.stringify({
    region: 'cn', aid: 6383, need_t: 1, service: 'www.douyin.com',
    migrate_priority: 0, cb_url_protocol: 'https', domain: '.douyin.com'
  })
  return new Promise(function (resolve) {
    const req = https.request('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA_DOUYIN,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, function (res) {
      const sc = res.headers['set-cookie']
      const setCookie = sc ? (Array.isArray(sc) ? sc.join(',') : sc) : ''
      res.resume()
      const m = setCookie.match(/(?:^|,\s*)ttwid=([^;\s]+)/i)
      resolve(m ? decodeURIComponent(m[1]) : null)
    })
    req.on('error', function () { resolve(null) })
    req.setTimeout(10000, function () { req.destroy(); resolve(null) })
    req.write(postData)
    req.end()
  })
}

/** 从 aweme_detail 提取无水印视频直链（优先高码率） */
function extractFromDetail(detail) {
  const video = detail.video || {}
  let url = null
  const br = video.bit_rate || video.bitRateList || []
  if (br && br.length) {
    const sorted = br.slice().sort(function (a, b) { return ((b.bit_rate || b.bitRate || 0) - (a.bit_rate || a.bitRate || 0)) })
    for (let i = 0; i < sorted.length; i++) {
      const addr = sorted[i].play_addr || sorted[i].playAddr || {}
      const list = addr.url_list || addr.urlList || []
      if (list.length) { url = list[0]; break }
    }
  }
  if (!url) {
    const pa = video.play_addr || {}
    const list = pa.url_list || []
    url = list[0]
  }
  if (!url) return null
  url = String(url).replace(/playwm/g, 'play')
  if (url.indexOf('http://') === 0) url = 'https://' + url.slice(7)
  const cover = (video.origin_cover && video.origin_cover.url_list && video.origin_cover.url_list[0]) ||
    (video.cover && video.cover.url_list && video.cover.url_list[0]) || ''
  return { desc: detail.desc || '', cover: cover, videoUrl: url, referer: 'https://www.douyin.com/' }
}

function douyinFromItem(item) {
  const v = item.video || {}
  const addr = v.play_addr || {}
  const list = addr.url_list || []
  if (!list.length) return null
  return {
    desc: item.desc || '',
    cover: (v.origin_cover && v.origin_cover.url_list && v.origin_cover.url_list[0]) ||
      (v.cover && v.cover.url_list && v.cover.url_list[0]) || '',
    videoUrl: list[0].replace(/playwm/g, 'play')
  }
}

function extractRouterData(html) {
  const idx = html.indexOf('window._ROUTER_DATA')
  if (idx < 0) return null
  const s = html.indexOf('{', idx)
  if (s < 0) return null
  const e = html.indexOf('</script>', s)
  if (e < 0) return null
  try { return JSON.parse(html.slice(s, e).trim()) } catch (err) { return null }
}

// ==================== 皮皮虾 ====================

/** 皮皮虾：优先 cell_h5_comment 接口，兜底 detail 接口 */
async function parsePipixia(link) {
  const page = await httpGet(link, { ua: UA_MOBILE })
  const html = page.body.toString('utf8')
  const idm = page.finalUrl.match(/item_id=(\d+)/) ||
    page.finalUrl.match(/item\/(\d+)/) ||
    page.finalUrl.match(/detail\/(\d+)/) ||
    html.match(/"item_id"\s*:\s*"?(\d{10,})/) ||
    html.match(/item\/(\d{10,})/)
  if (!idm) throw new Error('皮皮虾链接解析失败，请重新复制链接')
  const itemId = idm[1]

  // 主方案：cell_h5_comment 接口
  try {
    const r = await httpGet('https://h5.pipix.com/bds/cell/cell_h5_comment/?count=5&aid=1319&app_name=super&cell_id=' + itemId, { ua: UA_MOBILE })
    const j = JSON.parse(r.body.toString('utf8'))
    const cells = (j.data && j.data.cell_comments) || []
    for (let i = 0; i < cells.length; i++) {
      const item = (cells[i].comment_info && cells[i].comment_info.item) || {}
      const vd = item.video || {}
      const vh = vd.video_high || vd.video_download || vd
      const list = vh.url_list || []
      if (list.length) {
        const u = list[0].url || list[0]
        if (u) {
          return {
            desc: item.content || '',
            cover: (item.cover && item.cover.url_list && item.cover.url_list[0] && item.cover.url_list[0].url) || '',
            videoUrl: u
          }
        }
      }
    }
  } catch (e) { /* 落入兜底 */ }

  // 兜底：原 detail 接口
  const r = await httpGet('https://h5.pipix.com/bds/webapi/item/detail/?item_id=' + itemId, { ua: UA_MOBILE })
  const j = JSON.parse(r.body.toString('utf8'))
  const item = j && j.data && j.data.item
  if (!item || !item.video) throw new Error('皮皮虾解析失败：该内容可能不是视频')
  const dl = item.video.video_download || item.video
  const url = dl && ((dl.url_list && dl.url_list[0] && dl.url_list[0].url) || dl.url)
  if (!url) throw new Error('皮皮虾解析失败：未找到视频地址')
  return {
    desc: item.content || item.text || '',
    cover: item.video.cover_image && item.video.cover_image.url_list &&
      item.video.cover_image.url_list[0] && item.video.cover_image.url_list[0].url || '',
    videoUrl: url
  }
}

// ==================== 小红书 ====================

/** 小红书：笔记页提取 originVideoKey（无水印原始视频） */
async function parseXhs(link) {
  const page = await httpGet(link, { ua: UA_PC })
  const html = page.body.toString('utf8')
  const tm = html.match(/<title>([^<]*)<\/title>/)
  const title = tm ? tm[1].replace(/ - 小红书$/, '').trim() : ''

  const km = html.match(/"originVideoKey"\s*:\s*"([^"]+)"/)
  if (km) {
    const key = km[1].replace(/\\u002[Ff]/g, '/').replace(/\\\//g, '/')
    return { desc: title, cover: '', videoUrl: 'https://sns-video-bd.xhscdn.com/' + key }
  }
  // 兜底：og:video（该地址可能带水印，但保证可播）
  const om = html.match(/og:video[^>]*content="([^"]+)"/)
  if (om && om[1]) return { desc: title, cover: '', videoUrl: om[1] }
  throw new Error('小红书解析失败：未找到视频（图文笔记暂不支持，或页面需要登录）')
}

// ==================== 工具函数 ====================

/**
 * HTTP(S) 请求，自动跟随重定向（最多 6 次）
 * options: { ua, timeout, referer, headers(完整自定义), method, body }
 * @returns {Promise<{body: Buffer, finalUrl: string, headers: object}>}
 */
function httpGet(url, options, depth) {
  options = options || {}
  depth = depth || 0
  const method = options.method || 'GET'
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf('https:') === 0 ? https : http
    const headers = options.headers || {
      'User-Agent': options.ua || UA_MOBILE,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': options.referer || url
    }
    const req = lib.request(url, { headers: headers, method: method }, function (res) {
      const code = res.statusCode
      if ([301, 302, 303, 307, 308].indexOf(code) >= 0 && res.headers.location) {
        res.resume()
        if (depth >= 6) { reject(new Error('重定向次数过多')); return }
        let next = res.headers.location
        if (next.indexOf('http') !== 0) {
          // 手动拼接相对地址（兼容低版本 Node 运行时，不依赖 URL 构造器）
          if (next.indexOf('/') === 0) {
            const pm = url.match(/^(https?:\/\/[^\/]+)/)
            next = (pm ? pm[1] : '') + next
          } else {
            next = url.slice(0, url.lastIndexOf('/') + 1) + next
          }
        }
        resolve(httpGet(next, options, depth + 1))
        return
      }
      if (code !== 200) {
        res.resume()
        reject(new Error('HTTP ' + code))
        return
      }
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () { resolve({ body: Buffer.concat(chunks), finalUrl: url, headers: res.headers }) })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(options.timeout || 15000, function () { req.destroy(new Error('请求超时')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

/** 深度优先查找对象中第一个指定 key 的值 */
function findFirst(obj, key) {
  if (!obj || typeof obj !== 'object') return null
  if (obj[key] !== undefined) return obj[key]
  for (const k in obj) {
    const r = findFirst(obj[k], key)
    if (r !== null) return r
  }
  return null
}

// ==================== a_bogus 签名算法（纯 JS，拼接到此处） ====================

function randomMsToken(length) {
    const base = "ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789=";
    let out = "";
    for (let i = 0; i < length; i += 1) {
        out += base.charAt(Math.floor(Math.random() * base.length));
    }
    return out;
}

function toHttps(url) {
    if (!url) {
        return null;
    }
    return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
}

function host(url) {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return null;
    }
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function rc4_encrypt(plaintext, key) {
    const s = [];
    for (let i = 0; i < 256; i += 1) {
        s[i] = i;
    }
    let j = 0;
    for (let i = 0; i < 256; i += 1) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
        const temp = s[i];
        s[i] = s[j];
        s[j] = temp;
    }

    let i = 0;
    j = 0;
    const cipher = [];
    for (let k = 0; k < plaintext.length; k += 1) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        const temp = s[i];
        s[i] = s[j];
        s[j] = temp;
        const t = (s[i] + s[j]) % 256;
        cipher.push(String.fromCharCode(s[t] ^ plaintext.charCodeAt(k)));
    }
    return cipher.join("");
}

function le(e, r) {
    return ((e << (r % 32)) | (e >>> (32 - (r % 32)))) >>> 0;
}

function de(e) {
    if (e >= 0 && e < 16) {
        return 2043430169;
    }
    if (e >= 16 && e < 64) {
        return 2055708042;
    }
    throw new Error("invalid j for constant Tj");
}

function pe(e, r, t, n) {
    if (e >= 0 && e < 16) {
        return (r ^ t ^ n) >>> 0;
    }
    if (e >= 16 && e < 64) {
        return ((r & t) | (r & n) | (t & n)) >>> 0;
    }
    throw new Error("invalid j for bool function FF");
}

function he(e, r, t, n) {
    if (e >= 0 && e < 16) {
        return (r ^ t ^ n) >>> 0;
    }
    if (e >= 16 && e < 64) {
        return ((r & t) | (~r & n)) >>> 0;
    }
    throw new Error("invalid j for bool function GG");
}

class SM3 {
    constructor() {
        this.reg = [];
        this.chunk = [];
        this.size = 0;
        this.reset();
    }

    reset() {
        this.reg[0] = 1937774191;
        this.reg[1] = 1226093241;
        this.reg[2] = 388252375;
        this.reg[3] = 3666478592;
        this.reg[4] = 2842636476;
        this.reg[5] = 372324522;
        this.reg[6] = 3817729613;
        this.reg[7] = 2969243214;
        this.chunk = [];
        this.size = 0;
    }

    write(input) {
        const bytes =
            typeof input === "string"
                ? Array.from(
                    encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) =>
                        String.fromCharCode(Number(`0x${hex}`))
                    ),
                    (ch) => ch.charCodeAt(0)
                )
                : input;

        this.size += bytes.length;
        let free = 64 - this.chunk.length;

        if (bytes.length < free) {
            this.chunk = this.chunk.concat(bytes);
            return;
        }

        this.chunk = this.chunk.concat(bytes.slice(0, free));
        while (this.chunk.length >= 64) {
            this._compress(this.chunk);
            if (free < bytes.length) {
                this.chunk = bytes.slice(free, Math.min(free + 64, bytes.length));
            } else {
                this.chunk = [];
            }
            free += 64;
        }
    }

    sum(input, format) {
        if (input) {
            this.reset();
            this.write(input);
        }
        this._fill();

        for (let i = 0; i < this.chunk.length; i += 64) {
            this._compress(this.chunk.slice(i, i + 64));
        }

        let result;
        if (format === "hex") {
            result = "";
            for (let i = 0; i < 8; i += 1) {
                result += se(this.reg[i].toString(16), 8, "0");
            }
        } else {
            result = new Array(32);
            for (let i = 0; i < 8; i += 1) {
                let c = this.reg[i];
                result[4 * i + 3] = (c & 255) >>> 0;
                c >>>= 8;
                result[4 * i + 2] = (c & 255) >>> 0;
                c >>>= 8;
                result[4 * i + 1] = (c & 255) >>> 0;
                c >>>= 8;
                result[4 * i] = (c & 255) >>> 0;
            }
        }

        this.reset();
        return result;
    }

    _compress(t) {
        if (t.length < 64) {
            throw new Error("compress error: not enough data");
        }

        const w = new Array(132);
        for (let i = 0; i < 16; i += 1) {
            w[i] = (t[4 * i] << 24) | (t[4 * i + 1] << 16) | (t[4 * i + 2] << 8) | t[4 * i + 3];
            w[i] >>>= 0;
        }

        for (let i = 16; i < 68; i += 1) {
            let a = w[i - 16] ^ w[i - 9] ^ le(w[i - 3], 15);
            a = a ^ le(a, 15) ^ le(a, 23);
            w[i] = (a ^ le(w[i - 13], 7) ^ w[i - 6]) >>> 0;
        }

        for (let i = 0; i < 64; i += 1) {
            w[i + 68] = (w[i] ^ w[i + 4]) >>> 0;
        }

        const state = this.reg.slice(0);
        for (let i = 0; i < 64; i += 1) {
            let ss1 = le((((le(state[0], 12) + state[4] + le(de(i), i)) >>> 0) & 0xffffffff) >>> 0, 7);
            const ss2 = (ss1 ^ le(state[0], 12)) >>> 0;
            let tt1 = pe(i, state[0], state[1], state[2]);
            tt1 = (tt1 + state[3] + ss2 + w[i + 68]) >>> 0;
            let tt2 = he(i, state[4], state[5], state[6]);
            tt2 = (tt2 + state[7] + ss1 + w[i]) >>> 0;

            state[3] = state[2];
            state[2] = le(state[1], 9);
            state[1] = state[0];
            state[0] = tt1;
            state[7] = state[6];
            state[6] = le(state[5], 19);
            state[5] = state[4];
            state[4] = (tt2 ^ le(tt2, 9) ^ le(tt2, 17)) >>> 0;
        }

        for (let i = 0; i < 8; i += 1) {
            this.reg[i] = (this.reg[i] ^ state[i]) >>> 0;
        }
    }

    _fill() {
        const totalBits = 8 * this.size;
        let mod = this.chunk.push(128) % 64;

        if (64 - mod < 8) {
            mod -= 64;
        }
        while (mod < 56) {
            this.chunk.push(0);
            mod += 1;
        }

        for (let i = 0; i < 4; i += 1) {
            const high = Math.floor(totalBits / 4294967296);
            this.chunk.push((high >>> (8 * (3 - i))) & 255);
        }
        for (let i = 0; i < 4; i += 1) {
            this.chunk.push((totalBits >>> (8 * (3 - i))) & 255);
        }
    }
}

function se(value, width, fill) {
    let output = String(value);
    while (output.length < width) {
        output = fill + output;
    }
    return output;
}

function result_encrypt(long_str, num = null) {
    const s_obj = {
        s0: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        s1: "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        s2: "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        s3: "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
        s4: "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe",
    };

    const constant = {
        0: 16515072,
        1: 258048,
        2: 4032,
        str: s_obj[num],
    };

    let result = "";
    let round = 0;
    let longInt = get_long_int(round, long_str);
    for (let i = 0; i < (long_str.length / 3) * 4; i += 1) {
        if (Math.floor(i / 4) !== round) {
            round += 1;
            longInt = get_long_int(round, long_str);
        }

        const key = i % 4;
        let tempInt = 0;
        switch (key) {
            case 0:
                tempInt = (longInt & constant[0]) >> 18;
                result += constant.str.charAt(tempInt);
                break;
            case 1:
                tempInt = (longInt & constant[1]) >> 12;
                result += constant.str.charAt(tempInt);
                break;
            case 2:
                tempInt = (longInt & constant[2]) >> 6;
                result += constant.str.charAt(tempInt);
                break;
            case 3:
                tempInt = longInt & 63;
                result += constant.str.charAt(tempInt);
                break;
            default:
                break;
        }
    }
    return result;
}

function get_long_int(round, long_str) {
    const offset = round * 3;
    return (
        (long_str.charCodeAt(offset) << 16) |
        (long_str.charCodeAt(offset + 1) << 8) |
        long_str.charCodeAt(offset + 2)
    );
}

function gener_random(random, option) {
    return [
        ((random & 255 & 170) | (option[0] & 85)) >>> 0,
        ((random & 255 & 85) | (option[0] & 170)) >>> 0,
        (((random >> 8) & 255 & 170) | (option[1] & 85)) >>> 0,
        (((random >> 8) & 255 & 85) | (option[1] & 170)) >>> 0,
    ];
}

function generate_rc4_bb_str(
    url_search_params,
    user_agent,
    window_env_str,
    suffix = "cus",
    Arguments = [0, 1, 14]
) {
    const sm3 = new SM3();
    const start_time = Date.now();
    const url_search_params_list = sm3.sum(sm3.sum(url_search_params + suffix));
    const cus = sm3.sum(sm3.sum(suffix));
    const ua = sm3.sum(
        result_encrypt(
            rc4_encrypt(user_agent, String.fromCharCode.apply(null, [0.00390625, 1, 14])),
            "s3"
        )
    );
    const end_time = Date.now();
    const b = {
        8: 3,
        10: end_time,
        15: {
            aid: 6383,
            pageId: 6241,
            boe: false,
            ddrt: 7,
            paths: {
                include: [{}, {}, {}, {}, {}, {}, {}],
                exclude: [],
            },
            track: {
                mode: 0,
                delay: 300,
                paths: [],
            },
            dump: true,
            rpU: "",
        },
        16: start_time,
        18: 44,
        19: [1, 0, 1, 5],
    };

    b[20] = (b[16] >> 24) & 255;
    b[21] = (b[16] >> 16) & 255;
    b[22] = (b[16] >> 8) & 255;
    b[23] = b[16] & 255;
    b[24] = Math.floor(b[16] / 256 / 256 / 256 / 256);
    b[25] = Math.floor(b[16] / 256 / 256 / 256 / 256 / 256);

    b[26] = (Arguments[0] >> 24) & 255;
    b[27] = (Arguments[0] >> 16) & 255;
    b[28] = (Arguments[0] >> 8) & 255;
    b[29] = Arguments[0] & 255;

    b[30] = Math.floor(Arguments[1] / 256) & 255;
    b[31] = Arguments[1] % 256;
    b[32] = (Arguments[1] >> 24) & 255;
    b[33] = (Arguments[1] >> 16) & 255;

    b[34] = (Arguments[2] >> 24) & 255;
    b[35] = (Arguments[2] >> 16) & 255;
    b[36] = (Arguments[2] >> 8) & 255;
    b[37] = Arguments[2] & 255;

    b[38] = url_search_params_list[21];
    b[39] = url_search_params_list[22];
    b[40] = cus[21];
    b[41] = cus[22];
    b[42] = ua[23];
    b[43] = ua[24];

    b[44] = (b[10] >> 24) & 255;
    b[45] = (b[10] >> 16) & 255;
    b[46] = (b[10] >> 8) & 255;
    b[47] = b[10] & 255;
    b[48] = b[8];
    b[49] = Math.floor(b[10] / 256 / 256 / 256 / 256);
    b[50] = Math.floor(b[10] / 256 / 256 / 256 / 256 / 256);

    b[51] = b[15].pageId;
    b[52] = (b[15].pageId >> 24) & 255;
    b[53] = (b[15].pageId >> 16) & 255;
    b[54] = (b[15].pageId >> 8) & 255;
    b[55] = b[15].pageId & 255;

    b[56] = b[15].aid;
    b[57] = b[15].aid & 255;
    b[58] = (b[15].aid >> 8) & 255;
    b[59] = (b[15].aid >> 16) & 255;
    b[60] = (b[15].aid >> 24) & 255;

    const window_env_list = [];
    for (let i = 0; i < window_env_str.length; i += 1) {
        window_env_list.push(window_env_str.charCodeAt(i));
    }
    b[64] = window_env_list.length;
    b[65] = b[64] & 255;
    b[66] = (b[64] >> 8) & 255;

    b[69] = 0;
    b[70] = 0;
    b[71] = 0;

    b[72] =
        b[18] ^
        b[20] ^
        b[26] ^
        b[30] ^
        b[38] ^
        b[40] ^
        b[42] ^
        b[21] ^
        b[27] ^
        b[31] ^
        b[35] ^
        b[39] ^
        b[41] ^
        b[43] ^
        b[22] ^
        b[28] ^
        b[32] ^
        b[36] ^
        b[23] ^
        b[29] ^
        b[33] ^
        b[37] ^
        b[44] ^
        b[45] ^
        b[46] ^
        b[47] ^
        b[48] ^
        b[49] ^
        b[50] ^
        b[24] ^
        b[25] ^
        b[52] ^
        b[53] ^
        b[54] ^
        b[55] ^
        b[57] ^
        b[58] ^
        b[59] ^
        b[60] ^
        b[65] ^
        b[66] ^
        b[70] ^
        b[71];

    let bb = [
        b[18], b[20], b[52], b[26], b[30], b[34], b[58], b[38], b[40], b[53], b[42], b[21],
        b[27], b[54], b[55], b[31], b[35], b[57], b[39], b[41], b[43], b[22], b[28], b[32],
        b[60], b[36], b[23], b[29], b[33], b[37], b[44], b[45], b[59], b[46], b[47], b[48],
        b[49], b[50], b[24], b[25], b[65], b[66], b[70], b[71],
    ];

    bb = bb.concat(window_env_list).concat(b[72]);
    return rc4_encrypt(String.fromCharCode.apply(null, bb), String.fromCharCode.apply(null, [121]));
}

function generate_random_str() {
    let random_str_list = [];
    random_str_list = random_str_list.concat(gener_random(Math.random() * 10000, [3, 45]));
    random_str_list = random_str_list.concat(gener_random(Math.random() * 10000, [1, 0]));
    random_str_list = random_str_list.concat(gener_random(Math.random() * 10000, [1, 5]));
    return String.fromCharCode.apply(null, random_str_list);
}

function generate_a_bogus(url_search_params, user_agent) {
    const result_str =
        generate_random_str() +
        generate_rc4_bb_str(
            url_search_params,
            user_agent,
            "1536|747|1536|834|0|30|0|0|1536|834|1536|864|1525|747|24|24|Win32"
        );
    return `${result_encrypt(result_str, "s4")}=`;
}
