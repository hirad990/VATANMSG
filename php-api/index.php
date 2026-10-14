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
    
function api_search_users(): never
{
    api_method('GET');
    $user = api_user();
    $query = trim((string)($_GET['q'] ?? ''));
    if (mb_strlen($query) < 2 || mb_strlen($query) > 32) {
        api_response(['users' => []]);
    }
    $like = '%' . addcslashes($query, '%_\\\\') . '%';
    $stmt = api_db()->prepare(
        'SELECT id, username, display_name, avatar_url
         FROM users
         WHERE id <> ? AND (username LIKE ? OR display_name LIKE ?)
         ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, display_name ASC
         LIMIT 30'
    );
    $stmt->execute([$user['id'], $like, $like, $query]);
    $users = [];
    foreach ($stmt->fetchAll() as $row) {
        $users[] = [
            'id' => (string)$row['id'],
            'username' => $row['username'],
            'displayName' => $row['display_name'],
            'avatarUrl' => $row['avatar_url'],
        ];
    }
    api_response(['users' => $users]);
}

function api_create_direct_conversation(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $username = trim((string)($data['username'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) {
        api_response(['error' => 'Enter a valid username'], 422);
    }

    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) {
        api_response(['error' => 'User not found'], 404);
    }
    $targetId = (int)$target['id'];
    if ($targetId === (int)$user['id']) {
        api_response(['error' => 'You cannot start a chat with yourself'], 422);
    }

    $stmt = $pdo->prepare(
        "SELECT c.id FROM conversations c
         JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
         JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
         WHERE c.type = 'private'
         LIMIT 1"
    );
    $stmt->execute([$user['id'], $targetId]);
    $existing = $stmt->fetch();
    if ($existing) {
        api_response(['success' => true, 'conversation' => api_direct_summary((int)$existing['id'], (int)$user['id'])]);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("INSERT INTO conversations (title, description, type, created_by) VALUES (NULL, NULL, 'private', ?)");
        $stmt->execute([$user['id']]);
        $id = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member'), (?, ?, 'member')");
        $stmt->execute([$id, $user['id'], $id, $targetId]);
        $pdo->commit();
        api_response(['success' => true, 'conversation' => api_direct_summary($id, (int)$user['id'])], 201);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function api_direct_summary(int $conversationId, int $currentUserId): array
{
    $stmt = api_db()->prepare(
        "SELECT c.id, c.type, c.created_at,
                other.id AS other_id, other.username AS other_username,
                other.display_name AS other_display_name, other.avatar_url AS other_avatar_url
         FROM conversations c
         JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ?
         JOIN conversation_members them ON them.conversation_id = c.id AND them.user_id <> ?
         JOIN users other ON other.id = them.user_id
         WHERE c.id = ? AND c.type = 'private' LIMIT 1"
    );
    $stmt->execute([$currentUserId, $currentUserId, $conversationId]);
    $row = $stmt->fetch();
    if (!$row) api_response(['error' => 'Conversation not found'], 404);
    return [
        'id' => (string)$row['id'], 'kind' => 'direct', 'type' => 'private',
        'title' => $row['other_display_name'], 'description' => null,
        'otherUser' => [
            'id' => (string)$row['other_id'], 'username' => $row['other_username'],
            'displayName' => $row['other_display_name'], 'avatarUrl' => $row['other_avatar_url']
        ]
    ];
}

function api_join_conversation(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid conversation_id required'], 422);
    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id, type FROM conversations WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $conversation = $stmt->fetch();
    if (!$conversation || $conversation['type'] === 'private') api_response(['error' => 'Group or channel not found'], 404);
    $stmt = $pdo->prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    $stmt->execute([$id, $user['id']]);
    if ($stmt->fetch()) api_response(['success' => true, 'alreadyMember' => true]);
    $role = $conversation['type'] === 'channel' ? 'subscriber' : 'member';
    $stmt = $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)');
    $stmt->execute([$id, $user['id'], $role]);
    api_response(['success' => true, 'alreadyMember' => false], 201);
}

function api_leave_conversation(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid conversation_id required'], 422);
    $membership = api_require_membership((int)$id, (int)$user['id']);
    if ($membership['role'] === 'owner') api_response(['error' => 'Transfer ownership or delete the conversation before leaving'], 409);
    $stmt = api_db()->prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    $stmt->execute([$id, $user['id']]);
    api_response(['success' => true]);
}

function api_add_conversation_member(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $username = trim((string)($data['username'] ?? ''));
    if (!$id || $id < 1 || !preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) {
        api_response(['error' => 'Valid conversation_id and username required'], 422);
    }
    $membership = api_require_membership((int)$id, (int)$user['id']);
    if (!in_array($membership['role'], ['owner', 'admin'], true)) api_response(['error' => 'Only owners and admins can add members'], 403);
    $stmt = api_db()->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) api_response(['error' => 'User not found'], 404);
    if ((int)$target['id'] === (int)$user['id']) api_response(['error' => 'You are already a member'], 409);
    $stmt = api_db()->prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    $stmt->execute([$id, $target['id']]);
    if ($stmt->fetch()) api_response(['error' => 'User is already a member'], 409);
    $role = $membership['type'] === 'channel' ? 'subscriber' : 'member';
    $stmt = api_db()->prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)');
    $stmt->execute([$id, $target['id'], $role]);
    api_response(['success' => true], 201);
}

