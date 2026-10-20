
require('dotenv').config();

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { asegurarCategoriasIniciales } = require('./categorias-iniciales');
const {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createCsrfToken,
  createSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionToken
} = require('./auth');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const origenesPermitidos = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origen => origen.trim())
  .filter(Boolean);
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos. Intenta de nuevo más tarde.' }
});

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    const esOrigenLocal = process.env.NODE_ENV !== 'production' &&
      (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
    const esOrigenPermitido = !origin || origenesPermitidos.includes(origin) || esOrigenLocal;

    callback(null, esOrigenPermitido);
  }
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Mi Finanzas: backend funcionando correctamente');
});

app.get('/api/health', (req, res) => {
  res.json({ estado: 'OK' });
});

function cookieOptions(httpOnly) {
  const esProduccion = process.env.NODE_ENV === 'production';

  return [
    'Path=/',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    `SameSite=${esProduccion ? 'None' : 'Lax'}`,
    esProduccion ? 'Secure' : '',
    httpOnly ? 'HttpOnly' : ''
  ].filter(Boolean).join('; ');
}

function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const authorization = req.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : cookies[SESSION_COOKIE];
    const user = verifySessionToken(token);

    if (!user) {
      return res.status(401).json({ mensaje: 'Debes iniciar sesión' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error al validar la sesión:', error.message);
    res.status(401).json({ mensaje: 'Debes iniciar sesión' });
  }
}

function requireCsrfForMutation(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if ((req.get('Authorization') || '').startsWith('Bearer ')) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  const csrfCookie = cookies[CSRF_COOKIE];
  const csrfHeader = req.get('X-CSRF-Token');

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ mensaje: 'Solicitud no autorizada' });
  }

  next();
}

