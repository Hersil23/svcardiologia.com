<?php
require_once __DIR__ . '/config/db.php';

$method = getMethod();
$segments = getPathSegments();
$action = $_GET['action'] ?? '';

switch (true) {

    // GET /members?search=&status=&page=&per_page=
    case $method === 'GET' && $action === '':
    case $method === 'GET' && $action === 'list':
        $auth = requireAuth();
        $db = getDB();
        $input = getInput();

        $page    = max(1, (int)($input['page'] ?? 1));
        $perPage = min(50, max(5, (int)($input['per_page'] ?? 20)));
        $offset  = ($page - 1) * $perPage;
        $search  = trim($input['search'] ?? '');
        $status  = $input['status'] ?? '';

        $where = ['1=1'];
        $params = [];

        if ($search !== '') {
            $where[] = '(m.first_name LIKE ? OR m.last_name LIKE ? OR m.cedula LIKE ? OR m.membership_number LIKE ? OR u.email LIKE ?)';
            $like = "%{$search}%";
            $params = array_merge($params, [$like, $like, $like, $like, $like]);
        }

        if ($status !== '' && in_array($status, ['pending','active','expired','suspended'])) {
            $where[] = 'm.membership_status = ?';
            $params[] = $status;
        }

        $whereSQL = implode(' AND ', $where);

        $countStmt = $db->prepare("SELECT COUNT(*) FROM members m JOIN users u ON u.id = m.user_id WHERE {$whereSQL}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $db->prepare("
            SELECT m.*, u.email, u.role, u.status as user_status
            FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE {$whereSQL}
            ORDER BY m.last_name ASC, m.first_name ASC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $stmt->execute($params);
        $items = $stmt->fetchAll();

        respondPaginated($items, $total, $page, $perPage);
        break;

    // GET /members?action=get&id=X
    case $method === 'GET' && $action === 'get':
        $auth = requireAuth();
        $db = getDB();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $stmt = $db->prepare('
            SELECT m.*, u.email, u.role, u.status as user_status, u.last_login_at
            FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE m.id = ?
        ');
        $stmt->execute([$id]);
        $member = $stmt->fetch();
        if (!$member) respondError('Miembro no encontrado', 404);

        // Get payment history
        $pStmt = $db->prepare('
            SELECT p.*, pt.name as type_name
            FROM payments p
            JOIN payment_types pt ON pt.id = p.payment_type_id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT 10
        ');
        $pStmt->execute([$member['user_id']]);
        $member['recent_payments'] = $pStmt->fetchAll();

        respond($member);
        break;

    // GET /members?action=search&q=
    case $method === 'GET' && $action === 'search':
        $auth = requireAuth();
        $q = trim($_GET['q'] ?? '');
        if (strlen($q) < 2) respondError('Busqueda muy corta', 400);

        $db = getDB();
        $like = "%{$q}%";
        $stmt = $db->prepare('
            SELECT m.id, m.first_name, m.last_name, m.cedula, m.specialty,
                   m.membership_number, m.membership_status, u.email
            FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE m.first_name LIKE ? OR m.last_name LIKE ? OR m.cedula LIKE ?
                  OR m.membership_number LIKE ? OR u.email LIKE ?
            ORDER BY m.last_name ASC
            LIMIT 20
        ');
        $stmt->execute([$like, $like, $like, $like, $like]);
        respond($stmt->fetchAll());
        break;

    // GET /members?action=stats
    case $method === 'GET' && $action === 'stats':
        $auth = requireAuth('admin', 'superadmin');
        $db = getDB();

        $stats = [];
        $stats['total'] = (int) $db->query('SELECT COUNT(*) FROM members')->fetchColumn();
        $stats['active'] = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_status = 'active'")->fetchColumn();
        $stats['pending'] = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_status = 'pending'")->fetchColumn();
        $stats['expired'] = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_status = 'expired'")->fetchColumn();

        respond($stats);
        break;

    // POST /members — create
    case $method === 'POST' && ($action === '' || $action === 'create'):
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $db = getDB();

        $email     = trim($input['email'] ?? '');
        $password  = $input['password'] ?? '';
        $firstName = trim($input['first_name'] ?? '');
        $lastName  = trim($input['last_name'] ?? '');

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) respondError('Correo invalido', 400);
        if (strlen($password) < 8) respondError('Contrasena debe tener al menos 8 caracteres', 400);
        if (!$firstName || !$lastName) respondError('Nombre y apellido requeridos', 400);

        // Check duplicate
        $chk = $db->prepare('SELECT id FROM users WHERE email = ?');
        $chk->execute([$email]);
        if ($chk->fetch()) respondError('Correo ya registrado', 409);

        try {
            $db->beginTransaction();

            $stmt = $db->prepare('INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "member", "active")');
            $stmt->execute([$email, password_hash($password, PASSWORD_BCRYPT, ['cost' => 12])]);
            $userId = (int)$db->lastInsertId();

            // Generate membership number: NRO-SVC-XXXX
            $nextNum = (int) $db->query('SELECT COALESCE(MAX(id), 0) + 1 FROM members')->fetchColumn();
            $membershipNumber = 'NRO-SVC-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

            $stmt = $db->prepare('
                INSERT INTO members (user_id, first_name, last_name, cedula, phone, specialty,
                    institution, city, state, membership_number, membership_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending")
            ');
            $stmt->execute([
                $userId, $firstName, $lastName,
                trim($input['cedula'] ?? '') ?: null,
                trim($input['phone'] ?? '') ?: null,
                trim($input['specialty'] ?? '') ?: null,
                trim($input['institution'] ?? '') ?: null,
                trim($input['city'] ?? '') ?: null,
                trim($input['state'] ?? '') ?: null,
                $membershipNumber
            ]);

            $db->commit();
            respond(['id' => (int)$db->lastInsertId(), 'membership_number' => $membershipNumber], 201);
        } catch (PDOException $e) {
            $db->rollBack();
            respondError(APP_DEBUG ? $e->getMessage() : 'Error al crear miembro', 500);
        }
        break;

    // PUT /members?action=update&id=X
    case $method === 'PUT' && $action === 'update':
        $auth = requireAuth();
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();

        // Members can update themselves, admins can update anyone
        $stmt = $db->prepare('SELECT user_id FROM members WHERE id = ?');
        $stmt->execute([$id]);
        $member = $stmt->fetch();
        if (!$member) respondError('Miembro no encontrado', 404);

        $isOwn = (int)$member['user_id'] === (int)$auth['sub'];
        $isAdm = in_array($auth['role'], ['admin', 'superadmin']);
        if (!$isOwn && !$isAdm) respondError('Sin permisos', 403);

        $allowed = ['first_name','last_name','phone','specialty','institution','city','state','bio'];
        if ($isAdm) {
            $allowed = array_merge($allowed, ['cedula','membership_status','membership_expires_at']);
        }

        $sets = [];
        $params = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $input)) {
                $sets[] = "{$field} = ?";
                $params[] = $input[$field] === '' ? null : $input[$field];
            }
        }

        if (empty($sets)) respondError('Nada que actualizar', 400);

        $params[] = $id;
        $db->prepare("UPDATE members SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);

        respond(['updated' => true]);
        break;

    // DELETE /members?action=delete&id=X (soft: set status to suspended)
    case $method === 'DELETE' && $action === 'delete':
        $auth = requireAuth('admin', 'superadmin');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $stmt = $db->prepare('SELECT user_id FROM members WHERE id = ?');
        $stmt->execute([$id]);
        $member = $stmt->fetch();
        if (!$member) respondError('Miembro no encontrado', 404);

        $db->prepare("UPDATE members SET membership_status = 'suspended' WHERE id = ?")->execute([$id]);
        $db->prepare("UPDATE users SET status = 'suspended' WHERE id = ?")->execute([$member['user_id']]);

        respond(['deleted' => true]);
        break;

    default:
        respondError('Accion no valida', 400);
}
