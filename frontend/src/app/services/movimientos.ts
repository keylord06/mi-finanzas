
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Movimiento {
  id: number;
  usuario_id: number;
  categoria_id: number | null;
  tipo: 'INGRESO' | 'GASTO';
  descripcion: string;
  monto: string;
  fecha_movimiento: string;
}

export interface NuevoMovimiento {
  tipo: 'INGRESO' | 'GASTO';
  descripcion: string;
  monto: number;
  categoria_id: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class Movimientos {
  private http = inject(HttpClient);

  private apiUrl = `${environment.apiUrl}/movimientos`;

  private opcionesMutacion(): { withCredentials: true; headers?: HttpHeaders } {
    const token = sessionStorage.getItem('mi_finanzas_csrf');

    return {
      withCredentials: true,
      headers: token ? new HttpHeaders({ 'X-CSRF-Token': token }) : undefined
    };
  }

  obtenerMovimientos(): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(this.apiUrl, { withCredentials: true });
  }

  crearMovimiento(datos: NuevoMovimiento): Observable<{ mensaje: string; id: number }> {
    return this.http.post<{ mensaje: string; id: number }>(
      this.apiUrl,
      datos,
      this.opcionesMutacion()
    );
  }

  
  eliminarMovimiento(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      this.opcionesMutacion()
    );
  }

  
  actualizarMovimiento(
    id: number,
    datos: NuevoMovimiento
  ): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      datos,
      this.opcionesMutacion()
    );
  }

}
