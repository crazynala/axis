DO
$$
DECLARE
    t RECORD;
BEGIN
        -- Skip Prisma migrations table and auth tables
    FOR t IN
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                    AND tablename NOT IN ('_prisma_migrations', 'User', 'PasswordReset', 'ValueList')
    LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(t.tablename) || ' RESTART IDENTITY CASCADE;';
    END LOOP;
END;
$$;
