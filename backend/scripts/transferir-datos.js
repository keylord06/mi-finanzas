require('dotenv').config();

const pool = require('../db');

// Uso: npm run transferir-datos -- <correo-origen> <correo-destino>
// Mueve categorías y movimientos de un usuario a otro. Si el destino ya tiene
// una categoría con el mismo nombre y tipo, los movimientos se asignan a ella.
async function main() {
  const [correoOrigen, correoDestino] = process.argv.slice(2).map(correo => correo?.trim().toLowerCase());

  if (!correoOrigen || !correoDestino || correoOrigen === correoDestino) {
    throw new Error('Uso: npm run transferir-datos -- <correo-origen> <correo-destino>');
  }

  const conexion = await pool.getConnection();

  try {
    const [usuarios] = await conexion.execute(
      'SELECT id, correo FROM usuarios WHERE correo IN (?, ?)',
      [correoOrigen, correoDestino]
    );
    const origen = usuarios.find(usuario => usuario.correo === correoOrigen);
    const destino = usuarios.find(usuario => usuario.correo === correoDestino);

    if (!origen || !destino) {
      throw new Error('No se encontró alguno de los dos usuarios.');
    }

    await conexion.beginTransaction();

    const [categoriasOrigen] = await conexion.execute(
      'SELECT id, nombre, tipo FROM categorias WHERE usuario_id = ?',
      [origen.id]
    );
    const [categoriasDestino] = await conexion.execute(
      'SELECT id, nombre, tipo FROM categorias WHERE usuario_id = ?',
      [destino.id]
    );
    const destinoPorClave = new Map(
      categoriasDestino.map(categoria => [`${categoria.tipo}:${categoria.nombre}`, categoria.id])
    );

    // Los movimientos pasan primero a "sin categoría" para poder mover las categorías
    // sin romper la llave foránea compuesta (categoria_id, usuario_id).
    const [movimientos] = await conexion.execute(
      'SELECT id, categoria_id FROM movimientos WHERE usuario_id = ?',
      [origen.id]
    );
    await conexion.execute(
      'UPDATE movimientos SET categoria_id = NULL, usuario_id = ? WHERE usuario_id = ?',
      [destino.id, origen.id]
    );

    const nuevaCategoria = new Map();

    for (const categoria of categoriasOrigen) {
      const existente = destinoPorClave.get(`${categoria.tipo}:${categoria.nombre}`);

      if (existente) {
        nuevaCategoria.set(categoria.id, existente);
      } else {
        await conexion.execute(
          'UPDATE categorias SET usuario_id = ? WHERE id = ?',
          [destino.id, categoria.id]
        );
        nuevaCategoria.set(categoria.id, categoria.id);
      }
    }

    for (const movimiento of movimientos) {
      if (movimiento.categoria_id !== null) {
        await conexion.execute(
          'UPDATE movimientos SET categoria_id = ? WHERE id = ?',
          [nuevaCategoria.get(movimiento.categoria_id) ?? null, movimiento.id]
        );
      }
    }

    await conexion.commit();
    console.log(`Transferidos ${movimientos.length} movimientos y ${categoriasOrigen.length} categorías.`);
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
