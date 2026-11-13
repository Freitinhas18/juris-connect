\set ON_ERROR_STOP on
\prompt 'Nome do banco desta instalação' database_name
\prompt 'Nome da role de runtime da aplicação' app_role
CREATE ROLE :"app_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password :app_role
GRANT CONNECT ON DATABASE :"database_name" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
GRANT EXECUTE ON FUNCTION resolve_juris_session(text) TO :"app_role";
\echo 'Role criada. Confirme que a migration continua sendo aplicada por uma role de schema separada.'
