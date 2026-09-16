import { PGlite } from "@electric-sql/pglite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text); alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema public,auth,storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
await db.exec(await readFile("supabase/schema.sql", "utf8"));
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
async function asUser(id) {
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${id}';`,
  );
}
const material = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: userA,
  section: "行测",
  title: "私有资料",
  note: "备注",
  tags: ["错题"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};
const image = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: userA,
  material_id: material.id,
  path: userA + "/original",
  thumbnail_path: userA + "/thumb.webp",
  position: 0,
  created_at: new Date().toISOString(),
};
await asUser(userA);
await db.query(
  "select public.save_study_material($1::jsonb,$2::jsonb,$3::uuid[])",
  [JSON.stringify(material), JSON.stringify([image]), []],
);
assert.equal((await db.query("select * from study_materials")).rows.length, 1);
await db.query("insert into storage.objects values($1,$2,$3)", [
  image.id,
  "study-images",
  image.path,
]);
await asUser(userB);
for (const table of ["study_materials", "material_images"])
  assert.equal((await db.query("select * from " + table)).rows.length, 0);
assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
await assert.rejects(
  () =>
    db.query(
      "select public.save_study_material($1::jsonb,$2::jsonb,$3::uuid[])",
      [JSON.stringify(material), "[]", []],
    ),
  /Not authorized/,
);
await assert.rejects(
  () =>
    db.query("insert into storage.objects values($1,$2,$3)", [
      "55555555-5555-4555-8555-555555555555",
      "study-images",
      userA + "/bad",
    ]),
  /row-level security/,
);
await db.query("update study_materials set title=$1 where id=$2", [
  "hacked",
  material.id,
]);
await asUser(userA);
assert.equal(
  (await db.query("select title from study_materials")).rows[0].title,
  "私有资料",
);
const bad = {
  ...image,
  id: "66666666-6666-4666-8666-666666666666",
  user_id: userB,
};
await assert.rejects(
  () =>
    db.query(
      "select public.save_study_material($1::jsonb,$2::jsonb,$3::uuid[])",
      [
        JSON.stringify({ ...material, title: "should rollback" }),
        JSON.stringify([bad]),
        [],
      ],
    ),
  /Invalid image owner/,
);
assert.equal(
  (await db.query("select title from study_materials")).rows[0].title,
  "私有资料",
);
await db.exec("reset role;set role anon;");
await assert.rejects(
  () => db.query("select * from tasks"),
  /permission denied/,
);
await asUser(userA);
await db.query("select delete_study_material($1)", [material.id]);
assert.equal((await db.query("select * from material_images")).rows.length, 0);
assert.ok(
  (await db.query("select deleted_at from study_materials")).rows[0].deleted_at,
);
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/schema-report.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      engine: "PGlite embedded PostgreSQL; auth/storage shims",
      passed: [
        "Schema SQL executes",
        "Owner can save material and images",
        "Other user cannot read/update owner records",
        "Other user cannot read/upload owner storage paths",
        "Spoofed owner RPC rejected",
        "Material/image RPC rolls back atomically",
        "Anonymous access denied",
        "Material deletion clears image metadata",
      ],
      limitation: "Not a live Supabase project test",
    },
    null,
    2,
  ),
);
console.log(
  "PASS schema syntax, RLS owner isolation, storage path policies, atomic RPC, anonymous denial",
);
await db.close();
