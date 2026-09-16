-- Run once in a NEW Supabase project's SQL Editor. No service_role key is needed in the app.
begin;
create table public.daily_task_templates (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 180), note text not null default '',
 estimated_minutes integer not null default 0 check (estimated_minutes between 0 and 1440),
 enabled boolean not null default true, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(id,user_id)
);
create table public.tasks (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 180), date date not null,
 done boolean not null default false, estimated_minutes integer not null default 0 check(estimated_minutes between 0 and 1440),
 manual_minutes integer not null default 0 check(manual_minutes between 0 and 1440), note text not null default '',
 position double precision not null default 0, template_id uuid, template_date date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(id,user_id), unique(user_id,template_id,template_date),
 foreign key(template_id,user_id) references public.daily_task_templates(id,user_id),
 check ((template_id is null) = (template_date is null))
);
create table public.study_materials (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 section text not null check(section in ('行测','申论')), title text not null check(length(trim(title)) between 1 and 180),
 note text not null default '', tags text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(id,user_id)
);
create table public.material_images (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 material_id uuid not null, path text not null, thumbnail_path text not null,
 position integer not null default 0, created_at timestamptz not null default now(),
 foreign key(material_id,user_id) references public.study_materials(id,user_id) on delete cascade,
 check(split_part(path,'/',1)=user_id::text), check(split_part(thumbnail_path,'/',1)=user_id::text)
);
create table public.study_sessions (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null, date date not null, duration_seconds integer not null check(duration_seconds > 0),
 created_at timestamptz not null default now(),
 foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade
);
create index tasks_user_date on public.tasks(user_id,date);
create index templates_user on public.daily_task_templates(user_id);
create index materials_user_section on public.study_materials(user_id,section,created_at desc);
create index images_user_material on public.material_images(user_id,material_id);
create index sessions_user_date on public.study_sessions(user_id,date);

-- Every operation, including upserts, is restricted to the authenticated owner.
do $$ declare t text; begin
 foreach t in array array['tasks','daily_task_templates','study_materials','material_images','study_sessions'] loop
 execute format('alter table public.%I enable row level security', t);
 execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t);
 execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
 execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 end loop;
end $$;

-- One transaction publishes material metadata and image references; default invoker keeps RLS active.
create function public.save_study_material(p_material jsonb, p_images jsonb, p_deleted_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare m public.study_materials; i public.material_images;
begin
 m := jsonb_populate_record(null::public.study_materials,p_material);
 if m.user_id is distinct from auth.uid() then raise exception 'Not authorized'; end if;
 insert into public.study_materials values (m.*)
 on conflict(id) do update set section=excluded.section,title=excluded.title,note=excluded.note,tags=excluded.tags,updated_at=excluded.updated_at;
 delete from public.material_images where id=any(p_deleted_ids) and material_id=m.id and user_id=auth.uid();
 for i in select * from jsonb_populate_recordset(null::public.material_images,p_images) loop
 if i.user_id is distinct from auth.uid() or i.material_id is distinct from m.id then raise exception 'Invalid image owner'; end if;
 insert into public.material_images values(i.*) on conflict(id) do update set position=excluded.position;
 end loop;
end $$;
create function public.delete_study_material(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
 update public.study_materials set deleted_at=now(),updated_at=now() where id=p_id and user_id=auth.uid();
 delete from public.material_images where material_id=p_id and user_id=auth.uid();
end $$;
revoke all on function public.save_study_material(jsonb,jsonb,uuid[]) from public,anon;
revoke all on function public.delete_study_material(uuid) from public,anon;
grant execute on function public.save_study_material(jsonb,jsonb,uuid[]) to authenticated;
grant execute on function public.delete_study_material(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('study-images','study-images',false,20971520,array['image/jpeg','image/png','image/webp','image/gif'])
 on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
create policy study_images_read on storage.objects for select to authenticated using(bucket_id='study-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_images_insert on storage.objects for insert to authenticated with check(bucket_id='study-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_images_delete on storage.objects for delete to authenticated using(bucket_id='study-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
