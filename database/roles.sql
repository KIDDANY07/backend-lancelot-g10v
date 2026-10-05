BEGIN;

CREATE TEMP TABLE canonical_roles (
  id_role integer PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO canonical_roles (id_role, code) VALUES
  (1, 'ADMIN'),
  (2, 'ENTRENADOR'),
  (3, 'DEPORTISTA'),
  (4, 'DIRECTOR_TECNICO'),
  (5, 'ENCARGADO_SALUD');

CREATE TEMP TABLE role_mapping ON COMMIT DROP AS
SELECT r.id_role AS old_id, c.id_role AS new_id
FROM roles r
JOIN canonical_roles c ON c.code = CASE
  WHEN UPPER(TRIM(r.name)) IN (SELECT code FROM canonical_roles) THEN UPPER(TRIM(r.name))
  WHEN UPPER(TRIM(r.code)) IN (SELECT code FROM canonical_roles) THEN UPPER(TRIM(r.code))
  WHEN UPPER(TRIM(r.code)) = 'DEP' OR UPPER(TRIM(r.name)) = 'JUGADOR' THEN 'DEPORTISTA'
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users u
    LEFT JOIN role_mapping m ON m.old_id = u.id_role
    WHERE m.old_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay usuarios con un rol que no corresponde a ADMIN, ENTRENADOR, DEPORTISTA, DIRECTOR_TECNICO ni ENCARGADO_SALUD. No se aplicó ningún cambio.';
  END IF;
END $$;

CREATE TEMP TABLE role_foreign_keys ON COMMIT DROP AS
SELECT
  con.conname AS constraint_name,
  con.conrelid::regclass::text AS table_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.confrelid = 'roles'::regclass
  AND con.contype = 'f';

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN SELECT * FROM role_foreign_keys LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.constraint_name);
  END LOOP;
END $$;

UPDATE users u
SET id_role = m.new_id
FROM role_mapping m
WHERE u.id_role = m.old_id
  AND m.old_id <> m.new_id;

DELETE FROM roles;

INSERT INTO roles (id_role, name, code)
SELECT id_role, code, code
FROM canonical_roles
ORDER BY id_role;

SELECT setval(pg_get_serial_sequence('roles', 'id_role'), (SELECT MAX(id_role) FROM roles));

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN SELECT * FROM role_foreign_keys LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      fk.table_name,
      fk.constraint_name,
      fk.definition
    );
  END LOOP;
END $$;

COMMIT;
