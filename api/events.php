<?php
require_once __DIR__ . '/config/db.php';

$method = getMethod();
$action = $_GET['action'] ?? '';

switch (true) {

    // GET /events — public list
    case $method === 'GET' && ($action === '' || $action === 'list'):
        $db = getDB();
        $input = getInput();
        $page    = max(1, (int)($input['page'] ?? 1));
        $perPage = min(50, max(5, (int)($input['per_page'] ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $where = ['e.is_published = 1'];
        $params = [];

        if (!empty($input['upcoming'])) {
            $where[] = '(e.ends_at >= NOW() OR (e.ends_at IS NULL AND e.starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)))';
        }

        $whereSQL = implode(' AND ', $where);
        $total = (int) $db->prepare("SELECT COUNT(*) FROM events e WHERE {$whereSQL}")->execute($params)
            ? $db->query("SELECT FOUND_ROWS()")->fetchColumn() : 0;

        $cStmt = $db->prepare("SELECT COUNT(*) FROM events e WHERE {$whereSQL}");
        $cStmt->execute($params);
        $total = (int) $cStmt->fetchColumn();

        $stmt = $db->prepare("
            SELECT e.*,
                (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'active') as tickets_sold
            FROM events e
            WHERE {$whereSQL}
            ORDER BY e.starts_at ASC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $stmt->execute($params);
        $events = $stmt->fetchAll();

        // Attach ticket types to each event
        foreach ($events as &$evt) {
            $ttStmt = $db->prepare('SELECT id, name, price, currency FROM event_ticket_types WHERE event_id = ?');
            $ttStmt->execute([$evt['id']]);
            $evt['ticket_types'] = $ttStmt->fetchAll();
        }
        unset($evt);

        respondPaginated($events, $total, $page, $perPage);
        break;

    // GET /events?action=upcoming
    case $method === 'GET' && $action === 'upcoming':
        $db = getDB();
        $limit = min(10, max(1, (int)($_GET['limit'] ?? 5)));
        $stmt = $db->prepare("
            SELECT e.*
            FROM events e
            WHERE e.is_published = 1 AND (e.ends_at >= NOW() OR (e.ends_at IS NULL AND e.starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)))
            ORDER BY e.starts_at ASC
            LIMIT ?
        ");
        $stmt->execute([$limit]);
        $events = $stmt->fetchAll();

        foreach ($events as &$evt) {
            $ttStmt = $db->prepare('SELECT id, name, price, currency FROM event_ticket_types WHERE event_id = ?');
            $ttStmt->execute([$evt['id']]);
            $evt['ticket_types'] = $ttStmt->fetchAll();
        }
        unset($evt);

        respond($events);
        break;

    // GET /events?action=get&id=X
    case $method === 'GET' && $action === 'get':
        $db = getDB();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $stmt = $db->prepare('SELECT * FROM events WHERE id = ?');
        $stmt->execute([$id]);
        $event = $stmt->fetch();
        if (!$event) respondError('Evento no encontrado', 404);

        // Ticket types
        $tStmt = $db->prepare('SELECT * FROM event_ticket_types WHERE event_id = ? AND is_active = 1 ORDER BY price ASC');
        $tStmt->execute([$id]);
        $event['ticket_types'] = $tStmt->fetchAll();

        // Attendance count
        $aStmt = $db->prepare("SELECT COUNT(*) FROM tickets WHERE event_id = ? AND status IN ('active','used')");
        $aStmt->execute([$id]);
        $event['attendees'] = (int) $aStmt->fetchColumn();

        respond($event);
        break;

    // GET /events?action=my — events user has tickets for
    case $method === 'GET' && $action === 'my':
        $auth = requireAuth();
        $db = getDB();
        $stmt = $db->prepare("
            SELECT DISTINCT e.*, t.status as ticket_status, t.uid as ticket_uid
            FROM events e
            JOIN tickets t ON t.event_id = e.id
            WHERE t.user_id = ? AND t.status IN ('active','used')
            ORDER BY e.starts_at DESC
        ");
        $stmt->execute([(int)$auth['sub']]);
        respond($stmt->fetchAll());
        break;

    // POST /events — admin create
    case $method === 'POST' && ($action === '' || $action === 'create'):
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $db = getDB();

        $title = trim($input['title'] ?? '');
        if (!$title) respondError('Titulo requerido', 400);

        $startsAt = $input['starts_at'] ?? '';
        if (!$startsAt) respondError('Fecha de inicio requerida', 400);

        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $title));
        $slug = trim($slug, '-') . '-' . substr(uniqid(), -5);

        try {
            $db->beginTransaction();

            $stmt = $db->prepare('
                INSERT INTO events (title, slug, description, location, address, cover_image_url, starts_at, ends_at,
                    registration_opens_at, registration_closes_at, max_attendees, is_published, is_featured, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([
                $title, $slug,
                trim($input['description'] ?? '') ?: null,
                trim($input['location'] ?? '') ?: null,
                trim($input['address'] ?? '') ?: null,
                trim($input['cover_image_url'] ?? '') ?: null,
                $startsAt,
                $input['ends_at'] ?? null,
                $input['registration_opens_at'] ?? null,
                $input['registration_closes_at'] ?? null,
                $input['max_attendees'] ? (int)$input['max_attendees'] : null,
                (int)($input['is_published'] ?? 0),
                (int)($input['is_featured'] ?? 0),
                (int)$auth['sub']
            ]);
            $eventId = (int)$db->lastInsertId();

            // Create ticket types if provided
            if (!empty($input['ticket_types']) && is_array($input['ticket_types'])) {
                $ttStmt = $db->prepare('
                    INSERT INTO event_ticket_types (event_id, name, description, price, currency, quantity_available)
                    VALUES (?, ?, ?, ?, ?, ?)
                ');
                foreach ($input['ticket_types'] as $tt) {
                    $ttStmt->execute([
                        $eventId,
                        trim($tt['name'] ?? 'General'),
                        trim($tt['description'] ?? '') ?: null,
                        (float)($tt['price'] ?? 0),
                        $tt['currency'] ?? 'USD',
                        isset($tt['quantity_available']) ? (int)$tt['quantity_available'] : null
                    ]);
                }
            }

            $db->commit();
            respond(['id' => $eventId, 'slug' => $slug], 201);
        } catch (PDOException $e) {
            $db->rollBack();
            respondError(APP_DEBUG ? $e->getMessage() : 'Error al crear evento', 500);
        }
        break;

    // PUT /events?action=update&id=X
    case $method === 'PUT' && $action === 'update':
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $allowed = ['title','description','location','address','cover_image_url','starts_at','ends_at',
                     'registration_opens_at','registration_closes_at','max_attendees',
                     'is_published','is_featured'];

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
        $db->prepare("UPDATE events SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);

        respond(['updated' => true]);
        break;

    // DELETE /events?action=delete&id=X
    case $method === 'DELETE' && $action === 'delete':
        $auth = requireAuth('admin', 'superadmin');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $db->prepare('UPDATE events SET is_published = 0 WHERE id = ?')->execute([$id]);
        respond(['deleted' => true]);
        break;

    default:
        respondError('Accion no valida', 400);
}
