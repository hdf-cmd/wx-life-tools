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
    if (expect && typeof expect === 'object' && expect.__op === 'gte') {
      if (!(typeof actual === 'string' && actual >= expect.val)) return false
    } else if (expect && typeof expect === 'object' && expect.__op === 'lte') {
      if (!(typeof actual === 'string' && actual <= expect.val)) return false
    } else if (actual !== expect) {
      return false
    }
  }
  return true
}

class Query {
  constructor(name) {
    this.name = name
    this._cond = null
    this._orderBy = null
    this._limit = 100
  }
  where(cond) { this._cond = cond; return this }
  orderBy(field, order) { this._orderBy = [field, order]; return this }
  limit(n) { this._limit = n; return this }
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
    if (this._orderBy) {
      const f = this._orderBy[0]
      const o = this._orderBy[1]
      docs.sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0))
      if (o === 'desc') docs.reverse()
    }
    return { data: docs.slice(0, this._limit).map(d => Object.assign({}, d)) }
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
  command: {
    gte(v) { return { __op: 'gte', val: v } },
    lte(v) { return { __op: 'lte', val: v } }
  }
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
  dump(name) {
    return Array.from(coll(name).values()).map(d => Object.assign({}, d))
  },
  // 注入下一次查询的错误（如超时），一次性
  failNextQuery(err) {
    state.failNextQuery = err
  }
}
