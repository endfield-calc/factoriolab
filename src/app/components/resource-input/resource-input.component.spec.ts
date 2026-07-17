import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestModule } from '~/tests';

import { ResourceInputComponent } from './resource-input.component';

describe('ResourceInputComponent', () => {
  let component: ResourceInputComponent;
  let fixture: ComponentFixture<ResourceInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, ResourceInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ResourceInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
