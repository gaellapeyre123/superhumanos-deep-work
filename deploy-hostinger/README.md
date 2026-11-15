# Despliegue de la API en Hostinger

Hostinger (app web de Node.js) recibe solo esta carpeta comprimida. En cada deploy, `npm install` descarga la rama `main` del repositorio público de GitHub como dependencia, y `server.js` la arranca. Por eso un «Redeploy» en hPanel publica la última versión de `main` sin conectar la cuenta de GitHub.

- Archivo de entrada: `server.js`
- Comando de build: `npm run build:web` (no hace nada; Hostinger lo dejó configurado y no se puede borrar desde el panel)
- Variables de entorno: ver la tabla del README principal (no hace falta cargar ningún secreto)

Para empaquetarla: `tar -czf deepwork-api.tar.gz package.json server.js`
