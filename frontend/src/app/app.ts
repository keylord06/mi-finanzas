import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { MonoTypeOperatorFunction, Observable, finalize, retry, throwError, timer } from 'rxjs';
import { Auth } from './services/auth';
import { Categoria, Categorias, DatosCategoria } from './services/categorias';
import { Movimiento as MovimientoAPI, Movimientos, NuevoMovimiento } from './services/movimientos';

type Tipo = 'INGRESO' | 'GASTO';
type FiltroTipo = 'TODOS' | Tipo;
type Periodo = 'TODO' | 'MES' | 'MES_ANTERIOR';

interface Movimiento {
  id: number;
  categoria_id: number | null;
  descripcion: string;
  tipo: Tipo;
  monto: number;
  fecha: string;
  fechaOrden: number;
  dia: string;
}

interface GrupoDia {
  dia: string;
  etiqueta: string;
  total: number;
  movimientos: Movimiento[];
}

interface GastoCategoria {
  id: number | null;
  nombre: string;
  color: string;
  icono: string;
  total: number;
  porcentaje: number;
}

// Costa Rica no usa horario de verano: siempre UTC-6.
const ZONA_CR = '-0600';
const DESFASE_CR_MS = 6 * 60 * 60 * 1000;
const COLOR_SIN_CATEGORIA = '#64748B';

export const ICONOS: Record<string, string> = {
  wallet: '💼',
  'plus-circle': '➕',
  utensils: '🍽️',
  car: '🚗',
  'book-open': '📚',
  'gamepad-2': '🎮',
  'heart-pulse': '🩺',
  home: '🏠',
  'shopping-bag': '🛍️',
  bolt: '💡',
  phone: '📱',
  gift: '🎁',
  plane: '✈️',
  paw: '🐾',
  beer: '🍺',
  ball: '⚽',
  circle: '🏷️'
};

const ICONOS_DISPONIBLES = Object.keys(ICONOS);

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: 'TODO', etiqueta: 'Todo' },
  { valor: 'MES', etiqueta: 'Este mes' },
  { valor: 'MES_ANTERIOR', etiqueta: 'Mes pasado' }
];

function diaCostaRica(ms: number): string {
  return new Date(ms - DESFASE_CR_MS).toISOString().slice(0, 10);
}

function normalizarFecha(fecha: string): string {
  const valor = fecha.trim().replace(' ', 'T');

  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(valor) ? valor : `${valor}Z`;
}

function rangoPeriodo(periodo: Periodo): [string, string] {
  if (periodo === 'TODO') {
    return ['', ''];
  }

  const [anio, mes] = diaCostaRica(Date.now()).split('-').map(Number);
  const primerDia = (mesBase: number) =>
    new Date(Date.UTC(anio, mesBase - 1, 1)).toISOString().slice(0, 10);

  if (periodo === 'MES') {
    return [primerDia(mes), ''];
  }

  const ultimoDiaMesAnterior = new Date(Date.UTC(anio, mes - 1, 0)).toISOString().slice(0, 10);
  return [primerDia(mes - 1), ultimoDiaMesAnterior];
}

function aMovimiento(movimiento: MovimientoAPI): Movimiento {
  const fecha = normalizarFecha(String(movimiento.fecha_movimiento));
  const fechaOrden = Date.parse(fecha);

  return {
    id: movimiento.id,
    categoria_id: movimiento.categoria_id,
    descripcion: movimiento.descripcion,
    tipo: movimiento.tipo,
    monto: Number(movimiento.monto),
    fecha,
    fechaOrden,
    dia: diaCostaRica(fechaOrden)
  };
}

// Reintenta solo errores de red o del servidor; un 401/400 no se arregla reintentando.
function reintentoTransitorio<T>(): MonoTypeOperatorFunction<T> {
  return retry({
    count: 2,
    delay: (error: HttpErrorResponse) =>
      error.status === 0 || error.status >= 500 ? timer(1000) : throwError(() => error)
  });
}

function mensajeError(error: HttpErrorResponse, alternativo: string): string {
  return typeof error.error?.mensaje === 'string' ? error.error.mensaje : alternativo;
}

