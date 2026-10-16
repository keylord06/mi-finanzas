# Despliegue de Mi Finanzas

## Arquitectura recomendada

- Frontend: Cloudflare Pages, con HTTPS.
- Backend: Render Web Service, con HTTPS.
- Base de datos: TiDB Cloud Serverless compatible con el protocolo MySQL.

No se deben publicar `backend/.env`, credenciales, puertos MySQL ni respuestas de la API en un repositorio público.

## Base de datos

1. Conservar el respaldo local `.sql` creado antes de migrar.
2. Usar la base `test` que proporciona el clúster de TiDB y restringir sus credenciales al backend.
3. Importar el esquema y los datos desde MySQL Workbench.
4. Confirmar antes de borrar nada:

```sql
SHOW TABLES;

SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY TABLE_NAME;

SELECT COUNT(*) AS movimientos FROM movimientos;
SELECT COUNT(*) AS categorias FROM categorias;
SELECT COUNT(*) AS usuarios FROM usuarios;
SELECT COALESCE(SUM(monto), 0) AS total_movimientos FROM movimientos;
```

5. Guardar un respaldo antes de cada migración. Para recuperar datos, crear una base nueva e importar allí el `.sql`; no sobrescribir la base activa sin verificar primero las cantidades.

## Backend en Render

El archivo `render.yaml` deja configurado el servicio. En el panel del servicio se deben completar estos secretos y valores del proveedor:

```text
DB_HOST=<host-de-produccion>
DB_PORT=4000
DB_USER=<usuario-de-produccion>
DB_PASSWORD=<secreto-de-produccion>
DB_NAME=test
SESSION_SECRET=<secreto-aleatorio-largo>
CORS_ORIGINS=<url-https-del-frontend>
```

Render proporciona `PORT` automáticamente. No se debe fijar manualmente en producción.

Comprobación después del despliegue:

```text
GET https://<api-publica>/api/health
```

Debe responder `{"estado":"OK"}`. Las rutas financieras deben responder `401` si no hay sesión.

## Frontend en Cloudflare Pages

- Directorio raíz: `frontend`
- Comando de compilación: `npm run build`
- Directorio de salida: `dist/frontend/browser`

Antes de compilar producción, reemplazar en `frontend/src/environments/environment.production.ts` el marcador por la URL HTTPS real de la API:

```ts
apiUrl: 'https://<api-publica>/api'
```

Después de obtener la URL pública del frontend, copiarla exactamente en `CORS_ORIGINS` del backend y volver a desplegar el backend.

## iPhone

Abrir la URL HTTPS del frontend en Safari, pulsar Compartir, elegir **Añadir a pantalla de inicio**, confirmar el nombre y abrirla desde el icono.