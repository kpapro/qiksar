import {
  Router as vueRouter,
  createMemoryHistory,
  createRouter as vueCreateRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import getRoutes from 'src/domain/GetRoutes';

export let Router = {} as vueRouter;

export default async function createRouter(): Promise<vueRouter> {
  const routes = await getRoutes();

  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
    ? createWebHistory
    : createWebHashHistory;

  Router = vueCreateRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(
      process.env.MODE === 'ssr' ? void 0 : process.env.VUE_ROUTER_BASE
    ),
  });

  return Router;
}