@Component({
  imports: [CurrencyPipe, DatePipe],
  selector: 'app-root',
  templateUrl: './app.html'
})
export class App implements OnInit {
  private servicioMovimientos = inject(Movimientos);
  private servicioCategorias = inject(Categorias);
  private auth = inject(Auth);

  protected readonly zonaCR = ZONA_CR;
  protected readonly iconos = ICONOS;
  protected readonly iconosDisponibles = ICONOS_DISPONIBLES;
  protected readonly periodos = PERIODOS;

  protected readonly verificandoSesion = signal(true);
  protected readonly autenticado = signal(false);
  protected readonly iniciandoSesion = signal(false);
  protected readonly correo = signal('');
  protected readonly password = signal('');
  protected readonly errorSesion = signal('');
  protected readonly usuario = this.auth.usuario;
  protected readonly inicial = computed(() =>
    (this.usuario()?.nombre.trim()[0] ?? '?').toLocaleUpperCase()
  );

  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly cargandoCategorias = signal(false);
  protected readonly categoriaSeleccionada = signal<number | null>(null);

  protected readonly movimientos = signal<Movimiento[]>([]);
  protected readonly cargandoMovimientos = signal(false);
  protected readonly busqueda = signal('');
  protected readonly tipoFiltro = signal<FiltroTipo>('TODOS');
  protected readonly categoriaFiltro = signal<number | null>(null);
  protected readonly fechaDesde = signal('');
  protected readonly fechaHasta = signal('');

  protected readonly confirmacion = signal('');
  protected readonly errorCarga = signal('');
  protected readonly guardando = signal(false);

  protected readonly mostrarGestionCategorias = signal(false);
  protected readonly categoriaEditandoId = signal<number | null>(null);
  protected readonly nombreCategoria = signal('');
  protected readonly tipoCategoria = signal<Tipo>('GASTO');
  protected readonly colorCategoria = signal('#64748B');
  protected readonly iconoCategoria = signal('circle');

  protected readonly mostrarSeguridad = signal(false);
  protected readonly mostrarMenuCuenta = signal(false);
  protected readonly mostrarFiltros = signal(false);
  protected readonly passwordActual = signal('');
  protected readonly passwordNueva = signal('');
  protected readonly passwordConfirmacion = signal('');

  protected readonly mostrarFormulario = signal(false);
  protected readonly tipoMovimiento = signal<Tipo>('GASTO');
  protected readonly movimientoEditandoId = signal<number | null>(null);
  protected readonly descripcion = signal('');
  protected readonly monto = signal<number | null>(null);
  protected readonly errorFormulario = signal('');

  private temporizadorConfirmacion?: ReturnType<typeof setTimeout>;

  protected readonly categoriasPorId = computed(
    () => new Map(this.categorias().map(categoria => [categoria.id, categoria]))
  );

  protected readonly categoriasDelTipo = computed(() =>
    this.categorias().filter(categoria => categoria.tipo === this.tipoMovimiento())
  );

  protected readonly periodoActivo = computed<Periodo | null>(() => {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    return PERIODOS.find(({ valor }) => {
      const [inicio, fin] = rangoPeriodo(valor);
      return inicio === desde && fin === hasta;
    })?.valor ?? null;
  });

  protected readonly etiquetaPeriodo = computed(() => {
    switch (this.periodoActivo()) {
      case 'TODO': return 'total';
      case 'MES': return 'de este mes';
      case 'MES_ANTERIOR': return 'del mes pasado';
      default: return 'del periodo';
    }
  });

  protected readonly filtrosActivos = computed(() =>
    (this.tipoFiltro() !== 'TODOS' ? 1 : 0) +
    (this.categoriaFiltro() !== null ? 1 : 0) +
    (this.periodoActivo() === null ? 1 : 0)
  );

  // Movimientos del periodo (sin búsqueda ni tipo) para el resumen.
  private readonly movimientosPeriodo = computed(() => {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    if (!desde && !hasta) {
      return this.movimientos();
    }

    return this.movimientos().filter(movimiento =>
      (!desde || movimiento.dia >= desde) && (!hasta || movimiento.dia <= hasta)
    );
  });

