<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function api_response(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function api_method(string ...$allowed): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        api_response(['error' => 'Method not allowed'], 405);
    }
}

function api_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $value = json_decode($raw, true);
    if (!is_array($value)) {
        api_response(['error' => 'Invalid JSON body'], 400);
    }
    return $value;
}

function api_config(): array
{
    $file = __DIR__ . '/config.php';
    if (!is_file($file)) {
        api_response(['error' => 'API is not configured. Copy config.example.php to config.php and enter database settings.'], 503);
    }
    return require $file;
}

function api_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = api_config();
    foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $key) {
        if (!isset($config[$key]) || $config[$key] === '' || $config[$key] === 'CHANGE_ME' || $config[$key] === 'CPANEL_DB_NAME' || $config[$key] === 'CPANEL_DB_USER') {
            api_response(['error' => 'Database configuration is incomplete. Update config.php.'], 503);
        }
    }

    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function api_bearer(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('getallheaders')) {
        $headers = getallheaders();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    return preg_match('/^Bearer\s+(.+)$/i', trim($header), $m) ? trim($m[1]) : null;
}

function api_user(): array
{
    $token = api_bearer();
    if (!$token) {
        api_response(['error' => 'Authentication required'], 401);
    }
    $stmt = api_db()->prepare(
        'SELECT u.id, u.username, u.display_name, u.avatar_url, u.birth_year, u.birth_calendar
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.expires_at > UTC_TIMESTAMP() LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) {
        api_response(['error' => 'Invalid or expired token'], 401);
    }
    return $user;
}

function api_public_user(array $user): array
{
    return [
        'id' => (string)$user['id'],
        'username' => $user['username'],
        'displayName' => $user['display_name'],
        'avatarUrl' => $user['avatar_url'] ?? null,
        'birthYear' => isset($user['birth_year']) ? ($user['birth_year'] === null ? null : (int)$user['birth_year']) : null,
        'birthCalendar' => $user['birth_calendar'] ?? null,
    ];
}

function api_login_demo(): never
{
    api_method('POST');
    $config = api_config();
    if (empty($config['demo_login_enabled'])) {
        api_response(['error' => 'Demo login is disabled'], 403);
    }

    $data = api_input();
    $username = trim((string)($data['username'] ?? ''));
    $displayName = trim((string)($data['displayName'] ?? $data['display_name'] ?? $username));

    if (!preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) {
        api_response(['error' => 'Username must be 3-32 letters, numbers, or underscores'], 422);
    }
    if ($displayName === '' || mb_strlen($displayName) > 60) {
        api_response(['error' => 'Display name must be 1-60 characters'], 422);
    }

    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        api_response(['error' => 'Username already exists. Choose a different demo username.'], 409);
    }

    $stmt = $pdo->prepare('INSERT INTO users (username, display_name) VALUES (?, ?)');
    $stmt->execute([$username, $displayName]);
    $userId = (int)$pdo->lastInsertId();

    $token = bin2hex(random_bytes(32));
    $days = max(1, min(30, (int)($config['token_expiry_days'] ?? 7)));
    $stmt = $pdo->prepare(
        'INSERT INTO api_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . $days . ' DAY))'
    );
    $stmt->execute([$userId, hash('sha256', $token)]);

    $stmt = $pdo->prepare('SELECT id, username, display_name, avatar_url, birth_year, birth_calendar FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    api_response([
        'token' => $token,
        'token_type' => 'Bearer',
        'expires_in' => $days * 86400,
        'user' => api_public_user($stmt->fetch()),
        'warning' => 'Demo sign-in is for testing only; it does not verify a phone number.'
    ], 201);
}

function api_get_me(): never
{
    api_method('GET');
    api_response(['user' => api_public_user(api_user())]);
}

