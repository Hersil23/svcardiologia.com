<?php
/**
 * SVC App — File Upload Handler
 * Uploads to Bunny.net CDN with image compression
 */

require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/bunny.php';

if (getMethod() !== 'POST') {
    respondError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int) $auth['sub'];

// ── Validation rules per type ──────────────
$typeRules = [
    'foto_carne'           => ['accept' => ['image/jpeg','image/png','image/gif'],                          'maxMB' => 2,  'folder' => 'members'],
    'cedula'               => ['accept' => ['image/jpeg','image/png','image/gif','application/pdf'],        'maxMB' => 2,  'folder' => 'members'],
    'titulo_medico'        => ['accept' => ['application/pdf'],                                             'maxMB' => 4,  'folder' => 'members'],
    'titulo_especialidad'  => ['accept' => ['application/pdf'],                                             'maxMB' => 4,  'folder' => 'members'],
    'titulo_universitario' => ['accept' => ['application/pdf'],                                             'maxMB' => 4,  'folder' => 'members'],
    'cv'                   => ['accept' => ['application/pdf'],                                             'maxMB' => 4,  'folder' => 'members'],
    'comprobante_pago'     => ['accept' => ['image/jpeg','image/png','application/pdf'],                    'maxMB' => 5,  'folder' => 'payments'],
    'evento_imagen'        => ['accept' => ['image/jpeg','image/png','image/webp'],                         'maxMB' => 5,  'folder' => 'events'],
];

// ── Read parameters ────────────────────────
$uploadType = $_POST['type'] ?? '';
$contextId  = trim($_POST['context_id'] ?? '');

if (!isset($typeRules[$uploadType])) {
    respondError('Tipo de archivo no válido', 400);
}

$rules = $typeRules[$uploadType];

if (empty($contextId)) {
    respondError('context_id requerido', 400);
}

// ── Validate uploaded file ─────────────────
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errCode = $_FILES['file']['error'] ?? -1;
    $errors = [
        UPLOAD_ERR_INI_SIZE   => 'Archivo demasiado grande (límite del servidor)',
        UPLOAD_ERR_FORM_SIZE  => 'Archivo demasiado grande',
        UPLOAD_ERR_PARTIAL    => 'Archivo subido parcialmente',
        UPLOAD_ERR_NO_FILE    => 'No se seleccionó ningún archivo',
    ];
    respondError($errors[$errCode] ?? 'Error al subir archivo', 400);
}

$file     = $_FILES['file'];
$fileSize = $file['size'];
$mimeType = mime_content_type($file['tmp_name']) ?: $file['type'];
$origName = basename($file['name']);
$ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

// Check MIME
if (!in_array($mimeType, $rules['accept'])) {
    $allowed = implode(', ', array_map(fn($m) => explode('/', $m)[1], $rules['accept']));
    respondError("Formato no permitido. Permitidos: {$allowed}", 400);
}

// Check size
$maxBytes = $rules['maxMB'] * 1024 * 1024;
if ($fileSize > $maxBytes) {
    respondError("Archivo demasiado grande. Máximo: {$rules['maxMB']}MB", 400);
}

// ── Determine remote path ──────────────────
$timestamp = time();
$safeContext = preg_replace('/[^a-zA-Z0-9_\-]/', '', $contextId);

switch ($rules['folder']) {
    case 'members':
        $remotePath = "members/{$safeContext}/{$uploadType}_{$timestamp}.{$ext}";
        break;
    case 'payments':
        $remotePath = "payments/{$safeContext}/comprobante_{$timestamp}.{$ext}";
        break;
    case 'events':
        $remotePath = "events/{$safeContext}/imagen_{$timestamp}.{$ext}";
        break;
    default:
        $remotePath = "misc/{$uploadType}_{$timestamp}.{$ext}";
}

// ── Image processing ───────────────────────
$processedPath = $file['tmp_name'];
$thumbCdnUrl   = null;
$isImage       = str_starts_with($mimeType, 'image/');

if ($isImage && in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'])) {
    // Resize main image to max 1200px
    $resizedPath = sys_get_temp_dir() . '/svc_resized_' . $timestamp . '.' . $ext;
    if (resizeImage($file['tmp_name'], $resizedPath, 1200, 85)) {
        $processedPath = $resizedPath;
        $fileSize = filesize($resizedPath);
    }

    // Generate 300px thumbnail
    $thumbPath = sys_get_temp_dir() . '/svc_thumb_' . $timestamp . '.' . $ext;
    if (resizeImage($file['tmp_name'], $thumbPath, 300, 80)) {
        $thumbRemote = str_replace($uploadType, "thumb_{$uploadType}", $remotePath);
        $thumbResult = bunnyUpload($thumbPath, $thumbRemote);
        if ($thumbResult['success']) {
            $thumbCdnUrl = $thumbResult['cdn_url'];
        }
        @unlink($thumbPath);
    }
}

// ── Upload to Bunny ────────────────────────
$result = bunnyUpload($processedPath, $remotePath);

// Clean up temp files
if ($processedPath !== $file['tmp_name']) {
    @unlink($processedPath);
}

if (!$result['success']) {
    if (APP_DEBUG) {
        respondError('Error subiendo archivo: ' . ($result['error'] ?? 'unknown'), 500);
    }
    respondError('Error al subir archivo. Intente de nuevo.', 500);
}

// ── Save to database ───────────────────────
$db = getDB();

// Get member_id if this is a member upload
$memberId = null;
if ($rules['folder'] === 'members') {
    $stmt = $db->prepare('SELECT id FROM members WHERE user_id = ? OR membership_number = ? LIMIT 1');
    $stmt->execute([$userId, $contextId]);
    $row = $stmt->fetch();
    $memberId = $row ? (int)$row['id'] : null;
}

$stmt = $db->prepare('
    INSERT INTO file_uploads (user_id, member_id, upload_type, original_name, remote_path, cdn_url, thumbnail_url, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
');
$stmt->execute([
    $userId,
    $memberId,
    $uploadType,
    $origName,
    $remotePath,
    $result['cdn_url'],
    $thumbCdnUrl,
    $fileSize,
    $mimeType,
]);

$fileId = (int)$db->lastInsertId();

// ── Update member document URL if applicable ──
$docFields = [
    'foto_carne'           => 'foto_url',
    'cedula'               => 'cedula_url',
    'titulo_medico'        => 'titulo_medico_url',
    'titulo_especialidad'  => 'titulo_especialidad_url',
    'cv'                   => 'cv_url',
];

if ($memberId && isset($docFields[$uploadType])) {
    $col = $docFields[$uploadType];
    $db->prepare("UPDATE members SET {$col} = ? WHERE id = ?")
       ->execute([$result['cdn_url'], $memberId]);
}

respond([
    'file_id'       => $fileId,
    'cdn_url'       => $result['cdn_url'],
    'thumbnail_url' => $thumbCdnUrl,
    'file_size'     => $fileSize,
    'mime_type'     => $mimeType,
], 201);
