// Слой доступа к Supabase: вход, чтение и запись карт.
const SUPABASE_URL = 'https://shgwmhjecqzmkufpzoge.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZ3dtaGplY3F6bWt1ZnB6b2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2ODUxMDEsImV4cCI6MjEwOTI2MTEwMX0.EmHOHmnUsE6cIjlROyJtsovgRPNAm8oeTgKGO7r1zc8';

export const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

//if (typeof window !== 'undefined') window.db = db;

// ---------- Авторизация ----------

export const signIn = async (email, password) => {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
};

export const signOut = async () => {
  await db.auth.signOut();
};

export const getSession = async () => {
  const { data } = await db.auth.getSession();
  return data.session;
};

// ---------- Карты ----------

export const loadMaps = async () => {
  const { data: maps, error: mapsError } = await db.from('maps').select('*').order('created_at');
  if (mapsError) throw mapsError;

  const { data: objects, error: objectsError } = await db.from('objects').select('*');
  if (objectsError) throw objectsError;

  return maps.map((map) => ({
    ...map,
    objects: objects.filter((o) => o.map_id === map.id),
  }));
};

export const upsertMap = async (map) => {
  const { data, error } = await db
    .from('maps')
    .upsert({
      id: map.id,
      name: map.name,
      cells: map.cells,
      view: map.view,
      terrains: map.terrains,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteMap = async (id) => {
  const { error } = await db.from('maps').delete().eq('id', id);
  if (error) throw error;
};

// ---------- Объекты ----------

export const replaceObjects = async (mapId, objects) => {
  await db.from('objects').delete().eq('map_id', mapId);
  if (objects.length === 0) return;

  const { error } = await db
    .from('objects')
    .insert(objects.map((o) => ({ map_id: mapId, symbol: o.symbol, data: o })));
  if (error) throw error;
};

export const loadWorld = async () => {
  const { data, error } = await db.from('world').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
};

export const saveWorld = async (name, showLabels) => {
  const { error } = await db.from('world').upsert({ id: 1, name, show_labels: showLabels });
  if (error) throw error;
};