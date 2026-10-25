<?php
declare(strict_types=1);

// CORS: allow the local Expo web dev server and the production web app.
$allowedOrigins = [
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'https://binercraft.ir',
    'https://www.binercraft.ir',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');

// Preflight must exit before routing/authentication.
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

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
        'SELECT u.id, u.username, u.display_name, u.avatar_url
         FROM users u LEFT JOIN user_privacy_settings ps ON ps.user_id = u.id
         WHERE u.id <> ? AND COALESCE(ps.profile_visibility, \'everyone\') <> \'nobody\'
           AND (u.username LIKE ? OR u.display_name LIKE ?)
         ORDER BY CASE WHEN u.username = ? THEN 0 ELSE 1 END, u.display_name ASC
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

function api_get_user_profile(): never
{
    api_method('GET');
    $viewer = api_user();
    $username = trim((string)($_GET['username'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) api_response(['error' => 'Valid username required'], 422);
    $stmt = api_db()->prepare(
        "SELECT u.id, u.username, u.display_name, u.avatar_url, u.birth_year, u.birth_calendar, u.phone_e164,
                COALESCE(ps.phone_visibility, 'nobody') AS phone_visibility,
                COALESCE(ps.profile_visibility, 'everyone') AS profile_visibility
         FROM users u LEFT JOIN user_privacy_settings ps ON ps.user_id = u.id
         WHERE u.username = ? LIMIT 1"
    );
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) api_response(['error' => 'User not found'], 404);
    $isSelf = (int)$target['id'] === (int)$viewer['id'];
    // Contacts-only stays private until the app has a verifiable contacts list.
    if (!$isSelf && $target['profile_visibility'] !== 'everyone') api_response(['error' => 'This profile is not public'], 404);
    $phone = ($isSelf || $target['phone_visibility'] === 'everyone') ? ($target['phone_e164'] ?: null) : null;
    api_response(['user' => api_public_user($target), 'phoneNumber' => $phone]);
}

function api_resolve_identifier(): never
{
    api_method('GET');
    api_user();
    $query = trim((string)($_GET['q'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_]{1,32}$/', $query)) api_response(['users' => [], 'channels' => []]);
    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$query]);
    $users = [];
    foreach ($stmt->fetchAll() as $row) $users[] = ['id' => (string)$row['id'], 'username' => $row['username'], 'displayName' => $row['display_name'], 'avatarUrl' => $row['avatar_url']];
    $stmt = $pdo->prepare("SELECT id, title, channel_id, description, avatar_url FROM conversations WHERE type = 'channel' AND channel_id = ? LIMIT 1");
    $stmt->execute([$query]);
    $channels = [];
    foreach ($stmt->fetchAll() as $row) $channels[] = ['id' => (string)$row['id'], 'kind' => 'channel', 'title' => $row['title'], 'channelId' => $row['channel_id'], 'description' => $row['description'], 'avatarUrl' => $row['avatar_url']];
    api_response(['users' => $users, 'channels' => $channels]);
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
    $stmt = $pdo->prepare("SELECT u.id, COALESCE(ps.profile_visibility, 'everyone') AS profile_visibility FROM users u LEFT JOIN user_privacy_settings ps ON ps.user_id = u.id WHERE u.username = ? LIMIT 1");
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) {
        api_response(['error' => 'User not found'], 404);
    }
    if (($target['profile_visibility'] ?? 'everyone') === 'nobody') api_response(['error' => 'This user is not accepting new private chats'], 404);
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

function api_delete_conversation(): never
{
    api_method('DELETE', 'POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['conversation_id'] ?? $_GET['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid conversation_id required'], 422);

    $membership = api_require_membership((int)$id, (int)$user['id']);
    if ($membership['type'] === 'private') api_response(['error' => 'Private conversations cannot be deleted here'], 422);
    if ($membership['role'] !== 'owner') api_response(['error' => 'Only the conversation owner can delete it'], 403);

    // Conversation foreign keys cascade to members and messages.
    $stmt = api_db()->prepare('DELETE FROM conversations WHERE id = ?');
    $stmt->execute([$id]);
    api_response(['success' => true]);
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
    $canInvite = in_array($membership['role'], ['owner', 'admin'], true);
    if (!$canInvite && $membership['type'] === 'group') {
        $setting = api_db()->prepare('SELECT member_can_invite FROM conversation_settings WHERE conversation_id = ?');
        $setting->execute([$id]);
        $canInvite = (bool)$setting->fetchColumn();
    }
    if (!$canInvite) api_response(['error' => 'You do not have permission to add members'], 403);
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
        'SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.client_message_id, u.username, u.display_name, u.avatar_url, m.body, m.created_at, m.edited_at
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) api_response(['error' => 'Message not found'], 404);
    return [
        'id' => (string)$row['id'], 'conversationId' => (string)$row['conversation_id'],
        'senderId' => (string)$row['sender_id'], 'username' => $row['username'],
        'displayName' => $row['display_name'], 'avatarUrl' => $row['avatar_url'] ?? null,
        'replyToId' => isset($row['reply_to_id']) && $row['reply_to_id'] !== null ? (string)$row['reply_to_id'] : null,
        'clientMessageId' => $row['client_message_id'] ?? null, 'body' => $row['body'],
        'createdAt' => $row['created_at'], 'editedAt' => $row['edited_at'], 'attachments' => api_message_attachments((int)$row['id']), 'readCount' => api_message_receipt_counts((int)$row['id'])['readCount'], 'deliveredCount' => api_message_receipt_counts((int)$row['id'])['deliveredCount']
    ];
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
    try { api_db()->prepare('UPDATE api_tokens SET last_seen_at = UTC_TIMESTAMP(), ip_address = ?, user_agent = ? WHERE token_hash = ?')->execute([substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255), hash('sha256', $token)]); } catch (PDOException $e) { /* Older installations need upgrade-v2.1.sql for session metadata. */ }
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


function api_issue_auth_token(int $userId, array $config): string
{
    $token = bin2hex(random_bytes(32));
    $days = max(1, min(365, (int)($config['token_expiry_days'] ?? 90)));
    try {
        $stmt = api_db()->prepare('INSERT INTO api_tokens (user_id, token_hash, expires_at, ip_address, user_agent, last_seen_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . $days . ' DAY), ?, ?, UTC_TIMESTAMP())');
        $stmt->execute([$userId, hash('sha256', $token), substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
    } catch (PDOException $e) {
        $stmt = api_db()->prepare('INSERT INTO api_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . $days . ' DAY))');
        $stmt->execute([$userId, hash('sha256', $token)]);
    }
    return $token;
}

function api_register_account(): never
{
    api_method('POST');
    $data = api_input();
    $username = trim((string)($data['username'] ?? ''));
    $displayName = trim((string)($data['displayName'] ?? $data['display_name'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if (!preg_match('/^[A-Za-z0-9_]{3,32}$/', $username)) {
        api_response(['error' => 'نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا _ باشد.'], 422);
    }
    if ($displayName === '' || mb_strlen($displayName) > 60) {
        api_response(['error' => 'نام نمایشی باید بین ۱ تا ۶۰ نویسه باشد.'], 422);
    }
    if (strlen($password) < 8 || strlen($password) > 72) {
        api_response(['error' => 'رمز عبور باید حداقل ۸ و حداکثر ۷۲ بایت باشد.'], 422);
    }

    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetch()) api_response(['error' => 'این نام کاربری قبلاً ثبت شده است.'], 409);

    $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)');
    $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $displayName]);
    $userId = (int)$pdo->lastInsertId();
    $token = api_issue_auth_token($userId, api_config());

    $stmt = $pdo->prepare('SELECT id, username, display_name, avatar_url, birth_year, birth_calendar FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    api_response(['success' => true, 'token' => $token, 'user' => api_public_user($stmt->fetch())], 201);
}

function api_login_account(): never
{
    api_method('POST');
    $data = api_input();
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    if ($username === '' || $password === '') api_response(['error' => 'نام کاربری و رمز عبور را وارد کن.'], 422);

    $pdo = api_db();
    $usernameKey = mb_strtolower(mb_substr($username, 0, 64));
    $ipKey = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $attempts = $pdo->prepare('SELECT COUNT(*) FROM auth_login_attempts WHERE username_key = ? AND ip_key = ? AND was_successful = 0 AND attempted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)');
    $attempts->execute([$usernameKey, $ipKey]);
    if ((int)$attempts->fetchColumn() >= 10) {
        api_response(['error' => 'تلاش‌های ورود زیاد است؛ ۱۵ دقیقه دیگر دوباره امتحان کن.'], 429);
    }

    $stmt = $pdo->prepare('SELECT id, username, password_hash, display_name, avatar_url, birth_year, birth_calendar FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    if (!$user || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
        $pdo->prepare('INSERT INTO auth_login_attempts (username_key, ip_key, was_successful) VALUES (?, ?, 0)')->execute([$usernameKey, $ipKey]);
        api_response(['error' => 'نام کاربری یا رمز عبور اشتباه است.'], 401);
    }
    $pdo->prepare('INSERT INTO auth_login_attempts (username_key, ip_key, was_successful) VALUES (?, ?, 1)')->execute([$usernameKey, $ipKey]);
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $update->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    $token = api_issue_auth_token((int)$user['id'], api_config());
    api_response(['success' => true, 'token' => $token, 'user' => api_public_user($user)]);
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

function api_list_sessions(): never
{
    api_method('GET');
    $user = api_user();
    $currentHash = hash('sha256', (string)api_bearer());
    $stmt = api_db()->prepare('SELECT id, ip_address, user_agent, created_at, last_seen_at, expires_at, token_hash FROM api_tokens WHERE user_id = ? AND expires_at > UTC_TIMESTAMP() ORDER BY COALESCE(last_seen_at, created_at) DESC');
    $stmt->execute([$user['id']]);
    $sessions = [];
    foreach ($stmt->fetchAll() as $row) {
        $sessions[] = [
            'id' => (string)$row['id'],
            'ipAddress' => $row['ip_address'] ?? null,
            'userAgent' => $row['user_agent'] ?? null,
            'createdAt' => $row['created_at'],
            'lastSeenAt' => $row['last_seen_at'] ?? $row['created_at'],
            'expiresAt' => $row['expires_at'],
            'isCurrent' => hash_equals((string)$row['token_hash'], $currentHash),
            'location' => null
        ];
    }
    api_response(['sessions' => $sessions]);
}

function api_get_privacy_settings(): never
{
    api_method('GET');
    $user = api_user();
    $pdo = api_db();
    $pdo->prepare('INSERT IGNORE INTO user_privacy_settings (user_id) VALUES (?)')->execute([$user['id']]);
    $stmt = $pdo->prepare('SELECT phone_visibility, profile_visibility, last_seen_visibility, group_invite_visibility FROM user_privacy_settings WHERE user_id = ? LIMIT 1');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    api_response(['settings' => [
        'phone' => $row['phone_visibility'],
        'profile' => $row['profile_visibility'],
        'lastSeen' => $row['last_seen_visibility'],
        'invites' => $row['group_invite_visibility']
    ]]);
}

function api_update_privacy_settings(): never
{
    api_method('PATCH', 'POST');
    $user = api_user();
    $data = api_input();
    $allowed = ['everyone', 'contacts', 'nobody'];
    $values = [];
    foreach (['phone', 'profile', 'lastSeen', 'invites'] as $key) {
        $value = (string)($data[$key] ?? 'nobody');
        if (!in_array($value, $allowed, true)) api_response(['error' => 'Invalid privacy option'], 422);
        $values[$key] = $value;
    }
    $pdo = api_db();
    $stmt = $pdo->prepare('INSERT INTO user_privacy_settings (user_id, phone_visibility, profile_visibility, last_seen_visibility, group_invite_visibility) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE phone_visibility = VALUES(phone_visibility), profile_visibility = VALUES(profile_visibility), last_seen_visibility = VALUES(last_seen_visibility), group_invite_visibility = VALUES(group_invite_visibility)');
    $stmt->execute([$user['id'], $values['phone'], $values['profile'], $values['lastSeen'], $values['invites']]);
    api_response(['success' => true, 'settings' => $values]);
}

function api_delete_account(): never
{
    api_method('POST', 'DELETE');
    $user = api_user();
    $data = api_input();
    $password = (string)($data['password'] ?? '');
    $stmt = api_db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$user['id']]);
    $hash = (string)($stmt->fetchColumn() ?: '');
    if ($hash === '' || !password_verify($password, $hash)) api_response(['error' => 'Password confirmation failed'], 403);

    $pdo = api_db();
    $pdo->beginTransaction();
    try {
        $owned = $pdo->prepare("SELECT id FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ? AND role = 'owner')");
        $owned->execute([$user['id']]);
        foreach ($owned->fetchAll(PDO::FETCH_COLUMN) as $conversationId) {
            $other = $pdo->prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ? ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END, joined_at ASC LIMIT 1");
            $other->execute([$conversationId, $user['id']]);
            $newOwner = $other->fetchColumn();
            if ($newOwner) {
                $pdo->prepare("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?")->execute([$conversationId, $newOwner]);
                $pdo->prepare("UPDATE conversations SET created_by = ? WHERE id = ?")->execute([$newOwner, $conversationId]);
            } else {
                $pdo->prepare('DELETE FROM conversations WHERE id = ?')->execute([$conversationId]);
            }
        }

        $created = $pdo->prepare('SELECT id FROM conversations WHERE created_by = ?');
        $created->execute([$user['id']]);
        foreach ($created->fetchAll(PDO::FETCH_COLUMN) as $conversationId) {
            $other = $pdo->prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ? ORDER BY joined_at ASC LIMIT 1');
            $other->execute([$conversationId, $user['id']]);
            $replacement = $other->fetchColumn();
            if ($replacement) $pdo->prepare('UPDATE conversations SET created_by = ? WHERE id = ?')->execute([$replacement, $conversationId]);
            else $pdo->prepare('DELETE FROM conversations WHERE id = ?')->execute([$conversationId]);
        }

        $pdo->prepare('DELETE FROM messages WHERE sender_id = ?')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM conversation_members WHERE user_id = ?')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM api_tokens WHERE user_id = ?')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    api_response(['success' => true, 'accountDeleted' => true]);
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

function api_logout_all_sessions(): never
{
    api_method('POST');
    $user = api_user();
    api_db()->prepare('DELETE FROM api_tokens WHERE user_id = ?')->execute([$user['id']]);
    api_response(['success' => true, 'sessionsRevoked' => true]);
}

function api_list_conversations(): never
{
    api_method('GET');
    $user = api_user();
    $stmt = api_db()->prepare(
        'SELECT c.id, c.title, c.channel_id,
                (SELECT u.display_name FROM conversation_members cm2 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id <> cm.user_id LIMIT 1) AS direct_title,
                (SELECT u.avatar_url FROM conversation_members cm2 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id <> cm.user_id LIMIT 1) AS direct_avatar_url,
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
            'channelId' => $row['channel_id'] ?? null,
            'description' => $row['description'] ?? null,
            'role' => $row['role'],
            'avatarUrl' => $row['type'] === 'private' ? ($row['direct_avatar_url'] ?? null) : null,
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
    $channelId = strtolower(trim((string)($data['channel_id'] ?? '')));

    if (!in_array($type, ['group', 'channel'], true)) {
        api_response(['error' => 'Type must be group or channel'], 422);
    }
    if ($title === '' || mb_strlen($title) > 100) {
        api_response(['error' => 'Title must be 1-100 characters'], 422);
    }
    if (mb_strlen($description) > 280) {
        api_response(['error' => 'Description is too long'], 422);
    }
    if ($type === 'channel' && $channelId === '') api_response(['error' => 'Set a unique channel ID before creating the channel'], 422);
    if ($type === 'channel' && !preg_match('/^[a-zA-Z0-9_]{3,32}$/', $channelId)) api_response(['error' => 'Channel ID must be 3-32 letters, numbers or underscores'], 422);
    if ($type !== 'channel') $channelId = '';

    $pdo = api_db();
    if ($type === 'channel') {
        $check = $pdo->prepare('SELECT id FROM conversations WHERE channel_id = ? LIMIT 1');
        $check->execute([$channelId]);
        if ($check->fetch()) api_response(['error' => 'This channel ID is already in use'], 409);
    }
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO conversations (title, description, type, created_by, channel_id) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$title, $description === '' ? null : $description, $type, $user['id'], $channelId === '' ? null : $channelId]);
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
                'channelId' => $channelId === '' ? null : $channelId,
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
    $replyToId = isset($data['reply_to_id']) ? filter_var($data['reply_to_id'], FILTER_VALIDATE_INT) : null;
    $clientMessageId = trim((string)($data['client_message_id'] ?? ''));
    $config = api_config();
    $max = max(1, min(4000, (int)($config['max_message_length'] ?? 4000)));

    if (!$conversationId || $conversationId < 1) {
        api_response(['error' => 'Invalid conversation_id'], 422);
    }
    if ($body === '' || mb_strlen($body) > $max) {
        api_response(['error' => 'Message is empty or too long'], 422);
    }
    if ($clientMessageId !== '' && !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $clientMessageId)) api_response(['error' => 'Invalid client_message_id'], 422);
    if ($replyToId !== null && (!$replyToId || $replyToId < 1)) api_response(['error' => 'Invalid reply_to_id'], 422);

    $membership = api_require_membership((int)$conversationId, (int)$user['id']);
    if ($replyToId !== null) {
        $replyCheck = api_db()->prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL LIMIT 1');
        $replyCheck->execute([$replyToId, $conversationId]);
        if (!$replyCheck->fetch()) api_response(['error' => 'Reply target not found in this conversation'], 404);
    }
    if ($clientMessageId !== '') {
        $existing = api_db()->prepare('SELECT id FROM messages WHERE conversation_id = ? AND sender_id = ? AND client_message_id = ? LIMIT 1');
        $existing->execute([$conversationId, $user['id'], $clientMessageId]);
        if ($existingId = $existing->fetchColumn()) api_response(['message' => api_message_by_id((int)$existingId)], 200);
    }
    if ($membership['type'] === 'channel' && !in_array($membership['role'], ['owner', 'admin'], true)) {
        api_response(['error' => 'Only channel admins can publish messages'], 403);
    }
    if ($membership['type'] === 'group' && !in_array($membership['role'], ['owner', 'admin'], true)) {
        $setting = api_db()->prepare('SELECT member_can_send, slow_mode_seconds FROM conversation_settings WHERE conversation_id = ?');
        $setting->execute([$conversationId]);
        $groupSettings = $setting->fetch() ?: ['member_can_send' => 1, 'slow_mode_seconds' => 0];
        if (!(bool)$groupSettings['member_can_send']) api_response(['error' => 'Sending messages is disabled for members in this group'], 403);
        $slowMode = (int)$groupSettings['slow_mode_seconds'];
        if ($slowMode > 0) {
            $last = api_db()->prepare('SELECT created_at FROM messages WHERE conversation_id = ? AND sender_id = ? ORDER BY id DESC LIMIT 1');
            $last->execute([$conversationId, $user['id']]);
            $lastSent = $last->fetchColumn();
            if ($lastSent && strtotime((string)$lastSent . ' UTC') > time() - $slowMode) {
                api_response(['error' => 'Slow mode is enabled. Wait before sending another message.'], 429);
            }
        }
    }

    $stmt = api_db()->prepare('INSERT INTO messages (conversation_id, sender_id, reply_to_id, client_message_id, body) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$conversationId, $user['id'], $replyToId, $clientMessageId === '' ? null : $clientMessageId, $body]);
    $id = (int)api_db()->lastInsertId();

    $stmt = api_db()->prepare(
        'SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.client_message_id, u.username, u.display_name, u.avatar_url, m.body, m.created_at
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    api_dispatch_push_notification((int)$conversationId, (int)$user['id'], (string)$user['display_name'], $body);
    api_response(['message' => [
        'id' => (string)$row['id'],
        'conversationId' => (string)$row['conversation_id'],
        'senderId' => (string)$row['sender_id'],
        'username' => $row['username'],
        'displayName' => $row['display_name'],
        'avatarUrl' => $row['avatar_url'] ?? null,
        'replyToId' => isset($row['reply_to_id']) && $row['reply_to_id'] !== null ? (string)$row['reply_to_id'] : null,
        'clientMessageId' => $row['client_message_id'] ?? null,
        'body' => $row['body'],
        'createdAt' => $row['created_at'],
        'attachments' => api_message_attachments((int)$row['id']),
        'readCount' => api_message_receipt_counts((int)$row['id'])['readCount'],
        'deliveredCount' => api_message_receipt_counts((int)$row['id'])['deliveredCount']
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
            'SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.client_message_id, u.username, u.display_name, u.avatar_url, m.body, m.created_at, m.edited_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ? AND m.id < ? AND m.deleted_at IS NULL
             ORDER BY m.id DESC LIMIT ' . $limit
        );
        $stmt->execute([$conversationId, $beforeId]);
    } else {
        $stmt = api_db()->prepare(
            'SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.client_message_id, u.username, u.display_name, u.avatar_url, m.body, m.created_at
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
            'avatarUrl' => $row['avatar_url'] ?? null,
            'replyToId' => isset($row['reply_to_id']) && $row['reply_to_id'] !== null ? (string)$row['reply_to_id'] : null,
            'body' => $row['body'],
            'createdAt' => $row['created_at'],
            'editedAt' => $row['edited_at'] ?? null,
            'attachments' => api_message_attachments((int)$row['id']),
            'readCount' => api_message_receipt_counts((int)$row['id'])['readCount'],
            'deliveredCount' => api_message_receipt_counts((int)$row['id'])['deliveredCount']
        ];
    }
    api_response(['messages' => $messages]);
}


function api_update_conversation_settings(): never
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    api_method('GET', 'PATCH', 'POST');
    $user = api_user();
    $data = api_input();
    $id = filter_var($data['conversation_id'] ?? $_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid conversation_id required'], 422);
    $membership = api_require_membership((int)$id, (int)$user['id']);
    if ($membership['type'] === 'private') api_response(['error' => 'Group settings are unavailable for private chats'], 422);
    if ($method !== 'GET' && !in_array($membership['role'], ['owner', 'admin'], true)) {
        api_response(['error' => 'Only group owners/admins can manage group settings'], 403);
    }
    if ($method === 'GET') {
        $stmt = api_db()->prepare('SELECT c.id, c.title, c.channel_id, c.description, c.avatar_url, s.theme_key, s.theme_mode, s.member_can_send, s.member_can_invite, s.member_can_pin, s.slow_mode_seconds, s.show_signatures FROM conversations c LEFT JOIN conversation_settings s ON s.conversation_id = c.id WHERE c.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        api_response(['settings' => [
            'id' => (string)$row['id'], 'title' => $row['title'], 'channelId' => $row['channel_id'] ?? null, 'description' => $row['description'],
            'avatarUrl' => $row['avatar_url'], 'themeKey' => $row['theme_key'] ?? 'violet',
            'themeMode' => $row['theme_mode'] ?? 'system',
            'memberCanSend' => (bool)($row['member_can_send'] ?? 1),
            'memberCanInvite' => (bool)($row['member_can_invite'] ?? 0),
            'memberCanPin' => (bool)($row['member_can_pin'] ?? 0),
            'slowModeSeconds' => (int)($row['slow_mode_seconds'] ?? 0),
            'showSignatures' => (bool)($row['show_signatures'] ?? 0)
        ]]);
    }

    $sets = [];
    $values = [];
    if (array_key_exists('title', $data)) {
        $title = trim((string)$data['title']);
        if ($title === '' || mb_strlen($title) > 100) api_response(['error' => 'Title must be 1-100 characters'], 422);
        $sets[] = 'title = ?'; $values[] = $title;
    }
    if (array_key_exists('description', $data)) {
        $description = trim((string)$data['description']);
        if (mb_strlen($description) > 280) api_response(['error' => 'Description is too long'], 422);
        $sets[] = 'description = ?'; $values[] = $description === '' ? null : $description;
    }
    if (array_key_exists('channelId', $data)) {
        if ($membership['type'] !== 'channel') api_response(['error' => 'Only channels can have a channel ID'], 422);
        $channelId = strtolower(trim((string)$data['channelId']));
        if ($channelId === '' || !preg_match('/^[a-zA-Z0-9_]{3,32}$/', $channelId)) api_response(['error' => 'Channel ID must be 3-32 letters, numbers or underscores'], 422);
        if ($channelId !== '') {
            $check = api_db()->prepare('SELECT id FROM conversations WHERE channel_id = ? AND id <> ? LIMIT 1');
            $check->execute([$channelId, $id]);
            if ($check->fetch()) api_response(['error' => 'This channel ID is already in use'], 409);
        }
        $sets[] = 'channel_id = ?'; $values[] = $channelId === '' ? null : $channelId;
    }
    if (array_key_exists('avatarUrl', $data)) {
        $avatar = $data['avatarUrl'];
        if ($avatar !== null && (!is_string($avatar) || strlen($avatar) > 2048 || !filter_var($avatar, FILTER_VALIDATE_URL) || strtolower((string)parse_url($avatar, PHP_URL_SCHEME)) !== 'https')) {
            api_response(['error' => 'Group avatar must be an HTTPS URL or null'], 422);
        }
        $sets[] = 'avatar_url = ?'; $values[] = $avatar;
    }

    $settings = [];
    if (array_key_exists('themeKey', $data)) {
        $theme = (string)$data['themeKey'];
        if (!in_array($theme, ['violet','blue','green','rose','amber','midnight','ocean'], true)) api_response(['error' => 'Unsupported group theme'], 422);
        $settings['theme_key'] = $theme;
    }
    if (array_key_exists('themeMode', $data)) {
        $mode = (string)$data['themeMode'];
        if (!in_array($mode, ['light','dark','system'], true)) api_response(['error' => 'Invalid theme mode'], 422);
        $settings['theme_mode'] = $mode;
    }
    foreach (['memberCanSend' => 'member_can_send', 'memberCanInvite' => 'member_can_invite', 'memberCanPin' => 'member_can_pin'] as $input => $column) {
        if (array_key_exists($input, $data)) {
            if (!is_bool($data[$input]) && !in_array($data[$input], [0,1,'0','1'], true)) api_response(['error' => 'Invalid group permission'], 422);
            $settings[$column] = (int)(bool)$data[$input];
        }
    }
    if (array_key_exists('showSignatures', $data)) {
        if (!is_bool($data['showSignatures']) && !in_array($data['showSignatures'], [0,1,'0','1'], true)) api_response(['error' => 'Invalid signature setting'], 422);
        $settings['show_signatures'] = (int)(bool)$data['showSignatures'];
    }
    if (array_key_exists('slowModeSeconds', $data)) {
        $slow = filter_var($data['slowModeSeconds'], FILTER_VALIDATE_INT);
        if ($slow === false || $slow < 0 || $slow > 3600) api_response(['error' => 'Slow mode must be between 0 and 3600 seconds'], 422);
        $settings['slow_mode_seconds'] = $slow;
    }

    $pdo = api_db();
    if ($sets) {
        $values[] = $id;
        $pdo->prepare('UPDATE conversations SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($values);
    }
    if ($settings) {
        $columns = array_keys($settings);
        $insertColumns = array_merge(['conversation_id'], $columns);
        $placeholders = implode(', ', array_fill(0, count($insertColumns), '?'));
        $updates = implode(', ', array_map(fn($column) => $column . ' = VALUES(' . $column . ')', $columns));
        $values = array_merge([(int)$id], array_values($settings));
        $pdo->prepare('INSERT INTO conversation_settings (' . implode(', ', $insertColumns) . ') VALUES (' . $placeholders . ') ON DUPLICATE KEY UPDATE ' . $updates)->execute($values);
    }

    $stmt = $pdo->prepare('SELECT c.id, c.title, c.description, c.avatar_url, s.theme_key, s.theme_mode, s.member_can_send, s.member_can_invite, s.member_can_pin, s.slow_mode_seconds, s.show_signatures FROM conversations c LEFT JOIN conversation_settings s ON s.conversation_id = c.id WHERE c.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    api_response(['success' => true, 'settings' => [
        'id' => (string)$row['id'], 'title' => $row['title'], 'channelId' => $row['channel_id'] ?? null, 'description' => $row['description'],
        'avatarUrl' => $row['avatar_url'], 'themeKey' => $row['theme_key'] ?? 'violet',
        'themeMode' => $row['theme_mode'] ?? 'system',
        'memberCanSend' => (bool)($row['member_can_send'] ?? 1),
        'memberCanInvite' => (bool)($row['member_can_invite'] ?? 0),
        'memberCanPin' => (bool)($row['member_can_pin'] ?? 0),
        'slowModeSeconds' => (int)($row['slow_mode_seconds'] ?? 0),
            'showSignatures' => (bool)($row['show_signatures'] ?? 0)
    ]]);
}

function api_remove_conversation_member(): never
{
    api_method('POST', 'DELETE');
    $user = api_user();
    $data = api_input();
    $conversationId = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $targetId = filter_var($data['user_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$conversationId || !$targetId || $conversationId < 1 || $targetId < 1) api_response(['error' => 'Valid conversation_id and user_id required'], 422);
    $actor = api_require_membership((int)$conversationId, (int)$user['id']);
    if (!in_array($actor['role'], ['owner','admin'], true)) api_response(['error' => 'Only owners and admins can remove members'], 403);
    $target = api_require_membership((int)$conversationId, (int)$targetId);
    if ($target['role'] === 'owner') api_response(['error' => 'Transfer ownership before removing the owner'], 409);
    if ($actor['role'] === 'admin' && $target['role'] === 'admin') api_response(['error' => 'Admins cannot remove another admin'], 403);
    $stmt = api_db()->prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    $stmt->execute([$conversationId, $targetId]);
    api_response(['success' => true]);
}

function api_set_conversation_member_role(): never
{
    api_method('PATCH', 'POST');
    $user = api_user();
    $data = api_input();
    $conversationId = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $targetId = filter_var($data['user_id'] ?? null, FILTER_VALIDATE_INT);
    $role = (string)($data['role'] ?? '');
    if (!$conversationId || !$targetId || $conversationId < 1 || $targetId < 1 || !in_array($role, ['admin','member'], true)) api_response(['error' => 'Valid member and role required'], 422);
    $actor = api_require_membership((int)$conversationId, (int)$user['id']);
    if ($actor['role'] !== 'owner') api_response(['error' => 'Only the owner can change admin roles'], 403);
    $target = api_require_membership((int)$conversationId, (int)$targetId);
    if ($target['role'] === 'owner') api_response(['error' => 'The owner role can only be changed by transferring ownership'], 409);
    api_db()->prepare('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?')->execute([$role, $conversationId, $targetId]);
    api_response(['success' => true, 'role' => $role]);
}

function api_transfer_conversation_ownership(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $conversationId = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $targetId = filter_var($data['user_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$conversationId || !$targetId || $conversationId < 1 || $targetId < 1 || $targetId === (int)$user['id']) api_response(['error' => 'Select another valid group member'], 422);
    $actor = api_require_membership((int)$conversationId, (int)$user['id']);
    if ($actor['role'] !== 'owner' || $actor['type'] === 'private') api_response(['error' => 'Only the group owner can transfer ownership'], 403);
    $target = api_require_membership((int)$conversationId, (int)$targetId);
    $pdo = api_db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE conversation_members SET role = 'admin' WHERE conversation_id = ? AND user_id = ?")->execute([$conversationId, $user['id']]);
        $pdo->prepare("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?")->execute([$conversationId, $targetId]);
        $pdo->prepare('UPDATE conversations SET created_by = ? WHERE id = ?')->execute([$targetId, $conversationId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    api_response(['success' => true, 'newOwnerId' => (string)$targetId]);
}




function api_register_push_device(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $token = trim((string)($data['push_token'] ?? ''));
    $platform = (string)($data['platform'] ?? '');
    if (!preg_match('/^(Exponent|Expo)PushToken\\[[A-Za-z0-9_-]+\\]$/', $token) || strlen($token) > 512) {
        api_response(['error' => 'Invalid Expo push token'], 422);
    }
    if (!in_array($platform, ['ios','android','web'], true)) api_response(['error' => 'Invalid platform'], 422);
    $pdo = api_db();
    $stmt = $pdo->prepare('SELECT id FROM push_devices WHERE push_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $existing = $stmt->fetchColumn();
    if ($existing) {
        $pdo->prepare('UPDATE push_devices SET user_id = ?, platform = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$user['id'], $platform, $existing]);
    } else {
        $pdo->prepare('INSERT INTO push_devices (user_id, platform, push_token) VALUES (?, ?, ?)')->execute([$user['id'], $platform, $token]);
    }
    api_response(['success' => true]);
}

function api_dispatch_push_notification(int $conversationId, int $senderId, string $senderName, string $body): void
{
    if (!function_exists('curl_init')) return;
    $stmt = api_db()->prepare(
        'SELECT DISTINCT p.push_token
         FROM push_devices p
         JOIN conversation_members cm ON cm.user_id = p.user_id
         WHERE cm.conversation_id = ? AND p.user_id <> ?'
    );
    $stmt->execute([$conversationId, $senderId]);
    $tokens = array_values(array_unique(array_column($stmt->fetchAll(), 'push_token')));
    if (!$tokens) return;
    $preview = mb_substr(trim($body), 0, 140);
    $payload = [];
    foreach ($tokens as $token) {
        $payload[] = [
            'to' => $token,
            'title' => mb_substr($senderName, 0, 80),
            'body' => $preview === '' ? 'پیام جدید' : $preview,
            'sound' => 'default',
            'data' => ['conversationId' => (string)$conversationId]
        ];
    }
    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'Accept-Encoding: gzip, deflate'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 1,
        CURLOPT_TIMEOUT => 2
    ]);
    $response = curl_exec($ch);
    if ($response === false) error_log('VatanMSG push dispatch failed: ' . curl_error($ch));
    curl_close($ch);
}


function api_message_receipt_counts(int $messageId): array
{
    $stmt = api_db()->prepare('SELECT SUM(read_at IS NOT NULL) AS read_count, SUM(delivered_at IS NOT NULL) AS delivered_count FROM message_receipts WHERE message_id = ?');
    $stmt->execute([$messageId]);
    $row = $stmt->fetch() ?: [];
    return ['readCount' => (int)($row['read_count'] ?? 0), 'deliveredCount' => (int)($row['delivered_count'] ?? 0)];
}

function api_message_attachments(int $messageId): array
{
    $stmt = api_db()->prepare('SELECT id, original_name, mime_type, size_bytes, created_at FROM message_attachments WHERE message_id = ? ORDER BY id ASC');
    $stmt->execute([$messageId]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (string)$row['id'],
            'name' => $row['original_name'],
            'mimeType' => $row['mime_type'],
            'sizeBytes' => (int)$row['size_bytes'],
            'url' => 'https://binercraft.ir/api/index.php?route=media%2Fdownload&id=' . (string)$row['id'],
            'createdAt' => $row['created_at']
        ];
    }
    return $items;
}

function api_upload_profile_avatar(): never
{
    api_method('POST');
    $user = api_user();

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        api_response(['error' => 'Choose a profile photo to upload'], 422);
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$file['tmp_name'])) {
        api_response(['error' => 'Photo upload failed. Check the hosting upload size limit.'], 400);
    }
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > 5 * 1024 * 1024) {
        api_response(['error' => 'Profile photos must be 5 MB or smaller'], 413);
    }

    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file((string)$file['tmp_name']);
    $imageInfo = @getimagesize((string)$file['tmp_name']);
    if (!isset($allowed[$mime]) || !$imageInfo || ($imageInfo['mime'] ?? '') !== $mime) {
        api_response(['error' => 'Use a valid JPG, PNG, WEBP, or GIF image'], 415);
    }
    if ((int)($imageInfo[0] ?? 0) > 6000 || (int)($imageInfo[1] ?? 0) > 6000) {
        api_response(['error' => 'Profile photo dimensions are too large'], 413);
    }

    $storageDir = dirname(__DIR__) . '/uploads/avatars';
    if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) {
        api_response(['error' => 'Profile photo storage is unavailable on the host'], 500);
    }
    $rules = $storageDir . '/.htaccess';
    if (!is_file($rules)) {
        file_put_contents($rules, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|phar|cgi|pl|py|sh)$\">\nRequire all denied\n</FilesMatch>\n");
    }

    $storedName = bin2hex(random_bytes(24)) . '.' . $allowed[$mime];
    $destination = $storageDir . '/' . $storedName;
    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) {
        api_response(['error' => 'Could not save the profile photo on the server'], 500);
    }
    @chmod($destination, 0644);
    $avatarUrl = 'https://binercraft.ir/uploads/avatars/' . $storedName;

    try {
        $pdo = api_db();
        $pdo->prepare('UPDATE users SET avatar_url = ? WHERE id = ?')->execute([$avatarUrl, $user['id']]);
        $stmt = $pdo->prepare('SELECT id, username, display_name, avatar_url, birth_year, birth_calendar FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $updatedUser = $stmt->fetch();
        if (!$updatedUser) {
            @unlink($destination);
            api_response(['error' => 'Could not load the updated profile'], 500);
        }
    } catch (Throwable $e) {
        @unlink($destination);
        throw $e;
    }

    $oldAvatar = (string)($user['avatar_url'] ?? '');
    $avatarPrefix = 'https://binercraft.ir/uploads/avatars/';
    if (str_starts_with($oldAvatar, $avatarPrefix)) {
        $oldName = basename($oldAvatar);
        if ($oldName !== $storedName && preg_match('/^[a-f0-9]{48}\\.(jpg|png|webp|gif)$/', $oldName)) {
            @unlink($storageDir . '/' . $oldName);
        }
    }

    api_response(['success' => true, 'avatarUrl' => $avatarUrl, 'user' => api_public_user($updatedUser)]);
}

function api_upload_conversation_avatar(): never
{
    api_method('POST');
    $user = api_user();
    $conversationId = filter_var($_POST['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$conversationId || $conversationId < 1) api_response(['error' => 'Valid conversation_id required'], 422);
    $membership = api_require_membership((int)$conversationId, (int)$user['id']);
    if (!in_array($membership['role'], ['owner', 'admin'], true) || $membership['type'] === 'private') {
        api_response(['error' => 'Only group/channel owners and admins can change the photo'], 403);
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) api_response(['error' => 'Choose a group or channel photo'], 422);
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$file['tmp_name'])) api_response(['error' => 'Photo upload failed. Check the hosting upload size limit.'], 400);
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > 5 * 1024 * 1024) api_response(['error' => 'Group photos must be 5 MB or smaller'], 413);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file((string)$file['tmp_name']);
    $imageInfo = @getimagesize((string)$file['tmp_name']);
    if (!isset($allowed[$mime]) || !$imageInfo || ($imageInfo['mime'] ?? '') !== $mime) api_response(['error' => 'Use a valid JPG, PNG, or WEBP image'], 415);
    if ((int)($imageInfo[0] ?? 0) > 6000 || (int)($imageInfo[1] ?? 0) > 6000) api_response(['error' => 'Photo dimensions are too large'], 413);
    $storageDir = dirname(__DIR__) . '/uploads/conversation-avatars';
    if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) api_response(['error' => 'Group photo storage is unavailable on the host'], 500);
    $rules = $storageDir . '/.htaccess';
    if (!is_file($rules)) {
        $rulesContent = 'Options -Indexes' . "\n" . '<FilesMatch "\\.(php|phtml|phar|cgi|pl|py|sh)$">' . "\n" . 'Require all denied' . "\n" . '</FilesMatch>' . "\n";
        file_put_contents($rules, $rulesContent);
    }
    $storedName = bin2hex(random_bytes(24)) . '.' . $allowed[$mime];
    $destination = $storageDir . '/' . $storedName;
    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) api_response(['error' => 'Could not save the group photo on the server'], 500);
    @chmod($destination, 0644);
    $avatarUrl = 'https://binercraft.ir/uploads/conversation-avatars/' . $storedName;
    try {
        $stmt = api_db()->prepare('UPDATE conversations SET avatar_url = ? WHERE id = ?');
        $stmt->execute([$avatarUrl, $conversationId]);
    } catch (Throwable $e) {
        @unlink($destination);
        throw $e;
    }
    api_response(['success' => true, 'avatarUrl' => $avatarUrl]);
}

