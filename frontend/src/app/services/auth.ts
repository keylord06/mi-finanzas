import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;
  readonly usuario = signal<Usuario | null>(null);

  iniciarSesion(correo: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/login`,
      { correo, password },
      { withCredentials: true }
    ).pipe(
      tap(respuesta => {
        sessionStorage.setItem('mi_finanzas_csrf', respuesta.csrfToken);
        this.usuario.set(respuesta.usuario);
      })
    );
  }

  comprobarSesion(): Observable<{ usuario: Usuario }> {
    return this.http.get<{ usuario: Usuario }>(
      `${this.apiUrl}/me`,
      { withCredentials: true }
    ).pipe(
      tap(respuesta => this.usuario.set(respuesta.usuario))
    );
  }

  cerrarSesion(): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(
      `${this.apiUrl}/logout`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => {
        sessionStorage.removeItem('mi_finanzas_csrf');
        this.usuario.set(null);
      })
    );
  }
}