app.post('/api/auth/login', limitadorLogin, async (req, res) => {
  try {
    const correo = typeof req.body.correo === 'string'
      ? req.body.correo.trim().toLowerCase()
      : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!correo || !password) {
      return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios' });
    }

    const [usuarios] = await pool.execute(
      `SELECT id, nombre, correo, password_hash
       FROM usuarios
       WHERE correo = ? AND activo = TRUE
       LIMIT 1`,
      [correo]
    );
    const usuario = usuarios[0];

    if (!usuario || !verifyPassword(password, usuario.password_hash)) {
      return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    const csrfToken = createCsrfToken();
    const sessionToken = createSessionToken(usuario.id);
    res.setHeader('Set-Cookie', [
      `${SESSION_COOKIE}=${sessionToken}; ${cookieOptions(true)}`,
      `${CSRF_COOKIE}=${csrfToken}; ${cookieOptions(false)}`
    ]);

    res.json({
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo
      },
      csrfToken,
      sessionToken
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);
    res.status(500).json({ mensaje: 'No se pudo iniciar sesión' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; ${cookieOptions(true)}; Max-Age=0`,
    `${CSRF_COOKIE}=; ${cookieOptions(false)}; Max-Age=0`
  ]);
  res.json({ mensaje: 'Sesión cerrada' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [usuarios] = await pool.execute(
      'SELECT id, nombre, correo FROM usuarios WHERE id = ? AND activo = TRUE',
      [req.user.id]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ mensaje: 'Debes iniciar sesión' });
    }

    res.json({ usuario: usuarios[0] });
  } catch (error) {
    console.error('Error al consultar la sesión:', error.message);
    res.status(500).json({ mensaje: 'No se pudo consultar la sesión' });
  }
});

app.put('/api/auth/password', requireAuth, requireCsrfForMutation, async (req, res) => {
  try {
    const currentPassword = typeof req.body.currentPassword === 'string'
      ? req.body.currentPassword
      : '';
    const newPassword = typeof req.body.newPassword === 'string'
      ? req.body.newPassword
      : '';

    if (newPassword.length < 12) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 12 caracteres' });
    }

    const [usuarios] = await pool.execute(
      'SELECT password_hash FROM usuarios WHERE id = ? AND activo = TRUE LIMIT 1',
      [req.user.id]
    );

    if (usuarios.length === 0 || !verifyPassword(currentPassword, usuarios[0].password_hash)) {
      return res.status(401).json({ mensaje: 'La contraseña actual no es correcta' });
    }

    await pool.execute(
      'UPDATE usuarios SET password_hash = ? WHERE id = ?',
      [hashPassword(newPassword), req.user.id]
    );

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ mensaje: 'No se pudo cambiar la contraseña' });
  }
});

app.use('/api/movimientos', requireAuth, requireCsrfForMutation);
app.use('/api/categorias', requireAuth, requireCsrfForMutation);

app.get('/api/estado', requireAuth, async (req, res) => {
  try {
    const [filas] = await pool.query('SELECT 1 AS conexion');

    res.json({
      mensaje: 'API de Mi Finanzas funcionando',
      estado: 'OK',
      baseDeDatos: filas[0].conexion === 1 ? 'Conectada' : 'Error'
    });
  } catch (error) {
    console.error('Error al conectar con MySQL:', error.message);

    res.status(500).json({
      mensaje: 'La API funciona, pero hay un problema con la base de datos',
      estado: 'ERROR'
    });
  }
});

app.get('/api/movimientos', async (req, res) => {
  try {
    const [movimientos] = await pool.query(`
      SELECT
        id,
        usuario_id,
        categoria_id,
        tipo,
        descripcion,
        monto,
        fecha_movimiento
      FROM movimientos
      WHERE usuario_id = ?
      ORDER BY fecha_movimiento DESC
    `, [req.user.id]);

    res.json(movimientos);
  } catch (error) {
    console.error('Error al consultar movimientos:', error.message);

    res.status(500).json({
      mensaje: 'Error al consultar los movimientos'
    });
  }
});


app.get('/api/categorias', async (req, res) => {
  try {
    await asegurarCategoriasIniciales(pool, req.user.id);

    const [categorias] = await pool.query(`
      SELECT
        id,
        nombre,
        tipo,
        color,
        icono
      FROM categorias
      WHERE usuario_id = ?
        AND activa = TRUE
      ORDER BY nombre ASC
    `, [req.user.id]);

    res.json(categorias);
  } catch (error) {
    console.error('Error al consultar categorias:', error.message);

    res.status(500).json({
      mensaje: 'Error al consultar las categorias'
    });
  }
});

app.post('/api/categorias', async (req, res) => {
  try {
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const tipo = req.body.tipo;
    const color = typeof req.body.color === 'string' ? req.body.color : '#64748B';
    const icono = typeof req.body.icono === 'string' && req.body.icono.trim()
      ? req.body.icono.trim()
      : 'circle';

    if (!nombre || nombre.length > 80 || !['INGRESO', 'GASTO'].includes(tipo) ||
        !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ mensaje: 'Los datos de la categoría no son válidos' });
    }

    const [resultado] = await pool.execute(
      `INSERT INTO categorias (usuario_id, nombre, tipo, color, icono)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, nombre, tipo, color, icono]
    );

    res.status(201).json({
      mensaje: 'Categoría creada correctamente',
      id: resultado.insertId
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una categoría con ese nombre y tipo' });
    }

    console.error('Error al crear categoría:', error.message);
    res.status(500).json({ mensaje: 'No se pudo crear la categoría' });
  }
});

app.put('/api/categorias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const tipo = req.body.tipo;
    const color = typeof req.body.color === 'string' ? req.body.color : '#64748B';
    const icono = typeof req.body.icono === 'string' && req.body.icono.trim()
      ? req.body.icono.trim()
      : 'circle';

    if (!Number.isInteger(id) || id <= 0 || !nombre || nombre.length > 80 ||
        !['INGRESO', 'GASTO'].includes(tipo) || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ mensaje: 'Los datos de la categoría no son válidos' });
    }

    const [resultado] = await pool.execute(
      `UPDATE categorias
       SET nombre = ?, tipo = ?, color = ?, icono = ?
       WHERE id = ? AND usuario_id = ? AND activa = TRUE`,
      [nombre, tipo, color, icono, id, req.user.id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'No se encontró la categoría' });
    }

    res.json({ mensaje: 'Categoría actualizada correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una categoría con ese nombre y tipo' });
    }

    console.error('Error al editar categoría:', error.message);
    res.status(500).json({ mensaje: 'No se pudo editar la categoría' });
  }
});

app.delete('/api/categorias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ mensaje: 'El ID de la categoría no es válido' });
    }

    const [resultado] = await pool.execute(
      `UPDATE categorias
       SET activa = FALSE
       WHERE id = ? AND usuario_id = ? AND activa = TRUE`,
      [id, req.user.id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'No se encontró la categoría' });
    }

    res.json({ mensaje: 'Categoría desactivada correctamente' });
  } catch (error) {
    console.error('Error al eliminar categoría:', error.message);
    res.status(500).json({ mensaje: 'No se pudo eliminar la categoría' });
  }
});


