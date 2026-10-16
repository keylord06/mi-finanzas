
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Auth } from './auth';

export interface Categoria {
  id: number;
  nombre: string;
  tipo: 'INGRESO' | 'GASTO';
  color: string;
  icono: string;
}

export interface DatosCategoria {
  nombre: string;
  tipo: 'INGRESO' | 'GASTO';
  color: string;
  icono: string;
}

@Injectable({
  providedIn: 'root'
})
export class Categorias {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  private apiUrl = `${environment.apiUrl}/categorias`;

  obtenerCategorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(this.apiUrl, this.auth.opcionesAutenticacion());
  }

  crearCategoria(datos: DatosCategoria): Observable<{ mensaje: string; id: number }> {
    return this.http.post<{ mensaje: string; id: number }>(
      this.apiUrl,
      datos,
      this.auth.opcionesAutenticacion()
    );
  }

  actualizarCategoria(id: number, datos: DatosCategoria): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      datos,
      this.auth.opcionesAutenticacion()
    );
  }

  eliminarCategoria(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(
      `${this.apiUrl}/${id}`,
      this.auth.opcionesAutenticacion()
    );
  }
}
