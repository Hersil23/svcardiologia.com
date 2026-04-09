<?php
require_once __DIR__ . '/api/config/db.php';

$password = 'SVC@Admin2025';
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$db = getDB();

// Clear login attempts
$db->exec("DELETE FROM login_attempts WHERE email = 'admin@svcardiologia.com'");

// Update password
$stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE email = 'admin@svcardiologia.com'");
$stmt->execute([$hash]);

echo json_encode([
    'success' => true,
    'hash' => $hash,
    'rows_updated' => $stmt->rowCount()
]);
