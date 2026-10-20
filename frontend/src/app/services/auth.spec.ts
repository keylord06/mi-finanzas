import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth } from './auth';

describe('Auth', () => {
  let service: Auth;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    http.verify();
  });

  it('guarda el token de sesión después de iniciar sesión', () => {
    service.iniciarSesion('persona@example.com', 'password-seguro').subscribe();

    const request = http.expectOne(request => request.url.endsWith('/auth/login'));
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      usuario: { id: 2, nombre: 'Persona', correo: 'persona@example.com' },
      csrfToken: 'csrf-test',
      sessionToken: 'session-test'
    });

    expect(localStorage.getItem('mi_finanzas_csrf')).toBe('csrf-test');
    expect(localStorage.getItem('mi_finanzas_session_token')).toBe('session-test');
  });
});