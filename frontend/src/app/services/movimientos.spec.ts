import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Movimientos } from './movimientos';

describe('Movimientos', () => {
  let service: Movimientos;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(Movimientos);
    http = TestBed.inject(HttpTestingController);
    localStorage.setItem('mi_finanzas_csrf', 'csrf-test');
    localStorage.setItem('mi_finanzas_session_token', 'session-test');
  });

  afterEach(() => {
    localStorage.clear();
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('envía credenciales y token al crear un movimiento', () => {
    service.crearMovimiento({
      tipo: 'GASTO',
      descripcion: 'Comida',
      monto: 2500,
      categoria_id: 3
    }).subscribe();

    const request = http.expectOne(request => request.url.endsWith('/movimientos'));
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Authorization')).toBe('Bearer session-test');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-test');
    request.flush({ mensaje: 'OK', id: 10 });
  });
});
