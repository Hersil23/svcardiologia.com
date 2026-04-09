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

## Seguridad Post-Instalacion
- [ ] Cambiar contrasena del admin
- [ ] Cambiar JWT_SECRET en db.php
- [ ] Verificar que `/api/config/` no es accesible desde el navegador
- [ ] Eliminar `/deploy/check.php`
- [ ] Configurar HTTPS si no esta activo
- [ ] Configurar backups automaticos de la base de datos

## Checklist de Testing
- [ ] Login funciona con admin@svcardiologia.com
- [ ] Se pueden crear miembros
- [ ] Se pueden registrar pagos
- [ ] Se pueden crear eventos
- [ ] Se pueden obtener tickets
- [ ] QR scanner abre la camara y escanea
- [ ] PWA se puede instalar (Add to Home Screen)
- [ ] App funciona offline (datos en cache)
- [ ] Notificaciones toast aparecen correctamente
