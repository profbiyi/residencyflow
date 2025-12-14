-- Create additional databases for prefect and keycloak
-- This runs at container initialization via /docker-entrypoint-initdb.d

SELECT 'CREATE DATABASE prefect' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'prefect')\gexec
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
