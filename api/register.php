<?php
/**
 * SVC App — Public Registration API
 * No auth required for registration endpoints
 */

// Log errors to file, never display (protects JSON output)
ini_set('display_errors', 0);
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/register_error.log');
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/bunny.php';
require_once __DIR__ . '/config/mailer.php';

$action = $_GET['action'] ?? '';
$method = getMethod();

switch ($action) {

    // ── Check if email is available ─────────
    case 'check_email':
        if ($method !== 'POST') respondError('Method not allowed', 405);
        $input = getInput();
        $email = strtolower(trim($input['email'] ?? ''));
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respondError('Correo electrónico inválido', 400);
        }
        $db = getDB();
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        respond(['available' => !$stmt->fetch()]);
        break;

    // ── Check if cedula is available ────────
    case 'check_cedula':
        if ($method !== 'POST') respondError('Method not allowed', 405);
        $input = getInput();
        $cedula = trim($input['cedula'] ?? '');
        if (!$cedula) respondError('Cédula requerida', 400);
        $db = getDB();
        $stmt = $db->prepare('SELECT id FROM members WHERE cedula = ? LIMIT 1');
        $stmt->execute([$cedula]);
        respond(['available' => !$stmt->fetch()]);
        break;

    // ── Submit complete registration ────────
    case 'submit':
        if ($method !== 'POST') respondError('Method not allowed', 405);

        $ip = getClientIP();
        checkRateLimit($ip, 'register', 5, 3600);

        $input = getInput();

        // ── Validate required personal fields
        $email     = strtolower(trim($input['email'] ?? ''));
        $password  = $input['password'] ?? '';
        $firstName = trim($input['first_name'] ?? '');
        $lastName  = trim($input['last_name'] ?? '');
        $cedula    = trim($input['cedula'] ?? '');
        $phone     = trim($input['phone'] ?? '');
        $birthDate = $input['birth_date'] ?? '';
        $gender    = $input['gender'] ?? '';
        $membershipType = $input['membership_type'] ?? '';

        $errors = [];
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Correo inválido';
        if (strlen($password) < 8) $errors[] = 'Contraseña debe tener mínimo 8 caracteres';
        if (!$firstName) $errors[] = 'Nombres requerido';
        if (!$lastName) $errors[] = 'Apellidos requerido';
        if (!$cedula) $errors[] = 'Cédula requerida';
        if (!$phone) $errors[] = 'Teléfono requerido';
        if (!in_array($membershipType, ['asociado', 'correspondiente', 'profesional_afin'])) {
            $errors[] = 'Tipo de membresía inválido';
        }

        if (!empty($errors)) respondError(implode('. ', $errors), 400);

        $db = getDB();

        // Check duplicates
        $chk = $db->prepare('SELECT id FROM users WHERE email = ?');
        $chk->execute([$email]);
        if ($chk->fetch()) respondError('Este correo ya está registrado', 409);

        $chk = $db->prepare('SELECT id FROM members WHERE cedula = ?');
        $chk->execute([$cedula]);
        if ($chk->fetch()) respondError('Esta cédula ya está registrada', 409);

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        // Professional data
        $profData = $input['professional'] ?? [];

        // Payment data
        $payData = $input['payment'] ?? [];

        // File IDs
        $fileIds = $input['file_ids'] ?? [];

        try {
            $db->beginTransaction();

            // Create user (inactive until approved)
            $stmt = $db->prepare('
                INSERT INTO users (email, password_hash, role, status)
                VALUES (?, ?, "member", "inactive")
            ');
            $stmt->execute([$email, $passwordHash]);
            $userId = (int) $db->lastInsertId();

            // Create member record
            $stmt = $db->prepare('
                INSERT INTO members (
                    user_id, first_name, last_name, cedula, phone,
                    specialty, institution, city, state,
                    membership_status, bio
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", ?)
            ');
            $stmt->execute([
                $userId,
                $firstName,
                $lastName,
                $cedula,
                $phone,
                trim($profData['specialty'] ?? '') ?: null,
                trim($profData['institution'] ?? '') ?: null,
                trim($profData['city'] ?? '') ?: null,
                trim($profData['state'] ?? '') ?: null,
                json_encode([
                    'membership_type' => $membershipType,
                    'birth_date'      => $birthDate,
                    'gender'          => $gender,
                    'professional'    => $profData,
                ], JSON_UNESCAPED_UNICODE),
            ]);
            $memberId = (int) $db->lastInsertId();

            // Link uploaded files to member (filter out zeros from registration uploads)
            $validFileIds = array_filter(array_map('intval', $fileIds ?? []), fn($id) => $id > 0);
            if (!empty($validFileIds)) {
                $placeholders = implode(',', array_fill(0, count($validFileIds), '?'));
                $db->prepare("UPDATE file_uploads SET member_id = ?, user_id = ? WHERE id IN ({$placeholders})")
                   ->execute(array_merge([$memberId, $userId], $validFileIds));
            }

            // Store file URLs from registration uploads
            $fileUrls = $input['file_urls'] ?? [];
            if (!empty($fileUrls) && is_array($fileUrls)) {
                $urlFields = [
                    'foto_carne' => 'foto_url', 'cedula' => 'cedula_url',
                    'titulo_medico' => 'titulo_medico_url', 'titulo_especialidad' => 'titulo_especialidad_url',
                    'titulo_universitario' => 'titulo_especialidad_url', 'cv' => 'cv_url',
                ];
                foreach ($fileUrls as $type => $url) {
                    if (isset($urlFields[$type]) && $url) {
                        $col = $urlFields[$type];
                        $db->prepare("UPDATE members SET {$col} = ? WHERE id = ?")->execute([$url, $memberId]);
                    }
                }
            }

            // Create payment record if provided
            if (!empty($payData['method'])) {
                $stmt = $db->prepare('
                    INSERT INTO payments (user_id, payment_type_id, amount, currency, method, reference_number, notes, status)
                    VALUES (?, 1, ?, ?, ?, ?, "Pago de admisión - Registro", "pending")
                ');
                $stmt->execute([
                    $userId,
                    (float)($payData['amount'] ?? 50),
                    $payData['currency'] ?? 'USD',
                    $payData['method'] ?? 'other',
                    trim($payData['reference'] ?? '') ?: null,
                ]);
            }

            $db->commit();

            // Send confirmation emails (non-blocking, don't break on failure)
            try {
                $mailData = [
                    'first_name' => $firstName, 'last_name' => $lastName,
                    'email' => $email, 'phone' => $phone,
                    'membership_type' => $membershipType,
                ];
                SVCMailer::sendRegistrationConfirmation($mailData);
                SVCMailer::sendAdminNewRequest($mailData);
            } catch (Throwable $mailErr) {
                error_log('Registration email failed: ' . $mailErr->getMessage());
            }

            respond([
                'user_id'   => $userId,
                'member_id' => $memberId,
                'message'   => 'Solicitud registrada exitosamente',
            ], 201);

        } catch (PDOException $e) {
            $db->rollBack();
            if (APP_DEBUG) {
                respondError('Error: ' . $e->getMessage(), 500);
            }
            respondError('Error al procesar la solicitud. Intente de nuevo.', 500);
        }
        break;

    // ── Admin: Get pending registrations ────
    case 'pending':
        if ($method !== 'GET') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $db = getDB();

        $stmt = $db->query("
            SELECT m.*, u.email, u.status as user_status, u.created_at as registered_at
            FROM members m
            JOIN users u ON u.id = m.user_id
            WHERE m.membership_status = 'pending'
            ORDER BY u.created_at DESC
        ");
        $members = $stmt->fetchAll();

        // Attach files for each member
        foreach ($members as &$member) {
            $fStmt = $db->prepare('SELECT * FROM file_uploads WHERE member_id = ? ORDER BY upload_type');
            $fStmt->execute([$member['id']]);
            $member['documents'] = $fStmt->fetchAll();

            // Attach payment
            $pStmt = $db->prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
            $pStmt->execute([$member['user_id']]);
            $member['payment'] = $pStmt->fetch() ?: null;
        }
        unset($member);

        respond($members);
        break;

    // ── Admin: Approve registration ─────────
    case 'approve':
        if ($method !== 'PUT') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $memberId = (int)($input['member_id'] ?? 0);
        if (!$memberId) respondError('member_id requerido', 400);

        $db = getDB();
        $stmt = $db->prepare('SELECT id, user_id FROM members WHERE id = ? AND membership_status = "pending"');
        $stmt->execute([$memberId]);
        $member = $stmt->fetch();
        if (!$member) respondError('Solicitud no encontrada', 404);

        // Generate NRO SVC
        $year = date('Y');
        $lastNum = (int) $db->query("SELECT COUNT(*) FROM members WHERE membership_number LIKE 'SVC-{$year}-%'")->fetchColumn();
        $nroSvc = 'SVC-' . $year . '-' . str_pad($lastNum + 1, 4, '0', STR_PAD_LEFT);

        $db->prepare("UPDATE members SET membership_status = 'active', membership_number = ?, membership_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?")
           ->execute([$nroSvc, $memberId]);

        $db->prepare("UPDATE users SET status = 'active' WHERE id = ?")
           ->execute([$member['user_id']]);

        // Approve pending payment
        $db->prepare("UPDATE payments SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE user_id = ? AND status = 'pending'")
           ->execute([$auth['sub'], $member['user_id']]);

        // Send approval email
        $mStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = ?');
        $mStmt->execute([$memberId]);
        $approvedMember = $mStmt->fetch();
        if ($approvedMember) SVCMailer::sendApprovalEmail($approvedMember);

        respond(['approved' => true, 'nro_svc' => $nroSvc]);
        break;

    // ── Admin: Reject registration ──────────
    case 'reject':
        if ($method !== 'PUT') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $memberId = (int)($input['member_id'] ?? 0);
        $reason   = trim($input['reason'] ?? '');
        if (!$memberId) respondError('member_id requerido', 400);

        $db = getDB();
        $stmt = $db->prepare('SELECT user_id FROM members WHERE id = ?');
        $stmt->execute([$memberId]);
        $member = $stmt->fetch();
        if (!$member) respondError('Miembro no encontrado', 404);

        $db->prepare("UPDATE members SET membership_status = 'rechazado' WHERE id = ?")
           ->execute([$memberId]);
        $db->prepare("UPDATE users SET status = 'inactive' WHERE id = ?")
           ->execute([$member['user_id']]);

        // Reject payment
        $db->prepare("UPDATE payments SET status = 'rejected', notes = CONCAT(COALESCE(notes,''), ' — Rechazado: ', ?) WHERE user_id = ? AND status = 'pending'")
           ->execute([$reason ?: 'Sin motivo especificado', $member['user_id']]);

        // Send rejection email
        $mStmt = $db->prepare('SELECT m.*, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = ?');
        $mStmt->execute([$memberId]);
        $rejectedMember = $mStmt->fetch();
        if ($rejectedMember) SVCMailer::sendRejectionEmail($rejectedMember, $reason ?: 'Sin motivo especificado');

        respond(['rejected' => true]);
        break;

    default:
        respondError('Acción no válida', 400);
}
