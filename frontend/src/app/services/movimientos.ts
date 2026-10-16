
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Auth } from './auth';

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
  private auth = inject(Auth);

  private apiUrl = `${environment.apiUrl}/movimientos`;

  obtenerMovimientos(): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(this.apiUrl, this.auth.opcionesAutenticacion());
  }

  crearMovimiento(datos: NuevoMovimiento): Observable<{ mensaje: string; id: number }> {
    return this.http.post<{ mensaje: string; id: number }>(
      this.apiUrl,
      datos,
      this.auth.opcionesAutenticacion()
    );
  }

  
  eliminarMovimiento(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      this.auth.opcionesAutenticacion()
    );
  }

  
  actualizarMovimiento(
    id: number,
    datos: NuevoMovimiento
  ): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      datos,
      this.auth.opcionesAutenticacion()
    );
  }

}
