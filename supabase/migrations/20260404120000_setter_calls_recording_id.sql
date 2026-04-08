-- Zoom webhook stores Zoom recording id for deduplication (see lib/api-handlers/zoom-webhook.js).
alter table public.setter_calls
  add column if not exists recording_id text;

create unique index if not exists setter_calls_recording_id_key
  on public.setter_calls (recording_id)
  where recording_id is not null;
