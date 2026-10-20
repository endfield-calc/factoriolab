import { routes } from './main.routes';
import { CustomRecipesComponent } from './routes/custom-recipes/custom-recipes.component';
import { routes as dataRoutes } from './routes/data/data.routes';
import { FlowComponent } from './routes/flow/flow.component';
import { ListComponent } from './routes/list/list.component';

describe('Main Routes', () => {
  it('should load child routes', async () => {
    expect(await routes[0].children![0].loadComponent!()).toEqual(
      ListComponent,
    );
    expect(await routes[0].children![1].loadComponent!()).toEqual(
      CustomRecipesComponent,
    );
    expect(await routes[0].children![2].loadComponent!()).toEqual(
      FlowComponent,
    );
    expect(await routes[0].children![3].loadComponent!()).toEqual(
      FlowComponent,
    );
    expect(await routes[0].children![4].loadChildren!()).toEqual(dataRoutes);
    expect(routes[0].children![2].data).toEqual({ partitionPreview: false });
    expect(routes[0].children![3].data).toEqual({ partitionPreview: true });
  });
});
