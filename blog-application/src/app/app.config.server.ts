import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { HttpBackend } from '@angular/common/http';
import { SsrApiBackend } from '../core/ssr-api.interceptor';
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: HttpBackend, useClass: SsrApiBackend }
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
