import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { environment } from '../../../environments';

@Component({
  selector: 'lab-user-tips',
  standalone: true,
  imports: [
    AccordionModule,
    ButtonModule,
    TranslatePipe,
  ],
  templateUrl: './user-tips.component.html',
  styleUrl: './user-tips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserTipsComponent {

  protected readonly environment = environment;
}
