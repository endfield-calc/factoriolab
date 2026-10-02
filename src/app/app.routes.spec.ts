import { routes } from './app.routes';
import { DEFAULT_MOD } from './models/constants';
import { IdComponent } from './routes/id.component';
import { routes as mainRoutes } from './routes/main/main.routes';

describe('App Routes', () => {
  const idRoute = routes.find((route) => route.path === ':id');

  it('should load id route', async () => {
    expect(await idRoute?.loadComponent!()).toEqual(IdComponent);
  });

  it('should load child routes', async () => {
    expect(idRoute?.children?.[0].path).toEqual('ratio');
    expect(idRoute?.children?.[1].redirectTo).toEqual('list');
    expect(await idRoute?.children?.[2].loadChildren!()).toEqual(mainRoutes);
  });

  it('should redirect the root to the default list route', () => {
    expect(routes[0]).toEqual({
      path: '',
      pathMatch: 'full',
      redirectTo: `${DEFAULT_MOD}/list`,
    });
  });
});
