-- Bucket privado para los PDFs de estados de cuenta subidos por el usuario.
-- Convención de ruta: statements/{user_id}/{account_id}/{yyyy-mm}.pdf

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

create policy "statements bucket: owner can read own files"
  on storage.objects for select
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "statements bucket: owner can upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "statements bucket: owner can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
