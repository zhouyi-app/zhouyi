/* =====================================================
 * 《周易》账号系统 + 跨设备云同步
 * 基于 Supabase（免费）的 REST API 实现，自建用户表，无需邮件确认。
 * 未登录时一切照旧（仅保存在本机）；登录后起卦记录自动同步到云端，
 * 换手机 / 电脑登录同一账号即可恢复自己的记录。
 * ===================================================== */
(function (w) {
  "use strict";

  var CFG = {
    url: "https://ywfvtexqannyfyklglck.supabase.co",
    anonKey: "sb_publishable_oG6dsS2EP2WhE6-jPGODTg_R_HXh7no"
  };

  var SESSION_KEY = "zhouyi_session_v1";
  var DEL_KEY = "zhouyi_deleted_rids_v1";

  var cur = null;
  var hook = null;

  function cfgReady() {
    return CFG.url && CFG.anonKey;
  }

  /** SHA-256 加密密码 */
  async function hashPassword(password) {
    var encoder = new TextEncoder();
    var data = encoder.encode(password);
    var hashBuffer = await crypto.subtle.digest("SHA-256", data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  /** 生成 UUID */
  function genUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function req(method, path, body, extraHeaders) {
    if (!cfgReady()) return Promise.reject(new Error("云服务尚未配置"));
    var headers = {
      "apikey": CFG.anonKey,
      "Content-Type": "application/json"
    };
    if (cur && cur.token) headers["Authorization"] = "Bearer " + cur.token;
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    return fetch(CFG.url + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = text; }
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

  var api = {
    configured: cfgReady,
    isLoggedIn: function () { return !!cur && !!cur.userId; },
    getUser: function () { return cur; },

    /** 初始化：恢复本地会话，验证有效性 */
    init: function (cb) {
      hook = cb;
      try { cur = JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { cur = null; }
      if (cur && cur.token) {
        // 验证用户是否仍存在
        return req("GET", "/rest/v1/app_users?select=id,email&id=eq." + encodeURIComponent(cur.userId))
          .then(function (users) {
            if (Array.isArray(users) && users.length > 0) {
              cur.email = users[0].email || cur.email;
              saveSession();
              notify();
              return cur;
            }
            throw new Error("用户不存在");
          })
          .catch(function () {
            cur = null;
            clearSession();
            notify();
            return null;
          });
      }
      notify();
      return Promise.resolve(cur);
    },

    /** 注册（邮箱 + 密码），自建用户表，秒完成 */
    register: function (email, password) {
      return hashPassword(password).then(function (hash) {
        var userId = genUUID();
        return req("POST", "/rest/v1/app_users", {
          id: userId,
          email: email.toLowerCase(),
          password_hash: hash
        }, { "Prefer": "return=representation" })
          .then(function (data) {
            var row = Array.isArray(data) ? data[0] : data;
            cur = { userId: row.id, email: row.email, token: hash }; // 用密码哈希作会话 token（简单方案）
            saveSession();
            notify();
            return cur;
          })
          .catch(function (err) {
            if (err && err.message && err.message.indexOf("duplicate") >= 0) {
              throw new Error("该邮箱已注册，请直接登录。");
            }
            throw err;
          });
      });
    },

    /** 登录 */
    login: function (email, password) {
      return hashPassword(password).then(function (hash) {
        return req("GET", "/rest/v1/app_users?select=*&email=eq." + encodeURIComponent(email.toLowerCase()) + "&password_hash=eq." + encodeURIComponent(hash))
          .then(function (users) {
            if (!Array.isArray(users) || users.length === 0) {
              throw new Error("邮箱或密码错误。");
            }
            var row = users[0];
            cur = { userId: row.id, email: row.email, token: hash };
            saveSession();
            notify();
            return cur;
          });
      });
    },

    /** 退出登录 */
    logout: function () {
      cur = null;
      clearSession();
      notify();
    },

    /** 把一条新记录推到云端 */
    pushRecord: function (record) {
      if (!api.isLoggedIn()) return Promise.resolve(null);
      return req("POST", "/rest/v1/records", {
        rid: record.rid,
        user_id: cur.userId,
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
      }, { "Prefer": "return=representation" }).then(function (d) {
        var row = (Array.isArray(d) && d[0]) || d;
        if (row) record.cloudId = row.id;
        return row || null;
      });
    },

    /** 拉取云端全部记录（按 user_id 过滤） */
    pullAll: function () {
      if (!api.isLoggedIn()) return Promise.resolve([]);
      return req("GET", "/rest/v1/records?select=*&user_id=eq." + encodeURIComponent(cur.userId) + "&order=time.desc&limit=1000")
        .then(function (d) { return Array.isArray(d) ? d : []; });
    },

    /** 按 cloudId 删除云端记录 */
    deleteCloud: function (cloudId) {
      if (!api.isLoggedIn() || !cloudId) return Promise.resolve();
      return req("DELETE", "/rest/v1/records?id=eq." + encodeURIComponent(cloudId))
        .then(function () {});
    },

    /** 记录本地已删除的 rid（墓碑） */
    markDeleted: function (rid) {
      if (!rid) return;
      var list = getDeleted();
      if (list.indexOf(rid) < 0) list.push(rid);
      setDeleted(list);
    },
    getDeleted: getDeleted,

    /** 全量同步 */
    syncRecords: function (getLocal, saveLocal) {
      if (!api.isLoggedIn()) return Promise.resolve({ added: 0, pushed: 0, removed: 0 });
      var tombs = getDeleted();
      return api.pullAll().then(function (cloud) {
        var local = (getLocal() || []).slice();
        var localByRid = {};
        local.forEach(function (r) { if (r.rid) localByRid[r.rid] = r; });

        var added = 0, removed = 0, pushes = [], deletePushes = [];

        cloud.forEach(function (c) {
          if (c.rid && tombs.indexOf(c.rid) >= 0) {
            deletePushes.push(api.deleteCloud(c.id).catch(function () {}));
            removed++;
          }
        });

        cloud.forEach(function (c) {
          if (c.rid && tombs.indexOf(c.rid) >= 0) return;
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
            localByRid[c.rid].cloudId = c.id;
          } else if (!c.rid || !localByRid[c.rid]) {
            local.push(rc);
            if (c.rid) localByRid[c.rid] = rc;
            added++;
          }
        });

        local.forEach(function (r) {
          if (r.rid && !r.cloudId) {
            pushes.push(api.pushRecord(r));
          }
        });

        local = local.filter(function (r) { return !(r.rid && tombs.indexOf(r.rid) >= 0); });

        saveLocal(local);
        return Promise.all(pushes.concat(deletePushes)).then(function () {
          saveLocal(getLocal());
          return { added: added, pushed: pushes.length, removed: removed };
        });
      });
    }
  };

  api.genRid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  w.ZhouyiSync = api;
})(window);
