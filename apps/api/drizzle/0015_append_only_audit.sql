CREATE OR REPLACE FUNCTION reject_organization_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'organization_audit_events is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_audit_events_no_update_delete
BEFORE UPDATE OR DELETE ON organization_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_organization_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER organization_audit_events_no_truncate
BEFORE TRUNCATE ON organization_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_organization_audit_mutation();
