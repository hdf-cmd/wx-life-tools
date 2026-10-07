// tests/stubs/wx-server-sdk.js
// 最小 wx-server-sdk 桩件：内存数据库。
// 模拟三个与真实 MongoDB 一致的关键语义：
//   1. 主键唯一性 —— 相同 _id 并发/重复 add 只有一条成功，其余抛 duplicate key
//   2. 集合不存在 —— 查询/写入抛 errCode -502005
//   3. 故障注入 —— 可让下一次查询抛任意错误（验证 fail-closed）
// 运行方式：node tests/habit-checkin.test.js

const state = {
  openid: 'test-openid',
  collections: {},     // name -> Map(_id -> doc)
  failNextQuery: null  // 下一次查询抛出的错误（一次性）
}

function coll(name) {
  if (!state.collections[name]) state.collections[name] = new Map()
  return state.collections[name]
}

function notExistError(name) {
  const e = new Error('collection not exists: ' + name)
  e.errCode = -502005
  e.errMsg = e.message
  return e
}

function matchCond(doc, cond) {
  const keys = Object.keys(cond)
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    const expect = cond[k]
    const actual = doc[k]
    if (expect && Array.isArray(expect.__and)) {
      // _.gte(a).and(_.lt(b)) 复合条件：同一字段的区间
      for (const one of expect.__and) {
        if (one.__op === 'gte' && !(typeof actual === 'string' && actual >= one.val)) return false
        if (one.__op === 'lte' && !(typeof actual === 'string' && actual <= one.val)) return false
        if (one.__op === 'lt' && !(typeof actual === 'string' && actual < one.val)) return false
        if (one.__op === 'gt' && !(typeof actual === 'string' && actual > one.val)) return false
      }
    } else if (expect && typeof expect === 'object' && expect.__op === 'gte') {
      if (!(typeof actual === 'string' && actual >= expect.val)) return false
    } else if (expect && typeof expect === 'object' && expect.__op === 'lte') {
      if (!(typeof actual === 'string' && actual <= expect.val)) return false
    } else if (expect && typeof expect === 'object' && expect.__op === 'lt') {
      if (!(typeof actual === 'string' && actual < expect.val)) return false
    } else if (expect && typeof expect === 'object' && expect.__op === 'gt') {
      if (!(typeof actual === 'string' && actual > expect.val)) return false
    } else if (actual !== expect) {
      return false
    }
  }
  return true
}

function project(doc, fields) {
  if (!fields) return Object.assign({}, doc)
  const out = { _id: doc._id }
  Object.keys(fields).forEach(k => { if (fields[k]) out[k] = doc[k] })
  return out
}

class Query {
  constructor(name) {
    this.name = name
    this._cond = null
    this._orderBy = []
    this._limit = 100     // 与云函数端一致：不写 limit 时默认且最多 100 条
    this._skip = 0
    this._fields = null
  }
  where(cond) { this._cond = cond; return this }
  orderBy(field, order) { this._orderBy.push([field, order]); return this }
  limit(n) { this._limit = n; return this }
  skip(n) { this._skip = n; return this }
  field(fields) { this._fields = fields; return this }
  async get() {
    await Promise.resolve()
    if (state.failNextQuery) {
      const e = state.failNextQuery
      state.failNextQuery = null
      throw e
    }
    if (!state.collections[this.name]) throw notExistError(this.name)
    let docs = Array.from(state.collections[this.name].values())
    if (this._cond) docs = docs.filter(d => matchCond(d, this._cond))
    // 多字段排序：前面的键优先，date 这类天粒度字段必须能再按 _id 兜底
    if (this._orderBy.length) {
      docs.sort((a, b) => {
        for (const [f, o] of this._orderBy) {
          if (a[f] === b[f]) continue
          const cmp = a[f] > b[f] ? 1 : -1
          return (o === 'desc' ? -cmp : cmp)
        }
        return 0
      })
    }
    docs = docs.slice(this._skip, this._skip + this._limit)
    return { data: docs.map(d => project(d, this._fields)) }
  }
  async update({ data }) {
    await Promise.resolve()
    const c = state.collections[this.name]
    if (!c) throw notExistError(this.name)
    const matched = Array.from(c.values()).filter(d => this._cond ? matchCond(d, this._cond) : true)
    matched.forEach(doc => {
      c.set(doc._id, Object.assign({}, doc, data))
    })
    return { stats: { updated: matched.length } }
  }
}

