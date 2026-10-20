import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

interface Usuario {
  id: number;
  nombre: string;
  correo: string;
}

interface LoginResponse {
  usuario: Usuario;
  csrfToken: string;
  sessionToken: string;
}

const CLAVE_CSRF = 'mi_finanzas_csrf';
const CLAVE_SESION = 'mi_finanzas_session_token';

// localStorage para que la sesión sobreviva al cerrar la app instalada en iPhone;
// el token expira igualmente en el servidor.
function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null): void {
  try {
    if (valor === null) {
      localStorage.removeItem(clave);
    } else {
      localStorage.setItem(clave, valor);
    }
  } catch {
    // Almacenamiento no disponible (modo privado): la sesión dura lo que la pestaña.
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;
  readonly usuario = signal<Usuario | null>(null);

  tieneSesionGuardada(): boolean {
    return leer(CLAVE_SESION) !== null;
  }

  limpiarSesionLocal(): void {
    escribir(CLAVE_CSRF, null);
    escribir(CLAVE_SESION, null);
    this.usuario.set(null);
  }

  opcionesAutenticacion(): { withCredentials: true; headers?: HttpHeaders } {
    const headers: Record<string, string> = {};
    const csrfToken = leer(CLAVE_CSRF);
    const sessionToken = leer(CLAVE_SESION);

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    return {
      withCredentials: true,
      headers: Object.keys(headers).length > 0 ? new HttpHeaders(headers) : undefined
    };
  }

  iniciarSesion(correo: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/login`,
      { correo, password },
      { withCredentials: true }
    ).pipe(
      tap(respuesta => {
        escribir(CLAVE_CSRF, respuesta.csrfToken);
        escribir(CLAVE_SESION, respuesta.sessionToken);
        this.usuario.set(respuesta.usuario);
      })
    );
  }

  comprobarSesion(): Observable<{ usuario: Usuario }> {
    return this.http.get<{ usuario: Usuario }>(
      `${this.apiUrl}/me`,
      this.opcionesAutenticacion()
    ).pipe(
      tap(respuesta => this.usuario.set(respuesta.usuario))
    );
  }

  cambiarPassword(currentPassword: string, newPassword: string): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(
      `${this.apiUrl}/password`,
      { currentPassword, newPassword },
      this.opcionesAutenticacion()
    );
  }

  cerrarSesion(): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(
      `${this.apiUrl}/logout`,
      {},
      this.opcionesAutenticacion()
    ).pipe(
      tap(() => this.limpiarSesionLocal())
    );
  }
}