  protected readonly movimientosFiltrados = computed(() => {
    const termino = this.busqueda().trim().toLocaleLowerCase();
    const tipo = this.tipoFiltro();
    const categoria = this.categoriaFiltro();

    return this.movimientosPeriodo().filter(movimiento =>
      (!termino || movimiento.descripcion.toLocaleLowerCase().includes(termino)) &&
      (tipo === 'TODOS' || movimiento.tipo === tipo) &&
      (categoria === null || movimiento.categoria_id === categoria)
    );
  });

  protected readonly ingresos = computed(() => this.sumar(this.movimientosPeriodo(), 'INGRESO'));
  protected readonly gastos = computed(() => this.sumar(this.movimientosPeriodo(), 'GASTO'));
  protected readonly balance = computed(() => this.ingresos() - this.gastos());

  protected readonly porcentajeGastado = computed(() => {
    const ingresos = this.ingresos();
    return ingresos > 0 ? Math.round((this.gastos() / ingresos) * 100) : null;
  });

  protected readonly gastosPorCategoria = computed<GastoCategoria[]>(() => {
    const totales = new Map<number | null, number>();

    for (const movimiento of this.movimientosPeriodo()) {
      if (movimiento.tipo === 'GASTO') {
        totales.set(movimiento.categoria_id, (totales.get(movimiento.categoria_id) ?? 0) + movimiento.monto);
      }
    }

    const totalGastos = this.gastos() || 1;

    return [...totales]
      .map(([id, total]) => {
        const categoria = id === null ? undefined : this.categoriasPorId().get(id);

        return {
          id,
          nombre: categoria?.nombre ?? 'Sin categoría',
          color: categoria?.color ?? COLOR_SIN_CATEGORIA,
          icono: categoria?.icono ?? 'circle',
          total,
          porcentaje: Math.round((total / totalGastos) * 100)
        };
      })
      .sort((a, b) => b.total - a.total);
  });

  protected readonly grupos = computed<GrupoDia[]>(() => {
    const hoy = diaCostaRica(Date.now());
    const ayer = diaCostaRica(Date.now() - 24 * 60 * 60 * 1000);
    const grupos: GrupoDia[] = [];

    for (const movimiento of this.movimientosFiltrados()) {
      let grupo = grupos[grupos.length - 1];

      if (!grupo || grupo.dia !== movimiento.dia) {
        grupo = {
          dia: movimiento.dia,
          etiqueta: movimiento.dia === hoy
            ? 'Hoy'
            : movimiento.dia === ayer
              ? 'Ayer'
              : formatDate(`${movimiento.dia}T12:00:00Z`, "EEEE d 'de' MMMM", 'es-CR', 'UTC'),
          total: 0,
          movimientos: []
        };
        grupos.push(grupo);
      }

      grupo.movimientos.push(movimiento);
      grupo.total += movimiento.tipo === 'INGRESO' ? movimiento.monto : -movimiento.monto;
    }

    return grupos;
  });

  // Los modales de categorías y seguridad muestran errorCarga dentro de su propio panel.
  protected readonly hayCapaConError = computed(() =>
    this.mostrarGestionCategorias() || this.mostrarSeguridad()
  );

  private readonly hayModalAbierto = computed(() =>
    this.mostrarFormulario() || this.mostrarGestionCategorias() || this.mostrarSeguridad()
  );

  // Evita que la página de fondo se desplace mientras hay un modal abierto (iOS).
  private readonly bloquearScroll = effect(() => {
    document.documentElement.classList.toggle('sin-scroll', this.hayModalAbierto());
  });

  ngOnInit(): void {
    if (!this.auth.tieneSesionGuardada()) {
      this.verificandoSesion.set(false);
      return;
    }

    this.auth.comprobarSesion()
      .pipe(reintentoTransitorio(), finalize(() => this.verificandoSesion.set(false)))
      .subscribe({
        next: () => {
          this.autenticado.set(true);
          this.cargarDatos();
        },
        error: () => this.auth.limpiarSesionLocal()
      });
  }

  @HostListener('document:keydown.escape')
  protected cerrarCapaSuperior(): void {
    if (this.mostrarFormulario()) {
      this.cerrarFormulario();
    } else if (this.mostrarGestionCategorias()) {
      this.mostrarGestionCategorias.set(false);
    } else if (this.mostrarSeguridad()) {
      this.mostrarSeguridad.set(false);
    } else {
      this.mostrarMenuCuenta.set(false);
    }
  }

