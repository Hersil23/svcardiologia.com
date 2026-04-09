<?php
require_once __DIR__ . '/config/db.php';

$method = getMethod();
$action = $_GET['action'] ?? '';

switch (true) {

    // GET /tickets — member's tickets
    case $method === 'GET' && ($action === '' || $action === 'my'):
        $auth = requireAuth();
        $db = getDB();
        $stmt = $db->prepare("
            SELECT t.*, e.title as event_title, e.starts_at as event_date,
                   e.location as event_location, ett.name as ticket_type_name
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            JOIN event_ticket_types ett ON ett.id = t.ticket_type_id
            WHERE t.user_id = ?
            ORDER BY e.starts_at DESC
        ");
        $stmt->execute([(int)$auth['sub']]);
        respond($stmt->fetchAll());
        break;

    // GET /tickets?action=get&id=X
    case $method === 'GET' && $action === 'get':
        $auth = requireAuth();
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $stmt = $db->prepare("
            SELECT t.*, e.title as event_title, e.starts_at as event_date,
                   e.ends_at as event_ends, e.location as event_location,
                   e.address as event_address,
                   ett.name as ticket_type_name, ett.price as ticket_price,
                   m.first_name, m.last_name, m.cedula
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            JOIN event_ticket_types ett ON ett.id = t.ticket_type_id
            LEFT JOIN members m ON m.user_id = t.user_id
            WHERE t.id = ?
        ");
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        if (!$ticket) respondError('Ticket no encontrado', 404);

        // Only owner or admin can see
        if ((int)$ticket['user_id'] !== (int)$auth['sub'] && !in_array($auth['role'], ['admin','superadmin'])) {
            respondError('Sin permisos', 403);
        }

        respond($ticket);
        break;

    // POST /tickets — purchase ticket
    case $method === 'POST' && ($action === '' || $action === 'purchase'):
        $auth = requireAuth();
        $input = getInput();
        $db = getDB();

        $eventId = (int)($input['event_id'] ?? 0);
        $ticketTypeId = (int)($input['ticket_type_id'] ?? 0);
        if (!$eventId || !$ticketTypeId) respondError('Evento y tipo de ticket requeridos', 400);

        // Verify event exists and is open
        $eStmt = $db->prepare("SELECT * FROM events WHERE id = ? AND is_published = 1");
        $eStmt->execute([$eventId]);
        $event = $eStmt->fetch();
        if (!$event) respondError('Evento no encontrado', 404);

        // Verify ticket type and availability
        $ttStmt = $db->prepare('SELECT * FROM event_ticket_types WHERE id = ? AND event_id = ? AND is_active = 1');
        $ttStmt->execute([$ticketTypeId, $eventId]);
        $ticketType = $ttStmt->fetch();
        if (!$ticketType) respondError('Tipo de ticket no disponible', 404);

        if ($ticketType['quantity_available'] !== null && $ticketType['quantity_sold'] >= $ticketType['quantity_available']) {
            respondError('Tickets agotados', 409);
        }

        // Check if user already has a ticket for this event
        $dupStmt = $db->prepare("SELECT id FROM tickets WHERE user_id = ? AND event_id = ? AND status = 'active'");
        $dupStmt->execute([(int)$auth['sub'], $eventId]);
        if ($dupStmt->fetch()) respondError('Ya tienes un ticket para este evento', 409);

        $uid = generateTicketUid();
        $qrToken = generateQrToken();

        $stmt = $db->prepare('
            INSERT INTO tickets (uid, user_id, event_id, ticket_type_id, qr_token, status)
            VALUES (?, ?, ?, ?, ?, "active")
        ');
        $stmt->execute([$uid, (int)$auth['sub'], $eventId, $ticketTypeId, $qrToken]);

        respond([
            'id' => (int)$db->lastInsertId(),
            'uid' => $uid,
            'qr_token' => $qrToken
        ], 201);
        break;

    // GET /tickets?action=validate&token=XXX — validate QR token
    case $method === 'GET' && $action === 'validate':
        $auth = requireAuth('admin', 'superadmin');
        $token = trim($_GET['token'] ?? '');
        if (!$token) respondError('Token requerido', 400);

        $db = getDB();
        $stmt = $db->prepare("
            SELECT t.*, e.title as event_title, e.starts_at as event_date,
                   ett.name as ticket_type_name,
                   m.first_name, m.last_name, m.cedula, m.membership_number
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            JOIN event_ticket_types ett ON ett.id = t.ticket_type_id
            LEFT JOIN members m ON m.user_id = t.user_id
            WHERE t.qr_token = ?
        ");
        $stmt->execute([$token]);
        $ticket = $stmt->fetch();

        if (!$ticket) {
            respond(['scan_result' => 'invalid', 'message' => 'Ticket no encontrado']);
            break;
        }

        if ($ticket['status'] === 'used') {
            respond([
                'scan_result' => 'already_used',
                'message' => 'Este ticket ya fue usado',
                'ticket' => $ticket
            ]);
            break;
        }

        if ($ticket['status'] !== 'active') {
            respond([
                'scan_result' => 'invalid',
                'message' => 'Ticket ' . $ticket['status'],
                'ticket' => $ticket
            ]);
            break;
        }

        respond([
            'scan_result' => 'valid',
            'message' => 'Ticket valido',
            'ticket' => $ticket
        ]);
        break;

    // PUT /tickets?action=checkin&id=X — mark as used
    case $method === 'PUT' && $action === 'checkin':
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ? AND status = 'active'");
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        if (!$ticket) respondError('Ticket no encontrado o ya usado', 404);

        try {
            $db->beginTransaction();

            $db->prepare("UPDATE tickets SET status = 'used', checked_in_at = NOW() WHERE id = ?")->execute([$id]);

            // Log the scan
            $db->prepare('
                INSERT INTO qr_scan_log (ticket_id, scanned_by, scan_result, ip_address, user_agent)
                VALUES (?, ?, "valid", ?, ?)
            ')->execute([
                $id, (int)$auth['sub'],
                $_SERVER['REMOTE_ADDR'] ?? null,
                substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500)
            ]);

            $db->commit();
            respond(['checked_in' => true]);
        } catch (PDOException $e) {
            $db->rollBack();
            respondError(APP_DEBUG ? $e->getMessage() : 'Error al registrar entrada', 500);
        }
        break;

    default:
        respondError('Accion no valida', 400);
}
