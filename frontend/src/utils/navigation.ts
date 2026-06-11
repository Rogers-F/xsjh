/**
 * 开发者中心由 new-api 原生 React 控制台承载(后端挂在 /admin)。整页跳转交给后端
 * 返回控制台 index,绕过 Vue Router;同源 session cookie 共享,跳过去仍是登录态。
 * 星算 Vue 内任何"进开发者中心"的入口(路由守卫兜底拦截、聊天页按钮)都走这里,
 * 保证跳转目标单一可改。
 */
export function redirectToConsole(): void {
  window.location.href = '/admin'
}
