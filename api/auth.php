<?php
/**
 * SVC App - Auth API
 * Endpoints: login, me, logout, register (admin-only)
 */

require_once __DIR__ . '/config/db.php';

$action = $_GET['action'] ?? '';
$method = getMethod();

switch ($action) {

    // ── LOGIN ────────────────────────────────
    case 'login':
        if ($method !== 'POST') respondError('Method not allowed', 405);

        // Login-specific rate limit (10 attempts per minute per IP)
        $ip = getClientIP();
        checkRateLimit($ip, 'login', 10, 60);

        $input = getInput();
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';

        // Validate inputs
        $errors = validateInput($input, [
            'email' => 'required|email|max:255',
            'password' => 'required|min:1|max:255'
        ]);
        if ($errors) respondError(array_values($errors)[0], 400);

        // Check brute force lockout
        checkLoginAttempts($ip, $email);

        try {
            $db = getDB();

            // Find user with member data (specific columns, no SELECT *)
            $stmt = $db->prepare('
                SELECT u.id, u.email, u.password_hash, u.role, u.status,
                       m.first_name, m.last_name, m.cedula, m.phone,
                       m.specialty, m.institution, m.city, m.state,
                       m.avatar_url, m.membership_number, m.membership_status,
                       m.membership_expires_at
                FROM users u
                LEFT JOIN members m ON m.user_id = u.id
                WHERE u.email = ?
                LIMIT 1
            ');
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if (!$user) {
                recordLoginAttempt($ip, $email, false);
                respondError('Credenciales invalidas', 401);
            }

            if (!password_verify($password, $user['password_hash'])) {
                recordLoginAttempt($ip, $email, false);
                respondError('Credenciales invalidas', 401);
            }

            if ($user['status'] !== 'active') {
                recordLoginAttempt($ip, $email, false);
                logSecurityEvent('login_suspended_account', $ip, (int)$user['id'], "Email: {$email}");
                respondError('Tu cuenta esta suspendida. Contacta a administracion.', 403);
            }

            // Record successful login
            recordLoginAttempt($ip, $email, true);

            // Generate JWT with fingerprint
            $fingerprint = hashFingerprint($ip, $_SERVER['HTTP_USER_AGENT'] ?? '');
            $tokenPayload = [
                'sub'  => (int) $user['id'],
                'email' => $user['email'],
                'role' => $user['role'],
                'fpr'  => $fingerprint,
                'aud'  => 'svcardiologia.com',
                'exp'  => time() + JWT_EXPIRY
            ];
            $token = jwtEncode($tokenPayload);

            // Store token hash for revocation support
            $tokenHash = hash('sha256', $token);
            $expiresAt = date('Y-m-d H:i:s', time() + JWT_EXPIRY);
            $deviceInfo = substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 255);
            $ipAddress = $ip;

            $stmt = $db->prepare('
                INSERT INTO auth_tokens (user_id, token_hash, type, device_info, ip_address, expires_at)
                VALUES (?, ?, "access", ?, ?, ?)
            ');
            $stmt->execute([(int) $user['id'], $tokenHash, $deviceInfo, $ipAddress, $expiresAt]);

            // Update last login
            $db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')
               ->execute([(int) $user['id']]);

            // Build safe user response (exclude password_hash)
            $userData = [
                'id'                  => (int) $user['id'],
                'email'               => $user['email'],
                'role'                => $user['role'],
                'first_name'          => $user['first_name'],
                'last_name'           => $user['last_name'],
                'cedula'              => $user['cedula'],
                'phone'               => $user['phone'],
                'specialty'           => $user['specialty'],
                'institution'         => $user['institution'],
                'city'                => $user['city'],
                'state'               => $user['state'],
                'avatar_url'          => $user['avatar_url'],
                'membership_number'   => $user['membership_number'],
                'membership_status'   => $user['membership_status'],
                'membership_expires_at' => $user['membership_expires_at'],
            ];

            respond([
                'token' => $token,
                'user'  => $userData
            ]);
        } catch (PDOException $e) {
            if (APP_DEBUG) {
                respondError('Error de base de datos: ' . $e->getMessage(), 500);
            }
            respondError('Error al procesar login. Intente de nuevo.', 500);
        }
        break;

    // ── ME (current user profile) ────────────
    case 'me':
        if ($method !== 'GET') respondError('Method not allowed', 405);

        $auth = requireAuth();
        $db = getDB();

        $stmt = $db->prepare('
            SELECT u.id, u.email, u.role, u.status, u.last_login_at,
                   m.first_name, m.last_name, m.cedula, m.phone,
                   m.specialty, m.institution, m.city, m.state, m.country,
                   m.avatar_url, m.membership_number, m.membership_status,
                   m.membership_expires_at, m.bio
            FROM users u
            LEFT JOIN members m ON m.user_id = u.id
            WHERE u.id = ?
            LIMIT 1
        ');
        $stmt->execute([(int) $auth['sub']]);
        $user = $stmt->fetch();

        if (!$user) {
            respondError('Usuario no encontrado', 404);
        }

        respond([
            'id'                    => (int) $user['id'],
            'email'                 => $user['email'],
            'role'                  => $user['role'],
            'status'                => $user['status'],
            'first_name'            => $user['first_name'],
            'last_name'             => $user['last_name'],
            'cedula'                => $user['cedula'],
            'phone'                 => $user['phone'],
            'specialty'             => $user['specialty'],
            'institution'           => $user['institution'],
            'city'                  => $user['city'],
            'state'                 => $user['state'],
            'country'               => $user['country'],
            'avatar_url'            => $user['avatar_url'],
            'membership_number'     => $user['membership_number'],
            'membership_status'     => $user['membership_status'],
            'membership_expires_at' => $user['membership_expires_at'],
            'bio'                   => $user['bio'],
            'last_login_at'         => $user['last_login_at'],
        ]);
        break;

    // ── LOGOUT ───────────────────────────────
    case 'logout':
        if ($method !== 'POST') respondError('Method not allowed', 405);

        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            $tokenHash = hash('sha256', $matches[1]);
            $db = getDB();

            // Revoke this specific token
            $stmt = $db->prepare('
                UPDATE auth_tokens SET revoked_at = NOW() WHERE token_hash = ?
            ');
            $stmt->execute([$tokenHash]);
        }

        respond(['message' => 'Sesion cerrada']);
        break;

    // ── REGISTER (admin-only) ────────────────
    case 'register':
        if ($method !== 'POST') respondError('Method not allowed', 405);

        $auth = requireAuth('superadmin', 'admin');
        $input = getInput();

        // Validate required fields
        $email     = trim($input['email'] ?? '');
        $password  = $input['password'] ?? '';
        $firstName = trim($input['first_name'] ?? '');
        $lastName  = trim($input['last_name'] ?? '');
        $role      = $input['role'] ?? 'member';

        $errors = [];
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Correo electronico invalido';
        }
        if (strlen($password) < 8) {
            $errors[] = 'La contrasena debe tener al menos 8 caracteres';
        }
        if (empty($firstName)) {
            $errors[] = 'Nombre es requerido';
        }
        if (empty($lastName)) {
            $errors[] = 'Apellido es requerido';
        }

        // Only superadmin can create admin accounts
        $allowedRoles = ['member'];
        if ($auth['role'] === 'superadmin') {
            $allowedRoles = ['member', 'admin', 'superadmin'];
        }
        if (!in_array($role, $allowedRoles, true)) {
            $errors[] = 'Rol no permitido';
        }

        if (!empty($errors)) {
            respondError('Datos invalidos', 400, $errors);
        }

        $db = getDB();

        // Check if email already exists
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            respondError('Este correo ya esta registrado', 409);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        try {
            $db->beginTransaction();

            // Create user
            $stmt = $db->prepare('
                INSERT INTO users (email, password_hash, role, status)
                VALUES (?, ?, ?, "active")
            ');
            $stmt->execute([$email, $passwordHash, $role]);
            $userId = (int) $db->lastInsertId();

            // Create member profile
            $stmt = $db->prepare('
                INSERT INTO members (user_id, first_name, last_name, cedula, phone, specialty, institution, city, state, membership_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "pending")
            ');
            $stmt->execute([
                $userId,
                $firstName,
                $lastName,
                trim($input['cedula'] ?? '') ?: null,
                trim($input['phone'] ?? '') ?: null,
                trim($input['specialty'] ?? '') ?: null,
                trim($input['institution'] ?? '') ?: null,
                trim($input['city'] ?? '') ?: null,
                trim($input['state'] ?? '') ?: null,
            ]);

            $db->commit();

            respond([
                'id'         => $userId,
                'email'      => $email,
                'role'       => $role,
                'first_name' => $firstName,
                'last_name'  => $lastName,
            ], 201);

        } catch (PDOException $e) {
            $db->rollBack();
            if (APP_DEBUG) {
                respondError('Error al crear usuario: ' . $e->getMessage(), 500);
            }
            respondError('Error al crear usuario', 500);
        }
        break;

    // ── UNKNOWN ACTION ───────────────────────
    default:
        respondError('Accion no valida', 400);
        break;
}
