const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud2t5dmp0dmJycWdzaXRpbWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTE3OTQsImV4cCI6MjA5MDg4Nzc5NH0.ms5zRgNTY-5vLEes7J1COKp4aUNRc2KkXwCfdJAa8_Y';
const base = 'https://fnwkyvjtvbrqgsitimey.supabase.co/rest/v1';

async function run() {
  // Get exact titles
  const res = await fetch(`${base}/surveys?tenant_id=eq.76f68b8b-e65c-4f8b-8d3f-5ac5979ecbf0&select=id,title`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
  });
  const surveys = await res.json();
  console.log('=== ANKET BAŞLIKLARI (HEX) ===');
  surveys.forEach(s => {
    const hex = Buffer.from(s.title, 'utf8').toString('hex');
    console.log(`\nTitle: ${s.title}`);
    console.log(`Hex:   ${hex}`);
    // Check character codes
    for (const ch of s.title) {
      const code = ch.codePointAt(0);
      if (code > 127) console.log(`  Özel karakter: '${ch}' -> U+${code.toString(16).toUpperCase().padStart(4,'0')}`);
    }
  });
}
run();
