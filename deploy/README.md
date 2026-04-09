# SVC App — Guia de Despliegue en cPanel

## Requisitos
- PHP 8.1+ con extensiones: pdo, pdo_mysql, json, mbstring, openssl
- MySQL 5.7+ o MariaDB 10.3+
- Apache con mod_rewrite habilitado
- HTTPS habilitado

## Pasos de Instalacion

### 1. Base de Datos
1. En cPanel > MySQL Databases, crear base de datos `svc_app`
2. Crear usuario MySQL y asignar TODOS los privilegios sobre `svc_app`
3. En phpMyAdmin, importar `/deploy/install.sql`

### 2. Archivos
1. Subir TODO el contenido del proyecto al directorio `public_html/` (o el dominio que uses)
2. La estructura debe quedar:
   ```
   public_html/
     api/
     assets/
     deploy/
     public/
     index.html
     manifest.json
     sw.js
   ```
3. Copiar `public/.htaccess` a `public_html/.htaccess` (el directorio raiz del dominio)

### 3. Configuracion
1. Editar `api/config/db.php`:
   - Cambiar `DB_HOST` al host de MySQL (usualmente `localhost`)
   - Cambiar `DB_NAME` al nombre de la base de datos
   - Cambiar `DB_USER` al usuario MySQL creado
   - Cambiar `DB_PASS` a la contrasena del usuario MySQL
   - Cambiar `JWT_SECRET` a una cadena aleatoria de 64+ caracteres
   - Cambiar `APP_ENV` a `'production'`

### 4. Verificar
1. Abrir `https://tudominio.com/deploy/check.php`
2. Todos los checks deben mostrar `"ok"`
3. Eliminar o proteger `deploy/check.php` despues de verificar

### 5. Acceso
- URL: `https://tudominio.com`
- Admin: `admin@svcardiologia.com` / `SVC2024Admin!`
- **CAMBIAR LA CONTRASENA DEL ADMIN INMEDIATAMENTE**

## Seguridad Post-Instalacion (CRITICO)
- [ ] Cambiar contrasena del admin inmediatamente
- [ ] Cambiar `JWT_SECRET` en `api/config/db.php` a cadena aleatoria 64+ caracteres
- [ ] Cambiar `APP_ENV` a `'production'` en `api/config/db.php`
- [ ] Verificar HTTPS activo en todo el dominio
- [ ] Verificar que `/api/config/` NO es accesible desde el navegador
- [ ] Eliminar `/deploy/check.php` y `/deploy/security-audit.php` despues de verificar
- [ ] Set DB user con permisos minimos (SELECT, INSERT, UPDATE, DELETE — NO DROP, CREATE, ALTER)
- [ ] Configurar backups automaticos de la base de datos
- [ ] Verificar `display_errors = Off` en PHP
- [ ] Habilitar error logging a archivo (`error_log` en php.ini)
- [ ] Permisos de archivos: PHP files 644, dirs 755, config 600
- [ ] Habilitar ModSecurity si esta disponible en cPanel
- [ ] Ejecutar auditoria: `https://tudominio.com/deploy/security-audit.php`

## Seguridad Integrada
La app incluye las siguientes medidas de seguridad:

### Backend
- Rate limiting por IP (60 req/min global, 10/min para login)
- Proteccion contra brute force (lockout despues de 5 intentos, 15 min)
- JWT con fingerprint (IP + User-Agent hash)
- Token revocation server-side
- Sanitizacion de inputs (htmlspecialchars + strip_tags)
- Deteccion de SQL injection y XSS en inputs
- PDO prepared statements en TODAS las queries
- Limite de tamano de request (2MB)
- Validacion de Content-Type en POST/PUT
- Logging de todos los eventos de seguridad

### Firewall
- Bloqueo de user agents maliciosos (nikto, sqlmap, etc.)
- Bloqueo de patrones de ataque en URLs (path traversal, LFI, RCE)
- Honeypot endpoints que banean IPs automaticamente
- Bloqueo de IPs con tabla configurable
- Bloqueo de requests sin User-Agent

### Headers HTTP
- Strict-Transport-Security (HSTS)
- Content-Security-Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy
- Remocion de X-Powered-By y Server headers

### Frontend
- Auto-logout por inactividad (30 min)
- Verificacion de expiracion de JWT cada 5 min
- Validacion de estructura JWT client-side
- Limpieza completa de storage en logout
- Proteccion de QR codes contra right-click
- Nunca usa innerHTML con datos de usuario

### Uploads
- Validacion de MIME type real (no solo extension)
- Tamano maximo 5MB
- Solo JPG, PNG, WebP, PDF
- Renombrado a UUID
- Escaneo de codigo PHP embebido
- .htaccess en directorio de uploads bloqueando ejecucion PHP

## Checklist de Testing
- [ ] Login funciona con admin@svcardiologia.com
- [ ] Brute force lockout funciona (5 intentos fallidos)
- [ ] Rate limiting funciona (muchos requests rapidos = 429)
- [ ] Se pueden crear miembros
- [ ] Se pueden registrar pagos
- [ ] Se pueden crear eventos
- [ ] Se pueden obtener tickets
- [ ] QR scanner abre la camara y escanea
- [ ] PWA se puede instalar (Add to Home Screen)
- [ ] App funciona offline (datos en cache)
- [ ] Notificaciones toast aparecen correctamente
- [ ] Auto-logout funciona despues de 30 min inactividad
- [ ] Security audit score >= 90%
