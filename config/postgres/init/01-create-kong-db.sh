#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE kong;
    CREATE USER kong WITH ENCRYPTED PASSWORD 'kong_dev_2026';
    GRANT ALL PRIVILEGES ON DATABASE kong TO kong;
    ALTER DATABASE kong OWNER TO kong;
EOSQL
