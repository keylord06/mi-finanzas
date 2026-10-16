
import { DecimalPipe } from '@angular/common';
import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Movimientos, Movimiento as MovimientoAPI } from './services/movimientos';
import { Categorias, Categoria } from './services/categorias';
import { Auth } from './services/auth';
import { AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface Movimiento {
  id: number;
  categoria_id: number | null;
  descripcion: string;
  tipo: 'ingreso' | 'gasto';
  monto: number;
  fecha: string;
}

@Component({
  imports: [RouterOutlet, DecimalPipe],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit, AfterViewInit {
  private servicioMovimientos = inject(Movimientos);

  private servicioCategorias = inject(Categorias);

  private auth = inject(Auth);

  protected readonly autenticado = signal(false);
  protected readonly correo = signal('');
  protected readonly password = signal('');
  protected readonly errorSesion = signal('');

  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly categoriaSeleccionada = signal<number | null>(null);

  protected readonly ingresos = signal(0);
  protected readonly gastos = signal(0);
  protected readonly movimientos = signal<Movimiento[]>([]);

  @ViewChild('graficoFinanzas')
graficoFinanzas!: ElementRef<HTMLCanvasElement>;

private grafico: Chart | null = null;

  protected readonly balance = () => {
    return this.ingresos() - this.gastos();
  };

  protected readonly mostrarFormulario = signal(false);
  protected readonly tipoMovimiento = signal<'ingreso' | 'gasto'>('gasto');
  protected readonly movimientoEditandoId = signal<number | null>(null);
  protected readonly descripcion = signal('');
  protected readonly monto = signal<number | null>(null);
  protected readonly errorCarga = signal('');

  ngOnInit(): void {
    this.auth.comprobarSesion().subscribe({
      next: () => {
        this.autenticado.set(true);
        this.cargarDatos();
      },
      error: () => {
        sessionStorage.removeItem('mi_finanzas_csrf');
        this.autenticado.set(false);
      }
    });
  }

ngAfterViewInit(): void {
  this.actualizarGrafico();
}

private actualizarGrafico(): void {
  if (!this.autenticado() || !this.graficoFinanzas) {
    return;
  }

  const datos = [this.ingresos(), this.gastos()];

  if (this.grafico) {
    this.grafico.data.datasets[0].data = datos;
    this.grafico.update();
    return;
  }

  this.grafico = new Chart(this.graficoFinanzas.nativeElement, {
    type: 'bar',
    data: {
      labels: ['Ingresos', 'Gastos'],
      datasets: [
        {
          label: 'Monto en colones',
          data: datos,
          backgroundColor: ['#22c55e', '#ef4444']
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

  private cargarMovimientos(): void {
    this.servicioMovimientos.obtenerMovimientos().subscribe({
      next: (datos: MovimientoAPI[]) => {
        const lista: Movimiento[] = datos.map(movimiento => ({
        id: movimiento.id,
        categoria_id: movimiento.categoria_id,
        descripcion: movimiento.descripcion,
        tipo: movimiento.tipo === 'INGRESO' ? 'ingreso' : 'gasto',
        monto: Number(movimiento.monto),
        fecha: movimiento.fecha_movimiento,
      }));

        this.movimientos.set(lista);

        this.ingresos.set(
          lista
            .filter(movimiento => movimiento.tipo === 'ingreso')
            .reduce((total, movimiento) => total + movimiento.monto, 0)
        );

        this.gastos.set(
          lista
            .filter(movimiento => movimiento.tipo === 'gasto')
            .reduce((total, movimiento) => total + movimiento.monto, 0)
        );

        this.actualizarGrafico();
      },
      error: () => {
        this.errorCarga.set('No se pudieron cargar los movimientos.');
      }
    });
  }

  protected abrirFormulario(): void {
    this.mostrarFormulario.set(true);
  }

  
protected editarMovimiento(id: number): void {
  const movimiento = this.movimientos().find(
    item => item.id === id
  );

  if (!movimiento) {
    return;
  }

  this.movimientoEditandoId.set(movimiento.id);
  this.tipoMovimiento.set(movimiento.tipo);
  this.descripcion.set(movimiento.descripcion);
  this.monto.set(movimiento.monto);
  this.categoriaSeleccionada.set(movimiento.categoria_id);
  this.mostrarFormulario.set(true);
}

private cargarDatos(): void {
  this.cargarMovimientos();
  this.cargarCategorias();
}

protected iniciarSesion(): void {
  const correo = this.correo().trim();
  const password = this.password();

  if (!correo || !password) {
    this.errorSesion.set('Escribe tu correo y contraseña.');
    return;
  }

  this.auth.iniciarSesion(correo, password).subscribe({
    next: () => {
      this.autenticado.set(true);
      this.password.set('');
      this.errorSesion.set('');
      this.cargarDatos();
    },
    error: () => {
      this.errorSesion.set('Correo o contraseña incorrectos.');
    }
  });
}

protected cerrarSesion(): void {
  this.auth.cerrarSesion().subscribe({
    next: () => this.autenticado.set(false),
    error: () => this.errorSesion.set('No se pudo cerrar la sesión.')
  });
}


  protected actualizarMonto(valor: string): void {
    this.monto.set(valor === '' ? null : Number(valor));
  }

  protected actualizarCategoria(valor: string): void {
    this.categoriaSeleccionada.set(valor === '' ? null : Number(valor));
  }

  
protected guardarMovimiento(): void {
  const montoIngresado = this.monto();
  const concepto = this.descripcion().trim();
  const tipo = this.tipoMovimiento();
  const categoriaId = this.categoriaSeleccionada();
  const id = this.movimientoEditandoId();

  if (
    montoIngresado === null ||
    !Number.isFinite(montoIngresado) ||
    montoIngresado <= 0 ||
    concepto === '' ||
    categoriaId === null
  ) {
    this.errorCarga.set('Completa todos los campos correctamente.');
    return;
  }

  const datos = {
    tipo: tipo === 'ingreso' ? 'INGRESO' as const : 'GASTO' as const,
    descripcion: concepto,
    monto: montoIngresado,
    categoria_id: categoriaId
  };

  const operacion = id === null
    ? this.servicioMovimientos.crearMovimiento(datos)
    : this.servicioMovimientos.actualizarMovimiento(id, datos);

  operacion.subscribe({
    next: (respuesta) => {
      if (id === null) {
        if (!('id' in respuesta) || typeof respuesta.id !== 'number') {
          this.errorCarga.set('La respuesta del servidor no incluye el identificador.');
          return;
        }

        const nuevoMovimiento: Movimiento = {
          id: respuesta.id,
          categoria_id: categoriaId,
          descripcion: concepto,
          tipo,
          monto: montoIngresado,
          fecha: new Date().toLocaleDateString('es-CR')
        };

        this.movimientos.update(lista => [
          nuevoMovimiento,
          ...lista
        ]);
      } else {
        this.movimientos.update(lista =>
          lista.map(movimiento =>
            movimiento.id === id
              ? {
                  ...movimiento,
                  categoria_id: categoriaId,
                  descripcion: concepto,
                  tipo,
                  monto: montoIngresado
                }
              : movimiento
          )
        );
      }

      this.ingresos.set(
        this.movimientos()
          .filter(movimiento => movimiento.tipo === 'ingreso')
          .reduce((total, movimiento) => total + movimiento.monto, 0)
      );

      this.gastos.set(
        this.movimientos()
          .filter(movimiento => movimiento.tipo === 'gasto')
          .reduce((total, movimiento) => total + movimiento.monto, 0)
      );

      this.descripcion.set('');
      this.monto.set(null);
      this.categoriaSeleccionada.set(null);
      this.movimientoEditandoId.set(null);
      this.errorCarga.set('');
      this.mostrarFormulario.set(false);
    },
    error: (error) => {
      console.error('Error al guardar el movimiento:', error);
      this.errorCarga.set('No se pudo guardar el movimiento.');
    }
  });
}




protected eliminarMovimiento(id: number): void {
  const confirmar = confirm(
    '¿Estás seguro de que deseas eliminar este movimiento?'
  );

  if (!confirmar) {
    return;
  }

  this.servicioMovimientos.eliminarMovimiento(id).subscribe({
    next: () => {
      const movimientoEliminado = this.movimientos().find(
        movimiento => movimiento.id === id
      );

      if (!movimientoEliminado) {
        return;
      }

      this.movimientos.update(lista =>
        lista.filter(movimiento => movimiento.id !== id)
      );

      if (movimientoEliminado.tipo === 'ingreso') {
        this.ingresos.update(
          total => total - movimientoEliminado.monto
        );
      } else {
        this.gastos.update(
          total => total - movimientoEliminado.monto
        );
      }
    },
    error: (error) => {
      console.error('Error al eliminar movimiento:', error);
      this.errorCarga.set('No se pudo eliminar el movimiento.');
    }
  });
}


private cargarCategorias(): void {
  this.servicioCategorias.obtenerCategorias().subscribe({
    next: (datos: Categoria[]) => {
      this.categorias.set(datos);
    },
    error: (error) => {
      console.error('Error al cargar categorias:', error);
      this.errorCarga.set('No se pudieron cargar las categorias.');
    }
  });
}


}
