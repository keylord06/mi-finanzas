import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Categorias } from './categorias';

describe('Categorias', () => {
  let service: Categorias;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(Categorias);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('mi_finanzas_session_token', 'session-test');
  });

  afterEach(() => {
    sessionStorage.clear();
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('carga categorías con la sesión móvil', () => {
    service.obtenerCategorias().subscribe();

    const request = http.expectOne(request => request.url.endsWith('/categorias'));
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Authorization')).toBe('Bearer session-test');
    request.flush([]);
  });
});
