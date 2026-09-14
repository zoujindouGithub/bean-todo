// app.js
// 小程序入口。
//
// 当前版本的数据全部保存在**本地缓存**（见 utils/todo.js），
// 不依赖云开发或任何后端服务，因此这里无需初始化任何东西。
//
// 将来若需要多设备同步：
//   1. 在 onLaunch 里补上 wx.cloud.init({ env: '<你的环境 ID>', traceUser: true });
//   2. 把 utils/todo.js 的内部实现换成 wx.cloud.database() 版本即可，
//      对外接口保持一致，页面代码无需改动。
App({
  onLaunch() {},
  globalData: {}
});
