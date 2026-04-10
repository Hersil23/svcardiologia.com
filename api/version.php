<?php
echo json_encode([
    'version' => '2026-04-09-v2',
    'last_commit' => '42e8f39',
    'admin_js_has_pending' => file_exists(__DIR__ . '/../assets/js/admin.js') ? (str_contains(file_get_contents(__DIR__ . '/../assets/js/admin.js'), 'loadPendingRequests') ? 'YES' : 'NO') : 'FILE_MISSING',
    'register_php_has_file_uploads_insert' => file_exists(__DIR__ . '/register.php') ? (str_contains(file_get_contents(__DIR__ . '/register.php'), 'INSERT INTO file_uploads') ? 'YES' : 'NO') : 'FILE_MISSING',
    'upload_php_has_6mb' => file_exists(__DIR__ . '/upload.php') ? (str_contains(file_get_contents(__DIR__ . '/upload.php'), 'SVC_UPLOAD_MAX') ? 'YES' : 'NO') : 'FILE_MISSING',
]);
