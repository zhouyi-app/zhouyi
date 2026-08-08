// 测试记录上传和下载
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

async function main() {
  console.log("=== 测试记录同步 ===\n");

  // 1. 先获取一个已注册用户
  console.log("1. 查询现有用户...");
  const usersRes = await fetch(URL + '/rest/v1/app_users?select=id,email&limit=3', {
    method: 'GET',
    headers: { 'apikey': ANON_KEY }
  });
  const users = await usersRes.json();
  console.log(`用户数: ${users.length}`);
  if (users.length > 0) {
    console.log(`第一个用户: ${JSON.stringify(users[0])}`);
  }

  // 2. 测试上传一条记录
  console.log("\n2. 测试上传记录...");
  if (users.length > 0) {
    const testUser = users[0];
    const testRecord = {
      rid: "test_" + Date.now(),
      user_id: testUser.id,
      time: new Date().toISOString(),
      methodName: "测试",
      extraDesc: "",
      question: "同步测试",
      lines: "012345",
      moving: [],
      hexId: 1,
      hexName: "乾",
      hexTitle: "天",
      changeId: null,
      changeName: null,
      dayGZ: "甲子"
    };

    const uploadRes = await fetch(URL + '/rest/v1/records', {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(testRecord)
    });
    const uploadData = await uploadRes.text();
    console.log(`上传状态: ${uploadRes.status}`);
    console.log(`上传响应: ${uploadData.slice(0, 500)}`);

    // 3. 测试拉取记录
    console.log("\n3. 测试拉取记录...");
    const pullRes = await fetch(URL + '/rest/v1/records?select=*&user_id=eq.' + encodeURIComponent(testUser.id) + '&order=time.desc&limit=10', {
      method: 'GET',
      headers: { 'apikey': ANON_KEY }
    });
    const pullData = await pullRes.json();
    console.log(`拉取状态: ${pullRes.status}`);
    console.log(`拉取记录数: ${pullData.length}`);
    if (pullData.length > 0) {
      console.log(`第一条记录: ${JSON.stringify(pullData[0], null, 2).slice(0, 500)}`);
    }

    // 4. 清理测试记录
    console.log("\n4. 清理测试记录...");
    const testRid = testRecord.rid;
    const delRes = await fetch(URL + '/rest/v1/records?rid=eq.' + encodeURIComponent(testRid), {
      method: 'DELETE',
      headers: { 'apikey': ANON_KEY }
    });
    console.log(`删除状态: ${delRes.status}`);
  } else {
    console.log("没有用户，请先注册一个账号");
  }

  // 5. 检查表结构
  console.log("\n\n5. 查看 records 表结构...");
  const tableRes = await fetch(URL + '/rest/v1/records?select=*&limit=1', {
    method: 'GET',
    headers: { 'apikey': ANON_KEY }
  });
  console.log(`表访问状态: ${tableRes.status}`);
  if (!tableRes.ok) {
    console.log(`错误: ${await tableRes.text()}`);
  }
}

main().catch(e => console.error('❌ 错误:', e));
