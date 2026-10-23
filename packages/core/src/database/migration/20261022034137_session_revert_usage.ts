import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261022034137_session_revert_usage",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_revert_usage\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`model_provider_id\` text,
          \`model_id\` text,
          \`model_variant\` text,
          \`cost\` real DEFAULT 0 NOT NULL,
          \`tokens_input\` integer DEFAULT 0 NOT NULL,
          \`tokens_output\` integer DEFAULT 0 NOT NULL,
          \`tokens_reasoning\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_read\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_write\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT \`fk_session_revert_usage_session_id_session_v2_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`session_revert_usage_session_time_created_idx\` ON \`session_revert_usage\` (\`session_id\`,\`time_created\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_revert_usage_time_created_idx\` ON \`session_revert_usage\` (\`time_created\`);`,
      )
    })
  },
}

export default migration
