-- ==============================================================================
-- UniRequest-OS - Create Dedicated Database for Kestra Workflow Engine (Apache-2.0)
-- ==============================================================================
SELECT 'CREATE DATABASE kestra'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kestra')\gexec
