<?php
/**
 * SVC App — Health Check
 * Verifies server configuration and dependencies
 */
header('Content-Type: application/json; charset=utf-8');

$checks = [];
$allOk = true;

// PHP version
$phpOk = version_compare(PHP_VERSION, '8.1.0', '>=');
$checks['php_version'] = [
    'status' => $phpOk ? 'ok' : 'error',
    'current' => PHP_VERSION,
    'required' => '8.1+'
];
if (!$phpOk) $allOk = false;

// Required extensions
$required = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'openssl'];
foreach ($required as $ext) {
    $loaded = extension_loaded($ext);
    $checks["ext_{$ext}"] = ['status' => $loaded ? 'ok' : 'error'];
    if (!$loaded) $allOk = false;
}

// Database connection
try {
    require_once __DIR__ . '/../api/config/db.php';
    $db = getDB();
    $db->query('SELECT 1');
    $checks['database'] = ['status' => 'ok'];
} catch (Exception $e) {
    $checks['database'] = ['status' => 'error', 'message' => $e->getMessage()];
    $allOk = false;
}

// Folder permissions
$dirs = ['../assets/img', '../api/config'];
foreach ($dirs as $dir) {
    $path = __DIR__ . '/' . $dir;
    $writable = is_dir($path) && is_readable($path);
    $checks["dir_" . basename($dir)] = [
        'status' => $writable ? 'ok' : 'warning',
        'path' => realpath($path) ?: $path
    ];
}

// .htaccess check
$htaccess = file_exists(__DIR__ . '/../.htaccess') || file_exists(__DIR__ . '/../public/.htaccess');
$checks['htaccess'] = ['status' => $htaccess ? 'ok' : 'warning'];

// JWT secret check
if (defined('JWT_SECRET') && JWT_SECRET === 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING') {
    $checks['jwt_secret'] = ['status' => 'warning', 'message' => 'Using default JWT secret — change in production!'];
}

echo json_encode([
    'status' => $allOk ? 'healthy' : 'unhealthy',
    'timestamp' => date('c'),
    'checks' => $checks
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