class DocRef {
  constructor(name, id) {
    this.name = name
    this.id = id
  }
  async get() {
    await Promise.resolve()
    if (state.failNextQuery) {
      const e = state.failNextQuery
      state.failNextQuery = null
      throw e
    }
    const c = state.collections[this.name]
    if (!c || !c.has(this.id)) {
      const e = new Error('document not exists: ' + this.id)
      e.errCode = -502004
      e.errMsg = e.message
      throw e
    }
    return { data: Object.assign({}, c.get(this.id)) }
  }
  async update({ data }) {
    await Promise.resolve()
    const c = state.collections[this.name]
    if (!c || !c.has(this.id)) {
      const e = new Error('document not exists: ' + this.id)
      e.errCode = -502004
      e.errMsg = e.message
      throw e
    }
    c.set(this.id, Object.assign({}, c.get(this.id), data))
    return { stats: { updated: 1 } }
  }
  async remove() {
    await Promise.resolve()
    const c = state.collections[this.name]
    if (!c || !c.has(this.id)) throw notExistError(this.name)
    c.delete(this.id)
    return {}
  }
}

class Collection {
  constructor(name) { this.name = name }

  where(cond) { return new Query(this.name).where(cond) }
  orderBy(field, order) { return new Query(this.name).orderBy(field, order) }
  limit(n) { return new Query(this.name).limit(n) }
  doc(id) { return new DocRef(this.name, String(id)) }

  async add({ data }) {
    await Promise.resolve()
    if (!state.collections[this.name]) throw notExistError(this.name)
    const id = data._id != null ? String(data._id) : 'auto_' + Math.random().toString(36).slice(2, 12)
    // 原子区：检查与写入之间无 await —— 模拟数据库主键唯一性的原子语义
    if (state.collections[this.name].has(id)) {
      const e = new Error('duplicate key error: _id ' + id + ' already exists (E11000)')
      e.errCode = -502001
      e.errMsg = e.message
      throw e
    }
    const doc = Object.assign({}, data, { _id: id })
    state.collections[this.name].set(id, doc)
    return { _id: id }
  }
}

const dbApi = {
  collection(name) { return new Collection(name) },
  async createCollection(name) {
    await Promise.resolve()
    coll(name)
    return {}
  },
  serverDate() { return { __serverDate: true } },
  command: (function () {
    function cmd(op, val) {
      return {
        __op: op,
        val: val,
        and: function (other) { return { __and: [this, other] } }
      }
    }
    return {
      gte: v => cmd('gte', v),
      lte: v => cmd('lte', v),
      gt: v => cmd('gt', v),
      lt: v => cmd('lt', v)
    }
  })()
}

module.exports = {
  DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
  init() {},
  getWXContext() { return { OPENID: state.openid } },
  database() { return dbApi },

  // ===== 测试辅助 =====
  reset(opts) {
    opts = opts || {}
    state.openid = opts.openid || 'test-openid'
    state.collections = {}
    state.failNextQuery = null
  },
  // 预置文档（绕过 add，用于构造历史数据/习惯定义）
  seedDoc(name, doc) {
    coll(name).set(String(doc._id), Object.assign({}, doc))
  },
  // 建空集合（真实环境里 accounts/budgets 已存在，桩件需要显式建）
  ensureCollection(name) {
    coll(name)
  },
  dump(name) {
    return Array.from(coll(name).values()).map(d => Object.assign({}, d))
  },
  // 注入下一次查询的错误（如超时），一次性
  failNextQuery(err) {
    state.failNextQuery = err
  }
}