function api_update_profile(): never
{
    api_method('PATCH', 'POST');
    $user = api_user();
    $data = api_input();
    $sets = [];
    $values = [];

    if (array_key_exists('displayName', $data) || array_key_exists('display_name', $data)) {
        $name = trim((string)($data['displayName'] ?? $data['display_name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 60) {
            api_response(['error' => 'Invalid display name'], 422);
        }
        $sets[] = 'display_name = ?';
        $values[] = $name;
    }

    if (array_key_exists('username', $data)) {
        $username = trim((string)$data['username']);
        if (!preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) {
            api_response(['error' => 'Invalid username'], 422);
        }
        $sets[] = 'username = ?';
        $values[] = $username;
    }

    if (array_key_exists('avatarUrl', $data) || array_key_exists('avatar_url', $data)) {
        $avatar = array_key_exists('avatarUrl', $data) ? $data['avatarUrl'] : $data['avatar_url'];
        if ($avatar !== null && (!is_string($avatar) || strlen($avatar) > 2048 || !filter_var($avatar, FILTER_VALIDATE_URL) || strtolower((string)parse_url($avatar, PHP_URL_SCHEME)) !== 'https')) {
            api_response(['error' => 'Avatar URL must be HTTPS or null'], 422);
        }
        $sets[] = 'avatar_url = ?';
        $values[] = $avatar;
    }

    if (array_key_exists('birthYear', $data) || array_key_exists('birth_year', $data)) {
        $year = array_key_exists('birthYear', $data) ? $data['birthYear'] : $data['birth_year'];
        if ($year !== null && (!is_numeric($year) || (int)$year < 1300 || (int)$year > (int)gmdate('Y'))) {
            api_response(['error' => 'Invalid birth year'], 422);
        }
        $sets[] = 'birth_year = ?';
        $values[] = $year === null ? null : (int)$year;
    }

    if (array_key_exists('birthCalendar', $data) || array_key_exists('birth_calendar', $data)) {
        $calendar = array_key_exists('birthCalendar', $data) ? $data['birthCalendar'] : $data['birth_calendar'];
        if ($calendar !== null && !in_array($calendar, ['solar_hijri', 'gregorian'], true)) {
            api_response(['error' => 'Invalid birth calendar'], 422);
        }
        $sets[] = 'birth_calendar = ?';
        $values[] = $calendar;
    }

    if (!$sets) {
        api_response(['error' => 'No profile fields supplied'], 422);
    }

    $values[] = $user['id'];
    try {
        api_db()->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($values);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            api_response(['error' => 'Username is already taken'], 409);
        }
        throw $e;
    }

    $stmt = api_db()->prepare('SELECT id, username, display_name, avatar_url, birth_year, birth_calendar FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    api_response(['user' => api_public_user($stmt->fetch())]);
}

function api_logout(): never
{
    api_method('POST');
    $user = api_user();
    $token = api_bearer();
    $stmt = api_db()->prepare('DELETE FROM api_tokens WHERE user_id = ? AND token_hash = ?');
    $stmt->execute([$user['id'], hash('sha256', (string)$token)]);
    api_response(['success' => true]);
}

function api_list_conversations(): never
{
    api_method('GET');
    $user = api_user();
    $stmt = api_db()->prepare(
        'SELECT c.id, c.title, c.description, c.type, c.created_by, c.created_at,
                cm.role,
                (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) AS last_message_at
         FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
         WHERE cm.user_id = ?
         ORDER BY COALESCE(last_message_at, c.created_at) DESC'
    );
    $stmt->execute([$user['id']]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (string)$row['id'],
            'kind' => $row['type'] === 'private' ? 'direct' : $row['type'],
            'type' => $row['type'],
            'title' => $row['title'] ?? '',
            'description' => $row['description'] ?? null,
            'role' => $row['role'],
            'createdBy' => (string)$row['created_by'],
            'lastMessage' => $row['last_message'],
            'lastMessageAt' => $row['last_message_at'],
        ];
    }
    api_response(['conversations' => $items]);
}

function api_create_conversation(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $type = (string)($data['type'] ?? 'group');
    $title = trim((string)($data['title'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));

    if (!in_array($type, ['group', 'channel'], true)) {
        api_response(['error' => 'Type must be group or channel'], 422);
    }
    if ($title === '' || mb_strlen($title) > 100) {
        api_response(['error' => 'Title must be 1-100 characters'], 422);
    }
    if (mb_strlen($description) > 280) {
        api_response(['error' => 'Description is too long'], 422);
    }

    $pdo = api_db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO conversations (title, description, type, created_by) VALUES (?, ?, ?, ?)');
        $stmt->execute([$title, $description === '' ? null : $description, $type, $user['id']]);
        $id = (int)$pdo->lastInsertId();
        $role = $type === 'channel' ? 'owner' : 'owner';
        $stmt = $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)');
        $stmt->execute([$id, $user['id'], $role]);
        $pdo->commit();

        api_response([
            'success' => true,
            'conversation' => [
                'id' => (string)$id,
                'kind' => $type,
                'type' => $type,
                'title' => $title,
                'description' => $description === '' ? null : $description,
                'role' => 'owner'
            ]
        ], 201);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function api_conversation_members(): never
{
    api_method('GET');
    $user = api_user();
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
    if (!$id || $id < 1) {
        api_response(['error' => 'Valid conversation id required'], 422);
    }
    $stmt = api_db()->prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        api_response(['error' => 'Conversation not found'], 404);
    }
    $stmt = api_db()->prepare(
        'SELECT u.id, u.username, u.display_name, u.avatar_url, cm.role
         FROM conversation_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.conversation_id = ? ORDER BY cm.joined_at ASC'
    );
    $stmt->execute([$id]);
    $members = [];
    foreach ($stmt->fetchAll() as $row) {
        $members[] = [
            'id' => (string)$row['id'],
            'username' => $row['username'],
            'displayName' => $row['display_name'],
            'avatarUrl' => $row['avatar_url'],
            'role' => $row['role'],
        ];
    }
    api_response(['members' => $members]);
}

function api_require_membership(int $conversationId, int $userId): array
{
    $stmt = api_db()->prepare(
        'SELECT c.id, c.type, cm.role FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id
         WHERE c.id = ? AND cm.user_id = ? LIMIT 1'
    );
    $stmt->execute([$conversationId, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        api_response(['error' => 'Conversation not found'], 404);
    }
    return $row;
}

function api_send_message(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $conversationId = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $body = trim((string)($data['body'] ?? ''));
    $config = api_config();
    $max = max(1, min(4000, (int)($config['max_message_length'] ?? 4000)));

    if (!$conversationId || $conversationId < 1) {
        api_response(['error' => 'Invalid conversation_id'], 422);
    }
    if ($body === '' || mb_strlen($body) > $max) {
        api_response(['error' => 'Message is empty or too long'], 422);
    }

    $membership = api_require_membership((int)$conversationId, (int)$user['id']);
    if ($membership['type'] === 'channel' && !in_array($membership['role'], ['owner', 'admin'], true)) {
        api_response(['error' => 'Only channel admins can publish messages'], 403);
    }

    $stmt = api_db()->prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)');
    $stmt->execute([$conversationId, $user['id'], $body]);
    $id = (int)api_db()->lastInsertId();

    $stmt = api_db()->prepare(
        'SELECT m.id, m.conversation_id, m.sender_id, u.username, u.display_name, m.body, m.created_at
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    api_response(['message' => [
        'id' => (string)$row['id'],
        'conversationId' => (string)$row['conversation_id'],
        'senderId' => (string)$row['sender_id'],
        'username' => $row['username'],
        'displayName' => $row['display_name'],
        'body' => $row['body'],
        'createdAt' => $row['created_at'],
    ]], 201);
}

function api_get_messages(): never
{
    api_method('GET');
    $user = api_user();
    $conversationId = filter_input(INPUT_GET, 'conversation_id', FILTER_VALIDATE_INT);
    if (!$conversationId || $conversationId < 1) {
        api_response(['error' => 'Valid conversation_id required'], 422);
    }
    api_require_membership((int)$conversationId, (int)$user['id']);

    $limit = filter_input(INPUT_GET, 'limit', FILTER_VALIDATE_INT);
    $limit = max(1, min(100, $limit ?: 50));
    $beforeId = filter_input(INPUT_GET, 'before_id', FILTER_VALIDATE_INT);

    if ($beforeId && $beforeId > 0) {
        $stmt = api_db()->prepare(
            'SELECT m.id, m.conversation_id, m.sender_id, u.username, u.display_name, m.body, m.created_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ? AND m.id < ? AND m.deleted_at IS NULL
             ORDER BY m.id DESC LIMIT ' . $limit
        );
        $stmt->execute([$conversationId, $beforeId]);
    } else {
        $stmt = api_db()->prepare(
            'SELECT m.id, m.conversation_id, m.sender_id, u.username, u.display_name, m.body, m.created_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ? AND m.deleted_at IS NULL
             ORDER BY m.id DESC LIMIT ' . $limit
        );
        $stmt->execute([$conversationId]);
    }

    $messages = [];
    foreach (array_reverse($stmt->fetchAll()) as $row) {
        $messages[] = [
            'id' => (string)$row['id'],
            'conversationId' => (string)$row['conversation_id'],
            'senderId' => (string)$row['sender_id'],
            'username' => $row['username'],
            'displayName' => $row['display_name'],
            'body' => $row['body'],
            'createdAt' => $row['created_at'],
        ];
    }
    api_response(['messages' => $messages]);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/', '/');
$path = preg_replace('#^api/?#', '', $path);
$path = trim($path, '/');

try {
    if ($path === '' || $path === 'health') {
        api_method('GET');
        api_response(['ok' => true, 'service' => 'vatanmsg-php-api', 'version' => '1.0.0']);
    }

    switch ($path) {
        case 'auth/demo':
            api_login_demo();
            break;
        case 'auth/me':
            api_get_me();
            break;
        case 'auth/profile':
            api_update_profile();
            break;
        case 'auth/logout':
            api_logout();
            break;
        case 'conversations':
            if ($method === 'POST') {
                api_create_conversation();
            }
            api_list_conversations();
            break;
        case 'conversations/members':
            api_conversation_members();
            break;
        case 'messages':
            if ($method === 'POST') {
                api_send_message();
            }
            api_get_messages();
            break;
        default:
            api_response(['error' => 'Endpoint not found'], 404);
    }
} catch (PDOException $e) {
    error_log('VatanMSG API database error: ' . $e->getMessage());
    api_response(['error' => 'Database error. Check API config and schema.'], 500);
} catch (Throwable $e) {
    error_log('VatanMSG API error: ' . $e->getMessage());
    api_response(['error' => 'Internal server error'], 500);
}