function api_upload_media(): never
{
    api_method('POST');
    $user = api_user();
    $conversationId = filter_var($_POST['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$conversationId || $conversationId < 1) api_response(['error' => 'Valid conversation_id required'], 422);
    $membership = api_require_membership((int)$conversationId, (int)$user['id']);
    if ($membership['type'] === 'channel' && !in_array($membership['role'], ['owner','admin'], true)) {
        api_response(['error' => 'Only channel admins can upload media'], 403);
    }
    if ($membership['type'] === 'group' && !in_array($membership['role'], ['owner','admin'], true)) {
        $setting = api_db()->prepare('SELECT member_can_send, slow_mode_seconds FROM conversation_settings WHERE conversation_id = ?');
        $setting->execute([$conversationId]);
        $groupSettings = $setting->fetch() ?: ['member_can_send' => 1, 'slow_mode_seconds' => 0];
        if (!(bool)$groupSettings['member_can_send']) api_response(['error' => 'Sending media is disabled for members in this group'], 403);
        $slowMode = (int)$groupSettings['slow_mode_seconds'];
        if ($slowMode > 0) {
            $last = api_db()->prepare('SELECT created_at FROM messages WHERE conversation_id = ? AND sender_id = ? ORDER BY id DESC LIMIT 1');
            $last->execute([$conversationId, $user['id']]);
            $lastSent = $last->fetchColumn();
            if ($lastSent && strtotime((string)$lastSent . ' UTC') > time() - $slowMode) api_response(['error' => 'Slow mode is enabled. Wait before uploading another file.'], 429);
        }
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) api_response(['error' => 'Choose a file to upload'], 422);
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$file['tmp_name'])) {
        api_response(['error' => 'Upload failed. Check the hosting upload size limit.'], 400);
    }
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > 25 * 1024 * 1024) api_response(['error' => 'Files must be between 1 byte and 25 MB'], 413);
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file((string)$file['tmp_name']);
    $extensions = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif',
        'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov', 'video/3gpp' => '3gp',
        'audio/mpeg' => 'mp3', 'audio/mp4' => 'm4a', 'audio/aac' => 'aac', 'audio/ogg' => 'ogg',
        'audio/wav' => 'wav', 'audio/x-wav' => 'wav', 'audio/webm' => 'weba', 'audio/3gpp' => '3gp',
        'application/pdf' => 'pdf', 'text/plain' => 'txt', 'application/zip' => 'zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx'
    ];
    if (!isset($extensions[$mime])) api_response(['error' => 'This file type is not allowed'], 415);
    $originalName = trim(basename((string)($file['name'] ?? 'file')));
    $originalName = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', $originalName) ?: 'file', 0, 255);
    $storageDir = __DIR__ . '/uploads';
    if (!is_dir($storageDir) && !mkdir($storageDir, 0750, true) && !is_dir($storageDir)) {
        api_response(['error' => 'Upload storage is unavailable on the host'], 500);
    }
    $denyFile = $storageDir . '/.htaccess';
    if (!is_file($denyFile)) file_put_contents($denyFile, "Require all denied\n");
    $storedName = bin2hex(random_bytes(24)) . '.' . $extensions[$mime];
    $destination = $storageDir . '/' . $storedName;
    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) api_response(['error' => 'Could not save uploaded file'], 500);
    @chmod($destination, 0640);

    $pdo = api_db();
    $pdo->beginTransaction();
    try {
        $messageBody = '📎 ' . $originalName;
        $stmt = $pdo->prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)');
        $stmt->execute([$conversationId, $user['id'], $messageBody]);
        $messageId = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare('INSERT INTO message_attachments (message_id, uploader_id, storage_path, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$messageId, $user['id'], $storedName, $originalName, $mime, $size]);
        $attachmentId = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        @unlink($destination);
        throw $e;
    }
    $message = api_message_by_id($messageId);
    api_dispatch_push_notification((int)$conversationId, (int)$user['id'], (string)$user['display_name'], $messageBody);
    api_response(['success' => true, 'message' => $message, 'attachment' => api_message_attachments($messageId)[0]], 201);
}

