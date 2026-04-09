<?php
require_once __DIR__ . '/api/config/db.php';

header('Content-Type: application/json; charset=utf-8');

$email     = 'herasidesweb@gmail.com';
$password  = 'Todomarket02.';
$hash      = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$firstName = 'Herasi';
$lastName  = 'Dev';
$role      = 'superadmin';

$db = getDB();
$result = [];

// Clear any login lockouts for this email
$db->prepare("DELETE FROM login_attempts WHERE email = ?")->execute([$email]);

// Check if superadmin user already exists
$stmt = $db->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$existing = $stmt->fetch();

if ($existing) {
    // Update existing user
    $stmt = $db->prepare("UPDATE users SET password_hash = ?, role = ?, status = 'active' WHERE email = ?");
    $stmt->execute([$hash, $role, $email]);

    $stmt = $db->prepare("UPDATE members SET first_name = ?, last_name = ? WHERE user_id = ?");
    $stmt->execute([$firstName, $lastName, $existing['id']]);

    $result['action'] = 'updated';
    $result['user_id'] = (int) $existing['id'];
} else {
    // Insert new user
    $db->beginTransaction();

    $stmt = $db->prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, 'active')");
    $stmt->execute([$email, $hash, $role]);
    $userId = (int) $db->lastInsertId();

    $stmt = $db->prepare("INSERT INTO members (user_id, first_name, last_name, membership_status) VALUES (?, ?, ?, 'active')");
    $stmt->execute([$userId, $firstName, $lastName]);

    $db->commit();

    $result['action'] = 'created';
    $result['user_id'] = $userId;
}

// Set old admin to role='admin' (keep it)
$stmt = $db->prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@svcardiologia.com' AND role = 'superadmin'");
$stmt->execute();
$result['old_admin_demoted'] = $stmt->rowCount();

$result['success'] = true;
$result['email'] = $email;
$result['role'] = $role;
$result['hash'] = $hash;

echo json_encode($result, JSON_UNESCAPED_UNICODE);
