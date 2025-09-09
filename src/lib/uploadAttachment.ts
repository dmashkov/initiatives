import { supabase } from '@/lib/supabaseClient';

export async function uploadAttachment(
  file: File,
  initiativeId: string,
  appUserId: string
) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${appUserId}/${initiativeId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase
    .storage
    .from('attachments')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (upErr) throw upErr;

  const { error: insErr } = await supabase
    .from('initiative_attachments')
    .insert({
      initiative_id: initiativeId,
      path,
      mime_type: file.type || null,
      size_bytes: file.size,
    });

  if (insErr) throw insErr;

  return path;
}