  // Muestra céntimos solo cuando el monto los tiene: ₡650 000 y ₡38 450,50.
  protected formato(monto: number): string {
    return Number.isInteger(Math.round(monto * 100) / 100) ? '1.0-0' : '1.2-2';
  }

  protected iconoDe(nombre: string | undefined): string {
    return ICONOS[nombre ?? 'circle'] ?? ICONOS['circle'];
  }

  protected categoriaDe(id: number | null): Categoria | undefined {
    return id === null ? undefined : this.categoriasPorId().get(id);
  }

  // ---------- Sesión ----------

  protected iniciarSesion(): void {
    const correo = this.correo().trim();
    const password = this.password();

    if (!correo || !password) {
      this.errorSesion.set('Escribe tu correo y contraseña.');
      return;
    }

    this.iniciandoSesion.set(true);
    this.errorSesion.set('');

    this.auth.iniciarSesion(correo, password)
      .pipe(finalize(() => this.iniciandoSesion.set(false)))
      .subscribe({
        next: () => {
          this.autenticado.set(true);
          this.password.set('');
          this.cargarDatos();
        },
        error: (error: HttpErrorResponse) => {
          this.errorSesion.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.'
              : mensajeError(error, 'Correo o contraseña incorrectos.')
          );
        }
      });
  }

  protected cerrarSesion(): void {
    this.mostrarMenuCuenta.set(false);
    this.auth.cerrarSesion().subscribe({ error: () => undefined });
    this.salir();
  }

  private salir(mensaje = ''): void {
    this.auth.limpiarSesionLocal();
    this.autenticado.set(false);
    this.movimientos.set([]);
    this.categorias.set([]);
    this.errorCarga.set('');
    this.errorSesion.set(mensaje);
  }

  private manejarErrorCarga(error: HttpErrorResponse, mensaje: string): void {
    if (error.status === 401) {
      this.salir('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }

    this.errorCarga.set(mensaje);
  }

  // ---------- Carga de datos ----------

  private cargarDatos(): void {
    this.cargarMovimientos();
    this.cargarCategorias();
  }

  protected reintentarCarga(): void {
    this.errorCarga.set('');
    this.cargarDatos();
  }

  private cargarMovimientos(): void {
    this.cargandoMovimientos.set(true);

    this.servicioMovimientos.obtenerMovimientos()
      .pipe(reintentoTransitorio(), finalize(() => this.cargandoMovimientos.set(false)))
      .subscribe({
        next: datos => {
          this.movimientos.set(datos.map(aMovimiento).sort((a, b) => b.fechaOrden - a.fechaOrden));
        },
        error: (error: HttpErrorResponse) =>
          this.manejarErrorCarga(error, 'No se pudieron cargar los movimientos.')
      });
  }

  private cargarCategorias(): void {
    this.cargandoCategorias.set(true);

    this.servicioCategorias.obtenerCategorias()
      .pipe(reintentoTransitorio(), finalize(() => this.cargandoCategorias.set(false)))
      .subscribe({
        next: datos => this.categorias.set(datos),
        error: (error: HttpErrorResponse) =>
          this.manejarErrorCarga(error, 'No se pudieron cargar las categorías.')
      });
  }

  private sumar(lista: Movimiento[], tipo: Tipo): number {
    return lista.reduce((total, movimiento) => movimiento.tipo === tipo ? total + movimiento.monto : total, 0);
  }

  // ---------- Filtros ----------

  protected seleccionarPeriodo(periodo: Periodo): void {
    const [desde, hasta] = rangoPeriodo(periodo);
    this.fechaDesde.set(desde);
    this.fechaHasta.set(hasta);
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.tipoFiltro.set('TODOS');
    this.categoriaFiltro.set(null);
    this.seleccionarPeriodo('TODO');
  }

  protected actualizarCategoriaFiltro(valor: string): void {
    this.categoriaFiltro.set(valor === '' ? null : Number(valor));
  }

  // ---------- Movimientos ----------

  protected abrirFormulario(): void {
    this.movimientoEditandoId.set(null);
    this.tipoMovimiento.set('GASTO');
    this.descripcion.set('');
    this.monto.set(null);
    this.categoriaSeleccionada.set(null);
    this.errorFormulario.set('');
    this.mostrarFormulario.set(true);
  }

  protected editarMovimiento(id: number): void {
    const movimiento = this.movimientos().find(item => item.id === id);

    if (!movimiento) {
      return;
    }

    this.movimientoEditandoId.set(movimiento.id);
    this.tipoMovimiento.set(movimiento.tipo);
    this.descripcion.set(movimiento.descripcion);
    this.monto.set(movimiento.monto);
    this.categoriaSeleccionada.set(movimiento.categoria_id);
    this.errorFormulario.set('');
    this.mostrarFormulario.set(true);
  }

  protected cerrarFormulario(): void {
    this.mostrarFormulario.set(false);
    this.movimientoEditandoId.set(null);
  }

  protected cambiarTipoMovimiento(tipo: Tipo): void {
    this.tipoMovimiento.set(tipo);

    if (this.categoriaDe(this.categoriaSeleccionada())?.tipo !== tipo) {
      this.categoriaSeleccionada.set(null);
    }
  }

  protected actualizarMonto(valor: string): void {
    const numero = Number(valor.replace(',', '.'));
    this.monto.set(valor.trim() === '' || !Number.isFinite(numero) ? null : numero);
  }

  protected guardarMovimiento(): void {
    if (this.guardando()) {
      return;
    }

    const monto = this.monto();
    const descripcion = this.descripcion().trim();
    const tipo = this.tipoMovimiento();
    const categoriaId = this.categoriaSeleccionada();
    const id = this.movimientoEditandoId();

    if (monto === null || monto <= 0) {
      this.errorFormulario.set('Escribe un monto mayor que cero.');
      return;
    }

    if (!descripcion) {
      this.errorFormulario.set('Escribe una descripción.');
      return;
    }

    if (categoriaId === null) {
      this.errorFormulario.set('Elige una categoría.');
      return;
    }

    const datos: NuevoMovimiento = { tipo, descripcion, monto, categoria_id: categoriaId };
    const operacion: Observable<unknown> = id === null
      ? this.servicioMovimientos.crearMovimiento(datos)
      : this.servicioMovimientos.actualizarMovimiento(id, datos);

    this.guardando.set(true);

    operacion.pipe(finalize(() => this.guardando.set(false))).subscribe({
      next: respuesta => {
        if (id === null) {
          const ahora = new Date().toISOString();
          const nuevo = aMovimiento({
            id: (respuesta as { id: number }).id,
            usuario_id: this.usuario()?.id ?? 0,
            categoria_id: categoriaId,
            tipo,
            descripcion,
            monto: String(monto),
            fecha_movimiento: ahora
          });
          this.movimientos.update(lista => [nuevo, ...lista]);
        } else {
          this.movimientos.update(lista =>
            lista.map(movimiento =>
              movimiento.id === id
                ? { ...movimiento, categoria_id: categoriaId, descripcion, tipo, monto }
                : movimiento
            )
          );
        }

        this.cerrarFormulario();
        this.mostrarConfirmacion(id === null ? 'Movimiento guardado' : 'Movimiento actualizado');
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.mostrarFormulario.set(false);
          this.salir('Tu sesión expiró. Vuelve a iniciar sesión.');
          return;
        }

        this.errorFormulario.set(mensajeError(error, 'No se pudo guardar el movimiento.'));
      }
    });
  }

  protected eliminarMovimiento(id: number): void {
    if (this.guardando() || !confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) {
      return;
    }

    this.guardando.set(true);

    this.servicioMovimientos.eliminarMovimiento(id)
      .pipe(finalize(() => this.guardando.set(false)))
      .subscribe({
        next: () => {
          this.movimientos.update(lista => lista.filter(movimiento => movimiento.id !== id));
          this.cerrarFormulario();
          this.mostrarConfirmacion('Movimiento eliminado');
        },
        error: (error: HttpErrorResponse) =>
          this.errorFormulario.set(mensajeError(error, 'No se pudo eliminar el movimiento.'))
      });
  }

  // ---------- Categorías ----------

  protected abrirGestionCategorias(): void {
    this.mostrarMenuCuenta.set(false);
    this.cancelarCategoria();
    this.mostrarGestionCategorias.set(true);
  }

  protected editarCategoria(id: number): void {
    const categoria = this.categoriasPorId().get(id);

    if (!categoria) {
      return;
    }

    this.categoriaEditandoId.set(id);
    this.nombreCategoria.set(categoria.nombre);
    this.tipoCategoria.set(categoria.tipo);
    this.colorCategoria.set(categoria.color);
    this.iconoCategoria.set(ICONOS[categoria.icono] ? categoria.icono : 'circle');
  }

  protected cancelarCategoria(): void {
    this.categoriaEditandoId.set(null);
    this.nombreCategoria.set('');
    this.tipoCategoria.set('GASTO');
    this.colorCategoria.set('#64748B');
    this.iconoCategoria.set('circle');
    this.errorCarga.set('');
  }

  protected guardarCategoria(): void {
    if (this.guardando()) {
      return;
    }

    const datos: DatosCategoria = {
      nombre: this.nombreCategoria().trim(),
      tipo: this.tipoCategoria(),
      color: this.colorCategoria(),
      icono: this.iconoCategoria()
    };

    if (!datos.nombre || !/^#[0-9A-Fa-f]{6}$/.test(datos.color)) {
      this.errorCarga.set('Escribe un nombre y selecciona un color válido.');
      return;
    }

    const id = this.categoriaEditandoId();
    const operacion: Observable<unknown> = id === null
      ? this.servicioCategorias.crearCategoria(datos)
      : this.servicioCategorias.actualizarCategoria(id, datos);

    this.guardando.set(true);

    operacion.pipe(finalize(() => this.guardando.set(false))).subscribe({
      next: () => {
        this.cancelarCategoria();
        this.cargarCategorias();
        this.mostrarConfirmacion(id === null ? 'Categoría creada' : 'Categoría actualizada');
      },
      error: (error: HttpErrorResponse) =>
        this.errorCarga.set(mensajeError(error, 'No se pudo guardar la categoría.'))
    });
  }

  protected eliminarCategoria(id: number): void {
    if (!confirm('¿Desactivar esta categoría? Los movimientos históricos se conservarán.')) {
      return;
    }

    this.servicioCategorias.eliminarCategoria(id).subscribe({
      next: () => {
        this.categorias.update(lista => lista.filter(categoria => categoria.id !== id));
        if (this.categoriaEditandoId() === id) {
          this.cancelarCategoria();
        }
        this.mostrarConfirmacion('Categoría desactivada');
      },
      error: (error: HttpErrorResponse) =>
        this.errorCarga.set(mensajeError(error, 'No se pudo desactivar la categoría.'))
    });
  }

  // ---------- Seguridad ----------

  protected abrirSeguridad(): void {
    this.mostrarMenuCuenta.set(false);
    this.errorCarga.set('');
    this.mostrarSeguridad.set(true);
  }

  protected cambiarPassword(): void {
    const nueva = this.passwordNueva();

    if (nueva.length < 12 || nueva !== this.passwordConfirmacion()) {
      this.errorCarga.set('La nueva contraseña debe tener 12 caracteres y coincidir en ambos campos.');
      return;
    }

    this.guardando.set(true);

    this.auth.cambiarPassword(this.passwordActual(), nueva)
      .pipe(finalize(() => this.guardando.set(false)))
      .subscribe({
        next: () => {
          this.passwordActual.set('');
          this.passwordNueva.set('');
          this.passwordConfirmacion.set('');
          this.errorCarga.set('');
          this.mostrarSeguridad.set(false);
          this.mostrarConfirmacion('Contraseña actualizada');
        },
        error: (error: HttpErrorResponse) =>
          this.errorCarga.set(mensajeError(error, 'No se pudo cambiar la contraseña.'))
      });
  }

  private mostrarConfirmacion(mensaje: string): void {
    clearTimeout(this.temporizadorConfirmacion);
    this.confirmacion.set(mensaje);
    this.temporizadorConfirmacion = setTimeout(() => this.confirmacion.set(''), 3000);
  }
}
