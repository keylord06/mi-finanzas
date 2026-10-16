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

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;
  readonly usuario = signal<Usuario | null>(null);

  opcionesAutenticacion(): { withCredentials: true; headers?: HttpHeaders } {
    const headers: Record<string, string> = {};
    const csrfToken = sessionStorage.getItem('mi_finanzas_csrf');
    const sessionToken = sessionStorage.getItem('mi_finanzas_session_token');

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
        sessionStorage.setItem('mi_finanzas_csrf', respuesta.csrfToken);
        sessionStorage.setItem('mi_finanzas_session_token', respuesta.sessionToken);
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

  cerrarSesion(): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(
      `${this.apiUrl}/logout`,
      {},
      this.opcionesAutenticacion()
    ).pipe(
      tap(() => {
        sessionStorage.removeItem('mi_finanzas_csrf');
        sessionStorage.removeItem('mi_finanzas_session_token');
        this.usuario.set(null);
      })
    );
  }
}