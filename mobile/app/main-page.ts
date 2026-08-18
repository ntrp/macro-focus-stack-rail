import { EventData, Page } from '@nativescript/core';
import { RailViewModel } from './rail-view-model';

export function onNavigatingTo(args: EventData): void {
  const page = args.object as Page;
  if (!page.bindingContext) {
    page.bindingContext = new RailViewModel();
  }
}

