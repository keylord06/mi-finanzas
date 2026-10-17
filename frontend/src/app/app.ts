
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, signal, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { Movimientos, Movimiento as MovimientoAPI } from './services/movimientos';
import { Categorias, Categoria, DatosCategoria } from './services/categorias';
import { Auth } from './services/auth';
import { AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { finalize, retry } from 'rxjs';

Chart.register(...registerables);

interface Movimiento {
  id: number;
  categoria_id: number | null;
  descripcion: string;
  tipo: 'ingreso' | 'gasto';
  monto: number;
  fecha: string;
  fechaOrden: number;
}

type FiltroTipo = 'TODOS' | 'INGRESO' | 'GASTO';

function normalizarFecha(fecha: string): string {
  const valor = fecha.trim().replace(' ', 'T');

  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(valor) ? valor : `${valor}Z`;
}

@Component({
  imports: [RouterOutlet, CurrencyPipe, DatePipe],
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
  protected readonly cargandoCategorias = signal(false);
  protected readonly categoriaSeleccionada = signal<number | null>(null);

  protected readonly movimientos = signal<Movimiento[]>([]);
  protected readonly busqueda = signal('');
  protected readonly tipoFiltro = signal<FiltroTipo>('TODOS');
  protected readonly categoriaFiltro = signal<number | null>(null);
  protected readonly fechaDesde = signal('');
  protected readonly fechaHasta = signal('');
  protected readonly confirmacion = signal('');
  protected readonly mostrarGestionCategorias = signal(false);
  protected readonly categoriaEditandoId = signal<number | null>(null);
  protected readonly nombreCategoria = signal('');
  protected readonly tipoCategoria = signal<'INGRESO' | 'GASTO'>('GASTO');
  protected readonly colorCategoria = signal('#64748B');
  protected readonly iconoCategoria = signal('circle');
  protected readonly mostrarSeguridad = signal(false);
  protected readonly mostrarMenuCuenta = signal(false);
  protected readonly mostrarFiltros = signal(false);
  protected readonly mostrarResumenGrafico = signal(false);
  protected readonly passwordActual = signal('');
  protected readonly passwordNueva = signal('');
  protected readonly passwordConfirmacion = signal('');

  protected readonly movimientosFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLocaleLowerCase();
    const tipo = this.tipoFiltro();
    const categoria = this.categoriaFiltro();
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    return this.movimientos().filter(movimiento => {
      const coincideTexto = !termino ||
        movimiento.descripcion.toLocaleLowerCase().includes(termino);
      const coincideTipo = tipo === 'TODOS' ||
        movimiento.tipo === tipo.toLocaleLowerCase();
      const coincideCategoria = categoria === null ||
        movimiento.categoria_id === categoria;
      const fecha = movimiento.fecha.slice(0, 10);
      const coincideDesde = !desde || fecha >= desde;
      const coincideHasta = !hasta || fecha <= hasta;

      return coincideTexto && coincideTipo && coincideCategoria &&
        coincideDesde && coincideHasta;
    });
  });

  protected readonly ingresosFiltrados = computed(() =>
    this.movimientosFiltrados()
      .filter(movimiento => movimiento.tipo === 'ingreso')
      .reduce((total, movimiento) => total + movimiento.monto, 0)
  );

  protected readonly gastosFiltrados = computed(() =>
    this.movimientosFiltrados()
      .filter(movimiento => movimiento.tipo === 'gasto')
      .reduce((total, movimiento) => total + movimiento.monto, 0)
  );

  protected readonly balance = computed(() =>
    this.ingresosFiltrados() - this.gastosFiltrados()
  );

  @ViewChild('graficoFinanzas')
graficoFinanzas!: ElementRef<HTMLCanvasElement>;

private grafico: Chart | null = null;

  private readonly sincronizarGrafico = effect(() => {
    const datos = [this.ingresosFiltrados(), this.gastosFiltrados()];

    if (this.grafico) {
      this.grafico.data.datasets[0].data = datos;
      this.grafico.update();
    }
  });

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
        sessionStorage.removeItem('mi_finanzas_session_token');
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

  const datos = [this.ingresosFiltrados(), this.gastosFiltrados()];

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
        const lista: Movimiento[] = datos.map(movimiento => {
          const fecha = normalizarFecha(movimiento.fecha_movimiento);

          return {
        id: movimiento.id,
        categoria_id: movimiento.categoria_id,
        descripcion: movimiento.descripcion,
        tipo: movimiento.tipo === 'INGRESO' ? 'ingreso' as const : 'gasto' as const,
        monto: Number(movimiento.monto),
        fecha,
        fechaOrden: Date.parse(fecha)
          };
        }).sort((a, b) => b.fechaOrden - a.fechaOrden);

        this.movimientos.set(lista);

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

  protected alternarResumenGrafico(): void {
    if (this.mostrarResumenGrafico()) {
      this.grafico?.destroy();
      this.grafico = null;
      this.mostrarResumenGrafico.set(false);
      return;
    }

    this.mostrarResumenGrafico.set(true);
    setTimeout(() => this.actualizarGrafico());
  }

  protected abrirGestionCategorias(): void {
    this.mostrarGestionCategorias.update(valor => !valor);
    this.cancelarCategoria();
  }

  protected editarCategoria(id: number): void {
    const categoria = this.categorias().find(item => item.id === id);

    if (!categoria) {
      return;
    }

    this.categoriaEditandoId.set(id);
    this.nombreCategoria.set(categoria.nombre);
    this.tipoCategoria.set(categoria.tipo);
    this.colorCategoria.set(categoria.color);
    this.iconoCategoria.set(categoria.icono);
  }

  protected cancelarCategoria(): void {
    this.categoriaEditandoId.set(null);
    this.nombreCategoria.set('');
    this.tipoCategoria.set('GASTO');
    this.colorCategoria.set('#64748B');
    this.iconoCategoria.set('circle');
  }

  protected guardarCategoria(): void {
    const datos: DatosCategoria = {
      nombre: this.nombreCategoria().trim(),
      tipo: this.tipoCategoria(),
      color: this.colorCategoria(),
      icono: this.iconoCategoria().trim() || 'circle'
    };

    if (!datos.nombre || !/^#[0-9A-Fa-f]{6}$/.test(datos.color)) {
      this.errorCarga.set('Escribe un nombre y selecciona un color válido.');
      return;
    }

    const id = this.categoriaEditandoId();
    const operacion = id === null
      ? this.servicioCategorias.crearCategoria(datos)
      : this.servicioCategorias.actualizarCategoria(id, datos);

    operacion.subscribe({
      next: () => {
        this.cancelarCategoria();
        this.cargarCategorias();
        this.mostrarConfirmacion(
          id === null ? 'Categoría creada correctamente.' : 'Categoría actualizada correctamente.'
        );
      },
      error: (error: HttpErrorResponse) => {
        this.errorCarga.set(
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'No se pudo guardar la categoría.'
        );
      }
    });
  }

  protected eliminarCategoria(id: number): void {
    if (!confirm('¿Desactivar esta categoría? Los movimientos históricos se conservarán.')) {
      return;
    }

    this.servicioCategorias.eliminarCategoria(id).subscribe({
      next: () => {
        this.cargarCategorias();
        this.mostrarConfirmacion('Categoría desactivada correctamente.');
      },
      error: (error: HttpErrorResponse) => {
        this.errorCarga.set(
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'No se pudo desactivar la categoría.'
        );
      }
    });
  }

  protected cambiarPassword(): void {
    const actual = this.passwordActual();
    const nueva = this.passwordNueva();

    if (nueva.length < 12 || nueva !== this.passwordConfirmacion()) {
      this.errorCarga.set('La nueva contraseña debe tener 12 caracteres y coincidir en ambos campos.');
      return;
    }

    this.auth.cambiarPassword(actual, nueva).subscribe({
      next: () => {
        this.passwordActual.set('');
        this.passwordNueva.set('');
        this.passwordConfirmacion.set('');
        this.mostrarConfirmacion('Contraseña actualizada.');
        this.mostrarSeguridad.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorCarga.set(
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'No se pudo cambiar la contraseña.'
        );
      }
    });
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

  protected reintentarCarga(): void {
    this.errorCarga.set('');
    this.cargarDatos();
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.tipoFiltro.set('TODOS');
    this.categoriaFiltro.set(null);
    this.fechaDesde.set('');
    this.fechaHasta.set('');
  }

  protected actualizarCategoriaFiltro(valor: string): void {
    this.categoriaFiltro.set(valor === '' ? null : Number(valor));
  }

  protected etiquetaCategoria(id: number | null): string {
    return this.categorias().find(categoria => categoria.id === id)?.nombre ?? 'Sin categoría';
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
    error: (error: HttpErrorResponse) => {
      this.errorSesion.set(
        typeof error.error?.mensaje === 'string'
          ? error.error.mensaje
          : 'Correo o contraseña incorrectos.'
      );
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
          fecha: new Date().toISOString(),
          fechaOrden: Date.now()
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


      this.descripcion.set('');
      this.monto.set(null);
      this.categoriaSeleccionada.set(null);
      this.movimientoEditandoId.set(null);
      this.errorCarga.set('');
      this.mostrarFormulario.set(false);
      this.mostrarConfirmacion(
        id === null ? 'Movimiento guardado correctamente.' : 'Movimiento actualizado correctamente.'
      );
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

      this.mostrarConfirmacion('Movimiento eliminado correctamente.');
    },
    error: (error) => {
      console.error('Error al eliminar movimiento:', error);
      this.errorCarga.set('No se pudo eliminar el movimiento.');
    }
  });
}

  private mostrarConfirmacion(mensaje: string): void {
    this.confirmacion.set(mensaje);
    setTimeout(() => this.confirmacion.set(''), 3500);
  }


private cargarCategorias(): void {
  this.cargandoCategorias.set(true);

  this.servicioCategorias.obtenerCategorias()
    .pipe(
      retry({ count: 2, delay: 1000 }),
      finalize(() => this.cargandoCategorias.set(false))
    )
    .subscribe({
    next: (datos: Categoria[]) => {
      this.categorias.set(datos);
    },
    error: (error: HttpErrorResponse) => {
      console.error('Error al cargar categorias:', error);
      this.errorCarga.set(
        error.status === 401
          ? 'La sesión expiró. Cierra sesión y vuelve a entrar.'
          : 'No se pudieron cargar las categorías. Pulsa Reintentar.'
      );
    }
  });
}


}
