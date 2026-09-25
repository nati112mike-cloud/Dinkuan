-- Feed queries filter on the viewer (blocks, mutes, follows). Postgres switches prepared
-- statements to a generic plan after five runs, which ignores the viewer and was 3-4x slower
-- on deep feed pages at 100k posts (CLAUDE.md rule 19). Always plan with the real values.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET plan_cache_mode = force_custom_plan', current_database());
END
$$;
