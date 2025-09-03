DO
$$
DECLARE
    t RECORD;
BEGIN
    -- Skip Prisma migrations table
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(t.tablename) || ' RESTART IDENTITY CASCADE;';
    END LOOP;
END;
$$;
