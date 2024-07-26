import { NgModule } from '@angular/core';

import { AppSharedModule } from '~/app-shared.module';
import { MainSharedModule } from './main-shared.module';
import { MainComponent } from './main.component';
import { MainRoutingModule } from './main.routes';

@NgModule({
  imports: [AppSharedModule, MainSharedModule, MainRoutingModule],
  declarations: [MainComponent],
})
export class MainModule {}
