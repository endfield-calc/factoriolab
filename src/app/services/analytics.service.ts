import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  event(_: string, _1: string): void {
    // don't use this
  }
}
