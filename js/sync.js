/* =====================================================
 * 《周易》账号系统 + 跨设备云同步
 * 基于 Supabase（免费）的 REST API 实现，无需 SDK。
 * 未登录时一切照旧（仅保存在本机）；登录后起卦记录自动同步到云端，
 * 换手机 / 电脑登录同一账号即可恢复自己的记录。
 *
 * 使用前需在 Supabase 控制台执行一次建表 SQL（见对话指引），
 * 并把下方 CFG 的三个占位符替换为项目凭证。
 * ===================================================== */
(function (w) {
  "use strict";

  /* ---------------- 配置区（注册 Supabase 后填入） ----------------
   * 注册地址：https://supabase.com （免费，邮箱即可）
   * 创建项目后，在「Project Settings → API」里找到：
   *   Project URL        -> CFG.url
   *   anon public key    -> CFG.anonKey
   * -------------------------------------------------------------- */
  var CFG = {
    url: "https://ywfvtexqannyfyklglck.supabase.co",
    anonKey: "sb_publishable_oG6dsS2EP2WhE6-jPGODTg_R_HXh7no"
  };

  var SESSION_KEY = "zhouyi_session_v1";   // 登录会话缓存
  var DEL_KEY = "zhouyi_deleted_rids_v1";  // 本地删除墓碑（用于云同步去重）

  var cur = null;   // 当前用户 {id, email, token}
  var hook = null;  // 登录状态变化回调

  function cfgReady() {
    return CFG.url && CFG.anonKey &&
      CFG.url.indexOf("REPLACE") < 0 && CFG.anonKey.indexOf("REPLACE") < 0;
  }

  /** 通用请求。token 存在时携带用户授权；extraHeaders 可补充（如 Prefer） */
  function req(method, path, body, token, extraHeaders) {
    if (!cfgReady()) return Promise.reject(new Error("云服务尚未配置"));
    var headers = {
      "apikey": CFG.anonKey,
      "Content-Type": "application/json"
    };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    return fetch(CFG.url + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg;
          if (data && data.error_description) msg = data.error_description;
          else if (data && data.msg) msg = data.msg;
          else if (data && data.message) msg = data.message;
          else if (data && data.error) msg = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
          else msg = "请求失败（" + res.status + "）";
          var e = new Error(msg);
          e.status = res.status;
          throw e;
        }
        return data;
      });
    });
  }

  function saveSession() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(cur)); } catch (e) { /* 忽略 */ }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
  }
  function getDeleted() {
    try { return JSON.parse(localStorage.getItem(DEL_KEY)) || []; } catch (e) { return []; }
  }
  function setDeleted(list) {
    try { localStorage.setItem(DEL_KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
  }
  function notify() {
    if (hook) hook(cur);
  }
  function setCur(u, accessToken) {
    cur = { id: u.id, email: u.email || "", token: accessToken || u.access_token };
    saveSession();
    notify();
    return cur;
  }

  /* ---------------- 对外 API ---------------- */
  var api = {
    configured: cfgReady,
    isLoggedIn: function () { return !!cur && !!cur.token; },
    getUser: function () { return cur; },

    /** 初始化：恢复本地会话，异步向服务器验证有效性 */
    init: function (cb) {
      hook = cb;
      try { cur = JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { cur = null; }
      if (cur && cur.token) {
        return req("GET", "/auth/v1/user", null, cur.token).then(function (u) {
          cur.id = u.id;
          cur.email = u.email || cur.email;
          saveSession();
          notify();
          return cur;
        }).catch(function () {
          // 会话已失效则自动退出
          cur = null;
          clearSession();
          notify();
          return null;
        });
      }
      notify();
      return Promise.resolve(cur);
    },

    /** 注册（邮箱 + 密码），成功后自动登录 */
    register: function (email, password) {
      return req("POST", "/auth/v1/signup", { email: email, password: password })
        .then(function (d) {
          if (!d || !d.access_token) {
            var e = new Error("注册成功，但需要到邮箱点确认链接后才能登录。");
            e.needsConfirm = true;
            throw e;
          }
          return setCur(d.user || d, d.access_token);
        });
    },

    /** 登录 */
    login: function (email, password) {
      return req("POST", "/auth/v1/token?grant_type=password", { email: email, password: password })
        .then(function (d) {
          var u = d.user || {};
          return setCur({ id: u.id, email: u.email || email, access_token: d.access_token });
        });
    },

    /** 退出登录（本地与云端数据都保留） */
    logout: function () {
      cur = null;
      clearSession();
      notify();
    },

    /** 把一条新记录推到云端，成功后在本地补上 cloudId */
    pushRecord: function (record) {
      if (!api.isLoggedIn()) return Promise.resolve(null);
      return req("POST", "/rest/v1/records", {
        rid: record.rid,
        time: record.time,
        methodName: record.methodName,
        extraDesc: record.extraDesc || "",
        question: record.question || "",
        lines: record.lines,
        moving: record.moving || [],
        hexId: record.hexId,
        hexName: record.hexName,
        hexTitle: record.hexTitle,
        changeId: record.changeId || null,
        changeName: record.changeName || null,
        dayGZ: record.dayGZ || ""
      }, cur.token, { "Prefer": "return=representation" }).then(function (d) {
        var row = (Array.isArray(d) && d[0]) || d;
        if (row) record.cloudId = row.id;
        return row || null;
      });
    },

    /** 拉取云端全部记录（RLS 保证只返回本人数据） */
    pullAll: function () {
      if (!api.isLoggedIn()) return Promise.resolve([]);
      return req("GET", "/rest/v1/records?select=*&order=time.desc&limit=1000", null, cur.token)
        .then(function (d) { return Array.isArray(d) ? d : []; });
    },

    /** 按 cloudId 删除云端记录 */
    deleteCloud: function (cloudId) {
      if (!api.isLoggedIn() || !cloudId) return Promise.resolve();
      return req("DELETE", "/rest/v1/records?id=eq." + encodeURIComponent(cloudId), null, cur.token)
        .then(function () {});
    },

    /** 记录本地已删除的 rid（墓碑），供合并时排除 */
    markDeleted: function (rid) {
      if (!rid) return;
      var list = getDeleted();
      if (list.indexOf(rid) < 0) list.push(rid);
      setDeleted(list);
    },
    getDeleted: getDeleted,

    /**
     * 全量同步：拉取云端 → 与本地合并（按 rid 去重）→ 保存 → 补传本地新增。
     * 调用方传入读取 / 保存本地记录的函数。
     */
    syncRecords: function (getLocal, saveLocal) {
      if (!api.isLoggedIn()) return Promise.resolve({ added: 0, pushed: 0, removed: 0 });
      var tombs = getDeleted();
      return api.pullAll().then(function (cloud) {
        var local = (getLocal() || []).slice();
        var localByRid = {};
        local.forEach(function (r) { if (r.rid) localByRid[r.rid] = r; });

        var added = 0, removed = 0, pushes = [], deletePushes = [];

        // 1) 墓碑过滤：把云端已删的记录从云端删除
        cloud.forEach(function (c) {
          if (c.rid && tombs.indexOf(c.rid) >= 0) {
            deletePushes.push(api.deleteCloud(c.id).catch(function () {}));
            removed++;
          }
        });

        // 2) 合并云端记录（本地没有的补进本地；本地已删的剔除）
        cloud.forEach(function (c) {
          if (c.rid && tombs.indexOf(c.rid) >= 0) return; // 已删
          var rc = {
            rid: c.rid,
            cloudId: c.id,
            time: c.time,
            methodName: c.methodName,
            extraDesc: c.extraDesc || "",
            question: c.question || "",
            lines: c.lines,
            moving: c.moving || [],
            hexId: c.hexId,
            hexName: c.hexName,
            hexTitle: c.hexTitle,
            changeId: c.changeId || null,
            changeName: c.changeName || null,
            dayGZ: c.dayGZ || ""
          };
          if (c.rid && localByRid[c.rid]) {
            localByRid[c.rid].cloudId = c.id; // 补上云端 id
          } else if (!c.rid || !localByRid[c.rid]) {
            local.push(rc);
            if (c.rid) localByRid[c.rid] = rc;
            added++;
          }
        });

        // 3) 本地有而云端没有的 → 补传云端
        local.forEach(function (r) {
          if (r.rid && !r.cloudId) {
            pushes.push(api.pushRecord(r));
          }
        });

        local = local.filter(function (r) { return !(r.rid && tombs.indexOf(r.rid) >= 0); });

        saveLocal(local);
        return Promise.all(pushes.concat(deletePushes)).then(function () {
          saveLocal(getLocal()); // pushRecord 会写入 cloudId，再存一次
          return { added: added, pushed: pushes.length, removed: removed };
        });
      });
    }
  };

  /** 生成唯一记录 id（本地用） */
  api.genRid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  w.ZhouyiSync = api;
})(window);
