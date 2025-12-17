-- Idempotent, safe, production-ready

SELECT 'CREATE DATABASE residencyflow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'residencyflow')\gexec;

SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec;

SELECT 'CREATE DATABASE prefect'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'prefect')\gexec;
