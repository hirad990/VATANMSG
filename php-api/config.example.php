<?php
declare(strict_types=1);

/*
 * Copy this file to config.php on the hosting account.
 * Fill in credentials in cPanel File Manager only. Never commit real secrets.
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'CPANEL_DB_NAME',
    'db_user' => 'CPANEL_DB_USER',
    'db_pass' => 'CHANGE_ME',
    'demo_login_enabled' => true,
    'token_expiry_days' => 7,
    'max_message_length' => 4000,
];
