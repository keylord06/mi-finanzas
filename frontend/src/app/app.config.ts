
import { ApplicationConfig, isDevMode } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCR from '@angular/common/locales/es-CR';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

// Los pipes currency de la plantilla usan 'es-CR'; sin esto Angular lanza NG0701.
registerLocaleData(localeEsCR);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