function api_download_media(): never
{
    api_method('GET');
    $user = api_user();
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
    if (!$id || $id < 1) api_response(['error' => 'Valid attachment id required'], 422);
    $stmt = api_db()->prepare(
        'SELECT a.storage_path, a.original_name, a.mime_type, a.size_bytes, m.conversation_id
         FROM message_attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $attachment = $stmt->fetch();
    if (!$attachment) api_response(['error' => 'File not found'], 404);
    api_require_membership((int)$attachment['conversation_id'], (int)$user['id']);
    $base = realpath(__DIR__ . '/uploads');
    $path = realpath(__DIR__ . '/uploads/' . basename((string)$attachment['storage_path']));
    if (!$base || !$path || !str_starts_with($path, $base . DIRECTORY_SEPARATOR) || !is_file($path)) api_response(['error' => 'File not found'], 404);
    header('Content-Type: ' . $attachment['mime_type']);
    header('Content-Length: ' . (string)$attachment['size_bytes']);
    header('X-Content-Type-Options: nosniff');
    $safeName = str_replace(['"', "\\", "\r", "\n"], '_', (string)$attachment['original_name']);
    $inlineTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/3gpp'];
    $disposition = in_array((string)$attachment['mime_type'], $inlineTypes, true) ? 'inline' : 'attachment';
    header('Content-Disposition: ' . $disposition . '; filename="' . $safeName . '"');
    readfile($path);
    exit;
}

function api_search_messages(): never
{
    api_method('GET');
    $user = api_user();
    $conversationId = filter_input(INPUT_GET, 'conversation_id', FILTER_VALIDATE_INT);
    $query = trim((string)($_GET['q'] ?? ''));
    if (!$conversationId || $conversationId < 1 || mb_strlen($query) < 2 || mb_strlen($query) > 100) {
        api_response(['messages' => []]);
    }
    api_require_membership((int)$conversationId, (int)$user['id']);
    $like = '%' . addcslashes($query, '%_\\\\') . '%';
    $stmt = api_db()->prepare(
        'SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.client_message_id, u.username, u.display_name, u.avatar_url, m.body, m.created_at, m.edited_at
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND m.body LIKE ?
         ORDER BY m.id DESC LIMIT 50'
    );
    $stmt->execute([$conversationId, $like]);
    $messages = [];
    foreach (array_reverse($stmt->fetchAll()) as $row) {
        $messages[] = [
            'id' => (string)$row['id'], 'conversationId' => (string)$row['conversation_id'],
            'senderId' => (string)$row['sender_id'], 'username' => $row['username'],
            'displayName' => $row['display_name'], 'avatarUrl' => $row['avatar_url'] ?? null,
            'replyToId' => $row['reply_to_id'] === null ? null : (string)$row['reply_to_id'],
            'clientMessageId' => $row['client_message_id'] ?? null,
            'body' => $row['body'], 'createdAt' => $row['created_at'], 'editedAt' => $row['edited_at']
        ];
    }
    api_response(['messages' => $messages]);
}

function api_toggle_message_reaction(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $messageId = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);
    $reaction = (string)($data['reaction'] ?? '');
    if (!$messageId || $messageId < 1 || !in_array($reaction, ['👍','❤️','😂','😮','😢','🔥','🎉','👎'], true)) api_response(['error' => 'Unsupported reaction'], 422);
    $stmt = api_db()->prepare('SELECT conversation_id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$messageId]);
    $message = $stmt->fetch();
    if (!$message) api_response(['error' => 'Message not found'], 404);
    api_require_membership((int)$message['conversation_id'], (int)$user['id']);
    $stmt = api_db()->prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?');
    $stmt->execute([$messageId, $user['id'], $reaction]);
    if ($stmt->fetch()) {
        $pdo = api_db();
        $pdo->prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?')->execute([$messageId, $user['id'], $reaction]);
        $active = false;
    } else {
        api_db()->prepare('INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)')->execute([$messageId, $user['id'], $reaction]);
        $active = true;
    }
    $stmt = api_db()->prepare('SELECT reaction, COUNT(*) AS count FROM message_reactions WHERE message_id = ? GROUP BY reaction');
    $stmt->execute([$messageId]);
    api_response(['success' => true, 'active' => $active, 'reactions' => $stmt->fetchAll()]);
}

function api_mark_messages_read(): never
{
    api_method('POST');
    $user = api_user();
    $data = api_input();
    $conversationId = filter_var($data['conversation_id'] ?? null, FILTER_VALIDATE_INT);
    $lastMessageId = filter_var($data['last_message_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$conversationId || !$lastMessageId || $conversationId < 1 || $lastMessageId < 1) api_response(['error' => 'Valid conversation_id and last_message_id required'], 422);
    api_require_membership((int)$conversationId, (int)$user['id']);
    $pdo = api_db();
    $stmt = $pdo->prepare(
        'INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
         SELECT id, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM messages
         WHERE conversation_id = ? AND id <= ? AND sender_id <> ? AND deleted_at IS NULL
         ON DUPLICATE KEY UPDATE delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()), read_at = COALESCE(read_at, UTC_TIMESTAMP())'
    );
    $stmt->execute([$user['id'], $conversationId, $lastMessageId, $user['id']]);
    api_response(['success' => true]);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Normalize the route across cPanel/Apache configurations. Depending on rewrite
// settings REQUEST_URI may be /api/messages, /api/index.php/messages, or a
// PATH_INFO URL. Also accept ?route=messages as a safe fallback for hosts where
// rewrite rules are disabled.
$uriPath = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
$path = trim($uriPath, '/');
$routeQuery = trim((string)($_GET['route'] ?? $_GET['r'] ?? ''), " /\\t\\n\\r\\0\\x0B");
if ($routeQuery !== '') {
    $path = $routeQuery;
} else {
    $scriptName = trim((string)($_SERVER['SCRIPT_NAME'] ?? ''), '/');
    $scriptDir = trim(str_replace('\\', '/', dirname('/' . $scriptName)), '/');
    if ($scriptDir !== '' && ($path === $scriptDir || str_starts_with($path, $scriptDir . '/'))) {
        $path = ltrim(substr($path, strlen($scriptDir)), '/');
    }
    $path = preg_replace('#^(?:api/?)#i', '', $path) ?? $path;
    $path = preg_replace('#^index\\.php/?#i', '', $path) ?? $path;
}
$path = trim($path, '/');

try {
    if ($path === '' || $path === 'health') {
        api_method('GET');
        api_db()->query('SELECT 1');
        api_response(['ok' => true, 'database' => true, 'service' => 'vatanmsg-php-api', 'version' => '1.1.0']);
    }

    switch ($path) {
        case 'auth/register':
            api_register_account();
            break;
        case 'auth/login':
            api_login_account();
            break;
        case 'auth/demo':
            api_response(['error' => 'Demo sign-in is disabled. Use auth/register or auth/login.'], 410);
        case 'auth/me':
            api_get_me();
            break;
        case 'auth/profile':
            api_update_profile();
            break;
        case 'auth/logout':
            api_logout();
            break;
        case 'auth/logout-all':
            api_logout_all_sessions();
            break;
        case 'auth/sessions':
            api_list_sessions();
            break;
        case 'auth/privacy':
            if ($method === 'PATCH' || $method === 'POST') api_update_privacy_settings();
            else api_get_privacy_settings();
            break;
        case 'auth/delete-account':
            api_delete_account();
            break;
        case 'push/register':
            api_register_push_device();
            break;
        case 'conversations':
            if ($method === 'POST') {
                api_create_conversation();
            }
            api_list_conversations();
            break;
        case 'users/search':
            api_search_users();
        case 'resolve':
            api_resolve_identifier();
            break;
        case 'users/profile':
            api_get_user_profile();
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
        case 'conversations/delete':
            api_delete_conversation();
            break;
        case 'conversations/add-member':
            api_add_conversation_member();
            break;
        case 'conversations/manage':
            api_update_conversation_settings();
            break;
        case 'conversations/remove-member':
            api_remove_conversation_member();
            break;
        case 'conversations/member-role':
            api_set_conversation_member_role();
            break;
        case 'conversations/transfer-ownership':
            api_transfer_conversation_ownership();
            break;
        case 'media/avatar-upload':
            api_upload_profile_avatar();
            break;
        case 'media/conversation-avatar-upload':
            api_upload_conversation_avatar();
            break;
        case 'media/upload':
            api_upload_media();
            break;
        case 'media/download':
            api_download_media();
            break;
        case 'messages/search':
            api_search_messages();
            break;
        case 'messages/react':
            api_toggle_message_reaction();
            break;
        case 'messages/read':
            api_mark_messages_read();
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