app.post('/api/movimientos', async (req, res) => {
  try {
    const { tipo, descripcion, monto, categoria_id } = req.body;

    if (
      !['INGRESO', 'GASTO'].includes(tipo) ||
      typeof descripcion !== 'string' ||
      descripcion.trim() === '' ||
      !Number.isFinite(monto) ||
      monto <= 0
    ) {
      return res.status(400).json({
        mensaje: 'Los datos del movimiento no son válidos'
      });
    }

    if (categoria_id !== null && categoria_id !== undefined &&
        (!Number.isInteger(categoria_id) || categoria_id <= 0)) {
      return res.status(400).json({
        mensaje: 'La categoría del movimiento no es válida'
      });
    }

    if (categoria_id !== null && categoria_id !== undefined) {
      const [categorias] = await pool.execute(
        'SELECT id FROM categorias WHERE id = ? AND usuario_id = ? AND activa = TRUE',
        [categoria_id, req.user.id]
      );

      if (categorias.length === 0) {
        return res.status(400).json({
          mensaje: 'La categoría del movimiento no es válida'
        });
      }
    }

    const [resultado] = await pool.execute(
      `INSERT INTO movimientos
        (usuario_id, categoria_id, tipo, descripcion, monto)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        categoria_id ?? null,
        tipo,
        descripcion.trim(),
        monto
      ]
    );

    res.status(201).json({
      mensaje: 'Movimiento guardado correctamente',
      id: resultado.insertId
    });
  } catch (error) {
    console.error('Error al guardar movimiento:', error.message);

    res.status(500).json({
      mensaje: 'No se pudo guardar el movimiento'
    });
  }
});


app.put('/api/movimientos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { tipo, descripcion, monto, categoria_id } = req.body;

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !['INGRESO', 'GASTO'].includes(tipo) ||
      typeof descripcion !== 'string' ||
      descripcion.trim() === '' ||
      !Number.isFinite(monto) ||
      monto <= 0 ||
      !Number.isInteger(categoria_id) ||
      categoria_id <= 0
    ) {
      return res.status(400).json({
        mensaje: 'Los datos del movimiento no son válidos'
      });
    }

    const [categorias] = await pool.execute(
      'SELECT id FROM categorias WHERE id = ? AND usuario_id = ? AND activa = TRUE',
      [categoria_id, req.user.id]
    );

    if (categorias.length === 0) {
      return res.status(400).json({
        mensaje: 'La categoría del movimiento no es válida'
      });
    }

    const [resultado] = await pool.execute(
      `UPDATE movimientos
       SET tipo = ?, descripcion = ?, monto = ?, categoria_id = ?
       WHERE id = ? AND usuario_id = ?`,
      [tipo, descripcion.trim(), monto, categoria_id, id, req.user.id]
    );

    if (resultado.affectedRows === 0) {
      const [filas] = await pool.execute(
        'SELECT id FROM movimientos WHERE id = ? AND usuario_id = ?',
        [id, req.user.id]
      );

      if (filas.length === 0) {
        return res.status(404).json({
          mensaje: 'No se encontró el movimiento'
        });
      }
    }

    res.json({
      mensaje: 'Movimiento actualizado correctamente'
    });
  } catch (error) {
    console.error('Error al editar movimiento:', error.message);

    res.status(500).json({
      mensaje: 'No se pudo editar el movimiento'
    });
  }
});



app.delete('/api/movimientos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        mensaje: 'El ID del movimiento no es válido'
      });
    }

    const [resultado] = await pool.execute(
      'DELETE FROM movimientos WHERE id = ? AND usuario_id = ?',
      [id, req.user.id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        mensaje: 'No se encontró el movimiento'
      });
    }

    res.json({
      mensaje: 'Movimiento eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar movimiento:', error.message);

    res.status(500).json({
      mensaje: 'No se pudo eliminar el movimiento'
    });
  }
});



app.listen(PORT, async () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);

  try {
    await pool.query('SELECT 1');
    console.log('Conexión con la base de datos establecida');
  } catch (error) {
    console.error('No se pudo conectar con la base de datos:', error.code || error.message);
  }
});
