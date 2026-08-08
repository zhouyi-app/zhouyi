// 模拟前端的完整同步流程
const URL = 'https://ywfvtexqannyfyklglck.supabase.co';
const ANON_KEY = 'sb_publishable_oG6dsS2EP2WhE6-jPGODTg_R_HXh7no';

async function encodePassword(password) {
  var hash = 5381;
  for (var i = 0; i < password.length; i++) {
    hash = ((hash << 5) + hash) + password.charCodeAt(i);
    hash = hash & hash;
  }
  return "p_" + Math.abs(hash).toString(36);
}

// 模拟 sync.js 的 pushRecord
async function pushRecord(userId, record) {
  const res = await fetch(URL + '/rest/v1/records', {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      rid: record.rid,
      user_id: userId,
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
    })
  });
  const data = await res.json();
  if (res.ok && Array.isArray(data) && data[0]) {
    return { ...record, cloudId: data[0].id };
  }
  throw new Error(`上传失败: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
}

// 模拟 sync.js 的 pullAll
async function pullAll(userId) {
  const res = await fetch(URL + '/rest/v1/records?select=*&user_id=eq.' + encodeURIComponent(userId) + '&order=time.desc&limit=1000', {
    method: 'GET',
    headers: { 'apikey': ANON_KEY }
  });
  return res.json();
}

// 模拟 sync.js 的 syncRecords
async function syncRecords(userId, localRecords) {
  const cloud = await pullAll(userId);
  const localByRid = {};
  localRecords.forEach(r => { if (r.rid) localByRid[r.rid] = r; });

  let added = 0;
  const newLocal = [...localRecords];

  // 合并云端记录到本地
  cloud.forEach(c => {
    if (c.rid && localByRid[c.rid]) {
      // 已有，只更新 cloudId
      localByRid[c.rid].cloudId = c.id;
    } else {
      // 新增
      newLocal.push({
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
      });
      if (c.rid) localByRid[c.rid] = newLocal[newLocal.length - 1];
      added++;
    }
  });

  // 上传本地没有 cloudId 的记录
  const toPush = newLocal.filter(r => r.rid && !r.cloudId);
  for (const r of toPush) {
    try {
      const pushed = await pushRecord(userId, r);
      r.cloudId = pushed.cloudId;
    } catch (e) {
      console.error('上传失败:', e.message);
    }
  }

  return { records: newLocal, added, pushed: toPush.length };
}

async function main() {
  console.log("=== 完整同步流程测试 ===\n");

  // 获取用户
  const usersRes = await fetch(URL + '/rest/v1/app_users?select=id,email&limit=1', {
    method: 'GET',
    headers: { 'apikey': ANON_KEY }
  });
  const users = await usersRes.json();
  if (users.length === 0) {
    console.log("没有用户，请先注册！");
    return;
  }
  const user = users[0];
  const userId = user.id;
  console.log(`测试用户: ${user.email} (ID: ${userId})`);

  // 模拟本地记录
  let localRecords = [
    {
      rid: "local_test_1",
      time: new Date().toISOString(),
      methodName: "铜钱",
      extraDesc: "",
      question: "测试问题",
      lines: "111111",
      moving: [3],
      hexId: 1,
      hexName: "乾",
      hexTitle: "天",
      changeId: 2,
      changeName: "坤",
      dayGZ: "甲子"
    }
  ];
  console.log(`\n本地记录数: ${localRecords.length}`);

  // 执行同步
  console.log("\n执行 syncRecords...");
  try {
    const result = await syncRecords(userId, localRecords);
    console.log(`同步结果: 新增云端=${result.added}, 上传本地=${result.pushed}`);
    console.log(`最终记录数: ${result.records.length}`);
    if (result.records.length > 0) {
      console.log(`第一条记录 cloudId: ${result.records[0].cloudId}`);
    }
    localRecords = result.records;

    // 再次拉取，确认云端有数据
    console.log("\n验证云端数据...");
    const cloudRecords = await pullAll(userId);
    console.log(`云端记录数: ${cloudRecords.length}`);
    
    if (cloudRecords.length > 0) {
      console.log("\n✅ 同步成功！");
      
      // 清理测试数据
      console.log("\n清理测试数据...");
      for (const r of cloudRecords) {
        await fetch(URL + '/rest/v1/records?id=eq.' + r.id, {
          method: 'DELETE',
          headers: { 'apikey': ANON_KEY }
        });
      }
      console.log("已清理");
    }
  } catch (e) {
    console.error("❌ 同步失败:", e.message);
  }
}

main().catch(console.error);
