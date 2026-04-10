<?php
require_once __DIR__ . '/config/db.php';

$db = getDB();
$results = [];

// Get all non-superadmin users
$stmt = $db->query("SELECT id, email, role FROM users WHERE role != 'superadmin'");
$users = $stmt->fetchAll();

foreach ($users as $user) {
    $uid = (int)$user['id'];
    $db->prepare('DELETE FROM file_uploads WHERE user_id = ?')->execute([$uid]);
    $db->prepare('DELETE FROM payments WHERE user_id = ?')->execute([$uid]);
    $db->prepare('DELETE FROM auth_tokens WHERE user_id = ?')->execute([$uid]);
    $db->prepare('DELETE FROM members WHERE user_id = ?')->execute([$uid]);
    $db->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]);
    $results[] = "Borrado: {$user['email']} (rol: {$user['role']})";
}

// Clear rate limits and login attempts
$db->prepare('DELETE FROM rate_limits')->execute();
$db->prepare('DELETE FROM login_attempts')->execute();

$results[] = 'Rate limits y login attempts limpiados';
$results[] = 'Superadmin conservado';

echo json_encode(['success' => true, 'results' => $results], JSON_UNESCAPED_UNICODE);
