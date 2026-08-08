/* =====================================================
 * 《周易》账号系统 + 跨设备云同步
 * 基于 Supabase（免费）的 REST API 实现，自建用户表，无需邮件确认。
 * 未登录时一切照旧（仅保存在本机）；登录后起卦记录自动同步到云端，
 * 换手机 / 电脑登录同一账号即可恢复自己的记录。
 * 
 * 密码处理：使用简单哈希 + Base64 编码，保证跨平台一致。
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

  /** 
   * 跨平台一致的密码编码
   * 使用 DJB2 哈希算法（纯数学运算），保证所有设备 100% 一致
   * 不依赖任何浏览器 API，兼容所有环境
   */
  function encodePassword(password) {
    // DJB2 哈希算法 - 纯字符串处理，跨平台完全一致
    var hash = 5381;
    for (var i = 0; i < password.length; i++) {
      hash = ((hash << 5) + hash) + password.charCodeAt(i);
      hash = hash & hash; // 转换为32位整数
    }
    // 转换为36进制字符串（最短表示）
    return "p_" + Math.abs(hash).toString(36);
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
    // 仅在持有真实 Supabase JWT（以 eyJ 开头）时才附加 Authorization；
    // 自建用户表 + RLS 匿名策略只需 apikey 即可，错误的 Bearer token 会导致 401
    if (cur && cur.token && cur.token.indexOf("eyJ") === 0) headers["Authorization"] = "Bearer " + cur.token;
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
    }).catch(function (err) {
      // 网络层错误（断网/超时）转成友好提示
      if (err && err.status) throw err;
      var e = new Error("网络异常，请检查网络后重试。");
      e.status = 0;
      e.original = err;
      throw e;
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
        return req("GET", "/rest/v1/app_users?select=id,email&id=eq." + encodeURIComponent(cur.userId))
          .then(function (users) {
            if (Array.isArray(users) && users.length > 0) {
              cur.email = users[0].email || cur.email;
              saveSession();
              notify();
              return cur;
            }
            var nf = new Error("用户不存在");
            nf.status = 404;
            throw nf;
          })
          .catch(function (err) {
            // 仅当确认用户不存在（4xx）时清除本地会话；网络/服务器错误保留会话（离线降级）
            if (err && err.status && err.status >= 400 && err.status < 500) {
              cur = null;
              clearSession();
            }
            notify();
            return cur;
          });
      }
      notify();
      return Promise.resolve(cur);
    },

    /** 注册（邮箱 + 密码），自建用户表，秒完成 */
    register: function (email, password) {
      var encoded = encodePassword(password);
      var userId = genUUID();
      return req("POST", "/rest/v1/app_users", {
        id: userId,
        email: email.toLowerCase(),
        password_hash: encoded
      }, { "Prefer": "return=representation" })
        .then(function (data) {
          var row = Array.isArray(data) ? data[0] : data;
          cur = { userId: row.id, email: row.email, token: encoded };
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
    },

    /** 登录 */
    login: function (email, password) {
      var encoded = encodePassword(password);
      // 单次查询邮箱，客户端比对密码哈希（不再暴露"邮箱是否已注册"细节，也避免二次请求失败误判）
      return req("GET", "/rest/v1/app_users?select=id,email,password_hash&email=eq." + encodeURIComponent(email.toLowerCase()))
        .then(function (users) {
          if (!Array.isArray(users) || users.length === 0) {
            throw new Error("邮箱或密码不正确。");
          }
          var row = users[0];
          if (row.password_hash !== encoded) {
            throw new Error("邮箱或密码不正确。");
          }
          cur = { userId: row.id, email: row.email, token: encoded };
          saveSession();
          notify();
          return cur;
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

    /** 拉取云端全部记录（按 user_id 过滤，分页拉取避免超千条截断） */
    pullAll: function () {
      if (!api.isLoggedIn()) return Promise.resolve([]);
      var all = [];
      var step = function (from) {
        return req("GET", "/rest/v1/records?select=*&user_id=eq." + encodeURIComponent(cur.userId) + "&order=time.desc&limit=1000&offset=" + from)
          .then(function (d) {
            var list = Array.isArray(d) ? d : [];
            all = all.concat(list);
            return list.length === 1000 ? step(from + 1000) : all;
          });
      };
      return step(0);
    },

    /** 按 cloudId 删除云端记录（附带 user_id 校验，防止误删他人数据） */
    deleteCloud: function (cloudId) {
      if (!api.isLoggedIn() || !cloudId) return Promise.resolve();
      return req("DELETE", "/rest/v1/records?id=eq." + encodeURIComponent(cloudId) + "&user_id=eq." + encodeURIComponent(cur.userId))
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
      if (!api.isLoggedIn()) return Promise.reject(new Error("请先登录后再同步"));
      var tombs = getDeleted();
      return api.pullAll().then(function (cloud) {
        var local = (getLocal() || []).slice();
        var localByRid = {};
        local.forEach(function (r) { if (r.rid) localByRid[r.rid] = r; });
        // 无 rid 的云端脏记录按 time+hexName 去重，避免每次同步重复新增
        var localByTimeName = {};
        local.forEach(function (r) { if (!r.rid) localByTimeName[r.time + "|" + r.hexName] = true; });

        var added = 0, removed = 0, pushes = [], deletePushes = [], removedRids = [];

        cloud.forEach(function (c) {
          if (c.rid && tombs.indexOf(c.rid) >= 0) {
            deletePushes.push(api.deleteCloud(c.id).catch(function () {}));
            removedRids.push(c.rid);
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
          } else if (c.rid) {
            local.push(rc);
            localByRid[c.rid] = rc;
            added++;
          } else {
            // 云端脏记录（无 rid）：去重后并入本地
            var key = (c.time || "") + "|" + (c.hexName || "");
            if (!localByTimeName[key]) {
              localByTimeName[key] = true;
              local.push(rc);
              added++;
            }
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
          // 云端删除已提交成功后，清理对应墓碑，避免墓碑列表无限增长
          if (removedRids.length) {
            var rest = tombs.filter(function (t) { return removedRids.indexOf(t) < 0; });
            setDeleted(rest);
          }
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
