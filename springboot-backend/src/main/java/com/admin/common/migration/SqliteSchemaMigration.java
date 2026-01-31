package com.admin.common.migration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/**
 * Lightweight SQLite schema migration.
 *
 * Spring Boot SQL init uses CREATE TABLE IF NOT EXISTS, so existing installations
 * won't automatically receive new columns. This runner adds missing columns in-place.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SqliteSchemaMigration implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public SqliteSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureColumn("node", "inx", "INTEGER NOT NULL DEFAULT 0");
        ensureColumn("tunnel", "inx", "INTEGER NOT NULL DEFAULT 0");
    }

    private void ensureColumn(String table, String column, String columnDefinition) {
        Set<String> columns = new HashSet<>(
                jdbcTemplate.query(
                        "PRAGMA table_info(" + table + ")",
                        (rs, rowNum) -> rs.getString("name")
                )
        );

        if (columns.contains(column)) {
            return;
        }

        log.info("Adding missing column {}.{}", table, column);
        jdbcTemplate.execute(
                "ALTER TABLE " + table + " ADD COLUMN " + column + " " + columnDefinition
        );
    }
}
