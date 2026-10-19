import mysql from "mysql2/promise";

/**
 * MySQL connection for user accounts and cloud storage of projects/files. Configured through
 * MMB_DB_* env vars (webapp/.env.local); without MMB_DB_NAME the app runs in local-only mode
 * (projects in the browser, no login).
 */
export function accountsEnabled(): boolean {
  return !!process.env.MMB_DB_NAME;
}

const g = globalThis as { __mmbPool?: mysql.Pool; __mmbSchema?: Promise<void>; __mmbSchemaSize?: number };

function pool(): mysql.Pool {
  g.__mmbPool ??= mysql.createPool({
    host: process.env.MMB_DB_HOST || "127.0.0.1",
    port: Number(process.env.MMB_DB_PORT || 3306),
    user: process.env.MMB_DB_USER,
    password: process.env.MMB_DB_PASSWORD,
    database: process.env.MMB_DB_NAME,
    connectionLimit: 8,
    charset: "utf8mb4",
  });
  return g.__mmbPool;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mmb_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX (user_id),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_projects (
    user_id BIGINT UNSIGNED NOT NULL,
    project_key VARCHAR(128) NOT NULL,
    data LONGTEXT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    PRIMARY KEY (user_id, project_key),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_files (
    user_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    file_key VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    data LONGBLOB NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, kind, file_key),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_kv (
    user_id BIGINT UNSIGNED NOT NULL,
    k VARCHAR(64) NOT NULL,
    v LONGTEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, k),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_ai_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(8) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    label VARCHAR(100) NOT NULL,
    secret_enc MEDIUMTEXT NOT NULL,
    priority INT NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    quota_json TEXT NULL,
    limited_until BIGINT NULL,
    last_used_at BIGINT NULL,
    created_at BIGINT NOT NULL,
    INDEX (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Training data (lib/server/modelDataset.ts): every 3D model + the generator runs that built them.
  `CREATE TABLE IF NOT EXISTS mmb_ai_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(16) NOT NULL,
    account_label VARCHAR(100) NULL,
    prompt TEXT NOT NULL,
    ok TINYINT(1) NULL,
    result_text MEDIUMTEXT NULL,
    tools_json LONGTEXT NULL,
    model_ids JSON NOT NULL,
    created_at BIGINT NOT NULL,
    finished_at BIGINT NULL,
    INDEX (user_id),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Codex Chat conversations (lib/server/chatDataset.ts): one row per turn with the whole
  // conversation up to and including it, plus the editor tool calls of that turn.
  `CREATE TABLE IF NOT EXISTS mmb_ai_chats (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    conversation_id VARCHAR(64) NOT NULL,
    turn INT NOT NULL,
    run_id BIGINT UNSIGNED NULL,
    provider VARCHAR(16) NOT NULL,
    project_key VARCHAR(128) NULL,
    messages_json LONGTEXT NOT NULL,
    tools_json LONGTEXT NULL,
    ok TINYINT(1) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX (user_id, conversation_id),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mmb_models (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    project_key VARCHAR(128) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    element_id VARCHAR(128) NOT NULL,
    name VARCHAR(200) NOT NULL,
    mod_id VARCHAR(64) NOT NULL DEFAULT '',
    mc_version VARCHAR(16) NOT NULL DEFAULT '',
    model_json LONGTEXT NOT NULL,
    geo_json LONGTEXT NOT NULL,
    animations_json LONGTEXT NULL,
    settings_json MEDIUMTEXT NULL,
    texture_key VARCHAR(255) NULL,
    texture_width INT NOT NULL,
    texture_height INT NOT NULL,
    bone_count INT NOT NULL,
    cube_count INT NOT NULL,
    animation_count INT NOT NULL,
    content_hash CHAR(64) NOT NULL,
    prompt TEXT NULL,
    ai_provider VARCHAR(16) NULL,
    ai_run_id BIGINT UNSIGNED NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    UNIQUE KEY one_per_element (user_id, project_key, kind, element_id),
    INDEX (kind),
    FOREIGN KEY (user_id) REFERENCES mmb_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

/** The pool, with the tables created on first use. */
export async function db(): Promise<mysql.Pool> {
  const p = pool();
  // Re-run when tables were added (dev server hot reload keeps globalThis).
  if (g.__mmbSchemaSize !== SCHEMA.length) { g.__mmbSchema = undefined; g.__mmbSchemaSize = SCHEMA.length; }
  g.__mmbSchema ??= (async () => { for (const sql of SCHEMA) await p.query(sql); })().catch((e) => {
    g.__mmbSchema = undefined; // retry on the next request
    throw e;
  });
  await g.__mmbSchema;
  return p;
}
