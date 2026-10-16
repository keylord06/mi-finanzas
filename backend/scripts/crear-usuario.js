require('dotenv').config();

const readline = require('readline');
const pool = require('../db');
const { hashPassword } = require('../auth');

function preguntar(pregunta) {
  const interfaz = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    interfaz.question(pregunta, respuesta => {
      interfaz.close();
      resolve(respuesta.trim());
    });
  });
}

function preguntarSecreto(pregunta) {
  return new Promise(resolve => {
    const entrada = process.stdin;
    let respuesta = '';

    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();

    const recibirEntrada = caracter => {
      const texto = caracter.toString();

      if (texto === '\u0003') {
        entrada.setRawMode(false);
        process.exit(1);
      }

      if (texto === '\r' || texto === '\n') {
        entrada.setRawMode(false);
        entrada.pause();
        entrada.removeListener('data', recibirEntrada);
        process.stdout.write('\n');
        resolve(respuesta);
        return;
      }

      if (texto === '\u007f') {
        respuesta = respuesta.slice(0, -1);
        return;
      }

      respuesta += texto;
    };

    entrada.on('data', recibirEntrada);
  });
}

async function main() {
  const nombre = await preguntar('Nombre: ');
  const correo = (await preguntar('Correo: ')).toLowerCase();
  const password = await preguntarSecreto('Contraseña: ');

  if (!nombre || !correo || password.length < 12) {
    throw new Error('El nombre y el correo son obligatorios; la contraseña debe tener al menos 12 caracteres.');
  }

  const [existentes] = await pool.execute(
    'SELECT id FROM usuarios WHERE correo = ? LIMIT 1',
    [correo]
  );

  if (existentes.length > 0) {
    throw new Error('Ya existe un usuario con ese correo.');
  }

  await pool.execute(
    `INSERT INTO usuarios (nombre, correo, password_hash)
     VALUES (?, ?, ?)`,
    [nombre, correo, hashPassword(password)]
  );

  console.log('Usuario creado correctamente.');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });