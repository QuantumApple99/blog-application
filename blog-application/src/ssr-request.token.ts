import { InjectionToken } from '@angular/core';

/** Provided by server.ts during SSR only; absent in the browser. See contracts.md "SSR → API". */
export interface SsrRequest {
  cookie: string;
  origin: string;
}

export const SSR_REQUEST = new InjectionToken<SsrRequest>('SSR_REQUEST');
