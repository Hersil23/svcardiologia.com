<?php
/**
 * SVC App — Secure File Upload Handler
 */

define('UPLOAD_MAX_SIZE', 5 * 1024 * 1024); // 5MB
define('UPLOAD_DIR', __DIR__ . '/../../uploads/');
define('UPLOAD_ALLOWED_TYPES', [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'application/pdf' => 'pdf',
]);

function handleUpload(string $fieldName): ?string {
    if (!isset($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    $file = $_FILES[$fieldName];

    // Check upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors = [
            UPLOAD_ERR_INI_SIZE   => 'Archivo demasiado grande (limite del servidor)',
            UPLOAD_ERR_FORM_SIZE  => 'Archivo demasiado grande',
            UPLOAD_ERR_PARTIAL    => 'Archivo subido parcialmente',
            UPLOAD_ERR_NO_TMP_DIR => 'Error de configuracion del servidor',
            UPLOAD_ERR_CANT_WRITE => 'Error al escribir archivo',
        ];
        respondError($errors[$file['error']] ?? 'Error al subir archivo', 400);
    }

    // Size check
    if ($file['size'] > UPLOAD_MAX_SIZE) {
        respondError('El archivo no puede exceder 5MB', 400);
    }

    if ($file['size'] === 0) {
        respondError('El archivo esta vacio', 400);
    }

    // MIME type validation (actual content, not extension)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);

    if (!array_key_exists($mimeType, UPLOAD_ALLOWED_TYPES)) {
        logSecurityEvent('upload_invalid_type', getClientIP(), null, "MIME: {$mimeType}, Name: {$file['name']}");
        respondError('Tipo de archivo no permitido. Solo JPG, PNG, WebP y PDF.', 400);
    }

    // Scan for PHP code inside image files
    if (str_starts_with($mimeType, 'image/')) {
        $contents = file_get_contents($file['tmp_name']);
        if (scanForMaliciousContent($contents)) {
            logSecurityEvent('upload_malicious', getClientIP(), null, "File: {$file['name']}");
            respondError('Archivo rechazado por seguridad', 400);
        }
    }

    // Generate safe filename (UUID)
    $ext = UPLOAD_ALLOWED_TYPES[$mimeType];
    $filename = bin2hex(random_bytes(16)) . '.' . $ext;
    $subDir = date('Y/m');
    $targetDir = UPLOAD_DIR . $subDir;

    // Create directory if needed
    if (!is_dir($targetDir)) {
        mkdir($targetDir, 0755, true);
    }

    $targetPath = $targetDir . '/' . $filename;

    // Move file
    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        respondError('Error al guardar archivo', 500);
    }

    // Block direct PHP execution in uploads
    $htaccess = UPLOAD_DIR . '.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess, "# Deny script execution\nphp_flag engine off\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|php7|phps|phar|shtml)$\">\n    Require all denied\n</FilesMatch>\nOptions -ExecCGI\nAddHandler cgi-script .php .phtml .php3 .php4 .php5 .php7\n");
    }

    return '/uploads/' . $subDir . '/' . $filename;
}

function scanForMaliciousContent(string $content): bool {
    $patterns = [
        '/<\?php/i',
        '/<\?=/i',
        '/<\?(?!xml)/i',
        '/eval\s*\(/i',
        '/base64_decode\s*\(/i',
        '/exec\s*\(/i',
        '/system\s*\(/i',
        '/passthru\s*\(/i',
        '/shell_exec\s*\(/i',
        '/proc_open\s*\(/i',
        '/popen\s*\(/i',
        '/__HALT_COMPILER/i',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $content)) return true;
    }
    return false;
}
