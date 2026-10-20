const CATEGORIAS_INICIALES = [
  ['Salario', 'INGRESO', '#16A34A', 'wallet'],
  ['Otros ingresos', 'INGRESO', '#22C55E', 'plus-circle'],
  ['Alimentación', 'GASTO', '#EA580C', 'utensils'],
  ['Transporte', 'GASTO', '#2563EB', 'car'],
  ['Educación', 'GASTO', '#7C3AED', 'book-open'],
  ['Entretenimiento', 'GASTO', '#DB2777', 'gamepad-2'],
  ['Salud', 'GASTO', '#DC2626', 'heart-pulse'],
  ['Otros gastos', 'GASTO', '#64748B', 'circle']
];

// Crea las categorías por defecto solo si el usuario nunca ha tenido ninguna.
async function asegurarCategoriasIniciales(pool, usuarioId) {
  const [existentes] = await pool.execute(
    'SELECT 1 FROM categorias WHERE usuario_id = ? LIMIT 1',
    [usuarioId]
  );

  if (existentes.length > 0) {
    return false;
  }

  await pool.query(
    `INSERT IGNORE INTO categorias (usuario_id, nombre, tipo, color, icono) VALUES ?`,
    [CATEGORIAS_INICIALES.map(categoria => [usuarioId, ...categoria])]
  );

  return true;
}

module.exports = { asegurarCategoriasIniciales };
