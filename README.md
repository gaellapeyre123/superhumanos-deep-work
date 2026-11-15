# SuperHumanos · Deep Work

Aplicación web full stack para **planificar, ejecutar y medir sesiones de Deep Work**. Pensada para emprendedores que tratan su foco como un atleta trata su entrenamiento: ritual previo, post-it con objetivo y tiempo estimado, timer que respeta su criterio, cierre con feedback y datos de constancia en el tiempo.

## En producción

| | URL |
|---|---|
| **Frontend** | https://deepwork.gaellapeyre.com |
| **Backend (API REST)** | https://api-deepwork.gaellapeyre.com/api/health |

**Cuenta demo** (con 8 semanas de datos cargados): `demo@superhumanos.app` / `superhumanos`. También hay un botón «Probar con la cuenta demo» en el login. Cualquiera puede registrarse con su propio email.

## Qué hace

- **Planificador semanal:** panel de tareas y semana de lunes a domingo. Se agregan sesiones por día y se **arrastran tareas a las sesiones**. Distingue a simple vista una sesión *agendada sin tarea* (contorno punteado) de una *con tarea* (tarjeta llena).
- **Tipos de tarea editables:** por defecto *Deep Work*, *Shallow Work* y *Creative Work*.
- **Plantillas de sesión:** duración de trabajo/descanso (default 90/20) y checklist del ritual previo.
- **Ejecución:** ritual previo, post-it (objetivo + minutos estimados), objetivos clave y timer de trabajo y descanso. **El timer no pasa solo al descanso**: avisa y cuenta tiempo extra hasta que el usuario decide.
- **Botón de distracción** (o tecla `D`): registra el minuto; «Volví» mide la duración.
- **Calibrador de estimaciones:** ratio real/estimado por tipo de tarea, mostrado junto al post-it.
- **Cierre de sesión:** sesión completada y tarea completada por separado, resumen en texto y tiempo real vs. esperado.
  - *Simple* (default): métricas configurables (por defecto *Distracciones* y *Energía*).
  - *Periodizado* (avanzado): 6 preguntas Sí/No/N/A sorteadas de un banco de 116, una por tema, con reglas de rotación.
- **Datos:** mapa de constancia de 12 meses estilo GitHub, rachas diaria y semanal, resumen semanal con **valor de la hora** invertida y costo estimado de las distracciones, y resumen periodizado con candidatas a graduación.
- **Estado exportable/importable** del sistema periodizado.

## Arquitectura

```
frontend/  React 18 + Vite (SPA estática)  ──HTTP/JSON──▶  backend/  Node.js + Express (API REST)  ──Knex──▶  MySQL
                                                                         routes → controllers → services → repositories
```

- **Backend por capas** (`backend/src`):
  - `routes/` declara los endpoints y sus validaciones.
  - `validators/` tiene los esquemas zod.
  - `controllers/` traduce HTTP ⇄ servicio.
  - `services/` concentra **toda la lógica de negocio** (el sorteo periodizado es puro y está en `services/periodized/draw.js`).
  - `repositories/` es el único lugar con SQL y siempre filtra por usuario.
- **Persistencia:** MySQL en producción (Hostinger) y SQLite en desarrollo y tests, con las mismas migraciones Knex. La aritmética de fechas se hace en JS, no en SQL, para que los dos motores se comporten igual.
- **Auth:** bcrypt + JWT en cookie `httpOnly` (*same-site*, porque front y back comparten dominio).
- **Seguridad:** sin credenciales en el código, todo por variables de entorno (`.env` ignorado; ver `backend/.env.example`). Además: CORS restringido al frontend, límite de intentos de login y aislamiento de datos por usuario (devuelve 404 ante recursos ajenos).

Documentación:
- [`docs/spec.md`](docs/spec.md): especificación funcional con requerimientos, entidades, reglas de negocio y casos borde.
- [`docs/qa.md`](docs/qa.md): informe de pruebas.

## Cómo ejecutarlo localmente

Requisitos: Node.js 20 o superior.

```bash
# 1. API
cd backend
cp .env.example .env          # por defecto usa SQLite, no hace falta instalar una base
npm install
npm run seed:demo             # opcional: crea el usuario demo con datos
npm start                     # http://localhost:3001  (aplica migraciones al arrancar)

# 2. Frontend (otra terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # http://localhost:5173
```

Tests (40 casos: unitarios del sorteo y de integración de la API contra SQLite en memoria):

```bash
cd backend && npm test
```

## Variables de entorno (backend)

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `production` activa cookies `Secure` y oculta detalles de errores. |
| `PORT` | Puerto HTTP. |
| `DB_CLIENT` | `sqlite` o `mysql`. |
| `SQLITE_FILE` | Archivo SQLite (solo desarrollo). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión MySQL. |
| `JWT_SECRET` | Secreto para firmar la sesión. |
| `CORS_ORIGIN` | Origen(es) del frontend, separados por coma. |
| `COOKIE_DOMAIN` | Dominio de la cookie en producción (ej. `.gaellapeyre.com`). |
| `SEED_DEMO` | `1` crea el usuario demo en el primer arranque si no existe. |

## Despliegue

- **API:** app web de Node.js en Hostinger, conectada a este repositorio. Corre `npm install` y `npm start` en la raíz (el `package.json` raíz arranca `backend/src/server.js`). Las migraciones se aplican solas al iniciar.
- **Base de datos:** MySQL de Hostinger.
- **Frontend:** `npm --prefix frontend run build` con `VITE_API_URL` apuntando a la API. El contenido de `frontend/dist` se publica como sitio estático. El `.htaccess` de `frontend/public` resuelve las rutas de la SPA.

## Estructura

```
backend/
  src/
    app.js, server.js, config.js
    routes/  controllers/  services/  repositories/  validators/  middlewares/  lib/
    db/  (knex.js, migrations/, seeds/bank.json, seedDemo.js)
  tests/  (draw.test.js, api.test.js)
frontend/
  src/  (pages/, components/, api.js, auth.jsx, styles.css)
  public/  (fuentes, logos, .htaccess)
docs/  (spec.md, qa.md)
```
