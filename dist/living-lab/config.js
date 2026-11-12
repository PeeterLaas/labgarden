/* Where the Living Lab reads its public content. Both values are public by design: the publishable key only
 * reaches rows the database's row level security marks as published (see supabase/living-lab.sql).
 * Never put a secret or service-role key here. Leave them empty to show the built-in example content. */
window.LIVING_LAB = {
  url: '',   // e.g. https://<project-ref>.supabase.co
  key: '',
};
