<?php
/**
 * SVC App — News/Announcements API with Comments
 */

ini_set('display_errors', 0);
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/news_error.log');

require_once __DIR__ . '/config/db.php';

$action = $_GET['action'] ?? '';
$method = getMethod();
$db = getDB();

// Auto-create tables
$db->query("CREATE TABLE IF NOT EXISTS news (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    image_url VARCHAR(500) DEFAULT NULL,
    category ENUM('anuncio','comunicado','convocatoria','reconocimiento') NOT NULL DEFAULT 'anuncio',
    is_pinned TINYINT(1) NOT NULL DEFAULT 0,
    is_published TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT UNSIGNED NOT NULL,
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$db->query("CREATE TABLE IF NOT EXISTS news_comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    news_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    comment VARCHAR(300) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nc_news (news_id),
    INDEX idx_nc_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

switch ($action) {

    // ── PUBLIC: List published news ─────────
    case '':
    case 'list':
        if ($method !== 'GET') respondError('Method not allowed', 405);

        $limit = min(20, max(1, (int)($_GET['limit'] ?? 10)));
        $stmt = $db->prepare("
            SELECT n.*, u_author.email as author_email,
                   m_author.first_name as author_first_name, m_author.last_name as author_last_name,
                   (SELECT COUNT(*) FROM news_comments nc WHERE nc.news_id = n.id) as comment_count
            FROM news n
            JOIN users u_author ON u_author.id = n.created_by
            LEFT JOIN members m_author ON m_author.user_id = n.created_by
            WHERE n.is_published = 1
              AND (n.expires_at IS NULL OR n.expires_at > NOW())
            ORDER BY n.is_pinned DESC, n.published_at DESC
            LIMIT ?
        ");
        $stmt->execute([$limit]);
        respond($stmt->fetchAll());
        break;

    // ── PUBLIC: Get single news with comments ──
    case 'get':
        if ($method !== 'GET') respondError('Method not allowed', 405);
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $stmt = $db->prepare("
            SELECT n.*, m_author.first_name as author_first_name, m_author.last_name as author_last_name
            FROM news n
            LEFT JOIN members m_author ON m_author.user_id = n.created_by
            WHERE n.id = ?
        ");
        $stmt->execute([$id]);
        $news = $stmt->fetch();
        if (!$news) respondError('Noticia no encontrada', 404);

        // Get comments with user info
        $cStmt = $db->prepare("
            SELECT nc.*, m.first_name, m.last_name, m.specialty
            FROM news_comments nc
            LEFT JOIN members m ON m.user_id = nc.user_id
            WHERE nc.news_id = ?
            ORDER BY nc.created_at ASC
        ");
        $cStmt->execute([$id]);
        $news['comments'] = $cStmt->fetchAll();

        respond($news);
        break;

    // ── AUTH: Add comment ───────────────────
    case 'comment':
        if ($method !== 'POST') respondError('Method not allowed', 405);
        $auth = requireAuth();
        $input = getInput();

        $newsId = (int)($input['news_id'] ?? 0);
        $comment = trim($input['comment'] ?? '');

        if (!$newsId) respondError('news_id requerido', 400);
        if (!$comment) respondError('Comentario requerido', 400);
        if (strlen($comment) > 300) respondError('Comentario muy largo (máx 300 caracteres)', 400);

        // Verify news exists
        $stmt = $db->prepare('SELECT id FROM news WHERE id = ? AND is_published = 1');
        $stmt->execute([$newsId]);
        if (!$stmt->fetch()) respondError('Noticia no encontrada', 404);

        $stmt = $db->prepare('INSERT INTO news_comments (news_id, user_id, comment) VALUES (?, ?, ?)');
        $stmt->execute([$newsId, (int)$auth['sub'], $comment]);

        $commentId = (int)$db->lastInsertId();

        // Get commenter info
        $mStmt = $db->prepare('SELECT first_name, last_name, specialty FROM members WHERE user_id = ?');
        $mStmt->execute([(int)$auth['sub']]);
        $member = $mStmt->fetch();

        respond([
            'id' => $commentId,
            'comment' => $comment,
            'first_name' => $member['first_name'] ?? '',
            'last_name' => $member['last_name'] ?? '',
            'specialty' => $member['specialty'] ?? '',
            'created_at' => date('Y-m-d H:i:s'),
        ], 201);
        break;

    // ── ADMIN: Delete comment ───────────────
    case 'delete_comment':
        if ($method !== 'DELETE') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $commentId = (int)($_GET['id'] ?? 0);
        if (!$commentId) respondError('ID requerido', 400);

        $db->prepare('DELETE FROM news_comments WHERE id = ?')->execute([$commentId]);
        respond(['deleted' => true]);
        break;

    // ── ADMIN: Create news ─────────────────
    case 'create':
        if ($method !== 'POST') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();

        $title = trim($input['title'] ?? '');
        $body = trim($input['body'] ?? '');
        if (!$title) respondError('Título requerido', 400);
        if (!$body) respondError('Texto requerido', 400);

        $stmt = $db->prepare('
            INSERT INTO news (title, body, image_url, category, is_pinned, is_published, created_by, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $title, $body,
            trim($input['image_url'] ?? '') ?: null,
            $input['category'] ?? 'anuncio',
            (int)($input['is_pinned'] ?? 0),
            (int)($input['is_published'] ?? 1),
            (int)$auth['sub'],
            !empty($input['expires_at']) ? $input['expires_at'] : null,
        ]);

        respond(['id' => (int)$db->lastInsertId()], 201);
        break;

    // ── ADMIN: Update news ─────────────────
    case 'update':
        if ($method !== 'PUT') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $input = getInput();
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $allowed = ['title', 'body', 'image_url', 'category', 'is_pinned', 'is_published', 'expires_at'];
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
        $db->prepare("UPDATE news SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        respond(['updated' => true]);
        break;

    // ── ADMIN: Delete news ─────────────────
    case 'delete':
        if ($method !== 'DELETE') respondError('Method not allowed', 405);
        $auth = requireAuth('admin', 'superadmin');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) respondError('ID requerido', 400);

        $db->prepare('DELETE FROM news_comments WHERE news_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM news WHERE id = ?')->execute([$id]);
        respond(['deleted' => true]);
        break;

    default:
        respondError('Acción no válida', 400);
}