function api_edit_message(): never
{
    api_method('PATCH', 'POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);
    $body = trim((string)($data['body'] ?? ''));
    $max = max(1, min(4000, (int)(api_config()['max_message_length'] ?? 4000)));
    if (!$id || $id < 1 || $body === '' || mb_strlen($body) > $max) api_response(['error' => 'Valid message_id and body required'], 422);
    $stmt = api_db()->prepare('SELECT id, conversation_id, sender_id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id]);
    $message = $stmt->fetch();
    if (!$message) api_response(['error' => 'Message not found'], 404);
    api_require_membership((int)$message['conversation_id'], (int)$user['id']);
    if ((int)$message['sender_id'] !== (int)$user['id']) api_response(['error' => 'You can only edit your own messages'], 403);
    $stmt = api_db()->prepare('UPDATE messages SET body = ?, edited_at = UTC_TIMESTAMP() WHERE id = ?');
    $stmt->execute([$body, $id]);
    api_response(['success' => true, 'message' => api_message_by_id((int)$id)]);
}

function api_delete_message(): never
{
    api_method('POST', 'DELETE');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['message_id'] ?? $_GET['message_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid message_id required'], 422);
    $stmt = api_db()->prepare('SELECT id, conversation_id, sender_id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id]);
    $message = $stmt->fetch();
    if (!$message) api_response(['error' => 'Message not found'], 404);
    $membership = api_require_membership((int)$message['conversation_id'], (int)$user['id']);
    if ((int)$message['sender_id'] !== (int)$user['id'] && !in_array($membership['role'], ['owner', 'admin'], true)) {
        api_response(['error' => 'You cannot delete this message'], 403);
    }
    $stmt = api_db()->prepare('UPDATE messages SET deleted_at = UTC_TIMESTAMP(), body = ? WHERE id = ?');
    $stmt->execute(['', $id]);
    api_response(['success' => true]);
}

function api_message_by_id(int $id): array
{
    $stmt = api_db()->prepare(
        'SELECT m.id, m.conversation_id, m.sender_id, u.username, u.display_name, m.body, m.created_at, m.edited_at
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) api_response(['error' => 'Message not found'], 404);
    return [
        'id' => (string)$row['id'], 'conversationId' => (string)$row['conversation_id'],
        'senderId' => (string)$row['sender_id'], 'username' => $row['username'],
        'displayName' => $row['display_name'], 'body' => $row['body'],
        'createdAt' => $row['created_at'], 'editedAt' => $row['edited_at']
    ];
}


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
        'SELECT c.id, c.title,
                (SELECT u.display_name FROM conversation_members cm2 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id <> cm.user_id LIMIT 1) AS direct_title,
                c.description, c.type, c.created_by, c.created_at,
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
            'title' => $row['title'] ?? $row['direct_title'] ?? '',
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
            'SELECT m.id, m.conversation_id, m.sender_id, u.username, u.display_name, m.body, m.created_at, m.edited_at
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
            'editedAt' => $row['edited_at'] ?? null,
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
        api_db()->query('SELECT 1');
        api_response(['ok' => true, 'database' => true, 'service' => 'vatanmsg-php-api', 'version' => '1.1.0']);
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
        case 'users/search':
            api_search_users();
            break;
        case 'conversations/direct':
            api_create_direct_conversation();
            break;
        case 'conversations/join':
            api_join_conversation();
            break;
        case 'conversations/leave':
            api_leave_conversation();
            break;
        case 'conversations/add-member':
            api_add_conversation_member();
            break;
        case 'conversations/members':
            api_conversation_members();
            break;
        case 'messages/edit':
            api_edit_message();
            break;
        case 'messages/delete':
            api_delete_message();
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
