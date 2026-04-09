<?php
require_once __DIR__ . '/api/config/db.php';

$email = 'herasidesweb@gmail.com';
$password = 'Todomarket02.';
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$db = getDB();

$db->exec("DELETE FROM login_attempts WHERE email = '$email'");

$stmt = $db->prepare("UPDATE users SET password_hash = ?, role = 'superadmin', status = 'active' WHERE email = ?");
$stmt->execute([$hash, $email]);

echo json_encode([
    'success' => true,
    'hash' => $hash,
    'rows_updated' => $stmt->rowCount()
]);
